/**
 * Database Utility Script (Consolidated)
 *
 * Database management commands: migrate, seed, and kicksdb-backfill.
 * Consolidates migrate.ts, seed.ts, and backfill-kicksdb-data.ts.
 *
 * Usage:
 *   tsx src/scripts/db.ts <command> [options]
 *
 * Commands:
 *   migrate              Run database schema migrations
 *   seed                 Seed the database with initial sneakers
 *   backfill-kicksdb     Backfill missing KicksDB data (colorway, retail_price, release_date)
 *
 * Options for backfill-kicksdb:
 *   --limit <n>          Max sneakers to backfill (default: 100)
 *   --delay <ms>         Delay between API requests (default: 1000)
 */

import dotenv from 'dotenv';
import { query, closePool } from '../db/index.js';
import { schema } from '../db/schema.js';
import logger from '../utils/logger.js';

dotenv.config();

// ====================
// Migrate
// ====================

async function migrate() {
  logger.info('Starting database migration...');

  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    logger.debug(`Executing: ${statement.substring(0, 50)}...`);
    await query(statement);
  }

  logger.info('✅ Database migration completed successfully');
}

// ====================
// Seed
// ====================

const initialSneakers = [
  { sku_code: '555088-063', style_code: '555088-063', brand: 'Nike', model: 'Air Jordan 1 Retro High OG', colorway: 'Bred Toe', tier: 1, retail_price: 170 },
  { sku_code: 'DZ5485-612', style_code: 'DZ5485-612', brand: 'Nike', model: 'Air Jordan 1 Retro High OG', colorway: 'Lost and Found', tier: 1, retail_price: 180 },
  { sku_code: '555088-007', style_code: '555088-007', brand: 'Nike', model: 'Air Jordan 1 Retro High OG', colorway: 'Royal', tier: 1, retail_price: 160 },
  { sku_code: 'DD1391-100', style_code: 'DD1391-100', brand: 'Nike', model: 'Dunk Low', colorway: 'Panda', tier: 1, retail_price: 110 },
  { sku_code: 'DV0833-300', style_code: 'DV0833-300', brand: 'Nike', model: 'Dunk Low', colorway: 'Vintage Green', tier: 2, retail_price: 115 },
  { sku_code: 'BY1604', style_code: 'BY1604', brand: 'Adidas', model: 'Yeezy Boost 350 V2', colorway: 'Core Black White', tier: 1, retail_price: 220 },
  { sku_code: 'CP9654', style_code: 'CP9654', brand: 'Adidas', model: 'Yeezy Boost 350 V2', colorway: 'Zebra', tier: 1, retail_price: 220 },
  { sku_code: 'DM7866-162', style_code: 'DM7866-162', brand: 'Nike', model: 'Air Jordan 1 Low x Travis Scott', colorway: 'Reverse Mocha', tier: 1, retail_price: 150 },
  { sku_code: 'M990GL6', style_code: 'M990GL6', brand: 'New Balance', model: '990v6', colorway: 'Grey', tier: 2, retail_price: 210 },
  { sku_code: 'BB550WT1', style_code: 'BB550WT1', brand: 'New Balance', model: '550', colorway: 'White Green', tier: 2, retail_price: 120 },
  { sku_code: 'FZ4387', style_code: 'FZ4387', brand: 'Reebok', model: 'Question Mid', colorway: 'Black Chalk', tier: 2, retail_price: 140 },
  { sku_code: 'CN8490-100', style_code: 'CN8490-100', brand: 'Nike', model: 'Air Max 90', colorway: 'White Black', tier: 3, retail_price: 130 },
  { sku_code: 'FX5501', style_code: 'FX5501', brand: 'Adidas', model: 'Stan Smith', colorway: 'White Green', tier: 3, retail_price: 90 },
  { sku_code: '369449-01', style_code: '369449-01', brand: 'Puma', model: 'RS-X', colorway: 'Black White', tier: 3, retail_price: 110 },
];

async function seed() {
  logger.info('Starting database seed...');

  const existingResult = await query('SELECT COUNT(*) as count FROM skus');
  const existingCount = (existingResult.rows[0] as any).count;

  if (existingCount > 0) {
    logger.info(`Database already has ${existingCount} SKUs. Skipping seed.`);
    return;
  }

  for (const sneaker of initialSneakers) {
    const result = await query(
      `INSERT INTO skus (
        sku_code, style_code, brand, model, colorway, tier, retail_price
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (style_code) DO UPDATE SET
        sku_code = EXCLUDED.sku_code,
        brand = EXCLUDED.brand,
        model = EXCLUDED.model,
        colorway = EXCLUDED.colorway,
        tier = EXCLUDED.tier,
        retail_price = EXCLUDED.retail_price
      RETURNING id`,
      [sneaker.sku_code, sneaker.style_code, sneaker.brand, sneaker.model, sneaker.colorway, sneaker.tier, sneaker.retail_price],
    );

    if (result.rowCount > 0) {
      logger.info(`Added: ${sneaker.sku_code}`);
    }
  }

  logger.info(`✅ Seeded ${initialSneakers.length} sneakers`);
}

// ====================
// KicksDB Backfill
// ====================

const API_KEY = process.env.KICKSDB_API_KEY;
const API_BASE = process.env.KICKSDB_API_BASE || 'https://api.kicks.dev';

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
    if (match?.[1]) {
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
    if (match?.[1]) {
      try {
        const date = new Date(match[1]);
        if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
      } catch { continue; }
    }
  }
  return null;
}

async function fetchProductDetails(slug: string): Promise<any> {
  if (!API_KEY || API_KEY === 'your-api-key-here') {
    throw new Error('KICKSDB_API_KEY not configured');
  }

  const url = `${API_BASE}/v3/stockx/products/${slug}`;
  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      logger.warn({ slug, status: response.status }, 'Failed to fetch product details');
      return null;
    }
    const result = await response.json() as any;
    return result.data || null;
  } catch (error) {
    logger.warn({ error, slug }, 'Error fetching product details');
    return null;
  }
}

async function backfillKicksdbData(options: { limit?: number; delayMs?: number } = {}) {
  const { limit = 100, delayMs = 1000 } = options;

  logger.info({ limit }, 'Starting backfill of KicksDB data');

  const result = await query(
    `SELECT id, sku_code, brand, model, colorway, retail_price, release_date, stockx_id
     FROM skus
     WHERE stockx_id IS NOT NULL
       AND (colorway IS NULL OR retail_price IS NULL OR release_date IS NULL)
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );

  const sneakers = result.rows;
  if (sneakers.length === 0) {
    logger.info('No sneakers need backfilling');
    return { total: 0, updated: 0, failed: 0 };
  }

  logger.info({ count: sneakers.length }, 'Found sneakers to backfill');

  let updated = 0;
  let failed = 0;

  for (const sneaker of sneakers) {
    const slug = sneaker.sku_code;
    logger.info({ sku: slug, brand: sneaker.brand, model: sneaker.model }, 'Fetching product details');

    const details = await fetchProductDetails(slug);
    if (!details) {
      failed++;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      continue;
    }

    const colorway = sneaker.colorway || details.secondary_title || null;
    const retailPrice = sneaker.retail_price || extractRetailPrice(details.description);
    const releaseDate = sneaker.release_date || extractReleaseDate(details.description);

    if ((colorway && !sneaker.colorway) || (retailPrice && !sneaker.retail_price) || (releaseDate && !sneaker.release_date)) {
      const updates: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (colorway && !sneaker.colorway) { updates.push(`colorway = $${idx++}`); params.push(colorway); }
      if (retailPrice && !sneaker.retail_price) { updates.push(`retail_price = $${idx++}`); params.push(retailPrice); }
      if (releaseDate && !sneaker.release_date) { updates.push(`release_date = $${idx++}`); params.push(releaseDate); }

      if (updates.length > 0) {
        params.push(sneaker.id);
        try {
          await query(`UPDATE skus SET ${updates.join(', ')} WHERE id = $${idx}`, params);
          updated++;
          logger.info({ sku: slug, colorway, retailPrice, releaseDate }, 'Updated sneaker');
        } catch (error) {
          failed++;
          logger.error({ error, id: sneaker.id }, 'Failed to update sneaker');
        }
      }
    } else {
      logger.info({ sku: slug }, 'No new data found');
    }

    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  logger.info({ total: sneakers.length, updated, failed }, '✅ Backfill completed');
  return { total: sneakers.length, updated, failed };
}

// ====================
// CLI
// ====================

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  if (!command || command === '--help') {
    console.log(`
Database Utility Script

Usage:
  tsx src/scripts/db.ts <command> [options]

Commands:
  migrate              Run database schema migrations
  seed                 Seed with initial sneakers
  backfill-kicksdb     Backfill missing KicksDB data

Options for backfill-kicksdb:
  --limit <n>          Max sneakers to process (default: 100)
  --delay <ms>         Delay between API requests (default: 1000)

Examples:
  tsx src/scripts/db.ts migrate
  tsx src/scripts/db.ts seed
  tsx src/scripts/db.ts backfill-kicksdb --limit 500
    `);
    process.exit(0);
  }

  async function run() {
    switch (command) {
      case 'migrate':
        await migrate();
        break;
      case 'seed':
        await seed();
        break;
      case 'backfill-kicksdb': {
        const options: { limit?: number; delayMs?: number } = { limit: 100, delayMs: 1000 };
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--limit') options.limit = parseInt(args[++i], 10);
          if (args[i] === '--delay') options.delayMs = parseInt(args[++i], 10);
        }
        const result = await backfillKicksdbData(options);
        console.log(`\n✅ Backfill complete! Total: ${result.total}, Updated: ${result.updated}, Failed: ${result.failed}`);
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        console.error('Use --help to see available commands');
        process.exit(1);
    }
  }

  run()
    .then(() => process.exit(0))
    .catch(error => {
      logger.error({ error }, 'Command failed');
      process.exit(1);
    })
    .finally(() => closePool());
}
