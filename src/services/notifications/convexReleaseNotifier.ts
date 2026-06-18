import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import type { RawRelease } from '../releases/soleRetrieverParser.js';

/**
 * Convex release notifier.
 *
 * Single responsibility: take the genuinely-new releases the scheduler already
 * computed (the `xmax = 0` rows) and POST them to the Convex ingest endpoint,
 * which owns device tokens, per-user opt-ins, and the Expo fan-out. This module
 * knows nothing about delivery — it just hands Convex the new drops.
 *
 * Hard rule: it must never throw to its caller. A push outage cannot be allowed
 * to break the price/release-refresh job.
 */

const TIMEOUT_MS = 10_000;
const BATCH_SIZE = 200; // keep payloads small; Convex dedups per-id, so chunking is safe
const MAX_ATTEMPTS = 2; // one retry on network error / 5xx

interface IngestResponse {
  ok: boolean;
  accepted: number;
}

/** Wire payload sent to Convex. Only `id` is required. */
interface WireRelease {
  id: string;
  styleCode?: string;
  brand?: string;
  name?: string;
  releaseDate?: string;
  imageUrl?: string;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Map an internal release row to the Convex wire payload.
 *
 * `id` is Convex's idempotency key: it must be identical when the same drop is
 * re-seen on a later scrape and unique across drops. `styleCode` is exactly
 * that — it's UNIQUE NOT NULL in `upcoming_releases` and drives our own
 * `ON CONFLICT (style_code)` dedup, so it never drifts between scrapes. Rows
 * without one are unidentifiable and dropped.
 */
function toWire(r: RawRelease): WireRelease | null {
  if (!r.styleCode) return null;
  const wire: WireRelease = { id: r.styleCode, styleCode: r.styleCode };
  if (r.brand) wire.brand = r.brand;
  if (r.name) wire.name = r.name;
  if (r.releaseDate) wire.releaseDate = r.releaseDate;
  if (r.imageUrl) wire.imageUrl = r.imageUrl;
  return wire;
}

/**
 * POST a single batch with one retry. Returns the parsed response, or null on
 * any unrecoverable failure (already logged). Never throws.
 */
async function postBatch(
  url: string,
  secret: string,
  releases: WireRelease[],
): Promise<IngestResponse | null> {
  const body = JSON.stringify({ releases });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: controller.signal,
      });

      if (res.ok) {
        const json = (await res.json().catch(() => ({}))) as Partial<IngestResponse>;
        return { ok: true, accepted: json.accepted ?? 0 };
      }

      // 4xx is a config/contract problem (bad/missing secret, malformed body).
      // Retrying won't help — surface it loudly and stop.
      if (res.status >= 400 && res.status < 500) {
        logger.error(
          { status: res.status },
          'Convex releases ingest rejected request (config/contract problem)',
        );
        return null;
      }

      // 5xx — transient, fall through to retry.
      logger.warn({ status: res.status, attempt }, 'Convex releases ingest server error');
    } catch (err) {
      // Network error or AbortController timeout — transient, retry.
      logger.warn({ err, attempt }, 'Convex releases ingest request failed');
    } finally {
      clearTimeout(timer);
    }

    if (attempt < MAX_ATTEMPTS) await sleep(500 * attempt);
  }

  logger.error({ count: releases.length }, 'Convex releases ingest failed after retries');
  return null;
}

/**
 * Notify Convex of newly-detected releases. Returns the total accepted count
 * for logging, or null if the notify could not be confirmed. The return value
 * is informational only — nothing should depend on it.
 */
export async function notifyConvexOfReleases(
  releases: RawRelease[],
): Promise<{ accepted: number } | null> {
  if (releases.length === 0) return { accepted: 0 };

  const wire = releases.map(toWire).filter((w): w is WireRelease => w !== null);
  if (wire.length === 0) return { accepted: 0 };

  const { ingestUrl, ingestSecret } = config.releasesNotifier;
  if (!ingestUrl || !ingestSecret) {
    logger.warn('Convex releases ingest not configured; skipping notify');
    return null;
  }

  let accepted = 0;
  for (const batch of chunk(wire, BATCH_SIZE)) {
    const res = await postBatch(ingestUrl, ingestSecret, batch);
    if (res === null) return null; // failure already logged
    accepted += res.accepted;
  }

  return { accepted };
}
