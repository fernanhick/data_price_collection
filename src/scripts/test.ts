/**
 * Test Script (Consolidated)
 *
 * Runs test suites for scrapers and system components.
 * Consolidates test-scraper.ts, test-stylecode.ts, test-stockx.ts, test-ecmv-migration.ts.
 *
 * Usage:
 *   tsx src/scripts/test.ts [options]
 *
 * Options:
 *   --suite <scraper|stylecode|stockx|ecmv|all>   Test suite to run (default: all)
 *   --help                                        Show help
 */

import { query as dbQuery, closePool } from '../db/index.js';
import logger from '../utils/logger.js';
import { SKU } from '../types/index.js';

async function runScraperTest() {
  const { EbayScraper } = await import('../services/scrapers/ebay.js');
  const { GoatScraper } = await import('../services/scrapers/goat.js');
  const { PriceFetcher } = await import('../services/pricing/priceFetcher.js');

  logger.info('\n=== Test 1: Direct eBay Scraper ===');
  const ebayScraper = new EbayScraper();
  const testQueries = ['Nike Jordan 1 Bred', 'Nike Dunk Low Panda', 'Adidas Yeezy Boost 350 Zebra'];

  for (const q of testQueries) {
    logger.info(`Testing query: "${q}"`);
    try {
      const listings = await ebayScraper.searchSoldListings(q, 5);
      const stats = EbayScraper.getPriceStats(listings);
      if (listings.length > 0) {
        logger.info(`✅ Found ${listings.length} listings for "${q}"`);
        logger.info(`Median price: $${stats?.median?.toFixed(2)}`);
      } else {
        logger.warn(`⚠️  No listings found for "${q}"`);
      }
    } catch (error) {
      logger.error({ q, error: error instanceof Error ? error.message : String(error) }, 'Query failed');
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  logger.info('\n=== Test 2: Direct GOAT Scraper ===');
  const goatScraper = new GoatScraper();

  for (const q of testQueries) {
    logger.info(`Testing GOAT query: "${q}"`);
    try {
      const listings = await goatScraper.searchProducts(q, 3);
      const stats = GoatScraper.getPriceStats(listings);
      if (listings.length > 0) {
        logger.info(`✅ Found ${listings.length} listings for "${q}"`);
        logger.info(`Avg price: $${stats?.avg?.toFixed(2)}`);
      } else {
        logger.warn(`⚠️  No listings found for "${q}"`);
      }
    } catch (error) {
      logger.error({ q, error: error instanceof Error ? error.message : String(error) }, 'GOAT query failed');
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  logger.info('\n=== Test 3: Database Integration (All Sources) ===');
  const result = await dbQuery<SKU>('SELECT * FROM skus LIMIT 3');
  const skus = result.rows;

  if (skus.length === 0) {
    logger.warn('No SKUs found in database. Run `npm run db:seed` first.');
  } else {
    logger.info(`Found ${skus.length} SKUs to test`);
    const priceFetcher = new PriceFetcher();
    for (const sku of skus) {
      logger.info(`\nFetching prices for: ${sku.sku_code}`);
      try {
        const fetchResult = await priceFetcher.fetchAllPricesForSku(sku);
        logger.info({
          skuCode: sku.sku_code,
          ebay: fetchResult.ebay.success ? `$${fetchResult.ebay.price?.toFixed(2)}` : 'failed',
          goat: fetchResult.goat.success ? `$${fetchResult.goat.price?.toFixed(2)}` : 'failed',
          stockx: fetchResult.stockx.success ? `$${fetchResult.stockx.price?.toFixed(2)}` : 'disabled',
        });
      } catch (error) {
        logger.error({ skuCode: sku.sku_code, error }, 'Failed to fetch prices');
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  const priceCount = await dbQuery('SELECT COUNT(*) as count FROM prices');
  logger.info(`Total prices stored: ${(priceCount.rows[0] as any).count}`);

  const sourceBreakdown = await dbQuery('SELECT source, COUNT(*) as count FROM prices GROUP BY source ORDER BY source');
  logger.info('Prices by source:');
  for (const row of sourceBreakdown.rows as any[]) {
    logger.info(`  ${row.source}: ${row.count}`);
  }
}

async function runStyleCodeTest() {
  const { PriceFetcher } = await import('../services/pricing/priceFetcher.js');

  logger.info('Testing style code normalization...');

  const result = await dbQuery<SKU>('SELECT * FROM skus WHERE sku_code IN ($1, $2, $3)', [
    'DD1391-100',
    '555088-063',
    'CP9654',
  ]);
  const skus = result.rows;

  logger.info(`Found ${skus.length} SKUs with style codes`);

  for (const sku of skus) {
    logger.info(`\n--- Testing SKU: ${sku.sku_code} ---`);
    logger.info({ sku_code: sku.sku_code, style_code: sku.style_code, brand: sku.brand, model: sku.model });

    const priceFetcher = new PriceFetcher();

    logger.info('Fetching eBay prices...');
    const ebayResult = await priceFetcher.fetchEbayPricesForSku(sku);
    logger.info({ source: 'eBay', success: ebayResult.success, price: ebayResult.price ? `$${ebayResult.price}` : 'N/A' });

    await new Promise(resolve => setTimeout(resolve, 2000));

    logger.info('Fetching GOAT prices...');
    const goatResult = await priceFetcher.fetchGoatPricesForSku(sku);
    logger.info({ source: 'GOAT', success: goatResult.success, price: goatResult.price ? `$${goatResult.price}` : 'N/A' });

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  const priceCount = await dbQuery('SELECT COUNT(*) as count FROM prices');
  logger.info(`Total prices stored: ${(priceCount.rows[0] as any).count}`);

  logger.info('\n✅ Style code test completed');
}

async function runStockXTest() {
  const { StockxScraper } = await import('../services/scrapers/stockx.js');
  const scraper = new StockxScraper();

  try {
    logger.info('Testing StockX scraper with Puppeteer...');
    const queries = ['Jordan 1 Bred', 'Yeezy 350 Zebra', 'Dunk Low Panda'];

    for (const q of queries) {
      logger.info(`\nSearching for: "${q}"`);
      const results = await scraper.searchProducts(q, 3);
      if (results.length > 0) {
        logger.info(`✅ Found ${results.length} results:`);
        for (const r of results) {
          logger.info(`  - ${r.name}: $${r.lowestAsk}`);
        }
      } else {
        logger.warn(`⚠️  No results found for "${q}"`);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } finally {
    await scraper.closeBrowser();
    logger.info('\nTest complete, browser closed.');
  }
}

async function runEcmvTest() {
  const ecmvCalculator = (await import('../services/pricing/ecmvCalculator.js')).default;

  const result = await dbQuery<SKU>(
    `SELECT s.* FROM skus s
     JOIN prices p ON s.id = p.sku_id
     GROUP BY s.id
     HAVING COUNT(p.id) > 5
     ORDER BY MAX(p.timestamp) DESC
     LIMIT 1`
  );

  if (result.rows.length === 0) {
    logger.warn('No SKUs with prices found');
    return;
  }

  const sku = result.rows[0];
  logger.info({ id: sku.id, sku_code: sku.sku_code, brand: sku.brand, model: sku.model }, 'Testing ECMV calculation');

  const ecmvResult = await ecmvCalculator.calculateECMV(sku);
  if (ecmvResult) {
    logger.info({ ecmv: ecmvResult.ecmv, confidence: ecmvResult.confidence, components: ecmvResult.components }, '✅ ECMV calculated successfully');
  } else {
    logger.warn('No ECMV calculated (no recent prices)');
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`
Test Script

Runs test suites to verify scrapers and system components.

Usage:
  tsx src/scripts/test.ts [options]

Options:
  --suite <suite>    Test suite to run (default: all)
    scraper          eBay + GOAT + DB integration tests
    stylecode        Style code normalization test
    stockx           StockX Puppeteer scraper test
    ecmv             ECMV calculation test
    all              Run all suites

Examples:
  # Run all tests
  tsx src/scripts/test.ts

  # Test only scrapers
  tsx src/scripts/test.ts --suite scraper

  # Test StockX only
  tsx src/scripts/test.ts --suite stockx
    `);
    process.exit(0);
  }

  let suite = 'all';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--suite') suite = args[++i];
  }

  async function run() {
    try {
      if (suite === 'scraper' || suite === 'all') await runScraperTest();
      if (suite === 'stylecode' || suite === 'all') await runStyleCodeTest();
      if (suite === 'stockx' || suite === 'all') await runStockXTest();
      if (suite === 'ecmv' || suite === 'all') await runEcmvTest();

      logger.info('\n=== Test Summary ===');
      logger.info('✅ All tests completed');
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Test failed');
      process.exit(1);
    }
  }

  run().finally(() => closePool());
}
