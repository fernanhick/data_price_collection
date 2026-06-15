import axios, { AxiosRequestConfig } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import logger from '../../utils/logger.js';
import config from '../../config/index.js';
import { GOATListing } from '../../types/index.js';

/**
 * GOAT Price Scraper
 *
 * Uses GOAT's public Algolia search API to fetch sneaker prices.
 * Returns lowest ask prices from the GOAT marketplace.
 */
export class GoatScraper {
  private readonly algoliaUrl = 'https://2fwotdvm2o-dsn.algolia.net/1/indexes/product_variants_v2/query';
  private readonly algoliaApiKey = 'ac96de6fef0e02bb95d433d8d5c7038a';
  private readonly algoliaAppId = '2FWOTDVM2O';

  /**
   * Proxy options to merge into axios requests, if SCRAPER_PROXY_URL is configured.
   */
  private get proxyAxiosOptions(): Partial<AxiosRequestConfig> {
    if (!config.scraper.proxyUrl) return {};
    return {
      httpsAgent: new HttpsProxyAgent(config.scraper.proxyUrl),
      proxy: false,
    };
  }

  /**
   * Search for sneaker prices on GOAT
   * @param query - Search query (e.g., "Jordan 1 Bred")
   * @param maxResults - Maximum number of results (default: 10)
   * @returns Array of GOAT listings with price data
   */
  async searchProducts(query: string, maxResults: number = 10): Promise<GOATListing[]> {
    try {
      logger.info({ query, maxResults }, 'Starting GOAT search');

      const response = await axios.post(
        this.algoliaUrl,
        {
          query,
          hitsPerPage: maxResults,
          filters: 'product_category:shoes',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-algolia-api-key': this.algoliaApiKey,
            'x-algolia-application-id': this.algoliaAppId,
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          timeout: 10000,
          ...this.proxyAxiosOptions,
        },
      );

      const hits = response.data.hits || [];
      const listings: GOATListing[] = [];

      for (const hit of hits) {
        // Skip items without price data
        if (!hit.lowest_price_cents) continue;

        listings.push({
          name: hit.name || '',
          slug: hit.slug || '',
          sku: hit.sku || hit.search_sku || '',
          lowestPriceCents: hit.lowest_price_cents,
          retailPriceCents: hit.retail_price_cents || null,
          instantShipPriceCents: hit.instant_ship_lowest_price_cents || null,
          brand: hit.brand_name || '',
          colorway: hit.details || '',
          imageUrl: hit.grid_picture_url || '',
          url: `https://www.goat.com/sneakers/${hit.slug}`,
          timestamp: new Date(),
        });
      }

      logger.info({ query, found: listings.length, maxResults }, 'GOAT search completed');

      return listings;
    } catch (error) {
      logger.error(
        { query, error: error instanceof Error ? error.message : String(error) },
        'GOAT search failed',
      );
      throw error;
    }
  }

  /**
   * Search for catalog discovery — no price filter.
   * Unlike searchProducts(), includes items with no active listings so
   * style code lookups find shoes that exist in GOAT's catalog but aren't
   * currently listed (common for Adidas and older releases).
   */
  async searchForDiscovery(query: string, maxResults: number = 10): Promise<GOATListing[]> {
    try {
      logger.info({ query, maxResults }, 'Starting GOAT discovery search');

      const response = await axios.post(
        this.algoliaUrl,
        { query, hitsPerPage: maxResults, filters: 'product_category:shoes' },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-algolia-api-key': this.algoliaApiKey,
            'x-algolia-application-id': this.algoliaAppId,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: 10000,
          ...this.proxyAxiosOptions,
        },
      );

      const hits = response.data.hits || [];
      const listings: GOATListing[] = hits.map((hit: any) => ({
        name: hit.name || '',
        slug: hit.slug || '',
        sku: hit.sku || hit.search_sku || '',
        lowestPriceCents: hit.lowest_price_cents || 0,
        retailPriceCents: hit.retail_price_cents || null,
        instantShipPriceCents: hit.instant_ship_lowest_price_cents || null,
        brand: hit.brand_name || '',
        colorway: hit.details || '',
        imageUrl: hit.grid_picture_url || '',
        url: `https://www.goat.com/sneakers/${hit.slug}`,
        timestamp: new Date(),
      }));

      logger.info({ query, found: listings.length }, 'GOAT discovery search completed');
      return listings;
    } catch (error) {
      logger.error(
        { query, error: error instanceof Error ? error.message : String(error) },
        'GOAT discovery search failed',
      );
      throw error;
    }
  }

  /**
   * Search and get prices for a specific SKU
   * @param sku - The product SKU code
   * @returns Price data if found
   */
  async getPriceForSku(sku: string): Promise<GOATListing | null> {
    try {
      const listings = await this.searchProducts(sku, 5);

      // Find exact SKU match — strip both spaces and hyphens for comparison
      // so "1201A482-102", "1201A482 102", and "1201A482102" all match
      const normalize = (s: string) => s.replace(/[-\s]/g, '').toLowerCase();
      const exactMatch = listings.find((l) => normalize(l.sku) === normalize(sku));

      if (exactMatch) {
        return exactMatch;
      }

      // Return first result if no exact match
      return listings.length > 0 ? listings[0] : null;
    } catch (error) {
      logger.error({ sku, error: error instanceof Error ? error.message : String(error) }, 'Failed to get GOAT price');
      return null;
    }
  }

  /**
   * Get price statistics from listings
   */
  static getPriceStats(listings: GOATListing[]): {
    min: number;
    max: number;
    avg: number;
    count: number;
  } | null {
    if (listings.length === 0) return null;

    const prices = listings.map((l) => l.lowestPriceCents / 100).sort((a, b) => a - b);

    return {
      min: prices[0],
      max: prices[prices.length - 1],
      avg: prices.reduce((a, b) => a + b, 0) / prices.length,
      count: prices.length,
    };
  }
}

export default new GoatScraper();
