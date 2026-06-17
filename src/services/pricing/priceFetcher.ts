import { query as dbQuery } from '../../db/index.js';
import logger from '../../utils/logger.js';
import { EbayScraper } from '../scrapers/ebay.js';
import { GoatScraper } from '../scrapers/goat.js';
import { StockxScraper } from '../scrapers/stockx.js';
import { PriceSource, SKU } from '../../types/index.js';

// Randomized delay range between StockX requests (avoids Cloudflare blocks and
// a fixed, easily-fingerprinted interval).
const STOCKX_DELAY_MIN_MS = 8000;
const STOCKX_DELAY_MAX_MS = 20000;

// After this many consecutive StockX failures in a single run, stop hitting
// StockX for the rest of the run — a streak of failures usually means the IP
// got flagged, and continuing would just hammer a blocked IP.
const STOCKX_FAILURE_THRESHOLD = 3;

/**
 * Tracks consecutive StockX failures across a batch run and trips once a
 * blocked-IP pattern is likely, so the rest of the run skips StockX entirely.
 */
export class StockxCircuitBreaker {
  private consecutiveFailures = 0;
  private tripped = false;

  get isOpen(): boolean {
    return this.tripped;
  }

  recordResult(success: boolean): void {
    if (success) {
      this.consecutiveFailures = 0;
      return;
    }

    this.consecutiveFailures++;
    if (!this.tripped && this.consecutiveFailures >= STOCKX_FAILURE_THRESHOLD) {
      this.tripped = true;
      logger.warn(
        { consecutiveFailures: this.consecutiveFailures },
        'StockX circuit breaker tripped — skipping StockX for the rest of this run',
      );
    }
  }
}

/**
 * Fetch and store prices for sneakers
 */
export class PriceFetcher {
  private ebayScraper = new EbayScraper();
  private goatScraper = new GoatScraper();
  private stockxScraper = new StockxScraper();

  /**
   * Helper to add delay between requests
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Fetch eBay prices for a single sneaker
   */
  async fetchEbayPricesForSku(
    sku: SKU,
  ): Promise<{ success: boolean; price?: number; listingCount?: number }> {
    try {
      logger.info({ skuCode: sku.sku_code, styleCode: sku.style_code }, 'Fetching eBay prices');

      // eBay sellers use descriptive names more than style codes, so prefer custom query or built query
      // If custom query exists, use it. Otherwise build from brand + model + colorway (+ style code)
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
   * Fetch GOAT prices for a single sneaker
   */
  async fetchGoatPricesForSku(
    sku: SKU,
  ): Promise<{ success: boolean; price?: number }> {
    try {
      logger.info({ skuCode: sku.sku_code, styleCode: sku.style_code }, 'Fetching GOAT prices');

      // Strip hyphens and spaces so "DV3054-001", "DV3054 001", "DV3054001" all resolve correctly
      const styleCodeStripped = sku.style_code?.replace(/[-\s]/g, '');
      const query = styleCodeStripped || sku.goat_id || this.buildSearchQuery(sku);

      // Search GOAT
      const listing = await this.goatScraper.getPriceForSku(query);

      if (!listing) {
        logger.warn({ skuCode: sku.sku_code, query }, 'No listing found on GOAT');
        return { success: false };
      }

      const priceInDollars = listing.lowestPriceCents / 100;

      logger.info(
        { skuCode: sku.sku_code, price: priceInDollars, name: listing.name },
        'GOAT price fetched',
      );

      // Store price in database
      try {
        await dbQuery(
          `INSERT INTO prices (sku_id, source, price, timestamp)
           VALUES ($1, $2, $3, $4)`,
          [sku.id, PriceSource.GOAT, priceInDollars, listing.timestamp],
        );
      } catch (error) {
        logger.debug({ skuCode: sku.sku_code, error }, 'Failed to store GOAT price');
      }

      return {
        success: true,
        price: priceInDollars,
      };
    } catch (error) {
      logger.error(
        {
          skuCode: sku.sku_code,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to fetch GOAT prices',
      );
      return { success: false };
    }
  }

  /**
   * Fetch StockX prices for a single sneaker
   */
  async fetchStockxPricesForSku(
    sku: SKU,
  ): Promise<{ success: boolean; price?: number }> {
    try {
      logger.info({ skuCode: sku.sku_code, styleCode: sku.style_code }, 'Fetching StockX prices');

      // Strip hyphens and spaces so "DV3054-001", "DV3054 001", "DV3054001" all resolve correctly
      const styleCodeStripped = sku.style_code?.replace(/[-\s]/g, '');
      const query = styleCodeStripped || sku.stockx_id || this.buildSearchQuery(sku);

      // Search StockX
      const listing = await this.stockxScraper.getPriceForSku(query);

      if (!listing) {
        logger.debug({ skuCode: sku.sku_code, query }, 'No listing found on StockX (scraper may be disabled)');
        return { success: false };
      }

      logger.info(
        { skuCode: sku.sku_code, price: listing.lowestAsk, name: listing.name },
        'StockX price fetched',
      );

      // Store price in database
      try {
        await dbQuery(
          `INSERT INTO prices (sku_id, source, price, timestamp)
           VALUES ($1, $2, $3, $4)`,
          [sku.id, PriceSource.STOCKX, listing.lowestAsk, listing.timestamp],
        );
      } catch (error) {
        logger.debug({ skuCode: sku.sku_code, error }, 'Failed to store StockX price');
      }

      return {
        success: true,
        price: listing.lowestAsk,
      };
    } catch (error) {
      logger.error(
        {
          skuCode: sku.sku_code,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to fetch StockX prices',
      );
      return { success: false };
    }
  }

  /**
   * Fetch prices from all sources for a single SKU
   * Note: StockX is fetched separately with a randomized delay to avoid Cloudflare blocks.
   * Pass a shared `stockxBreaker` across a batch run to stop hitting StockX after
   * repeated consecutive failures (likely IP block).
   */
  async fetchAllPricesForSku(sku: SKU, stockxBreaker?: StockxCircuitBreaker): Promise<{
    ebay: { success: boolean; price?: number };
    goat: { success: boolean; price?: number };
    stockx: { success: boolean; price?: number };
  }> {
    // Fetch eBay and GOAT in parallel (they don't have aggressive anti-bot measures)
    const [ebayResult, goatResult] = await Promise.all([
      this.fetchEbayPricesForSku(sku),
      this.fetchGoatPricesForSku(sku),
    ]);

    if (stockxBreaker?.isOpen) {
      return { ebay: ebayResult, goat: goatResult, stockx: { success: false } };
    }

    // Add a randomized delay before StockX to avoid Cloudflare detection
    const stockxDelay = STOCKX_DELAY_MIN_MS + Math.random() * (STOCKX_DELAY_MAX_MS - STOCKX_DELAY_MIN_MS);
    await this.delay(stockxDelay);

    // Fetch StockX separately
    const stockxResult = await this.fetchStockxPricesForSku(sku);
    stockxBreaker?.recordResult(stockxResult.success);

    return {
      ebay: ebayResult,
      goat: goatResult,
      stockx: stockxResult,
    };
  }

  /**
   * Fetch prices from eBay and GOAT only (faster, skips StockX)
   */
  async fetchFastPricesForSku(sku: SKU): Promise<{
    ebay: { success: boolean; price?: number };
    goat: { success: boolean; price?: number };
  }> {
    const [ebayResult, goatResult] = await Promise.all([
      this.fetchEbayPricesForSku(sku),
      this.fetchGoatPricesForSku(sku),
    ]);

    return {
      ebay: ebayResult,
      goat: goatResult,
    };
  }

  /**
   * Fetch prices for all SKUs (respecting tier-based frequency)
   */
  async fetchAllPrices(tier?: 1 | 2 | 3, skipStockX = false, rotationSlot?: number): Promise<number> {
    try {
      let query = 'SELECT * FROM skus';
      const params: any[] = [];
      const conditions: string[] = [];

      if (tier) {
        conditions.push(`tier = $${params.length + 1}`);
        params.push(tier);
      }

      if (rotationSlot !== undefined) {
        conditions.push(`id % 3 = $${params.length + 1}`);
        params.push(rotationSlot);
      }

      if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
      query += ' ORDER BY tier ASC, model ASC';

      const result = await dbQuery<SKU>(query, params);
      const skus = result.rows;

      logger.info({ count: skus.length, tier, skipStockX }, 'Starting price fetch for SKUs from all sources');

      const stockxBreaker = new StockxCircuitBreaker();

      for (const sku of skus) {
        const results = skipStockX
          ? { ...(await this.fetchFastPricesForSku(sku)), stockx: { success: false } }
          : await this.fetchAllPricesForSku(sku, stockxBreaker);

        const successCount = [results.ebay, results.goat, results.stockx].filter((r) => r.success).length;

        logger.info(
          {
            skuCode: sku.sku_code,
            ebay: results.ebay.success ? `$${results.ebay.price}` : 'failed',
            goat: results.goat.success ? `$${results.goat.price}` : 'failed',
            stockx: results.stockx.success ? `$${results.stockx.price}` : 'disabled',
            sourcesSucceeded: successCount,
          },
          'Fetched prices for SKU',
        );

        // Add random delay between SKUs to avoid rate limiting
        const delay = Math.random() * 2000 + 1000; // 1-3 seconds
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      logger.info({ count: skus.length }, 'Price fetch completed for all SKUs');
      return skus.length;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to fetch all prices',
      );
      return 0;
    }
  }

  /**
   * Build eBay search query from SKU data
   * Includes brand, model, colorway, and optionally style code for better matching
   */
  private buildSearchQuery(sku: SKU): string {
    const parts = [sku.brand, sku.model];

    if (sku.colorway) {
      parts.push(sku.colorway);
    }

    // Add style code for better matching on eBay
    if (sku.style_code) {
      parts.push(sku.style_code);
    }

    return parts.filter((p) => p).join(' ');
  }
}

export default new PriceFetcher();
