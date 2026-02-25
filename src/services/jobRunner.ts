/**
 * Job Runner Service
 *
 * Orchestrates background job execution for the admin dashboard.
 * Tracks run history in job_runs table, prevents concurrent duplicate runs.
 */

import { query } from '../db/index.js';
import logger from '../utils/logger.js';

export interface JobDefinition {
  type: string;
  label: string;
  description: string;
  icon: string;
  params: JobParamDef[];
}

export interface JobParamDef {
  name: string;
  label: string;
  type: 'select' | 'number' | 'checkbox';
  options?: { value: string; label: string }[];
  default?: any;
}

export const JOB_DEFINITIONS: JobDefinition[] = [
  {
    type: 'discover',
    label: 'Sneaker Discovery',
    description: 'Discover new sneakers from GOAT marketplace',
    icon: '🔍',
    params: [
      {
        name: 'preset',
        label: 'Preset',
        type: 'select',
        options: [
          { value: 'safe', label: 'Safe (6 queries, ~30s)' },
          { value: 'basic', label: 'Basic (26 queries, ~5min)' },
          { value: 'mega', label: 'Mega (80+ queries, ~15min)' },
        ],
        default: 'basic',
      },
      {
        name: 'withPrices',
        label: 'Also fetch prices after discovery',
        type: 'checkbox',
        default: false,
      },
    ],
  },
  {
    type: 'prices',
    label: 'Price Fetcher',
    description: 'Fetch market prices from eBay, GOAT, and StockX',
    icon: '💰',
    params: [
      {
        name: 'tier',
        label: 'Tier',
        type: 'select',
        options: [
          { value: '', label: 'All Tiers' },
          { value: '1', label: 'Tier 1 (High-demand)' },
          { value: '2', label: 'Tier 2 (Medium)' },
          { value: '3', label: 'Tier 3 (Long-tail)' },
        ],
        default: '',
      },
      {
        name: 'limit',
        label: 'Limit',
        type: 'number',
        default: 50,
      },
      {
        name: 'skipStockX',
        label: 'Skip StockX (faster)',
        type: 'checkbox',
        default: false,
      },
    ],
  },
  {
    type: 'images',
    label: 'Image Backfill',
    description: 'Download missing product images',
    icon: '🖼',
    params: [
      {
        name: 'iterations',
        label: 'Iterations (x100 SKUs each)',
        type: 'number',
        default: 1,
      },
    ],
  },
  {
    type: 'ecmv',
    label: 'ECMV Recalculation',
    description: 'Recalculate Estimated Current Market Values',
    icon: '📊',
    params: [
      {
        name: 'tier',
        label: 'Tier',
        type: 'select',
        options: [
          { value: '', label: 'All Tiers' },
          { value: '1', label: 'Tier 1' },
          { value: '2', label: 'Tier 2' },
          { value: '3', label: 'Tier 3' },
        ],
        default: '',
      },
      {
        name: 'limit',
        label: 'Limit',
        type: 'number',
        default: 100,
      },
    ],
  },
  {
    type: 'kicksdb',
    label: 'KicksDB Import',
    description: 'Import sneakers from KicksDB API',
    icon: '🗃',
    params: [
      {
        name: 'all',
        label: 'Fetch all (auto-paginate)',
        type: 'checkbox',
        default: false,
      },
      {
        name: 'limit',
        label: 'Limit',
        type: 'number',
        default: 100,
      },
    ],
  },
  {
    type: 'cleanup',
    label: 'Catalog Cleanup',
    description: 'Remove non-footwear items from catalog',
    icon: '🧹',
    params: [
      {
        name: 'dryRun',
        label: 'Dry run (preview only, no deletion)',
        type: 'checkbox',
        default: true,
      },
    ],
  },
];

// Track currently running jobs (by job type)
const runningJobs = new Set<string>();

/**
 * Start a job asynchronously. Returns the run ID immediately.
 */
export async function startJob(
  jobType: string,
  params: Record<string, any> = {},
  triggeredBy: string = 'admin',
): Promise<number> {
  if (runningJobs.has(jobType)) {
    throw new Error(`Job "${jobType}" is already running`);
  }

  // Insert run record
  const result = await query(
    `INSERT INTO job_runs (job_type, params, status, triggered_by)
     VALUES ($1, $2, 'running', $3)
     RETURNING id`,
    [jobType, params, triggeredBy],
  );

  const runId: number = result.rows[0].id;
  runningJobs.add(jobType);

  // Fire and forget
  executeJob(runId, jobType, params).catch(err => {
    logger.error({ runId, jobType, error: err.message }, 'Job execution error (unhandled)');
  });

  return runId;
}

/**
 * Execute a job and update the job_runs record on completion.
 */
async function executeJob(
  runId: number,
  jobType: string,
  params: Record<string, any>,
): Promise<void> {
  try {
    logger.info({ runId, jobType, params }, 'Starting job execution');
    let stats: Record<string, any> = {};

    switch (jobType) {
      case 'discover': {
        const { discoverSneakers } = await import('../scripts/discover.js');
        stats = await discoverSneakers({
          preset: params.preset || 'basic',
          withPrices: !!params.withPrices,
          limit: params.limit ? Number(params.limit) : 15,
        });
        break;
      }

      case 'prices': {
        const { fetchPricesManual } = await import('../scripts/prices.js');
        stats = await fetchPricesManual({
          limit: params.limit ? Number(params.limit) : 10,
          all: !!params.all,
          tier: params.tier ? Number(params.tier) as 1 | 2 | 3 : undefined,
          brand: params.brand || undefined,
          skipStockX: !!params.skipStockX,
        });
        break;
      }

      case 'images': {
        const { backfillImages } = await import('../scripts/images.js');
        stats = await backfillImages({
          iterations: params.iterations ? Number(params.iterations) : 1,
        });
        break;
      }

      case 'ecmv': {
        const { backfillPriceHistory } = await import('../scripts/ecmv.js');
        stats = await backfillPriceHistory({
          limit: params.limit ? Number(params.limit) : 100,
          tier: params.tier ? Number(params.tier) : undefined,
          delayMs: 1000,
          minAge: 24,
        });
        break;
      }

      case 'kicksdb': {
        const { bulkFetch, fetchAll } = await import('../scripts/kicksdb.js');
        if (params.all) {
          stats = await fetchAll({
            delayMs: 1000,
            maxRequests: params.maxRequests ? Number(params.maxRequests) : undefined,
          });
        } else {
          stats = await bulkFetch({
            limit: params.limit ? Number(params.limit) : 100,
            offset: params.offset ? Number(params.offset) : 0,
            brand: params.brand || undefined,
            delayMs: 1000,
          });
        }
        break;
      }

      case 'cleanup': {
        const { cleanupNonFootwear } = await import('../scripts/cleanup.js');
        const dryRun = params.dryRun !== false; // Default true
        await cleanupNonFootwear(dryRun);
        stats = { dryRun, message: dryRun ? 'Dry run completed - check server logs for report' : 'Cleanup executed' };
        break;
      }

      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }

    await query(
      `UPDATE job_runs SET status = 'completed', finished_at = NOW(), stats = $1 WHERE id = $2`,
      [stats, runId],
    );

    logger.info({ runId, jobType, stats }, 'Job completed successfully');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ runId, jobType, error: errorMsg }, 'Job failed');

    await query(
      `UPDATE job_runs SET status = 'failed', finished_at = NOW(), error = $1 WHERE id = $2`,
      [errorMsg, runId],
    ).catch(dbErr => {
      logger.error({ dbErr }, 'Failed to update job_run status to failed');
    });
  } finally {
    runningJobs.delete(jobType);
  }
}

/**
 * Get currently running job types.
 */
export function getRunningJobs(): string[] {
  return Array.from(runningJobs);
}

export default { startJob, getRunningJobs, JOB_DEFINITIONS };
