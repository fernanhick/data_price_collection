import { query as dbQuery } from '../../db/index.js';
import logger from '../../utils/logger.js';
import notifier from '../notifier.js';

/**
 * GOAT usage tracking.
 *
 * GOAT prices come from GOAT's own public Algolia search key (the one its
 * website ships to every browser), not an account of ours, so there is no
 * agreed quota. The two ways it can break: Algolia rate-limits our one AWS IP
 * (HTTP 429), or GOAT rotates/restricts the key (401/403 on every call).
 * Every request is counted per UTC day, kind and outcome in goat_requests; the
 * first 429 or 401/403 of a day sends a Telegram alert, and either pauses GOAT
 * calls for PAUSE_MS so we don't keep hammering a block.
 */
export type GoatRequestKind = 'search' | 'discovery' | 'variants';
type Outcome = 'ok' | 'rate_limited' | 'forbidden' | 'error' | 'paused';

const PAUSE_MS = 30 * 60_000;
let pausedUntil = 0;
const alerted = new Set<string>(); // `${day}:${outcome}`

let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = dbQuery(`CREATE TABLE IF NOT EXISTS goat_requests (
      day DATE NOT NULL,
      kind VARCHAR(20) NOT NULL,
      outcome VARCHAR(20) NOT NULL,
      n INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, kind, outcome)
    )`).then(
      () => undefined,
      (error) => {
        tableReady = null;
        throw error;
      },
    );
  }
  return tableReady;
}

async function record(kind: GoatRequestKind, outcome: Outcome): Promise<void> {
  try {
    await ensureTable();
    await dbQuery(
      `INSERT INTO goat_requests (day, kind, outcome, n)
       VALUES ((NOW() AT TIME ZONE 'UTC')::date, $1, $2, 1)
       ON CONFLICT (day, kind, outcome) DO UPDATE SET n = goat_requests.n + 1`,
      [kind, outcome],
    );
  } catch (error) {
    logger.debug({ error: error instanceof Error ? error.message : String(error) }, 'Failed to record GOAT request');
  }
}

function classify(error: unknown): Outcome {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'forbidden';
  return 'error';
}

/** Throws while GOAT is paused after a 429/401/403 (counted as "paused"). */
export async function beforeGoatRequest(kind: GoatRequestKind): Promise<void> {
  if (Date.now() < pausedUntil) {
    await record(kind, 'paused');
    throw new Error(`GOAT paused until ${new Date(pausedUntil).toISOString()} after a rate limit or key error`);
  }
}

export async function goatRequestSucceeded(kind: GoatRequestKind): Promise<void> {
  await record(kind, 'ok');
}

export async function goatRequestFailed(kind: GoatRequestKind, error: unknown): Promise<void> {
  const outcome = classify(error);
  await record(kind, outcome);
  if (outcome !== 'rate_limited' && outcome !== 'forbidden') return;

  pausedUntil = Date.now() + PAUSE_MS;
  const status = (error as { response?: { status?: number } })?.response?.status;
  const why =
    outcome === 'rate_limited'
      ? `HTTP 429: Algolia is rate-limiting our IP`
      : `HTTP ${status}: GOAT's public search key was rejected (rotated or restricted?)`;
  logger.warn({ kind, status, pausedUntil: new Date(pausedUntil).toISOString() }, `GOAT ${why}; pausing GOAT 30 min`);

  const key = `${new Date().toISOString().slice(0, 10)}:${outcome}`;
  if (!alerted.has(key)) {
    alerted.add(key);
    await notifier.scrapeError('GOAT', `${why}. GOAT calls paused 30 min; prices fall back to other sources.`).catch(() => {});
  }
}
