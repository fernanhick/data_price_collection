import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { Browser, Page } from 'puppeteer';
import logger from '../../utils/logger.js';
import config from '../../config/index.js';
import { StockXListing } from '../../types/index.js';
import { StockxLookupStatus, recordStockxLookup } from '../pricing/stockxLookups.js';

export interface StockxLookupResult {
  status: StockxLookupStatus;
  listing: StockXListing | null;
}

interface SearchOutcome {
  listings: StockXListing[];
  // Set when the search itself broke (launch/navigation error, or a block or
  // challenge page instead of results), as opposed to StockX not listing it.
  error?: string;
}

const profileDir = () =>
  config.scraper.stockxProfileDir || path.join(os.homedir(), '.cache', 'sneakersbook', 'stockx-profile');

/**
 * StockX Price Scraper
 *
 * Uses Puppeteer headless browser to bypass Cloudflare protection
 * and scrape prices from StockX search results.
 *
 * Use the default export everywhere. Every caller shares one persistent
 * Chrome profile (a returning visitor looks less like a bot), and Chrome
 * allows one browser per profile, so all scrapes must queue on the same
 * instance's lock. Separate instances per route used to collide with
 * "The browser is already running for .../stockx-profile".
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

  // StockX prices differ per market and the IP decides the default (a UK exit
  // shows GBP). Pin the US market so every price is USD.
  private readonly marketCookies = [
    ['stockx_selected_region', 'US'],
    ['stockx_selected_currency', 'USD'],
    ['stockx_selected_locale', 'en'],
  ].map(([name, value]) => ({ name, value, domain: '.stockx.com', path: '/' }));

  /**
   * One consistent identity that matches the real browser: same Chrome major
   * version in the UA string and the client hints, and the real platform
   * (Linux). The old random mix (Chrome 120 / Firefox / Safari UA on a Chrome
   * 145 engine) was an easy bot tell. The untouched HeadlessChrome UA gets
   * blocked outright, so the override itself must stay.
   */
  private async getIdentity(browser: Browser) {
    const major = (await browser.version()).match(/\/(\d+)\./)?.[1] ?? '145';
    return {
      userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`,
      userAgentMetadata: {
        brands: [
          { brand: 'Google Chrome', version: major },
          { brand: 'Chromium', version: major },
          { brand: 'Not:A-Brand', version: '99' },
        ],
        fullVersion: `${major}.0.0.0`,
        platform: 'Linux',
        platformVersion: '',
        architecture: 'x86',
        model: '',
        mobile: false,
      },
    };
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
    const proxyUrl = config.scraper.stockxProxyUrl || config.scraper.proxyUrl;
    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      args.push(`--proxy-server=${proxy.protocol}//${proxy.host}`);
      if (proxy.username) {
        this.proxyAuth = {
          username: decodeURIComponent(proxy.username),
          password: decodeURIComponent(proxy.password),
        };
      }
    }

    const launch = () => puppeteer.launch({ headless: true, args, userDataDir: profileDir() });
    try {
      this.browser = await launch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/SingletonLock|already running/i.test(message)) throw error;
      // Scrapes are serialized, so a profile that is still locked here was
      // left behind by a Chrome that crashed or didn't close. Clear it and
      // retry once; the profile itself (cookies, history) is kept.
      this.releaseStaleProfile();
      this.browser = await launch();
    }

    return this.browser;
  }

  /** Kill any orphaned Chrome on our profile and remove its lock files. */
  private releaseStaleProfile(): void {
    const dir = profileDir();
    try {
      const pids = execFileSync('pgrep', ['-f', `--user-data-dir=${dir}`], { encoding: 'utf8' })
        .split('\n')
        .map((p) => parseInt(p, 10))
        .filter((p) => p > 0 && p !== process.pid);
      for (const pid of pids) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // already gone
        }
      }
      if (pids.length) logger.warn({ pids }, 'Killed orphaned StockX Chrome holding the profile');
    } catch {
      // pgrep exits 1 when nothing matches
    }
    for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
      fs.rmSync(path.join(dir, name), { force: true });
    }
    logger.warn({ dir }, 'Cleared stale StockX profile lock');
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
    return (await this.search(query, maxResults)).listings;
  }

  private search(query: string, maxResults: number): Promise<SearchOutcome> {
    return this.runExclusive(() => this._searchProducts(query, maxResults));
  }

  private async _searchProducts(query: string, maxResults: number = 10): Promise<SearchOutcome> {
    let page: Page | null = null;

    try {
      logger.info({ query, maxResults }, 'Starting StockX search with Puppeteer');

      const browser = await this.getBrowser();
      page = await browser.newPage();

      if (this.proxyAuth) {
        await page.authenticate(this.proxyAuth);
      }

      const identity = await this.getIdentity(browser);
      await page.setUserAgent(identity.userAgent, identity.userAgentMetadata);
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      await page.setCookie(...this.marketCookies);
      // Match the exit IP's location (the home VPS is in the UK); UTC is a server tell.
      await page.emulateTimezone(process.env.STOCKX_TIMEZONE || 'Europe/London');

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

            // USD only: the market cookies pin USD, and a £/€ price must never
            // be stored as dollars.
            const priceMatch = textContent.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);

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
      if (listings.length === 0) {
        // A real results page is titled "<query> at StockX"; anything else
        // (access denied, captcha, "Just a moment") is a block, not a miss.
        if (!/stockx/i.test(pageTitle)) {
          logger.warn({ query, pageTitle, pageUrl }, 'StockX served a block or challenge page');
          return { listings: [], error: `challenge page: ${pageTitle}` };
        }
        const nonUsd = await page.evaluate(
          // @ts-ignore - document exists in browser context
          () => /[£€]\s?\d/.test(document.body ? document.body.innerText : ''),
        );
        if (nonUsd) {
          logger.warn({ query }, 'StockX served non-USD prices; ignored');
          return { listings: [], error: 'non-USD prices' };
        }
      }

      const mapped = listings.map((l) => ({
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
      return { listings: mapped };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ query, error: message }, 'StockX search failed');
      return { listings: [], error: message };
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
    const { status, listing } = await this.lookup(sku);
    // On-demand lookups (catalog review, scan fallback) aren't budget-gated,
    // since a user is waiting, but they count against today's budget.
    await recordStockxLookup({ source: 'on_demand', status });
    return listing;
  }

  /** One StockX lookup with an outcome callers can act on. Not recorded. */
  async lookup(query: string): Promise<StockxLookupResult> {
    try {
      const { listings, error } = await this.search(query, 5);
      if (error) return { status: 'error', listing: null };
      return listings.length > 0
        ? { status: 'ok', listing: listings[0] }
        : { status: 'not_found', listing: null };
    } catch (error) {
      logger.error(
        { query, error: error instanceof Error ? error.message : String(error) },
        'Failed to get StockX price',
      );
      return { status: 'error', listing: null };
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
