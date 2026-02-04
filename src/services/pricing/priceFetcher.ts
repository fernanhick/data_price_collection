import { query as dbQuery } from '../../db/index.js';
import logger from '../../utils/logger.js';
import { EbayScraper } from '../scrapers/ebay.js';
import { PriceSource, SKU } from '../../types/index.js';

/**
 * Fetch and store prices for sneakers
 */
export class PriceFetcher {
  private ebayScraper = new EbayScraper();

  /**
   * Fetch eBay prices for a single sneaker
   */
  async fetchEbayPricesForSku(
    sku: SKU,
  ): Promise<{ success: boolean; price?: number; listingCount?: number }> {
    try {
      logger.info({ skuCode: sku.sku_code }, 'Fetching eBay prices');

      // Build search query from SKU data
      const query = sku.ebay_query || this.buildSearchQuery(sku);

      // Search eBay
      const listings = await this.ebayScraper.searchSoldListings(query, 20);

      if (listings.length === 0) {
        logger.warn({ skuCode: sku.sku_code, query }, 'No listings found on eBay');
        return { success: false };
      }

      // Get price statistics
      const stats = EbayScraper.getPriceStats(listings);
      if (!stats) {
        logger.warn({ skuCode: sku.sku_code }, 'Could not calculate price stats');
        return { success: false };
      }

      logger.info(
        { skuCode: sku.sku_code, stats, listingCount: listings.length },
        'eBay price stats calculated',
      );

      // Store individual prices in database
      for (const listing of listings) {
        try {
          await dbQuery(
            `INSERT INTO prices (sku_id, source, price, timestamp)
             VALUES ($1, $2, $3, $4)`,
            [sku.id, PriceSource.EBAY, listing.price, listing.timestamp],
          );
        } catch (error) {
          logger.debug({ skuCode: sku.sku_code, error }, 'Failed to store individual price');
        }
      }

      return {
        success: true,
        price: stats.median, // Use median as representative price
        listingCount: listings.length,
      };
    } catch (error) {
      logger.error(
        {
          skuCode: sku.sku_code,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to fetch eBay prices',
      );
      return { success: false };
    }
  }

  /**
   * Fetch prices for all SKUs (respecting tier-based frequency)
   */
  async fetchAllPrices(tier?: 1 | 2 | 3): Promise<void> {
    try {
      let query = 'SELECT * FROM skus';
      const params: any[] = [];

      if (tier) {
        query += ' WHERE tier = $1';
        params.push(tier);
      }

      query += ' ORDER BY tier ASC, model ASC';

      const result = await dbQuery<SKU>(query, params);
      const skus = result.rows;

      logger.info({ count: skus.length, tier }, 'Starting price fetch for SKUs');

      for (const sku of skus) {
        const result = await this.fetchEbayPricesForSku(sku);

        if (result.success) {
          logger.info(
            {
              skuCode: sku.sku_code,
              price: result.price,
              listingCount: result.listingCount,
            },
            'Successfully fetched eBay prices',
          );
        } else {
          logger.warn({ skuCode: sku.sku_code }, 'Failed to fetch eBay prices');
        }

        // Add random delay between requests to avoid rate limiting
        const delay = Math.random() * 2000 + 1000; // 1-3 seconds
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      logger.info({ count: skus.length }, 'Price fetch completed for all SKUs');
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to fetch all prices',
      );
    }
  }

  /**
   * Build eBay search query from SKU data
   */
  private buildSearchQuery(sku: SKU): string {
    const parts = [sku.brand, sku.model];

    if (sku.colorway) {
      parts.push(sku.colorway);
    }

    return parts.filter((p) => p).join(' ');
  }
}

export default new PriceFetcher();
