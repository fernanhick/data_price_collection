/**
 * KicksDB Script (Consolidated)
 *
 * Fetches sneakers from KicksDB API and adds them to the catalog.
 * Consolidates bulk-fetch-kicksdb.ts, fetch-all-kicksdb.ts, and backfill-kicksdb-data.ts.
 *
 * Usage:
 *   tsx src/scripts/kicksdb.ts [options]
 *
 * Options:
 *   --all                    Fetch all available sneakers (auto-paginate until end)
 *   --limit <n>              Max sneakers to fetch (default: 100)
 *   --offset <n>             Starting offset (default: 0)
 *   --continue, -c           Resume from last saved position
 *   --brand <name>           Filter by brand
 *   --delay <ms>             Delay between requests (default: 1000)
 *   --max-requests <n>       Safety limit on API requests (--all mode only)
 *   --help                   Show help
 */

import dotenv from 'dotenv';
import { query, closePool } from '../db/index.js';
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
  secondary_title?: string;
  brand?: string;
  model?: string;
  name?: string;
  colorway?: string;
  description?: string;
  releaseDate?: string;
  retailPrice?: number;
  min_price?: number;
  max_price?: number;
  avg_price?: number;
  category?: string;
  productCategory?: string;
  product_type?: string;
  silhouette?: string;
}

interface KicksDBOptions {
  all?: boolean;
  limit?: number;
  offset?: number;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  delayMs?: number;
  maxRequests?: number;
}

interface KicksDBResult {
  fetched: number;
  inserted: number;
  skipped: number;
  catalogSize?: number;
  requests?: number;
  durationSeconds?: number;
}

const API_KEY = process.env.KICKSDB_API_KEY;
const API_BASE = process.env.KICKSDB_API_BASE || 'https://api.kicks.dev';
const DEFAULT_DELAY_MS = 1000;
const DEFAULT_TIER = 2;
const PROGRESS_FILE = path.join(process.cwd(), '.kicksdb-progress');

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

function saveProgress(offset: number): void {
  try {
    fs.writeFileSync(PROGRESS_FILE, offset.toString(), 'utf-8');
  } catch (error) {
    logger.warn({ error }, 'Failed to save progress');
  }
}

async function fetchFromKicksDB(options: { limit?: number; offset?: number; brand?: string; minPrice?: number; maxPrice?: number }): Promise<KicksDBProduct[]> {
  const { limit = 100, offset = 0, brand, minPrice, maxPrice } = options;

  if (!API_KEY || API_KEY === 'your-api-key-here') {
    throw new Error('KICKSDB_API_KEY not configured in .env file');
  }

  const page = Math.floor(offset / limit) + 1;
  const params = new URLSearchParams({
    limit: limit.toString(),
    page: page.toString(),
  });

  if (brand) params.append('query', brand);

  const url = `${API_BASE}/v3/stockx/products?${params.toString()}`;
  logger.info({ url, limit, offset, brand }, 'Fetching from KicksDB API');

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
  let products = data.data || data.products || data;

  if (!Array.isArray(products)) {
    throw new Error('Unexpected API response format');
  }

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
}

function isFootwear(product: KicksDBProduct): boolean {
  const category = (product.product_type || product.productCategory || product.category || product.silhouette || '').toLowerCase();
  const title = (product.title || product.primary_title || product.name || '').toLowerCase();

  const excludedCategories = ['apparel', 'clothing', 'shirt', 'tee', 'hoodie', 'jacket', 'pants', 'shorts', 'hat', 'cap', 'beanie', 'accessory', 'accessories', 'bag', 'backpack', 'watch', 'jewelry', 'socks', 'underwear', 'collectible'];
  for (const excluded of excludedCategories) {
    if (category.includes(excluded) || title.includes(excluded)) return false;
  }

  const footwearKeywords = ['shoe', 'shoes', 'sneaker', 'sneakers', 'footwear', 'boot', 'boots', 'sandal', 'sandals', 'slide', 'slides', 'slipper', 'slippers', 'clog', 'clogs', 'flip-flop', 'runner', 'running', 'trainer', 'trainers'];
  for (const keyword of footwearKeywords) {
    if (category.includes(keyword) || title.includes(keyword)) return true;
  }

  return false;
}

function extractRetailPrice(description?: string): number | null {
  if (!description) return null;
  const patterns = [
    /retailed?\s+(?:for|at|price)?\s*\$(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
    /retail\s+price\s+(?:of|was|is)?\s*\$(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
    /released?\s+at\s+\$(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
    /priced?\s+at\s+\$(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
  ];
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      const price = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(price) && price > 0 && price < 10000) return price;
    }
  }
  return null;
}

function extractReleaseDate(description?: string): string | null {
  if (!description) return null;
  const patterns = [
    /(?:released|dropped|launched)\s+on\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i,
    /release\s+date[:\s]+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i,
  ];
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      try {
        const date = new Date(match[1]);
        if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
      } catch { continue; }
    }
  }
  return null;
}

function mapProductToSKU(product: KicksDBProduct) {
  const styleCode = product.styleId || product.sku || product.slug || product.id;
  let brand = product.brand || '';
  let model = product.model || product.primary_title || product.title || product.name || '';

  if (brand && model) {
    const brandRegex = new RegExp(`^${brand}\\s+`, 'i');
    model = model.replace(brandRegex, '').trim();
  }

  if (!brand && model) {
    const brandPatterns = ['Nike', 'Adidas', 'Jordan', 'Air Jordan', 'New Balance', 'Asics', 'Puma', 'Reebok', 'Vans', 'Converse', 'Yeezy', 'On', 'Hoka', 'Salomon', 'Balenciaga', 'Golden Goose', 'Bottega Veneta', 'Crocs'];
    for (const b of brandPatterns) {
      if (model.toLowerCase().includes(b.toLowerCase())) {
        brand = b;
        model = model.replace(new RegExp(b, 'i'), '').trim();
        break;
      }
    }
  }

  const colorway = product.secondary_title || product.colorway || null;
  let retailPrice = product.retailPrice || extractRetailPrice(product.description);
  if (!retailPrice) retailPrice = product.avg_price || product.min_price || null;
  const releaseDate = product.releaseDate || extractReleaseDate(product.description);
  const category = product.product_type || product.productCategory || product.category || product.silhouette || null;

  return {
    sku_code: styleCode,
    style_code: styleCode,
    brand: brand || 'Unknown',
    model: model || 'Unknown Model',
    colorway,
    release_date: releaseDate,
    retail_price: retailPrice,
    category,
    tier: DEFAULT_TIER,
    stockx_id: product.uuid || product.id || null,
    goat_id: null,
    ebay_query: null,
  };
}

async function insertSneaker(sku: ReturnType<typeof mapProductToSKU>): Promise<boolean> {
  try {
    const result = await query(
      `INSERT INTO skus (
        sku_code, style_code, brand, model, colorway,
        release_date, retail_price, category, tier,
        stockx_id, goat_id, ebay_query
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (style_code) DO NOTHING
      RETURNING id`,
      [
        sku.sku_code, sku.style_code, sku.brand, sku.model, sku.colorway,
        sku.release_date, sku.retail_price, sku.category, sku.tier,
        sku.stockx_id, sku.goat_id, sku.ebay_query,
      ]
    );
    return !!(result.rowCount && result.rowCount > 0);
  } catch (error) {
    logger.error({ error, sku: sku.sku_code }, 'Failed to insert sneaker');
    return false;
  }
}

/**
 * Fetch a batch of sneakers from KicksDB.
 * Does NOT call closePool().
 */
export async function bulkFetch(options: KicksDBOptions = {}): Promise<KicksDBResult> {
  const {
    limit = 100,
    offset = 0,
    delayMs = DEFAULT_DELAY_MS,
    brand,
    minPrice,
    maxPrice,
  } = options;

  logger.info({ limit, offset, brand }, 'Starting KicksDB bulk fetch');

  let totalFetched = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let currentOffset = offset;
  const batchSize = 100;

  while (totalFetched < limit) {
    const remaining = limit - totalFetched;
    const fetchLimit = Math.min(batchSize, remaining);

    const products = await fetchFromKicksDB({ limit: fetchLimit, offset: currentOffset, brand, minPrice, maxPrice });

    if (products.length === 0) {
      logger.info('No more products available');
      break;
    }

    for (const product of products) {
      if (!isFootwear(product)) {
        totalSkipped++;
        continue;
      }

      const sku = mapProductToSKU(product);
      const inserted = await insertSneaker(sku);

      if (inserted) {
        totalInserted++;
        logger.info({ sku: sku.sku_code, brand: sku.brand, model: sku.model }, 'Added new sneaker');
      } else {
        totalSkipped++;
      }
    }

    totalFetched += products.length;
    currentOffset += products.length;

    logger.info({ fetched: totalFetched, inserted: totalInserted, skipped: totalSkipped }, 'Batch completed');
    saveProgress(currentOffset);

    if (totalFetched < limit && products.length === fetchLimit) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    if (products.length < fetchLimit) {
      logger.info('Reached end of available products');
      break;
    }
  }

  logger.info({ totalFetched, totalInserted, totalSkipped }, '✅ Bulk fetch completed');
  return { fetched: totalFetched, inserted: totalInserted, skipped: totalSkipped };
}

/**
 * Fetch ALL available sneakers from KicksDB (auto-paginate).
 * Does NOT call closePool().
 */
export async function fetchAll(options: KicksDBOptions = {}): Promise<KicksDBResult> {
  const {
    delayMs = DEFAULT_DELAY_MS,
    limit: batchSize = 100,
    offset: startOffset = 0,
    maxRequests = Infinity,
  } = options;

  logger.info({ batchSize, delayMs, startOffset }, '🚀 Starting full KicksDB catalog fetch');

  let currentOffset = startOffset;
  let totalFetched = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let requestCount = 0;
  let consecutiveEmptyBatches = 0;
  const startTime = Date.now();

  while (requestCount < maxRequests) {
    requestCount++;
    logger.info({ request: requestCount, offset: currentOffset, totalSoFar: totalFetched }, `📦 Fetching batch ${requestCount}...`);

    const result = await bulkFetch({
      limit: batchSize,
      offset: currentOffset,
      delayMs,
    });

    totalFetched += result.fetched;
    totalInserted += result.inserted;
    totalSkipped += result.skipped;

    if (result.fetched === 0) {
      consecutiveEmptyBatches++;
      if (consecutiveEmptyBatches >= 2) {
        logger.info('✅ Reached end of catalog');
        break;
      }
    } else {
      consecutiveEmptyBatches = 0;
    }

    currentOffset += result.fetched;

    if (result.fetched < batchSize) {
      logger.info('✅ Reached end of catalog');
      break;
    }
  }

  const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
  const catalogSize = await query('SELECT COUNT(*) as total FROM skus');

  logger.info({ requestCount, totalFetched, totalInserted, totalSkipped, durationSeconds }, '🎉 Fetch complete!');

  return {
    requests: requestCount,
    fetched: totalFetched,
    inserted: totalInserted,
    skipped: totalSkipped,
    durationSeconds,
    catalogSize: parseInt((catalogSize.rows[0] as any).total),
  };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`
KicksDB Script (Consolidated)

Usage:
  tsx src/scripts/kicksdb.ts [options]

Options:
  --all                  Fetch all available sneakers (auto-paginate)
  --limit <n>            Max sneakers to fetch (default: 100)
  --offset <n>           Starting offset (default: 0)
  --continue, -c         Resume from last saved position
  --brand <name>         Filter by brand
  --delay <ms>           Delay between requests (default: 1000)
  --max-requests <n>     Safety limit on API requests (--all mode)
  --help                 Show this help message

Examples:
  # Fetch 100 sneakers (default)
  tsx src/scripts/kicksdb.ts

  # Fetch all available sneakers
  tsx src/scripts/kicksdb.ts --all

  # Fetch Nike sneakers only
  tsx src/scripts/kicksdb.ts --brand Nike --limit 200

  # Continue from saved position
  tsx src/scripts/kicksdb.ts --continue --limit 1000

Note: Free tier is 1,000 requests/month
    `);
    process.exit(0);
  }

  const options: KicksDBOptions = {
    limit: 100,
    delayMs: DEFAULT_DELAY_MS,
    all: false,
  };

  let useContinue = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--all':
        options.all = true;
        break;
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
      case '--delay':
        options.delayMs = parseInt(args[++i], 10);
        break;
      case '--max-requests':
        options.maxRequests = parseInt(args[++i], 10);
        break;
    }
  }

  if (useContinue) {
    const lastOffset = readProgress();
    options.offset = lastOffset;
    console.log(`📍 Continuing from offset ${lastOffset}...`);
  }

  const runFn = options.all ? fetchAll : bulkFetch;

  console.log(`🚀 Starting KicksDB fetch (${options.all ? 'full catalog' : `limit: ${options.limit}`})...\n`);

  runFn(options)
    .then(result => {
      console.log('\n✅ Success!');
      console.log(`   Fetched: ${result.fetched}`);
      console.log(`   Inserted: ${result.inserted}`);
      console.log(`   Skipped: ${result.skipped}`);
      if (result.requests) console.log(`   API Requests: ${result.requests}`);
      if (result.durationSeconds) console.log(`   Duration: ${result.durationSeconds}s`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    })
    .finally(() => closePool());
}
