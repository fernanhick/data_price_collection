/**
 * Cleanup Non-Footwear Products Script
 *
 * Identifies and removes non-footwear items from the database.
 * Generates a report before deletion.
 */

import { query, closePool } from '../db/index.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

interface SKURecord {
  id: number;
  sku_code: string;
  style_code: string;
  brand: string;
  model: string;
  colorway: string | null;
  category: string | null;
}

/**
 * Check if a product is non-footwear based on brand, model, and category
 */
function isNonFootwear(sku: SKURecord): { isNonFootwear: boolean; reason: string } {
  const brand = (sku.brand || '').toLowerCase();
  const model = (sku.model || '').toLowerCase();
  const category = (sku.category || '').toLowerCase();
  const fullText = `${brand} ${model} ${category}`.toLowerCase();

  // Non-footwear keywords (apparel and accessories)
  const nonFootwearKeywords = [
    // Apparel
    { keyword: 'tee', category: 'apparel' },
    { keyword: 't-shirt', category: 'apparel' },
    { keyword: 'shirt', category: 'apparel' },
    { keyword: 'hoodie', category: 'apparel' },
    { keyword: 'jacket', category: 'apparel' },
    { keyword: 'coat', category: 'apparel' },
    { keyword: 'pants', category: 'apparel' },
    { keyword: 'shorts', category: 'apparel' },
    { keyword: 'jogger', category: 'apparel' },
    { keyword: 'sweatpants', category: 'apparel' },
    { keyword: 'sweatshirt', category: 'apparel' },
    { keyword: 'sweater', category: 'apparel' },
    { keyword: 'jersey', category: 'apparel' },

    // Accessories
    { keyword: 'hat', category: 'accessory' },
    { keyword: 'cap', category: 'accessory' },
    { keyword: 'beanie', category: 'accessory' },
    { keyword: 'bag', category: 'accessory' },
    { keyword: 'backpack', category: 'accessory' },
    { keyword: 'wallet', category: 'accessory' },
    { keyword: 'watch', category: 'accessory' },
    { keyword: 'bracelet', category: 'accessory' },
    { keyword: 'necklace', category: 'accessory' },
    { keyword: 'socks', category: 'accessory' },
    { keyword: 'belt', category: 'accessory' },
    { keyword: 'scarf', category: 'accessory' },
    { keyword: 'glove', category: 'accessory' },

    // Other
    { keyword: 'collectible', category: 'other' },
    { keyword: 'toy', category: 'other' },
    { keyword: 'figure', category: 'other' },
  ];

  // Check if category explicitly says apparel/accessories
  const excludedCategories = [
    'apparel', 'clothing', 'accessory', 'accessories',
    'headwear', 'bags', 'jewelry', 'collectibles'
  ];

  for (const excluded of excludedCategories) {
    if (category.includes(excluded)) {
      return { isNonFootwear: true, reason: `Category: ${excluded}` };
    }
  }

  // Check for non-footwear keywords in full text
  for (const { keyword, category: cat } of nonFootwearKeywords) {
    // Use word boundaries to avoid false positives
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(fullText)) {
      return { isNonFootwear: true, reason: `Keyword: ${keyword} (${cat})` };
    }
  }

  return { isNonFootwear: false, reason: '' };
}

/**
 * Query database for all SKUs
 */
async function getAllSKUs(): Promise<SKURecord[]> {
  const result = await query<SKURecord>(
    `SELECT id, sku_code, style_code, brand, model, colorway, category
     FROM skus
     ORDER BY brand, model`
  );
  return result.rows;
}

/**
 * Generate report of non-footwear items
 */
function generateReport(nonFootwearItems: Array<SKURecord & { reason: string }>): string {
  const report: string[] = [];

  report.push('='.repeat(80));
  report.push('NON-FOOTWEAR PRODUCTS CLEANUP REPORT');
  report.push('='.repeat(80));
  report.push('');
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push(`Total items flagged for removal: ${nonFootwearItems.length}`);
  report.push('');

  // Group by reason
  const byReason = new Map<string, Array<SKURecord & { reason: string }>>();
  for (const item of nonFootwearItems) {
    const existing = byReason.get(item.reason) || [];
    existing.push(item);
    byReason.set(item.reason, existing);
  }

  report.push('BREAKDOWN BY REASON:');
  report.push('-'.repeat(80));
  for (const [reason, items] of Array.from(byReason.entries()).sort((a, b) => b[1].length - a[1].length)) {
    report.push(`${reason}: ${items.length} items`);
  }
  report.push('');

  // Group by brand
  const byBrand = new Map<string, number>();
  for (const item of nonFootwearItems) {
    byBrand.set(item.brand, (byBrand.get(item.brand) || 0) + 1);
  }

  report.push('BREAKDOWN BY BRAND:');
  report.push('-'.repeat(80));
  for (const [brand, count] of Array.from(byBrand.entries()).sort((a, b) => b[1] - a[1])) {
    report.push(`${brand}: ${count} items`);
  }
  report.push('');

  // Detailed list
  report.push('DETAILED LIST OF ITEMS TO BE REMOVED:');
  report.push('-'.repeat(80));
  report.push('ID | Style Code | Brand | Model | Category | Reason');
  report.push('-'.repeat(80));

  for (const item of nonFootwearItems) {
    const line = [
      item.id.toString().padEnd(6),
      (item.style_code || '').substring(0, 20).padEnd(20),
      (item.brand || '').substring(0, 15).padEnd(15),
      (item.model || '').substring(0, 30).padEnd(30),
      (item.category || 'N/A').substring(0, 15).padEnd(15),
      item.reason,
    ].join(' | ');
    report.push(line);
  }

  report.push('');
  report.push('='.repeat(80));

  return report.join('\n');
}

/**
 * Main cleanup function
 */
async function cleanupNonFootwear(dryRun: boolean = true) {
  try {
    logger.info('Starting non-footwear cleanup scan...');

    // 1. Query all SKUs
    logger.info('Fetching all SKUs from database...');
    const allSKUs = await getAllSKUs();
    logger.info(`Found ${allSKUs.length} total SKUs`);

    // 2. Identify non-footwear items
    logger.info('Analyzing products...');
    const nonFootwearItems: Array<SKURecord & { reason: string }> = [];

    for (const sku of allSKUs) {
      const check = isNonFootwear(sku);
      if (check.isNonFootwear) {
        nonFootwearItems.push({ ...sku, reason: check.reason });
      }
    }

    logger.info(`Found ${nonFootwearItems.length} non-footwear items (${((nonFootwearItems.length / allSKUs.length) * 100).toFixed(1)}%)`);

    // 3. Generate report
    const report = generateReport(nonFootwearItems);

    // Save report to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const reportPath = path.join(process.cwd(), `non-footwear-cleanup-report-${timestamp}.txt`);
    fs.writeFileSync(reportPath, report);
    logger.info(`Report saved to: ${reportPath}`);

    // Print report to console
    console.log('\n' + report);

    // 4. Delete items (if not dry run)
    if (dryRun) {
      logger.warn('DRY RUN MODE - No items were deleted');
      logger.info(`To actually delete these items, run with --execute flag`);
    } else {
      logger.warn(`DELETING ${nonFootwearItems.length} NON-FOOTWEAR ITEMS...`);

      let deleted = 0;
      for (const item of nonFootwearItems) {
        try {
          await query(
            'DELETE FROM skus WHERE id = $1',
            [item.id]
          );
          deleted++;

          if (deleted % 10 === 0) {
            logger.info(`Deleted ${deleted}/${nonFootwearItems.length}...`);
          }
        } catch (error) {
          logger.error({ error, item }, `Failed to delete item ${item.id}`);
        }
      }

      logger.info(`✅ Successfully deleted ${deleted} non-footwear items`);

      // Show updated stats
      const remainingResult = await query('SELECT COUNT(*) as count FROM skus');
      const remaining = parseInt((remainingResult.rows[0] as any).count, 10);
      logger.info(`Remaining SKUs in database: ${remaining}`);
    }

  } catch (error) {
    logger.error({ error }, 'Cleanup failed');
    throw error;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  if (args.includes('--help')) {
    console.log(`
Non-Footwear Cleanup Script

This script identifies and removes non-footwear products (apparel, accessories, etc.)
from the database.

Usage:
  tsx src/scripts/cleanup-non-footwear.ts [options]

Options:
  --execute     Actually delete the items (default is dry run)
  --help        Show this help message

Examples:
  # Dry run - generate report without deleting
  tsx src/scripts/cleanup-non-footwear.ts

  # Actually delete non-footwear items
  tsx src/scripts/cleanup-non-footwear.ts --execute

Note: A detailed report will be saved to a file in the current directory.
    `);
    process.exit(0);
  }

  cleanupNonFootwear(dryRun)
    .then(() => {
      console.log('\n✅ Cleanup completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Cleanup failed:', error.message);
      process.exit(1);
    })
    .finally(() => closePool());
}

export { cleanupNonFootwear, isNonFootwear };
