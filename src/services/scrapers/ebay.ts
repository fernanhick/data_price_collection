import { load } from 'cheerio';
import { fetchUrl } from '../../utils/http.js';
import logger from '../../utils/logger.js';
import config from '../../config/index.js';
import { eBayListing } from '../../types/index.js';

/**
 * eBay Sold Listings Scraper
 *
 * Fetches sold listings from eBay's public search results.
 * Uses public URLs, no API access required.
 *
 * Supports condition filtering and outlier removal.
 */
export class EbayScraper {
  private readonly baseUrl = 'https://www.ebay.com/sch/i.html';

  /**
   * Condition code mappings
   */
  private readonly conditionCodeMap: Record<string, number> = {
    'brand new': 1000,
    'new': 1000,
    'new other': 1500,
    'new (other)': 1500,
    'refurbished': 2000,
    'refurbished (certified)': 2000,
    'refurbished (seller)': 2500,
    'used': 3000,
    'very good': 4000,
    'good': 5000,
    'acceptable': 6000,
    'for parts or not working': 7000,
  };

  /**
   * Search for sold listings on eBay
   * @param query - Search query (e.g., "Nike Jordan 1 Bred")
   * @param maxResults - Maximum number of listings to extract (default: 10)
   * @returns Array of eBay listings with price data
   */
  async searchSoldListings(query: string, maxResults: number = 10): Promise<eBayListing[]> {
    try {
      logger.info({ query, maxResults }, 'Starting eBay search for sold listings');

      // Get condition codes from config
      const conditionCodes = config.scraper.ebay?.conditionCodes || ['1000', '1500', '3000', '4000'];
      const enableOutlierFiltering = config.scraper.ebay?.enableOutlierFiltering ?? false;

      let allListings: eBayListing[] = [];

      // Fetch listings for each condition code
      for (const conditionCode of conditionCodes) {
        try {
          const searchUrl = this.buildSearchUrl(query, conditionCode);
          const html = await fetchUrl(searchUrl);
          const listings = this.parseListings(html);

          logger.debug(
            { query, conditionCode, found: listings.length },
            'eBay search completed for condition',
          );

          allListings.push(...listings);

          // Add delay between condition queries to avoid rate limiting
          if (conditionCodes.indexOf(conditionCode) < conditionCodes.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        } catch (error) {
          logger.warn(
            { query, conditionCode, error: error instanceof Error ? error.message : String(error) },
            'Failed to fetch listings for condition code',
          );
          // Continue with other conditions if one fails
        }
      }

      // Apply IQR outlier filtering if enabled
      if (enableOutlierFiltering && allListings.length > 0) {
        allListings = this.filterOutliers(allListings);
      }

      logger.info({ query, found: allListings.length, maxResults }, 'eBay search completed');

      return allListings.slice(0, maxResults);
    } catch (error) {
      logger.error(
        { query, error: error instanceof Error ? error.message : String(error) },
        'eBay search failed',
      );
      throw error;
    }
  }

  /**
   * Build search URL with parameters
   * @param query - Search query
   * @param conditionCode - eBay condition code (1000, 1500, 3000, 4000, etc.)
   */
  private buildSearchUrl(query: string, conditionCode: string = '3000'): string {
    const params = new URLSearchParams({
      _nkw: query, // Keyword search
      LH_Sold: '1', // Sold items filter
      LH_Complete: '1', // Completed listings
      LH_ItemCondition: conditionCode, // Condition code
      rt: 'nc', // Return to normal categories
      _trksid: 'p3507.c0.m570',
      pgn: '1',
    });

    return `${this.baseUrl}?${params.toString()}`;
  }

  /**
   * Parse HTML and extract listings
   */
  private parseListings(html: string): eBayListing[] {
    const $ = load(html);
    const listings: eBayListing[] = [];

    // eBay updated their HTML structure - now uses .s-card instead of .s-item
    const listingElements = $('.s-card');

    const minConditionThreshold = config.scraper.ebay?.minConditionThreshold ?? 3000;

    listingElements.each((_index, element) => {
      try {
        const $item = $(element);

        // Extract title using new selector
        const title = $item.find('.s-card__title').text().trim();
        if (!title) return; // Skip if no title

        // Extract price using new selector
        let priceText = $item.find('.s-card__price').first().text().trim();

        // Parse price (handle "Sold" items showing previous price)
        const price = this.parsePrice(priceText);
        if (!price) return; // Skip if price can't be parsed

        // Extract URL using new selector
        const url = $item.find('.s-card__link').attr('href') || '';
        if (!url) return;

        // Extract subtitle/condition (optional)
        const conditionText = $item.find('.s-card__subtitle').text().trim();
        const conditionId = this.parseConditionId(conditionText);

        // Filter by minimum condition threshold
        if (conditionId && conditionId < minConditionThreshold) {
          logger.debug({ title, conditionId, minConditionThreshold }, 'Filtered out below threshold');
          return;
        }

        listings.push({
          title,
          price,
          url,
          condition: conditionText,
          conditionId,
          timestamp: new Date(),
        });

        logger.debug({ title, price, url, condition: conditionText, conditionId }, 'Extracted listing');
      } catch (error) {
        logger.debug(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to parse listing element',
        );
      }
    });

    return listings;
  }

  /**
   * Parse price from text (handles currency symbols, commas, etc.)
   * @example "$150.00" -> 150
   * @example "$1,500.99" -> 1500.99
   * @example "to $200.00" -> 200
   */
  private parsePrice(priceText: string): number | null {
    if (!priceText) return null;

    // Remove common non-numeric characters except decimal point
    const cleanPrice = priceText
      .replace(/[^\d.]/g, '') // Remove everything except digits and decimal
      .split(',')
      .join(''); // Remove commas

    const price = parseFloat(cleanPrice);

    // Return price if it's a valid number
    return !isNaN(price) && price > 0 ? price : null;
  }

  /**
   * Parse condition text and map to numeric condition ID
   * @example "Used" -> 3000
   * @example "Very Good" -> 4000
   */
  private parseConditionId(conditionText: string): number | null {
    if (!conditionText) return null;

    const normalized = conditionText.toLowerCase().trim();

    // Direct lookup
    if (this.conditionCodeMap[normalized]) {
      return this.conditionCodeMap[normalized];
    }

    // Partial matching for common variations
    for (const [condition, code] of Object.entries(this.conditionCodeMap)) {
      if (normalized.includes(condition) || condition.includes(normalized)) {
        return code;
      }
    }

    return null;
  }

  /**
   * Filter outliers using IQR (Interquartile Range) method
   * Removes prices outside [Q1 - 1.5×IQR, Q3 + 1.5×IQR]
   */
  private filterOutliers(listings: eBayListing[]): eBayListing[] {
    if (listings.length < 4) {
      // Need at least 4 prices for IQR calculation
      return listings;
    }

    const prices = listings.map((l) => l.price).sort((a, b) => a - b);

    // Calculate quartiles
    const q1Index = Math.floor(prices.length * 0.25);
    const q3Index = Math.floor(prices.length * 0.75);

    const q1 = prices[q1Index];
    const q3 = prices[q3Index];
    const iqr = q3 - q1;

    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const filtered = listings.filter((listing) => {
      const isOutlier = listing.price < lowerBound || listing.price > upperBound;
      if (isOutlier) {
        logger.debug(
          { price: listing.price, lowerBound, upperBound },
          'Filtered outlier price',
        );
      }
      return !isOutlier;
    });

    logger.info(
      { original: listings.length, filtered: filtered.length, lowerBound, upperBound },
      'IQR outlier filtering applied',
    );

    // Return filtered if we have enough data, otherwise return original
    return filtered.length >= 4 ? filtered : listings;
  }

  /**
   * Search eBay sold listings for catalog info by style code.
   * Used as a last-resort fallback when GOAT, KicksDB, and StockX all fail.
   * Extracts brand + model name from listing titles that contain the style code.
   */
  async searchCatalogByStyleCode(styleCode: string): Promise<{
    name: string;
    brand: string;
    colorway: string;
  } | null> {
    try {
      logger.info({ styleCode }, 'eBay catalog fallback: searching by style code');

      const searchUrl = this.buildSearchUrl(styleCode, '1000'); // new condition for best titles
      const html = await fetchUrl(searchUrl);
      const $ = load(html);

      const normalize = (s: string) => s.replace(/[-\s]/g, '').toLowerCase();
      const normalizedCode = normalize(styleCode);

      const KNOWN_BRANDS = ['Nike', 'Adidas', 'Jordan', 'New Balance', 'Yeezy', 'Puma',
        'Reebok', 'Converse', 'Vans', 'Asics', 'Hoka', 'Salomon', 'On'];

      let best: { name: string; brand: string; colorway: string } | null = null;

      $('.s-card').each((_i, el) => {
        if (best) return; // stop after first match
        const title = $(el).find('.s-card__title').text().trim();
        if (!title) return;
        // Only use listings whose title contains the style code (confirms it's the right shoe)
        if (!normalize(title).includes(normalizedCode)) return;

        const brand = KNOWN_BRANDS.find(b => title.toLowerCase().includes(b.toLowerCase())) || 'Unknown';
        const colorwayMatch = title.match(/['"]([^'"]+)['"]/);
        const colorway = colorwayMatch ? colorwayMatch[1] : '';
        best = { name: title, brand, colorway };
      });

      if (best) {
        logger.info({ styleCode, result: best }, 'eBay catalog fallback found result');
      } else {
        logger.info({ styleCode }, 'eBay catalog fallback found no matching listing');
      }

      return best;
    } catch (error) {
      logger.warn(
        { styleCode, error: error instanceof Error ? error.message : String(error) },
        'eBay catalog fallback failed',
      );
      return null;
    }
  }

  /**
   * Get price statistics from listings
   */
  static getPriceStats(listings: eBayListing[]): {
    min: number;
    max: number;
    avg: number;
    median: number;
    count: number;
  } | null {
    if (listings.length === 0) return null;

    const prices = listings.map((l) => l.price).sort((a, b) => a - b);

    const min = prices[0];
    const max = prices[prices.length - 1];
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const median =
      prices.length % 2 === 0
        ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
        : prices[Math.floor(prices.length / 2)];

    return { min, max, avg, median, count: prices.length };
  }
}

export default new EbayScraper();
