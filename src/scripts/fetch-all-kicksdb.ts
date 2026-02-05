/**
 * Fetch ALL available sneakers from KicksDB
 *
 * Automatically fetches the maximum products per request and continues
 * until all products are retrieved, respecting rate limits.
 */

import { bulkFetch } from './bulk-fetch-kicksdb.js';
import logger from '../utils/logger.js';
import { query } from '../db/index.js';

interface FetchAllOptions {
  delayMs?: number;      // Delay between requests (default: 1000ms)
  batchSize?: number;    // Products per request (default: 100, max: 100)
  startOffset?: number;  // Where to start (default: 0)
  maxRequests?: number;  // Safety limit on requests (default: unlimited)
}

/**
 * Fetch all available products from KicksDB
 */
async function fetchAll(options: FetchAllOptions = {}) {
  const {
    delayMs = 1000,
    batchSize = 100,
    startOffset = 0,
    maxRequests = Infinity,
  } = options;

  logger.info(
    {
      batchSize,
      delayMs,
      startOffset,
      maxRequests: maxRequests === Infinity ? 'unlimited' : maxRequests,
    },
    '🚀 Starting full KicksDB catalog fetch'
  );

  let currentOffset = startOffset;
  let totalFetched = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let requestCount = 0;
  let consecutiveEmptyBatches = 0;

  const startTime = Date.now();

  try {
    while (requestCount < maxRequests) {
      requestCount++;

      logger.info(
        {
          request: requestCount,
          offset: currentOffset,
          totalSoFar: totalFetched,
        },
        `📦 Fetching batch ${requestCount}...`
      );

      // Fetch batch
      const result = await bulkFetch({
        limit: batchSize,
        offset: currentOffset,
        delayMs,
      });

      totalFetched += result.fetched;
      totalInserted += result.inserted;
      totalSkipped += result.skipped;

      // Check if we got any products
      if (result.fetched === 0) {
        consecutiveEmptyBatches++;
        logger.info('No products returned, might have reached the end');

        // Stop after 2 consecutive empty batches
        if (consecutiveEmptyBatches >= 2) {
          logger.info('✅ Reached end of catalog (2 consecutive empty batches)');
          break;
        }
      } else {
        consecutiveEmptyBatches = 0;
      }

      // Move to next batch
      currentOffset += result.fetched;

      // Progress update
      const duplicateRate = totalFetched > 0 ? (totalSkipped / totalFetched * 100).toFixed(1) : '0.0';
      logger.info(
        {
          requests: requestCount,
          fetched: totalFetched,
          inserted: totalInserted,
          skipped: totalSkipped,
          duplicateRate: `${duplicateRate}%`,
          currentOffset,
        },
        '📊 Progress update'
      );

      // If we got fewer products than requested, we're at the end
      if (result.fetched < batchSize) {
        logger.info({ fetched: result.fetched, expected: batchSize }, '✅ Reached end of catalog');
        break;
      }

      // Stop if duplicate rate is too high (> 90%) for the last batch
      if (result.fetched > 0 && (result.skipped / result.fetched) > 0.9) {
        logger.warn(
          { duplicateRate: ((result.skipped / result.fetched) * 100).toFixed(1) },
          '⚠️ Very high duplicate rate in batch - consider stopping or changing filters'
        );
      }
    }

    // Final statistics
    const endTime = Date.now();
    const durationSeconds = Math.floor((endTime - startTime) / 1000);
    const durationMinutes = Math.floor(durationSeconds / 60);

    // Get final catalog size
    const catalogSize = await query('SELECT COUNT(*) as total FROM skus');
    const totalInCatalog = parseInt(catalogSize.rows[0].total);

    logger.info(
      {
        totalRequests: requestCount,
        totalFetched,
        totalInserted,
        totalSkipped,
        duplicateRate: `${((totalSkipped / totalFetched) * 100).toFixed(1)}%`,
        durationSeconds,
        catalogSize: totalInCatalog,
      },
      '🎉 Fetch complete!'
    );

    return {
      requests: requestCount,
      fetched: totalFetched,
      inserted: totalInserted,
      skipped: totalSkipped,
      durationSeconds,
      catalogSize: totalInCatalog,
    };

  } catch (error) {
    logger.error({ error }, '❌ Fetch failed');
    throw error;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  const options: FetchAllOptions = {
    delayMs: 1000,
    batchSize: 100,
    startOffset: 0,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--delay':
        options.delayMs = parseInt(args[++i], 10);
        break;
      case '--batch-size':
        const size = parseInt(args[++i], 10);
        options.batchSize = Math.min(size, 100); // API max is 100
        break;
      case '--start-offset':
        options.startOffset = parseInt(args[++i], 10);
        break;
      case '--max-requests':
        options.maxRequests = parseInt(args[++i], 10);
        break;
      case '--help':
        console.log(`
KicksDB Full Catalog Fetcher

Automatically fetches ALL available sneakers from KicksDB, respecting rate limits.

Usage:
  tsx src/scripts/fetch-all-kicksdb.ts [options]

Options:
  --delay <ms>          Delay between requests in ms (default: 1000)
                        Minimum 1000ms recommended for rate limiting

  --batch-size <num>    Products per request (default: 100, max: 100)
                        100 is optimal for API efficiency

  --start-offset <num>  Start from specific offset (default: 0)
                        Use to resume if interrupted

  --max-requests <num>  Safety limit on API requests (default: unlimited)
                        Useful to prevent runaway fetching

  --help                Show this help message

Examples:
  # Fetch all products (recommended)
  tsx src/scripts/fetch-all-kicksdb.ts

  # Faster rate (if you have paid tier)
  tsx src/scripts/fetch-all-kicksdb.ts --delay 500

  # Safety limit: max 20 requests (2,000 products)
  tsx src/scripts/fetch-all-kicksdb.ts --max-requests 20

  # Resume from offset 5000
  tsx src/scripts/fetch-all-kicksdb.ts --start-offset 5000

Rate Limits:
  Free tier: 1,000 requests/month
  Per-minute: 640 requests/minute (no issue with 1s delays)

  With default settings (100 products per request, 1s delay):
  - ~10 requests to fetch all ~1,000 products
  - ~10 seconds total duration
  - Uses only 1% of monthly limit

The script automatically:
  ✓ Fetches maximum products per request (100)
  ✓ Continues until all products retrieved
  ✓ Stops at end of catalog
  ✓ Skips duplicates automatically
  ✓ Shows progress in real-time
  ✓ Respects rate limits with delays
        `);
        process.exit(0);
    }
  }

  console.log('🚀 Starting KicksDB full catalog fetch...\n');

  fetchAll(options)
    .then(result => {
      console.log('\n' + '='.repeat(60));
      console.log('🎉 SUCCESS! Full catalog fetch completed');
      console.log('='.repeat(60));
      console.log(`📊 Statistics:`);
      console.log(`   API Requests: ${result.requests}`);
      console.log(`   Products Fetched: ${result.fetched}`);
      console.log(`   New Products Added: ${result.inserted}`);
      console.log(`   Duplicates Skipped: ${result.skipped}`);
      console.log(`   Duration: ${result.durationSeconds}s`);
      console.log(`   Final Catalog Size: ${result.catalogSize} sneakers`);
      console.log('='.repeat(60));
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    });
}

export { fetchAll };
