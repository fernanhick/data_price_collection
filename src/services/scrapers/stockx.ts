import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { Browser, Page } from 'puppeteer';
import logger from '../../utils/logger.js';
import config from '../../config/index.js';
import { StockXListing } from '../../types/index.js';
import { StockxLookupStatus, recordStockxLookup } from '../pricing/stockxLookups.js';
import { MatchTarget, categoryAllowed, expectedCategory, pickMatch } from './stockxMatch.js';

export interface StockxLookupResult {
  status: StockxLookupStatus;
  listing: StockXListing | null;
}

// One search result, priced or not (a result with no asks shows "--").
interface SearchHit {
  name: string;
  urlKey: string;
  url: string;
  lowestAsk: number | null;
  category: string | null;
}

interface SearchOutcome {
  // Results with a USD ask, in StockX's order.
  listings: StockXListing[];
  // Every result read, priced or not, for picking the right product.
  hits: SearchHit[];
  // Set when the search itself broke (launch/navigation error, or a block or
  // challenge page instead of results), as opposed to StockX not listing it.
  error?: string;
}

// On-demand lookups (scan fallback, catalog review) are cached per style code.
// The app often asks for the same code twice within seconds (retries, two
// screens), and every repeat used to cost a real StockX hit from the budget.
// Misses are cached shorter so a newly listed shoe shows up the same day.
// Errors are never cached.
const ON_DEMAND_HIT_TTL_MS = 6 * 60 * 60_000;
const ON_DEMAND_MISS_TTL_MS = 2 * 60 * 60_000;
const ON_DEMAND_CACHE_MAX = 1000;

const cacheKey = (query: string) => query.toUpperCase().replace(/[^A-Z0-9]/g, '');

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

  private onDemandCache = new Map<string, { listing: StockXListing | null; expires: number }>();
  private onDemandInFlight = new Map<string, Promise<StockXListing | null>>();

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
        const products: {
          name: string;
          urlKey: string;
          url: string;
          lowestAsk: number | null;
          category: string | null;
        }[] = [];
        const seenUrls = new Set<string>();

        // The page embeds its search results as JSON (__NEXT_DATA__) with each
        // product's category; the tiles don't show it. urlKey -> category.
        const categories = new Map<string, string>();
        try {
          // @ts-ignore - document exists in browser context
          const raw = document.getElementById('__NEXT_DATA__')?.textContent;
          const walk = (o: any): void => {
            if (!o || typeof o !== 'object') return;
            if (typeof o.urlKey === 'string' && typeof o.productCategory === 'string') {
              categories.set(o.urlKey, o.productCategory);
            }
            for (const v of Object.values(o)) walk(v);
          };
          if (raw) walk(JSON.parse(raw));
        } catch (e) {
          // No category info; the name match still applies.
        }
        // USD only: the market cookies pin USD, and a £/€ price must never
        // be stored as dollars.
        const usd = (text: string) => {
          const m = text.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
          return m ? parseFloat(m[1].replace(/,/g, '')) : null;
        };
        const add = (name: string, href: string, price: number | null, needPrice: boolean) => {
          if (products.length >= max || !name || name.length <= 5) return;
          if (price !== null && price <= 0) price = null;
          if (needPrice && price === null) return;
          if (!href || seenUrls.has(href)) return;
          seenUrls.add(href);
          const urlKey = href.split('/').pop() || '';
          products.push({
            name,
            urlKey,
            url: href.startsWith('http') ? href : `https://stockx.com${href}`,
            lowestAsk: price,
            category: categories.get(urlKey) ?? null,
          });
        };

        // Current markup (since 2026-10-15): each result is a
        // div[data-testid=ProductTile] holding an empty overlay link
        // <a aria-label="<name>" href="/<slug>">, the name in a <p> and the
        // lowest ask in a <span>. The price is no longer inside the link.
        // @ts-ignore - document exists in browser context
        const tiles = Array.from(document.querySelectorAll('[data-testid="ProductTile"]')) as any[];
        for (const tile of tiles) {
          // Sponsored tiles (trading cards etc.) carry an "Ad"/"Sponsored" label.
          const labels = Array.from(tile.querySelectorAll('span, p, div')) as any[];
          if (labels.some((el) => el.children.length === 0 && /^(Ad|Sponsored)$/i.test((el.textContent || '').trim()))) {
            continue;
          }
          const link = tile.querySelector('a[href]');
          const name = (link?.getAttribute('aria-label') || tile.querySelector('p')?.textContent || '').trim();
          const priceText = (Array.from(tile.querySelectorAll('span')) as any[])
            .map((el) => el.textContent || '')
            .find((t: string) => /\$\d/.test(t));
          // Unpriced tiles are kept: if the real match has no ask, the answer
          // is "no StockX price", not the next lookalike's price.
          add(name, link?.getAttribute('href') || '', usd(priceText || ''), false);
        }
        if (tiles.length > 0) return products;

        // Older markup: the whole card was a link containing name and price.
        // @ts-ignore - document exists in browser context
        const productLinks = document.querySelectorAll('a[href*="/"]');
        // @ts-ignore - el is HTMLElement in browser context
        productLinks.forEach((el) => {
          try {
            const href = el.getAttribute('href') || '';
            if (!href.includes('/') || href.includes('/search') || href.includes('/browse')) return;
            const textContent = el.textContent?.trim() || '';
            let name = el.querySelector('p, span, div')?.textContent?.trim() || '';
            if (!name && textContent) name = textContent.replace(/[£$€][\d,]+(?:\.\d{2})?/g, '').trim();
            name = name
              .replace(/Lowest Ask.*$/i, '')
              .replace(/Xpress Ship.*$/i, '')
              .replace(/Sponsored.*$/i, '')
              .replace(/US [MW] \d+.*$/i, '')
              .trim();
            add(name, href, usd(textContent), true);
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
          return { listings: [], hits: [], error: `challenge page: ${pageTitle}` };
        }
        const nonUsd = await page.evaluate(
          // @ts-ignore - document exists in browser context
          () => /[£€]\s?\d/.test(document.body ? document.body.innerText : ''),
        );
        if (nonUsd) {
          logger.warn({ query }, 'StockX served non-USD prices; ignored');
          return { listings: [], hits: [], error: 'non-USD prices' };
        }
        // StockX says it has results but none could be read: the page markup
        // changed under the parser. An error (trips the breaker + Telegram),
        // not a quiet "not listed" like the silent 2026-10-15 outage.
        const resultCount = await page.evaluate(() => {
          // @ts-ignore - document exists in browser context
          const m = (document.body ? document.body.innerText : '').match(/Browse ([\d,]+) results/);
          return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
        });
        if (resultCount > 0) {
          logger.error({ query, resultCount }, 'StockX listed results the parser could not read');
          return { listings: [], hits: [], error: `unparsed results: ${resultCount}` };
        }
      }

      const mapped = listings.filter((l) => l.lowestAsk !== null).map((l) => this.toListing(l));
      return { listings: mapped, hits: listings };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ query, error: message }, 'StockX search failed');
      return { listings: [], hits: [], error: message };
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
      // Close Chrome after every scrape so no idle browser stays resident in RAM.
      await this.closeBrowser().catch(() => {});
    }
  }

  private toListing(l: SearchHit): StockXListing {
    return {
      name: l.name,
      urlKey: l.urlKey,
      sku: '', // SKU not easily available from search
      lowestAsk: l.lowestAsk ?? 0,
      highestBid: null,
      lastSale: null,
      retailPrice: null,
      brand: '',
      colorway: '',
      imageUrl: '',
      url: l.url,
      timestamp: new Date(),
    };
  }

  /**
   * Search and get prices for a specific SKU
   * @param sku - The product SKU code or search query
   * @returns Price data if found
   */
  async getPriceForSku(sku: string): Promise<StockXListing | null> {
    const key = cacheKey(sku);
    if (!key) return null;

    const cached = this.onDemandCache.get(key);
    if (cached && cached.expires > Date.now()) {
      logger.info({ query: sku, hit: !!cached.listing }, 'StockX on-demand cache hit');
      return cached.listing;
    }
    // Same code already being looked up: share that result.
    const inFlight = this.onDemandInFlight.get(key);
    if (inFlight) {
      logger.info({ query: sku }, 'StockX on-demand lookup joined in-flight request');
      return inFlight;
    }

    const request = (async () => {
      const { status, listing } = await this.lookup(sku);
      // On-demand lookups aren't budget-gated, since a user is waiting, but
      // they count against today's budget.
      await recordStockxLookup({ source: 'on_demand', status });
      if (status !== 'error') {
        if (this.onDemandCache.size >= ON_DEMAND_CACHE_MAX) {
          const now = Date.now();
          for (const [k, v] of this.onDemandCache) if (v.expires <= now) this.onDemandCache.delete(k);
          // Still full: drop the oldest entries (Map keeps insertion order).
          for (const k of this.onDemandCache.keys()) {
            if (this.onDemandCache.size < ON_DEMAND_CACHE_MAX) break;
            this.onDemandCache.delete(k);
          }
        }
        this.onDemandCache.set(key, {
          listing,
          expires: Date.now() + (listing ? ON_DEMAND_HIT_TTL_MS : ON_DEMAND_MISS_TTL_MS),
        });
      }
      return listing;
    })().finally(() => this.onDemandInFlight.delete(key));

    this.onDemandInFlight.set(key, request);
    return request;
  }

  /**
   * One StockX lookup with an outcome callers can act on. Not recorded.
   * With `match` (our model/colorway) it takes the result that names our
   * sneaker instead of the first one with a price; see stockxMatch.ts.
   */
  async lookup(query: string, match?: MatchTarget): Promise<StockxLookupResult> {
    try {
      const { hits: allHits, error } = await this.search(query, 20);
      if (error) return { status: 'error', listing: null };

      // Only the same kind of product: a shoe is never priced with a LEGO set,
      // a keychain or jeans. On-demand scans (no match target) are shoes.
      const expected = expectedCategory(match);
      const hits = allHits.filter((h) => categoryAllowed(expected, h.category));
      if (hits.length < allHits.length) {
        logger.info(
          { query, expected, dropped: allHits.filter((h) => !hits.includes(h)).map((h) => `${h.name} (${h.category})`) },
          'StockX results of another product type ignored',
        );
      }

      if (!match) {
        const first = hits.find((h) => h.lowestAsk !== null);
        return first ? { status: 'ok', listing: this.toListing(first) } : { status: 'not_found', listing: null };
      }

      const listings = hits.filter((h) => h.lowestAsk !== null);
      const { best, score } = pickMatch(match, hits);
      if (!best) {
        logger.info({ query, match, score, top: hits[0]?.name }, 'No StockX result matches our sneaker');
        return { status: 'not_found', listing: null };
      }
      if (best.lowestAsk === null) {
        logger.info({ query, name: best.name }, 'StockX match has no ask');
        return { status: 'not_found', listing: null };
      }
      if (listings[0] && best.urlKey !== listings[0].urlKey) {
        logger.info({ query, picked: best.name, skipped: listings[0].name, score }, 'StockX matched by name');
      }
      return { status: 'ok', listing: this.toListing(best) };
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
