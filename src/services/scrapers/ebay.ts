import { load } from 'cheerio';
import { fetchUrl, delay, getRandomDelay } from '../../utils/http.js';
import logger from '../../utils/logger.js';
import { eBayListing } from '../../types/index.js';

/**
 * eBay Sold Listings Scraper
 *
 * Fetches sold listings from eBay's public search results.
 * Uses public URLs, no API access required.
 */
export class EbayScraper {
  private readonly baseUrl = 'https://www.ebay.com/sch/i.html';
  private readonly soldFilter = '&LH_Sold=1'; // Filter for sold items

  /**
   * Search for sold listings on eBay
   * @param query - Search query (e.g., "Nike Jordan 1 Bred")
   * @param maxResults - Maximum number of listings to extract (default: 10)
   * @returns Array of eBay listings with price data
   */
  async searchSoldListings(query: string, maxResults: number = 10): Promise<eBayListing[]> {
    try {
      logger.info({ query, maxResults }, 'Starting eBay search for sold listings');

      // Build search URL
      const searchUrl = this.buildSearchUrl(query);

      // Fetch the search results page
      const html = await fetchUrl(searchUrl);

      // Parse HTML
      const listings = this.parseListings(html);

      logger.info(
        { query, found: listings.length, maxResults },
        'eBay search completed',
      );

      return listings.slice(0, maxResults);
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
   */
  private buildSearchUrl(query: string): string {
    const params = new URLSearchParams({
      _nkw: query, // Keyword search
      LH_Sold: '1', // Sold items filter
      LH_Complete: '1', // Completed listings
      LH_ItemCondition: '3000', // Used items (can adjust to '4000' for 'Not Applicable' etc)
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

    // eBay uses div elements with specific classes for listings
    const listingElements = $('div.s-item');

    listingElements.each((index, element) => {
      try {
        const $item = $(element);

        // Extract title
        const title = $item.find('.s-item__title').text().trim();
        if (!title) return; // Skip if no title

        // Extract price - eBay shows price in multiple possible locations
        let priceText = $item.find('.s-item__price').text().trim();

        // Fallback: look for price in alternative locations
        if (!priceText) {
          priceText = $item.find('.BOLD').text().trim();
        }

        // Parse price (handle "Sold" items showing previous price)
        const price = this.parsePrice(priceText);
        if (!price) return; // Skip if price can't be parsed

        // Extract URL
        const url = $item.find('.s-item__link').attr('href') || '';
        if (!url) return;

        // Extract seller info (optional)
        const sellerInfo = $item.find('.s-item__etrs').text().trim();

        // Extract item condition
        const condition = $item.find('.SECONDARY_INFO').text().trim();

        listings.push({
          title,
          price,
          url,
          timestamp: new Date(),
        });

        logger.debug(
          { title, price, url, condition, sellerInfo },
          'Extracted listing',
        );
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
