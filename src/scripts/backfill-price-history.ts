/**
 * Backfill price_history table with ECMV calculations
 *
 * Calculates and persists ECMV for SKUs that have price data but no/old history entries
 */

import dotenv from 'dotenv';
import { query } from '../db/index.js';
import logger from '../utils/logger.js';
import ecmvPersistence from '../services/pricing/ecmvPersistence.js';
import { SKU } from '../types/index.js';

dotenv.config();

interface BackfillOptions {
  limit?: number;
  tier?: number;
  delayMs?: number;
  minAge?: number; // Minimum age in hours before recalculating ECMV
}

/**
 * Get SKUs that need ECMV calculation
 */
async function getSKUsNeedingECMV(options: BackfillOptions): Promise<SKU[]> {
  const { limit = 100, tier, minAge = 24 } = options;

  let whereClause = `
    WHERE s.id IN (
      SELECT DISTINCT sku_id FROM prices
    )
  `;

  // Optional tier filter
  if (tier !== undefined) {
    whereClause += ` AND s.tier = ${tier}`;
  }

  // SKUs with no history OR history older than minAge hours
  whereClause += `
    AND (
      s.id NOT IN (SELECT DISTINCT sku_id FROM price_history)
      OR s.id IN (
        SELECT sku_id FROM price_history
        GROUP BY sku_id
        HAVING MAX(timestamp) < NOW() - INTERVAL '${minAge} hours'
      )
    )
  `;

  const result = await query<SKU>(
    `SELECT s.*
     FROM skus s
     ${whereClause}
     ORDER BY s.tier ASC, s.id ASC
     LIMIT $1`,
    [limit],
  );

  return result.rows;
}

/**
 * Backfill ECMV data for SKUs
 */
async function backfillPriceHistory(options: BackfillOptions = {}): Promise<{
  total: number;
  success: number;
  failed: number;
  skipped: number;
}> {
  const { limit = 100, tier, delayMs = 1000, minAge = 24 } = options;

  logger.info(
    {
      limit,
      tier: tier || 'all',
      delayMs,
      minAge,
    },
    'Starting ECMV backfill',
  );

  // Get SKUs needing ECMV calculation
  const skus = await getSKUsNeedingECMV(options);

  if (skus.length === 0) {
    logger.info('No SKUs need ECMV backfill');
    return { total: 0, success: 0, failed: 0, skipped: 0 };
  }

  logger.info({ count: skus.length }, 'Found SKUs needing ECMV calculation');

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const sku of skus) {
    try {
      logger.info(
        {
          styleCode: sku.style_code,
          brand: sku.brand,
          model: sku.model,
          tier: sku.tier,
        },
        'Calculating ECMV',
      );

      // Calculate and save ECMV
      const result = await ecmvPersistence.calculateAndSave(sku, 'backfill');

      if (result) {
        success++;
        logger.info(
          {
            styleCode: sku.style_code,
            ecmv: result.ecmv,
            confidence: result.confidence,
          },
          '✅ ECMV saved',
        );
      } else {
        // null means calculation returned null (no price data) or duplicate
        skipped++;
        logger.debug(
          {
            styleCode: sku.style_code,
          },
          'ECMV calculation returned null (no price data or duplicate)',
        );
      }
    } catch (error) {
      failed++;
      logger.error(
        {
          styleCode: sku.style_code,
          error: error instanceof Error ? error.message : String(error),
        },
        '❌ Failed to calculate ECMV',
      );
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  logger.info(
    {
      total: skus.length,
      success,
      failed,
      skipped,
    },
    '✅ ECMV backfill completed',
  );

  return { total: skus.length, success, failed, skipped };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  const options: BackfillOptions = {
    limit: 100,
    delayMs: 1000,
    minAge: 24,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--tier':
        options.tier = parseInt(args[++i], 10);
        break;
      case '--delay':
        options.delayMs = parseInt(args[++i], 10);
        break;
      case '--min-age':
        options.minAge = parseInt(args[++i], 10);
        break;
      case '--help':
        console.log(`
ECMV Price History Backfill Tool

Calculates and saves ECMV (Estimated Current Market Value) to price_history table
for SKUs that have price data but no/old ECMV history.

Usage:
  npm run ecmv:backfill -- [options]

Options:
  --limit <number>      Maximum number of SKUs to process (default: 100)
  --tier <1|2|3>        Only process SKUs of specific tier (default: all)
  --delay <ms>          Delay between calculations in ms (default: 1000)
  --min-age <hours>     Minimum age of last ECMV before recalculating (default: 24)
  --help                Show this help message

Examples:
  # Backfill 100 SKUs
  npm run ecmv:backfill

  # Backfill all Tier 1 SKUs
  npm run ecmv:backfill -- --tier 1 --limit 1000

  # Backfill with slower rate
  npm run ecmv:backfill -- --limit 500 --delay 2000

  # Recalculate ECMV for SKUs with history older than 48 hours
  npm run ecmv:backfill -- --min-age 48 --limit 200

Notes:
  - SKUs without price data will be skipped automatically
  - Duplicate prevention (5 min window) prevents redundant entries
  - Process prioritizes Tier 1 SKUs first (ordered by tier ASC)
        `);
        process.exit(0);
    }
  }

  backfillPriceHistory(options)
    .then((result) => {
      console.log('\n✅ Backfill complete!');
      console.log(`   Total processed: ${result.total}`);
      console.log(`   Success: ${result.success}`);
      console.log(`   Skipped: ${result.skipped}`);
      console.log(`   Failed: ${result.failed}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    });
}

export { backfillPriceHistory };
