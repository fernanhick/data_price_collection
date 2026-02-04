import { EbayScraper } from '../services/scrapers/ebay.js';
import { PriceFetcher } from '../services/pricing/priceFetcher.js';
import { query as dbQuery, closePool } from '../db/index.js';
import logger from '../utils/logger.js';
import { SKU } from '../types/index.js';

/**
 * Test script to verify eBay scraper functionality
 * Run with: npm run scraper:test
 */
async function testScraper() {
  try {
    logger.info('Starting scraper test...');

    // Test 1: Direct eBay scraper
    logger.info('\n=== Test 1: Direct eBay Scraper ===');
    const ebayScraper = new EbayScraper();

    const testQueries = [
      'Nike Jordan 1 Bred',
      'Nike Dunk Low Panda',
      'Adidas Yeezy Boost 350 Zebra',
    ];

    for (const query of testQueries) {
      logger.info(`Testing query: "${query}"`);
      try {
        const listings = await ebayScraper.searchSoldListings(query, 5);
        const stats = EbayScraper.getPriceStats(listings);

        logger.info({
          query,
          listingsFound: listings.length,
          stats,
          sample: listings.slice(0, 2),
        });

        if (listings.length > 0) {
          logger.info(`✅ Found ${listings.length} listings for "${query}"`);
          logger.info(`Median price: $${stats?.median?.toFixed(2)}`);
        } else {
          logger.warn(`⚠️  No listings found for "${query}"`);
        }
      } catch (error) {
        logger.error(
          { query, error: error instanceof Error ? error.message : String(error) },
          'Query failed',
        );
      }

      // Add delay between requests
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Test 2: Database integration
    logger.info('\n=== Test 2: Database Integration ===');
    const result = await dbQuery<SKU>('SELECT * FROM skus LIMIT 5');
    const skus = result.rows;

    if (skus.length === 0) {
      logger.warn('No SKUs found in database. Run `npm run db:seed` first.');
    } else {
      logger.info(`Found ${skus.length} SKUs to test`);

      const priceFetcher = new PriceFetcher();

      for (const sku of skus) {
        logger.info(`\nFetching prices for: ${sku.sku_code}`);
        try {
          const fetchResult = await priceFetcher.fetchEbayPricesForSku(sku);

          if (fetchResult.success) {
            logger.info({
              skuCode: sku.sku_code,
              price: fetchResult.price,
              listingCount: fetchResult.listingCount,
            });
            logger.info(`✅ Successfully fetched prices for ${sku.sku_code}`);
          } else {
            logger.warn(`⚠️  No prices found for ${sku.sku_code}`);
          }
        } catch (error) {
          logger.error({ skuCode: sku.sku_code, error }, 'Failed to fetch prices');
        }

        // Add delay between requests
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    logger.info('\n=== Test Summary ===');
    logger.info('✅ Scraper test completed successfully');

    // Show sample data from database
    const priceCount = await dbQuery('SELECT COUNT(*) as count FROM prices');
    const count = (priceCount.rows[0] as any).count;
    logger.info(`Total prices stored: ${count}`);
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Test failed');
    process.exit(1);
  } finally {
    await closePool();
  }
}

testScraper();
