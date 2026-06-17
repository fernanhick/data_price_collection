import puppeteer, { Browser, Page } from 'puppeteer';
import logger from '../../utils/logger.js';
import config from '../../config/index.js';
import { StockXListing } from '../../types/index.js';

/**
 * StockX Price Scraper
 *
 * Uses Puppeteer headless browser to bypass Cloudflare protection
 * and scrape prices from StockX search results.
 */
export class StockxScraper {
  private browser: Browser | null = null;
  private proxyAuth: { username: string; password: string } | null = null;
  private readonly baseUrl = 'https://stockx.com';

  // Serialize all scrapes: only one headless Chrome may run at a time, so a
  // scheduled tier job and an on-lookup price fetch can never spawn parallel
  // browsers — the multiplier that OOM-killed the 1GB instance.
  private scrapeChain: Promise<unknown> = Promise.resolve();

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.scrapeChain.then(fn, fn);
    // Keep the chain alive regardless of this run's outcome.
    this.scrapeChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private readonly userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  ];

  private getRandomUserAgent(): string {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  /**
   * Initialize a fresh browser instance
   */
  private async getBrowser(): Promise<Browser> {
    // Always create a fresh browser to avoid detection
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }

    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1280,800',
      '--disable-blink-features=AutomationControlled',
      // Memory-thrifty flags for the 1GB instance
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-features=site-per-process',
      '--js-flags=--max-old-space-size=256',
    ];

    this.proxyAuth = null;
    if (config.scraper.proxyUrl) {
      const proxy = new URL(config.scraper.proxyUrl);
      args.push(`--proxy-server=${proxy.protocol}//${proxy.host}`);
      if (proxy.username) {
        this.proxyAuth = {
          username: decodeURIComponent(proxy.username),
          password: decodeURIComponent(proxy.password),
        };
      }
    }

    this.browser = await puppeteer.launch({
      headless: true,
      args,
    });

    return this.browser;
  }

  /**
   * Close the browser instance
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Search for sneaker prices on StockX
   * @param query - Search query (e.g., "Jordan 1 Bred")
   * @param maxResults - Maximum number of results (default: 10)
   * @returns Array of StockX listings with price data
   */
  async searchProducts(query: string, maxResults: number = 10): Promise<StockXListing[]> {
    return this.runExclusive(() => this._searchProducts(query, maxResults));
  }

  private async _searchProducts(query: string, maxResults: number = 10): Promise<StockXListing[]> {
    let page: Page | null = null;

    try {
      logger.info({ query, maxResults }, 'Starting StockX search with Puppeteer');

      const browser = await this.getBrowser();
      page = await browser.newPage();

      if (this.proxyAuth) {
        await page.authenticate(this.proxyAuth);
      }

      // Set a randomized user agent
      await page.setUserAgent(this.getRandomUserAgent());

      // Set viewport
      await page.setViewport({ width: 1280, height: 800 });

      // Block images, media, fonts, and CSS — we only parse the DOM, so not
      // loading them roughly halves Chrome's memory (and speeds the scrape up).
      // Does not affect the Cloudflare bypass, which relies on JS + cookies.
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const type = req.resourceType();
        if (type === 'image' || type === 'media' || type === 'font' || type === 'stylesheet') {
          req.abort().catch(() => {});
        } else {
          req.continue().catch(() => {});
        }
      });

      // Navigate to search page
      const searchUrl = `${this.baseUrl}/search?s=${encodeURIComponent(query)}`;
      logger.debug({ url: searchUrl }, 'Navigating to StockX search');

      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      // Wait a bit for any JS / Cloudflare challenge to execute
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Wait for products to load - try multiple selectors
      await page.waitForSelector('[data-testid="product-tile"], [class*="ProductCard"], [class*="product-card"], a[href*="/product/"]', { timeout: 15000 }).catch(() => {
        logger.debug('Product tiles not found with any selector');
      });

      // Log page info for debugging
      const pageTitle = await page.title();
      const pageUrl = page.url();
      logger.info({ pageTitle, pageUrl }, 'Page loaded');

      // Extract product data
      const listings = await page.evaluate((max) => {
        const products: any[] = [];

        // Find all product links - StockX uses links to product pages
        // @ts-ignore - document exists in browser context
        const productLinks = document.querySelectorAll('a[href*="/"]');

        const seenUrls = new Set<string>();

        // @ts-ignore - el is HTMLElement in browser context
        productLinks.forEach((el) => {
          if (products.length >= max) return;

          try {
            const href = el.getAttribute('href') || '';

            // Only process product links (not category links, etc.)
            if (!href.includes('/') || href.includes('/search') || href.includes('/browse')) return;

            // Skip duplicates
            if (seenUrls.has(href)) return;
            seenUrls.add(href);

            // Get product name from the link or its children
            const textContent = el.textContent?.trim() || '';

            // Look for price pattern (currency symbol followed by numbers)
            const priceMatch = textContent.match(/[£$€](\d+(?:,\d{3})*(?:\.\d{2})?)/);

            // Get the product name - usually before the price
            let name = '';
            const nameEl = el.querySelector('p, span, div');
            if (nameEl) {
              name = nameEl.textContent?.trim() || '';
            }

            // If no specific name element, try to extract from text content
            if (!name && textContent) {
              // Remove price and get the rest as name
              name = textContent.replace(/[£$€][\d,]+(?:\.\d{2})?/g, '').trim();
            }

            const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;

            // Only add if we have a valid product (name contains "Jordan" or other keywords and has a price)
            if (name && price && price > 0 && name.length > 5) {
              // Clean the name - remove "Lowest Ask", "Xpress Ship", etc.
              let cleanName = name
                .replace(/Lowest Ask.*$/i, '')
                .replace(/Xpress Ship.*$/i, '')
                .replace(/Sponsored.*$/i, '')
                .replace(/US [MW] \d+.*$/i, '')
                .trim();

              if (cleanName.length > 5) {
                products.push({
                  name: cleanName,
                  urlKey: href.split('/').pop() || '',
                  url: href.startsWith('http') ? href : `https://stockx.com${href}`,
                  lowestAsk: price,
                });
              }
            }
          } catch (e) {
            // Skip this element
          }
        });

        return products;
      }, maxResults);

      logger.info({ query, found: listings.length, maxResults }, 'StockX search completed');

      return listings.map((l) => ({
        name: l.name,
        urlKey: l.urlKey,
        sku: '', // SKU not easily available from search
        lowestAsk: l.lowestAsk,
        highestBid: null,
        lastSale: null,
        retailPrice: null,
        brand: '',
        colorway: '',
        imageUrl: '',
        url: l.url,
        timestamp: new Date(),
      }));
    } catch (error) {
      logger.error(
        { query, error: error instanceof Error ? error.message : String(error) },
        'StockX search failed',
      );
      return [];
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
      // Close Chrome after every scrape so no idle browser stays resident in RAM.
      await this.closeBrowser().catch(() => {});
    }
  }

  /**
   * Search and get prices for a specific SKU
   * @param sku - The product SKU code or search query
   * @returns Price data if found
   */
  async getPriceForSku(sku: string): Promise<StockXListing | null> {
    try {
      const listings = await this.searchProducts(sku, 5);
      return listings.length > 0 ? listings[0] : null;
    } catch (error) {
      logger.error(
        { sku, error: error instanceof Error ? error.message : String(error) },
        'Failed to get StockX price',
      );
      return null;
    }
  }

  /**
   * Get price statistics from listings
   */
  static getPriceStats(listings: StockXListing[]): {
    min: number;
    max: number;
    avg: number;
    count: number;
  } | null {
    if (listings.length === 0) return null;

    const prices = listings.map((l) => l.lowestAsk).sort((a, b) => a - b);

    return {
      min: prices[0],
      max: prices[prices.length - 1],
      avg: prices.reduce((a, b) => a + b, 0) / prices.length,
      count: prices.length,
    };
  }
}

export default new StockxScraper();
