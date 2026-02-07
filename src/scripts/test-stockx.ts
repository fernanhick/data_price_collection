import { StockxScraper } from '../services/scrapers/stockx.js';
import logger from '../utils/logger.js';

async function testStockX() {
  const scraper = new StockxScraper();

  try {
    logger.info('Testing StockX scraper with Puppeteer...');

    const queries = ['Jordan 1 Bred', 'Yeezy 350 Zebra', 'Dunk Low Panda'];

    for (const query of queries) {
      logger.info(`\nSearching for: "${query}"`);

      const results = await scraper.searchProducts(query, 3);

      if (results.length > 0) {
        logger.info(`✅ Found ${results.length} results:`);
        for (const r of results) {
          logger.info(`  - ${r.name}: $${r.lowestAsk}`);
        }
      } else {
        logger.warn(`⚠️  No results found for "${query}"`);
      }

      // Delay between searches
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Test failed');
  } finally {
    await scraper.closeBrowser();
    logger.info('\nTest complete, browser closed.');
  }
}

testStockX();
