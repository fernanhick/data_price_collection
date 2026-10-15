import { query as dbQuery } from '../../db/index.js';
import logger from '../../utils/logger.js';

// new_sku = first price for a sneaker a user just added (never budget-gated).
export type StockxLookupSource = 'queue' | 'tier_run' | 'on_demand' | 'new_sku';
export type StockxLookupStatus = 'ok' | 'not_found' | 'error';

/**
 * Durable log of every StockX lookup. It is the single daily-budget counter
 * for all callers (queue, tier runs, on-demand routes), and a restart no
 * longer hands out a fresh budget the way the old in-memory counter did.
 */
let tableReady: Promise<void> | null = null;

export function ensureStockxLookupsTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await dbQuery(`CREATE TABLE IF NOT EXISTS stockx_lookups (
        id SERIAL PRIMARY KEY,
        sku_id INTEGER REFERENCES skus(id) ON DELETE CASCADE,
        tier SMALLINT,
        source VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL,
        at TIMESTAMP NOT NULL DEFAULT NOW()
      )`);
      await dbQuery('CREATE INDEX IF NOT EXISTS idx_stockx_lookups_at ON stockx_lookups(at DESC)');
      await dbQuery('CREATE INDEX IF NOT EXISTS idx_stockx_lookups_sku_at ON stockx_lookups(sku_id, at DESC)');
    })().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}

export async function recordStockxLookup(opts: {
  source: StockxLookupSource;
  status: StockxLookupStatus;
  skuId?: number | null;
  tier?: number | null;
}): Promise<void> {
  try {
    await ensureStockxLookupsTable();
    await dbQuery(
      `INSERT INTO stockx_lookups (sku_id, tier, source, status, at)
       VALUES ($1, $2, $3, $4, NOW() AT TIME ZONE 'UTC')`,
      [opts.skuId ?? null, opts.tier ?? null, opts.source, opts.status],
    );
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'Failed to record StockX lookup');
  }
}

/**
 * Lookups made since UTC midnight. `total` is what counts against the daily
 * budget: every source except new_sku, which has its own allowance.
 */
export async function stockxLookupsToday(): Promise<{
  total: number;
  newSku: number;
  queueByTier: Record<1 | 2 | 3, number>;
}> {
  await ensureStockxLookupsTable();
  const r = await dbQuery<{ tier: number | null; source: string; n: number }>(
    `SELECT tier, source, COUNT(*)::int AS n FROM stockx_lookups
     WHERE at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')
     GROUP BY tier, source`,
  );
  const queueByTier: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  let total = 0;
  let newSku = 0;
  for (const row of r.rows) {
    if (row.source === 'new_sku') {
      newSku += row.n;
      continue;
    }
    total += row.n;
    if (row.source === 'queue' && (row.tier === 1 || row.tier === 2 || row.tier === 3)) {
      queueByTier[row.tier] += row.n;
    }
  }
  return { total, newSku, queueByTier };
}
