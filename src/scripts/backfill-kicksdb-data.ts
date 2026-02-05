/**
 * Backfill missing colorway and retail_price data for KicksDB sneakers
 *
 * Updates existing database records with data from KicksDB API
 */

import dotenv from 'dotenv';
import { query } from '../db/index.js';
import logger from '../utils/logger.js';

dotenv.config();

const API_KEY = process.env.KICKSDB_API_KEY;
const API_BASE = process.env.KICKSDB_API_BASE || 'https://api.kicks.dev';

/**
 * Extract retail price from description text
 */
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
 * Fetch product details from KicksDB
 */
async function fetchProductDetails(slug: string): Promise<any> {
  if (!API_KEY || API_KEY === 'your-api-key-here') {
    throw new Error('KICKSDB_API_KEY not configured');
  }

  const url = `${API_BASE}/v3/stockx/products/${slug}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      logger.warn({ slug, status: response.status }, 'Failed to fetch product details');
      return null;
    }

    const result = await response.json();
    return result.data || null;

  } catch (error) {
    logger.warn({ error, slug }, 'Error fetching product details');
    return null;
  }
}

/**
 * Update sneaker record with missing data
 */
async function updateSneaker(id: number, colorway: string | null, retailPrice: number | null, releaseDate: string | null) {
  const updates = [];
  const params = [];
  let paramIndex = 1;

  if (colorway) {
    updates.push(`colorway = $${paramIndex++}`);
    params.push(colorway);
  }

  if (retailPrice) {
    updates.push(`retail_price = $${paramIndex++}`);
    params.push(retailPrice);
  }

  if (releaseDate) {
    updates.push(`release_date = $${paramIndex++}`);
    params.push(releaseDate);
  }

  if (updates.length === 0) {
    return false;
  }

  params.push(id);

  try {
    await query(
      `UPDATE skus SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    );
    return true;
  } catch (error) {
    logger.error({ error, id }, 'Failed to update sneaker');
    return false;
  }
}

/**
 * Backfill missing data
 */
async function backfillData(options: { limit?: number; delayMs?: number } = {}) {
  const { limit = 100, delayMs = 1000 } = options;

  logger.info({ limit }, 'Starting backfill of KicksDB data');

  // Get sneakers with missing colorway or retail_price that have stockx_id
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

    logger.info(
      { sku: slug, brand: sneaker.brand, model: sneaker.model },
      'Fetching product details'
    );

    const details = await fetchProductDetails(slug);

    if (!details) {
      failed++;
      logger.warn({ sku: slug }, 'No details found');
      await new Promise(resolve => setTimeout(resolve, delayMs));
      continue;
    }

    // Extract missing data
    const colorway = sneaker.colorway || details.secondary_title || null;
    const retailPrice = sneaker.retail_price || extractRetailPrice(details.description);
    const releaseDate = sneaker.release_date || extractReleaseDate(details.description);

    // Update if we found new data
    if ((colorway && !sneaker.colorway) ||
        (retailPrice && !sneaker.retail_price) ||
        (releaseDate && !sneaker.release_date)) {

      const success = await updateSneaker(sneaker.id, colorway, retailPrice, releaseDate);

      if (success) {
        updated++;
        logger.info(
          {
            sku: slug,
            colorway: colorway || 'none',
            retailPrice: retailPrice || 'none',
            releaseDate: releaseDate || 'none',
          },
          'Updated sneaker'
        );
      } else {
        failed++;
      }
    } else {
      logger.info({ sku: slug }, 'No new data found');
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  logger.info(
    {
      total: sneakers.length,
      updated,
      failed,
      remaining: sneakers.length - updated - failed,
    },
    '✅ Backfill completed'
  );

  return { total: sneakers.length, updated, failed };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  const options: { limit?: number; delayMs?: number } = {
    limit: 100,
    delayMs: 1000,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--delay':
        options.delayMs = parseInt(args[++i], 10);
        break;
      case '--help':
        console.log(`
KicksDB Data Backfill Tool

Usage:
  tsx src/scripts/backfill-kicksdb-data.ts [options]

Options:
  --limit <number>   Maximum number of sneakers to update (default: 100)
  --delay <ms>       Delay between API requests in ms (default: 1000)
  --help             Show this help message

Examples:
  # Backfill 100 sneakers
  tsx src/scripts/backfill-kicksdb-data.ts

  # Backfill all missing data (up to 1000)
  tsx src/scripts/backfill-kicksdb-data.ts --limit 1000

  # Slower rate (2 second delay)
  tsx src/scripts/backfill-kicksdb-data.ts --limit 500 --delay 2000
        `);
        process.exit(0);
    }
  }

  backfillData(options)
    .then(result => {
      console.log('\n✅ Backfill complete!');
      console.log(`   Total processed: ${result.total}`);
      console.log(`   Updated: ${result.updated}`);
      console.log(`   Failed: ${result.failed}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    });
}

export { backfillData };
