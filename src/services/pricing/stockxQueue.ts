import config from '../../config/index.js';
import { query as dbQuery } from '../../db/index.js';
import logger from '../../utils/logger.js';
import { SKU } from '../../types/index.js';
import notifier from '../notifier.js';
import priceFetcher from './priceFetcher.js';
import { ensureStockxLookupsTable, stockxLookupsToday } from './stockxLookups.js';

type Tier = 1 | 2 | 3;
const TIERS: Tier[] = [1, 2, 3];

const MIN_GAP_MS = 60_000;
const MAX_GAP_MS = 60 * 60_000;
const IDLE_MS = 30 * 60_000;
const CANDIDATE_TTL_MS = 60 * 60_000;
const CANDIDATES_PER_TIER = 100;
// Consecutive hard errors (block page, launch/navigation failure) before the
// queue backs off. "Not listed on StockX" never counts.
const ERROR_THRESHOLD = 3;
const ERROR_PAUSE_MS = 2 * 60 * 60_000;
// A SKU StockX didn't list this many times since its last good price is only
// retried after this many times its tier's stale window.
const MISS_THRESHOLD = 2;
const MISS_BACKOFF = 4;

const jitter = (ms: number) => ms * (0.6 + Math.random() * 0.8);

function msUntilNextUtcDay(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
}

/**
 * StockX price queue.
 *
 * One lookup at a time, paced so the day's budget is spread over the whole
 * UTC day (about one every 5 minutes at 300/day) rather than burst at 03:00.
 * Each tier is guaranteed its share of the budget while it has stale SKUs,
 * so tier 3 always makes progress instead of starving behind tier 1.
 * Within a tier the stalest SKU goes first (never-fetched before anything),
 * so every SKU is reached in turn.
 */
export class StockxQueue {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private candidates: Record<Tier, SKU[]> = { 1: [], 2: [], 3: [] };
  private candidatesLoadedAt = 0;
  private consecutiveErrors = 0;
  private pausedUntil = 0;
  private summaryDay = new Date().toISOString().slice(0, 10);

  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info(
      { budget: config.scraper.stockxDailyBudget, shares: config.scraper.stockxTierShares },
      'StockX queue started',
    );
    this.schedule(jitter(2 * 60_000));
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  get isRunning(): boolean {
    return this.running;
  }

  private schedule(ms: number): void {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      let next = IDLE_MS;
      try {
        next = await this.tick();
      } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'StockX queue tick failed');
      }
      this.schedule(next);
    }, ms);
  }

  /** Runs at most one lookup; returns how long to wait before the next. */
  private async tick(): Promise<number> {
    const now = Date.now();
    await ensureStockxLookupsTable();
    await this.maybeLogDailySummary();

    if (now < this.pausedUntil) return this.pausedUntil - now;

    const { total, queueByTier } = await stockxLookupsToday();
    const left = config.scraper.stockxDailyBudget - total;
    if (left <= 0) {
      // Start tomorrow at a slightly different minute each day.
      return msUntilNextUtcDay(now) + Math.random() * 20 * 60_000;
    }

    if (now - this.candidatesLoadedAt > CANDIDATE_TTL_MS || TIERS.every((t) => !this.candidates[t].length)) {
      await this.loadCandidates();
    }

    // Weighted fair share: serve the tier furthest below its share of today's
    // queue lookups, among tiers that still have stale SKUs.
    const shares = config.scraper.stockxTierShares;
    const tier = TIERS.filter((t) => this.candidates[t].length > 0 && shares[t] > 0).sort(
      (a, b) => queueByTier[a] / shares[a] - queueByTier[b] / shares[b],
    )[0];
    if (!tier) {
      this.candidatesLoadedAt = 0;
      return IDLE_MS;
    }

    const sku = this.candidates[tier].shift()!;
    const result = await priceFetcher.fetchStockxPricesForSku(sku, 'queue');

    if (result.status === 'error') {
      this.consecutiveErrors++;
      if (this.consecutiveErrors >= ERROR_THRESHOLD) {
        this.consecutiveErrors = 0;
        this.pausedUntil = Date.now() + ERROR_PAUSE_MS;
        const msg = `${ERROR_THRESHOLD} StockX errors in a row (block page or browser failure); pausing 2h`;
        logger.warn({ pausedUntil: new Date(this.pausedUntil).toISOString() }, msg);
        await notifier.scrapeError('StockX queue', msg).catch(() => {});
        return ERROR_PAUSE_MS;
      }
    } else {
      this.consecutiveErrors = 0;
    }

    // Spread what's left of the budget over what's left of the day.
    const remaining = Math.max(1, left - 1);
    const gap = Math.min(MAX_GAP_MS, Math.max(MIN_GAP_MS, msUntilNextUtcDay() / remaining));
    return jitter(gap);
  }

  /** The stalest SKUs per tier whose StockX price is due. */
  private async loadCandidates(): Promise<void> {
    const stale = config.scraper.stockxStaleDays;
    for (const tier of TIERS) {
      const r = await dbQuery<SKU>(
        `WITH lp AS (
           SELECT p.sku_id, MAX(p.timestamp) AS t
           FROM prices p JOIN skus s ON s.id = p.sku_id
           WHERE p.source = 'stockx' AND s.tier = $1
           GROUP BY p.sku_id
         ), la AS (
           SELECT l.sku_id, MAX(l.at) AS t,
                  COUNT(*) FILTER (WHERE l.status = 'not_found' AND l.at > COALESCE(lp.t, '-infinity')) AS misses
           FROM stockx_lookups l
           JOIN skus s ON s.id = l.sku_id
           LEFT JOIN lp ON lp.sku_id = l.sku_id
           WHERE s.tier = $1 AND l.status <> 'error'
           GROUP BY l.sku_id
         )
         SELECT s.*
         FROM skus s
         LEFT JOIN lp ON lp.sku_id = s.id
         LEFT JOIN la ON la.sku_id = s.id
         WHERE s.tier = $1
           AND (
             GREATEST(lp.t, la.t) IS NULL
             OR GREATEST(lp.t, la.t) < (NOW() AT TIME ZONE 'UTC')
                - make_interval(secs => $2 * 86400 * CASE WHEN COALESCE(la.misses, 0) >= $3 THEN $4 ELSE 1 END)
           )
         ORDER BY GREATEST(lp.t, la.t) ASC NULLS FIRST, s.id ASC
         LIMIT $5`,
        [tier, stale[tier], MISS_THRESHOLD, MISS_BACKOFF, CANDIDATES_PER_TIER],
      );
      this.candidates[tier] = r.rows;
    }
    this.candidatesLoadedAt = Date.now();
    logger.info(
      { due: { 1: this.candidates[1].length, 2: this.candidates[2].length, 3: this.candidates[3].length } },
      'StockX queue candidates loaded',
    );
  }

  /** Once per UTC day, log yesterday's lookups by tier and outcome. */
  private async maybeLogDailySummary(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    if (today === this.summaryDay) return;
    const day = this.summaryDay;
    this.summaryDay = today;
    const r = await dbQuery<{ source: string; tier: number | null; status: string; n: number }>(
      `SELECT source, tier, status, COUNT(*)::int AS n FROM stockx_lookups
       WHERE at >= $1::date AND at < $1::date + 1
       GROUP BY source, tier, status ORDER BY source, tier, status`,
      [day],
    );
    logger.info({ day, lookups: r.rows }, 'StockX daily summary');
  }
}

export default new StockxQueue();
