import { PriceFetcher } from '../services/pricing/priceFetcher.js';
import { query as dbQuery, closePool } from '../db/index.js';
import logger from '../utils/logger.js';
import { SKU } from '../types/index.js';

/**
 * Test script to verify style code normalization works
 */
async function testStyleCode() {
  try {
    logger.info('Testing style code normalization...');

    // Get a few SKUs from database
    const result = await dbQuery<SKU>('SELECT * FROM skus WHERE sku_code IN ($1, $2, $3)', [
      'DD1391-100', // Nike Dunk Low Panda
      '555088-063', // Jordan 1 Bred Toe
      'CP9654',     // Yeezy Zebra
    ]);
    const skus = result.rows;

    logger.info(`Found ${skus.length} SKUs with style codes`);

    for (const sku of skus) {
      logger.info(`\n--- Testing SKU: ${sku.sku_code} ---`);
      logger.info({
        sku_code: sku.sku_code,
        style_code: sku.style_code,
        brand: sku.brand,
        model: sku.model,
        colorway: sku.colorway,
      });

      // Test just eBay and GOAT (skip StockX for speed)
      const priceFetcher = new PriceFetcher();

      logger.info('Fetching eBay prices...');
      const ebayResult = await priceFetcher.fetchEbayPricesForSku(sku);
      logger.info({
        source: 'eBay',
        success: ebayResult.success,
        price: ebayResult.price ? `$${ebayResult.price}` : 'N/A',
        listingCount: ebayResult.listingCount,
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      logger.info('Fetching GOAT prices...');
      const goatResult = await priceFetcher.fetchGoatPricesForSku(sku);
      logger.info({
        source: 'GOAT',
        success: goatResult.success,
        price: goatResult.price ? `$${goatResult.price}` : 'N/A',
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Show stored prices
    logger.info('\n=== Stored Prices Summary ===');
    const priceCount = await dbQuery('SELECT COUNT(*) as count FROM prices');
    const count = (priceCount.rows[0] as any).count;
    logger.info(`Total prices stored: ${count}`);

    const sourceBreakdown = await dbQuery(
      'SELECT source, COUNT(*) as count FROM prices GROUP BY source ORDER BY source',
    );
    logger.info('Prices by source:');
    for (const row of sourceBreakdown.rows as any[]) {
      logger.info(`  ${row.source}: ${row.count}`);
    }

    logger.info('\n✅ Style code test completed');
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Test failed');
    process.exit(1);
  } finally {
    await closePool();
  }
}

testStyleCode();
