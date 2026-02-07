/**
 * KicksDB Bulk Sneaker Fetcher
 *
 * Fetches sneakers from KicksDB API and adds them to the catalog.
 * Separate from the main system - runs independently for bulk imports.
 *
 * Free tier: 1,000 requests/month
 * API docs: https://docs.kicks.dev
 */

import dotenv from 'dotenv';
import { query } from '../db/index.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

dotenv.config();

interface KicksDBProduct {
  id: string;
  uuid?: string;
  slug?: string;
  sku?: string;
  styleId?: string;
  title?: string;
  primary_title?: string;
  secondary_title?: string;  // This is the colorway!
  brand?: string;
  model?: string;
  name?: string;
  colorway?: string;
  description?: string;  // May contain retail price info
  releaseDate?: string;
  retailPrice?: number;
  min_price?: number;      // Market minimum price
  max_price?: number;      // Market maximum price
  avg_price?: number;      // Market average price (best fallback)
  category?: string;
  productCategory?: string;
  product_type?: string;
  silhouette?: string;
  // Add other fields as needed based on actual API response
}

interface BulkFetchOptions {
  limit?: number;           // Max number of sneakers to fetch
  offset?: number;          // Starting offset for pagination
  brand?: string;           // Filter by brand
  minPrice?: number;        // Filter by minimum price
  maxPrice?: number;        // Filter by maximum price
  delayMs?: number;         // Delay between requests (for rate limiting)
}

const API_KEY = process.env.KICKSDB_API_KEY;
const API_BASE = process.env.KICKSDB_API_BASE || 'https://api.kicks.dev';

// Default to tier 2 for bulk imports
const DEFAULT_TIER = 2;

// Rate limiting: Free tier is 1,000 requests/month
// To be safe, we'll add delays between requests
const DEFAULT_DELAY_MS = 1000; // 1 second between requests

// Progress tracking file
const PROGRESS_FILE = path.join(process.cwd(), '.kicksdb-progress');

/**
 * Read last fetched offset from progress file
 */
function readProgress(): number {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const content = fs.readFileSync(PROGRESS_FILE, 'utf-8');
      const offset = parseInt(content.trim(), 10);
      return isNaN(offset) ? 0 : offset;
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to read progress file');
  }
  return 0;
}

/**
 * Save current offset to progress file
 */
function saveProgress(offset: number): void {
  try {
    fs.writeFileSync(PROGRESS_FILE, offset.toString(), 'utf-8');
  } catch (error) {
    logger.warn({ error }, 'Failed to save progress');
  }
}

/**
 * Fetch sneakers from KicksDB API
 */
async function fetchFromKicksDB(options: BulkFetchOptions = {}): Promise<KicksDBProduct[]> {
  const {
    limit = 100,
    offset = 0,
    brand,
    minPrice,
    maxPrice,
  } = options;

  if (!API_KEY || API_KEY === 'your-api-key-here') {
    throw new Error('KICKSDB_API_KEY not configured in .env file');
  }

  // Build query parameters
  // KicksDB uses 'page' instead of 'offset'
  const page = Math.floor(offset / limit) + 1;

  const params = new URLSearchParams({
    limit: limit.toString(),
    page: page.toString(),
  });

  // Add search query if brand is specified
  if (brand) {
    params.append('query', brand);
  }

  // Note: KicksDB doesn't support direct price filtering in query params
  // Price filtering will be done client-side if needed

  const url = `${API_BASE}/v3/stockx/products?${params.toString()}`;

  logger.info({ url, limit, offset, brand }, 'Fetching from KicksDB API');

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`KicksDB API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as any;

    // KicksDB StockX endpoint returns: { data: [...], pagination: {...} }
    let products = data.data || data.products || data;

    if (!Array.isArray(products)) {
      throw new Error('Unexpected API response format');
    }

    // Client-side price filtering if needed
    if (minPrice !== undefined || maxPrice !== undefined) {
      products = products.filter(p => {
        const price = p.retailPrice || p.retail_price || 0;
        if (minPrice !== undefined && price < minPrice) return false;
        if (maxPrice !== undefined && price > maxPrice) return false;
        return true;
      });
    }

    logger.info({ count: products.length, total: data.pagination?.total }, 'Fetched products from KicksDB');
    return products;

  } catch (error) {
    logger.error({ error, url }, 'Failed to fetch from KicksDB');
    throw error;
  }
}

/**
 * Extract retail price from description text
 */
function extractRetailPrice(description?: string): number | null {
  if (!description) return null;

  // Look for patterns like "retailed for $XXX" or "retail price of $XXX"
  const patterns = [
    /retailed?\s+(?:for|at|price)?\s*\$(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
    /retail\s+price\s+(?:of|was|is)?\s*\$(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
    /released?\s+at\s+\$(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
    /priced?\s+at\s+\$(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      // Remove commas and parse as float
      const price = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(price) && price > 0 && price < 10000) {
        return price;
      }
    }
  }

  return null;
}

/**
 * Extract release date from description text
 */
function extractReleaseDate(description?: string): string | null {
  if (!description) return null;

  // Look for patterns like "released on Month DD, YYYY" or "dropped on Month DD, YYYY"
  const patterns = [
    /(?:released|dropped|launched)\s+on\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i,
    /release\s+date[:\s]+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      try {
        const date = new Date(match[1]);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Map KicksDB product to our database schema
 */
function mapProductToSKU(product: KicksDBProduct) {
  // Extract style code (try multiple fields)
  const styleCode = product.styleId || product.sku || product.slug || product.id;

  // Get brand and model
  let brand = product.brand || '';
  let model = product.model || product.primary_title || product.title || product.name || '';

  // If model contains brand name, try to clean it up
  if (brand && model) {
    // Remove brand from model name if it's at the start
    const brandRegex = new RegExp(`^${brand}\\s+`, 'i');
    model = model.replace(brandRegex, '').trim();
  }

  // If no brand, try to extract from model name
  if (!brand && model) {
    const brandPatterns = [
      'Nike', 'Adidas', 'Jordan', 'Air Jordan', 'New Balance',
      'Asics', 'Puma', 'Reebok', 'Vans', 'Converse',
      'Yeezy', 'On', 'Hoka', 'Salomon', 'Balenciaga',
      'Golden Goose', 'Bottega Veneta', 'Crocs'
    ];

    for (const b of brandPatterns) {
      if (model.toLowerCase().includes(b.toLowerCase())) {
        brand = b;
        model = model.replace(new RegExp(b, 'i'), '').trim();
        break;
      }
    }
  }

  // Extract colorway from secondary_title (this is where KicksDB puts it)
  const colorway = product.secondary_title || product.colorway || null;

  // Try to get retail price, fallback to market price if not available
  let retailPrice = product.retailPrice || extractRetailPrice(product.description);

  // If no retail price found, use market price as fallback
  if (!retailPrice) {
    // Prefer average price, then min price as fallback
    retailPrice = product.avg_price || product.min_price || null;
  }

  // Try to extract release date from description
  const releaseDate = product.releaseDate || extractReleaseDate(product.description);

  // Get category
  const category = product.product_type || product.productCategory || product.category || product.silhouette || null;

  return {
    sku_code: styleCode,
    brand_style_code: styleCode,
    brand: brand || 'Unknown',
    model: model || 'Unknown Model',
    colorway: colorway,
    release_date: releaseDate,
    retail_price: retailPrice,
    category: category,
    tier: DEFAULT_TIER,
    // Map IDs - use StockX ID if available
    stockx_id: product.uuid || product.id || null,
    goat_id: null,
    ebay_query: null,
  };
}

/**
 * Insert sneaker into database with duplicate handling
 */
async function insertSneaker(sku: ReturnType<typeof mapProductToSKU>): Promise<boolean> {
  try {
    await query(
      `INSERT INTO skus (
        sku_code, brand_style_code, brand, model, colorway,
        release_date, retail_price, category, tier,
        stockx_id, goat_id, ebay_query
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (brand_style_code) DO NOTHING`,
      [
        sku.sku_code,
        sku.brand_style_code,
        sku.brand,
        sku.model,
        sku.colorway,
        sku.release_date,
        sku.retail_price,
        sku.category,
        sku.tier,
        sku.stockx_id,
        sku.goat_id,
        sku.ebay_query,
      ]
    );
    return true;
  } catch (error) {
    logger.error({ error, sku }, 'Failed to insert sneaker');
    return false;
  }
}

/**
 * Bulk fetch and import sneakers from KicksDB
 */
async function bulkFetch(options: BulkFetchOptions = {}) {
  const {
    limit = 100,
    offset = 0,
    delayMs = DEFAULT_DELAY_MS,
    ...filters
  } = options;

  logger.info({ limit, offset, filters }, 'Starting KicksDB bulk fetch');

  let totalFetched = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let currentOffset = offset;
  const batchSize = 100; // Fetch 100 at a time

  try {
    while (totalFetched < limit) {
      const remaining = limit - totalFetched;
      const fetchLimit = Math.min(batchSize, remaining);

      // Fetch batch
      const products = await fetchFromKicksDB({
        ...filters,
        limit: fetchLimit,
        offset: currentOffset,
      });

      if (products.length === 0) {
        logger.info('No more products available');
        break;
      }

      // Process each product
      for (const product of products) {
        const sku = mapProductToSKU(product);
        const inserted = await insertSneaker(sku);

        if (inserted) {
          totalInserted++;
          logger.info(
            {
              sku: sku.sku_code,
              brand: sku.brand,
              model: sku.model
            },
            'Added new sneaker'
          );
        } else {
          totalSkipped++;
        }
      }

      totalFetched += products.length;
      currentOffset += products.length;

      logger.info(
        {
          fetched: totalFetched,
          inserted: totalInserted,
          skipped: totalSkipped,
          progress: `${totalFetched}/${limit}`,
          currentOffset: currentOffset,
        },
        'Batch completed'
      );

      // Save progress after each batch
      saveProgress(currentOffset);

      // Rate limiting delay
      if (totalFetched < limit && products.length === fetchLimit) {
        logger.info({ delayMs }, 'Waiting before next request...');
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      // If we got fewer products than requested, we've reached the end
      if (products.length < fetchLimit) {
        logger.info('Reached end of available products');
        break;
      }
    }

    // Summary
    logger.info(
      {
        totalFetched,
        totalInserted,
        totalSkipped,
        duplicateRate: `${((totalSkipped / totalFetched) * 100).toFixed(1)}%`,
      },
      '✅ Bulk fetch completed'
    );

    return {
      fetched: totalFetched,
      inserted: totalInserted,
      skipped: totalSkipped,
    };

  } catch (error) {
    logger.error({ error }, '❌ Bulk fetch failed');
    throw error;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  // Parse CLI arguments
  let useContinue = false;
  const options: BulkFetchOptions = {
    limit: 100,
    delayMs: DEFAULT_DELAY_MS,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--offset':
        options.offset = parseInt(args[++i], 10);
        break;
      case '--continue':
      case '-c':
        useContinue = true;
        break;
      case '--brand':
        options.brand = args[++i];
        break;
      case '--min-price':
        options.minPrice = parseFloat(args[++i]);
        break;
      case '--max-price':
        options.maxPrice = parseFloat(args[++i]);
        break;
      case '--delay':
        options.delayMs = parseInt(args[++i], 10);
        break;
      case '--help':
        console.log(`
KicksDB Bulk Sneaker Fetcher

Usage:
  tsx src/scripts/bulk-fetch-kicksdb.ts [options]

Options:
  --limit <number>      Maximum number of sneakers to fetch (default: 100)
  --offset <number>     Starting offset for pagination (default: 0)
  --continue, -c        Continue from last saved position
  --brand <string>      Filter by brand name
  --min-price <number>  Filter by minimum retail price
  --max-price <number>  Filter by maximum retail price
  --delay <ms>          Delay between requests in ms (default: 1000)
  --help                Show this help message

Examples:
  # Fetch 500 sneakers
  tsx src/scripts/bulk-fetch-kicksdb.ts --limit 500

  # Continue from where you left off
  tsx src/scripts/bulk-fetch-kicksdb.ts --continue --limit 1000

  # Start from specific offset
  tsx src/scripts/bulk-fetch-kicksdb.ts --offset 2000 --limit 500

  # Fetch Nike sneakers only
  tsx src/scripts/bulk-fetch-kicksdb.ts --brand Nike --limit 200

  # Fetch sneakers in price range $100-$200
  tsx src/scripts/bulk-fetch-kicksdb.ts --min-price 100 --max-price 200 --limit 300

Note: Free tier is limited to 1,000 requests/month
Progress is automatically saved after each batch
        `);
        process.exit(0);
    }
  }

  // Use continue flag to resume from last position
  if (useContinue) {
    const lastOffset = readProgress();
    options.offset = lastOffset;
    console.log(`📍 Continuing from offset ${lastOffset}...`);
  }

  bulkFetch(options)
    .then(result => {
      console.log('\n✅ Success!');
      console.log(`   Fetched: ${result.fetched}`);
      console.log(`   Inserted: ${result.inserted}`);
      console.log(`   Skipped (duplicates): ${result.skipped}`);

      const finalOffset = (options.offset || 0) + result.fetched;
      console.log(`   Progress saved at offset: ${finalOffset}`);

      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    });
}

export { bulkFetch, fetchFromKicksDB, mapProductToSKU };
