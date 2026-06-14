import logger from '../../utils/logger.js';
import { StockXListing } from '../../types/index.js';
import { getAccessToken } from '../stockx/tokenManager.js';

/**
 * StockX Official API v2 Client
 *
 * Uses the official StockX API with OAuth 2.0 authentication.
 * Requires STOCKX_CLIENT_ID, STOCKX_CLIENT_SECRET, and STOCKX_API_KEY env vars,
 * plus tokens obtained via GET /api/auth/stockx (one-time OAuth flow).
 *
 * This is intended to replace the Puppeteer-based StockxScraper once validated.
 */

const API_BASE = 'https://api.stockx.com/v2';

interface StockXProduct {
  productId: string;
  brand: string;
  styleId: string;
  urlKey: string;
  title: string;
  productAttributes: {
    colorway: string | null;
    retailPrice: number | null;
    gender: string | null;
    releaseDate: string | null;
  };
}

interface StockXVariant {
  variantId: string;
  variantName: string;
}

interface StockXMarketData {
  lowestAskAmount: number | null;
  highestBidAmount: number | null;
}

export class StockxApiScraper {
  private get apiKey(): string {
    return process.env.STOCKX_API_KEY || '';
  }

  private async request<T>(path: string): Promise<T> {
    const accessToken = await getAccessToken();

    const resp = await fetch(`${API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!resp.ok) {
      throw new Error(`StockX API ${resp.status}: ${path}`);
    }

    return resp.json() as Promise<T>;
  }

  /**
   * Search for products by query (style code or name)
   */
  async searchProducts(query: string, maxResults: number = 10): Promise<StockXListing[]> {
    try {
      logger.info({ query, maxResults }, 'Starting StockX API search');

      const params = new URLSearchParams({
        query,
        pageNumber: '1',
        pageSize: String(Math.min(maxResults, 10)),
      });

      const data = await this.request<{ products: StockXProduct[]; count: number }>(
        `/catalog/search?${params}`,
      );

      if (!data.products?.length) {
        logger.info({ query }, 'StockX API search returned no products');
        return [];
      }

      const product = data.products[0];
      const { lowestAsk, highestBid } = await this.getMarketData(product.productId);

      const listing: StockXListing = {
        name: product.title,
        urlKey: product.urlKey,
        sku: product.styleId || '',
        lowestAsk: lowestAsk ?? 0,
        highestBid: highestBid,
        lastSale: null,
        retailPrice: product.productAttributes?.retailPrice ?? null,
        brand: product.brand || '',
        colorway: product.productAttributes?.colorway || '',
        imageUrl: '',
        url: `https://stockx.com/${product.urlKey}`,
        timestamp: new Date(),
      };

      logger.info(
        { query, found: data.products.length, lowestAsk },
        'StockX API search completed',
      );

      return lowestAsk !== null ? [listing] : [];
    } catch (error) {
      logger.error(
        { query, error: error instanceof Error ? error.message : String(error) },
        'StockX API search failed',
      );
      return [];
    }
  }

  /**
   * Get the lowest ask and highest bid across all variants for a product
   */
  private async getMarketData(
    productId: string,
  ): Promise<{ lowestAsk: number | null; highestBid: number | null }> {
    try {
      const variants = await this.request<StockXVariant[]>(
        `/catalog/products/${productId}/variants`,
      );

      logger.debug({ productId, variantCount: variants?.length }, 'StockX variants fetched');

      if (!variants?.length) return { lowestAsk: null, highestBid: null };

      // Pick a few mid-range variants (common sizes) rather than iterating all ~20
      // Sizes are sorted smallest to largest — take up to 5 from the middle
      const mid = Math.floor(variants.length / 2);
      const sample = variants.slice(Math.max(0, mid - 2), mid + 3);

      for (const variant of sample) {
        try {
          await new Promise((r) => setTimeout(r, 1100)); // respect 1 req/sec limit
          const market = await this.request<StockXMarketData>(
            `/catalog/products/${productId}/variants/${variant.variantId}/market-data`,
          );
          logger.debug({ variantId: variant.variantId, variantName: variant.variantName, market }, 'StockX market data');

          if (market.lowestAskAmount !== null && market.lowestAskAmount > 0) {
            // Return on first valid price found — no need to check all sizes
            return { lowestAsk: market.lowestAskAmount, highestBid: market.highestBidAmount };
          }
        } catch (err) {
          logger.debug({ variantId: variant.variantId, err: err instanceof Error ? err.message : String(err) }, 'StockX market data fetch failed for variant');
        }
      }

      return { lowestAsk: null, highestBid: null };
    } catch (err) {
      logger.debug({ productId, err: err instanceof Error ? err.message : String(err) }, 'StockX getMarketData failed');
      return { lowestAsk: null, highestBid: null };
    }
  }

  /**
   * Get price for a specific style code / search query
   */
  async getPriceForSku(sku: string): Promise<StockXListing | null> {
    try {
      const listings = await this.searchProducts(sku, 5);
      return listings.length > 0 ? listings[0] : null;
    } catch (error) {
      logger.error(
        { sku, error: error instanceof Error ? error.message : String(error) },
        'StockX API getPriceForSku failed',
      );
      return null;
    }
  }
}

export default new StockxApiScraper();
