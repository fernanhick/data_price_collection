/**
 * Manual Price Fetcher
 *
 * Fetch prices for a specified number of sneakers from the catalog
 */

import { PriceFetcher } from '../services/pricing/priceFetcher.js';
import { query as dbQuery } from '../db/index.js';
import logger from '../utils/logger.js';
import { SKU } from '../types/index.js';

interface FetchOptions {
  limit?: number;
  all?: boolean;
  tier?: 1 | 2 | 3;
  brand?: string;
  skipStockX?: boolean;
}

async function fetchPricesManual(options: FetchOptions = {}) {
  const {
    limit = 10,
    all = false,
    tier,
    brand,
    skipStockX = false,
  } = options;

  try {
    // Build query
    let queryStr = 'SELECT * FROM skus WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (tier) {
      queryStr += ` AND tier = $${paramIndex++}`;
      params.push(tier);
    }

    if (brand) {
      queryStr += ` AND brand ILIKE $${paramIndex++}`;
      params.push(`%${brand}%`);
    }

    queryStr += ` ORDER BY tier ASC, created_at DESC`;

    if (!all) {
      queryStr += ` LIMIT $${paramIndex}`;
      params.push(limit);
    }

    logger.info({ limit: all ? 'ALL' : limit, tier, brand, skipStockX }, 'Starting manual price fetch');

    const result = await dbQuery<SKU>(queryStr, params);
    const skus = result.rows;

    if (skus.length === 0) {
      logger.warn('No sneakers found matching criteria');
      return { total: 0, success: 0, failed: 0 };
    }

    logger.info({ count: skus.length }, 'Found sneakers to fetch prices for');

    const priceFetcher = new PriceFetcher();
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < skus.length; i++) {
      const sku = skus[i];

      logger.info(
        {
          progress: `${i + 1}/${skus.length}`,
          sku: sku.sku_code,
          brand: sku.brand,
          model: sku.model,
        },
        'Fetching prices...'
      );

      try {
        let results;

        if (skipStockX) {
          // Faster fetch without StockX
          results = await priceFetcher.fetchFastPricesForSku(sku);

          const ebaySuccess = results.ebay.success;
          const goatSuccess = results.goat.success;

          logger.info(
            {
              sku: sku.sku_code,
              ebay: ebaySuccess ? `$${results.ebay.price}` : 'failed',
              goat: goatSuccess ? `$${results.goat.price}` : 'failed',
            },
            'Prices fetched (fast mode)'
          );

          if (ebaySuccess || goatSuccess) {
            successCount++;
          } else {
            failedCount++;
          }
        } else {
          // Full fetch including StockX
          results = await priceFetcher.fetchAllPricesForSku(sku);

          const ebaySuccess = results.ebay.success;
          const goatSuccess = results.goat.success;
          const stockxSuccess = results.stockx.success;

          logger.info(
            {
              sku: sku.sku_code,
              ebay: ebaySuccess ? `$${results.ebay.price}` : 'failed',
              goat: goatSuccess ? `$${results.goat.price}` : 'failed',
              stockx: stockxSuccess ? `$${results.stockx.price}` : 'failed',
            },
            'Prices fetched (full mode)'
          );

          if (ebaySuccess || goatSuccess || stockxSuccess) {
            successCount++;
          } else {
            failedCount++;
          }
        }
      } catch (error) {
        logger.error({ sku: sku.sku_code, error }, 'Failed to fetch prices for SKU');
        failedCount++;
      }

      // Small delay between SKUs
      if (i < skus.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info(
      {
        total: skus.length,
        success: successCount,
        failed: failedCount,
      },
      '✅ Manual price fetch completed'
    );

    return {
      total: skus.length,
      success: successCount,
      failed: failedCount,
    };

  } catch (error) {
    logger.error({ error }, 'Manual price fetch failed');
    throw error;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  const options: FetchOptions = {
    limit: 10,
    all: false,
    skipStockX: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--all':
        options.all = true;
        break;
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--tier':
        options.tier = parseInt(args[++i], 10) as 1 | 2 | 3;
        break;
      case '--brand':
        options.brand = args[++i];
        break;
      case '--skip-stockx':
        options.skipStockX = true;
        break;
      case '--help':
        console.log(`
Manual Price Fetcher

Fetch current market prices for sneakers from eBay, GOAT, and StockX.

Usage:
  tsx src/scripts/fetch-prices-manual.ts [options]

Options:
  --all               Fetch prices for the entire catalog (ignores --limit)
  --limit <number>    Number of sneakers to fetch prices for (default: 10)
  --tier <1|2|3>      Filter by tier (default: all tiers)
  --brand <name>      Filter by brand name (default: all brands)
  --skip-stockx       Skip StockX (faster, uses eBay + GOAT only)
  --help              Show this help message

Examples:
  # Fetch prices for the full catalog
  tsx src/scripts/fetch-prices-manual.ts --all

  # Full catalog, skip StockX (faster)
  tsx src/scripts/fetch-prices-manual.ts --all --skip-stockx

  # Fetch prices for 5 Nike sneakers
  tsx src/scripts/fetch-prices-manual.ts --brand Nike --limit 5

  # Fetch prices for tier 1 sneakers only
  tsx src/scripts/fetch-prices-manual.ts --tier 1 --limit 20

  # Fast fetch (skip StockX) for 10 sneakers
  tsx src/scripts/fetch-prices-manual.ts --skip-stockx --limit 10

  # Fetch prices for 3 Jordan sneakers (fast mode)
  tsx src/scripts/fetch-prices-manual.ts --brand Jordan --limit 3 --skip-stockx

Notes:
  - StockX fetching has 10-second delays to avoid Cloudflare blocks
  - eBay and GOAT can be fetched in parallel (faster)
  - Use --skip-stockx for quick testing
  - Prices are stored in the database for historical tracking
  - The scheduler runs automatically in the background

Rate Limiting:
  - eBay: 2-second delay between SKUs
  - GOAT: 2-second delay between SKUs
  - StockX: 10-second delay (can trigger Cloudflare blocks)
  - Total time estimate: ~15-20 seconds per SKU (full mode)
  - Total time estimate: ~3-5 seconds per SKU (fast mode)
        `);
        process.exit(0);
    }
  }

  console.log('🚀 Starting manual price fetch...\n');

  fetchPricesManual(options)
    .then(result => {
      console.log('\n' + '='.repeat(60));
      console.log('✅ Price fetch completed!');
      console.log('='.repeat(60));
      console.log(`📊 Results:`);
      console.log(`   Total SKUs: ${result.total}`);
      console.log(`   Successful: ${result.success}`);
      console.log(`   Failed: ${result.failed}`);
      console.log('='.repeat(60));
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    });
}

export { fetchPricesManual };
