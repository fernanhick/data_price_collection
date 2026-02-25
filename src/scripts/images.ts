/**
 * Image Backfill Script (Consolidated)
 *
 * Downloads and optimizes missing product images for SKUs in the catalog.
 * Consolidates backfill-images.ts and backfill-images-batch.ts.
 *
 * Usage:
 *   tsx src/scripts/images.ts [options]
 *
 * Options:
 *   --iterations <n>   Number of passes of 100 SKUs each (default: 1)
 *   --help             Show help
 */

import { query, closePool } from '../db/index.js';
import { GoatScraper } from '../services/scrapers/goat.js';
import imageProcessor from '../services/imageProcessor.js';
import logger from '../utils/logger.js';

interface SKURow {
  id: number;
  style_code: string;
  brand: string;
  model: string;
  image_url?: string;
}

interface ImageBackfillResult {
  success: number;
  failed: number;
  total: number;
}

/**
 * Backfill images for SKUs without local images.
 * Does NOT call closePool().
 */
export async function backfillImages(options: { iterations?: number } = {}): Promise<ImageBackfillResult> {
  const { iterations = 1 } = options;

  await imageProcessor.initialize();

  let totalSuccess = 0;
  let totalFailed = 0;
  let totalProcessed = 0;

  const isMultiIteration = iterations > 1;

  if (isMultiIteration) {
    console.log(`\n🚀 Starting batch backfill (${iterations} iterations of 100 SKUs each)\n`);
  } else {
    console.log('Starting image backfill process...\n');
  }

  for (let iter = 1; iter <= iterations; iter++) {
    if (isMultiIteration) {
      console.log(`\n${'='.repeat(60)}\nIteration ${iter}/${iterations}\n${'='.repeat(60)}`);
    }

    const result = await query<SKURow>(`
      SELECT id, style_code, brand, model, image_url
      FROM skus
      WHERE image_local_path IS NULL
      ORDER BY tier ASC, id ASC
      LIMIT 100
    `);

    const skus = result.rows as SKURow[];

    if (skus.length === 0) {
      console.log('✅ All sneakers have images! No more to process.');
      break;
    }

    console.log(`Processing ${skus.length} SKUs...`);

    const goatScraper = new GoatScraper();
    let iterSuccess = 0;
    let iterFailed = 0;

    for (const sku of skus) {
      try {
        if (!isMultiIteration) {
          console.log(`Processing: ${sku.brand} ${sku.model} (${sku.style_code})`);
        }

        let imageUrl = sku.image_url;

        if (!imageUrl) {
          const listing = await goatScraper.getPriceForSku(sku.style_code);
          if (listing && listing.imageUrl) {
            imageUrl = listing.imageUrl;
            await query(`UPDATE skus SET image_url = $1 WHERE id = $2`, [imageUrl, sku.id]);
          }
        }

        if (imageUrl) {
          const imageResult = await imageProcessor.downloadAndOptimize(imageUrl, sku.style_code);

          if (imageResult) {
            await query(
              `UPDATE skus SET image_local_path = $1, image_file_size = $2, image_downloaded_at = NOW() WHERE id = $3`,
              [imageResult.fullPath, imageResult.fileSize, sku.id]
            );

            if (!isMultiIteration) {
              console.log(`✓ Success: ${imageResult.fullPath}\n`);
            }
            iterSuccess++;
          } else {
            if (!isMultiIteration) console.log(`✗ Failed to process image\n`);
            iterFailed++;
          }
        } else {
          if (!isMultiIteration) console.log(`✗ No image URL available\n`);
          iterFailed++;
        }

        // Rate limiting: 2-3 seconds between requests
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
      } catch (error) {
        logger.error({ sku, error }, `Error processing SKU ${sku.id}`);
        iterFailed++;
      }
    }

    totalSuccess += iterSuccess;
    totalFailed += iterFailed;
    totalProcessed += skus.length;

    if (isMultiIteration) {
      console.log(`✓ Iteration ${iter}: ${iterSuccess}/${skus.length} success`);
    }
  }

  // Show final stats for multi-iteration runs
  if (isMultiIteration) {
    const finalResult = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE image_local_path IS NOT NULL) as with_images,
        ROUND(100.0 * COUNT(*) FILTER (WHERE image_local_path IS NOT NULL) / NULLIF(COUNT(*), 0), 2) as coverage
      FROM skus
    `);

    const stats = (finalResult.rows[0] as any);
    console.log(`\nFinal Coverage: ${stats.with_images}/${stats.total} (${stats.coverage}%)`);
  }

  return { success: totalSuccess, failed: totalFailed, total: totalProcessed };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`
Image Backfill Script

Downloads and optimizes missing product images for sneakers in the catalog.

Usage:
  tsx src/scripts/images.ts [options]

Options:
  --iterations <n>   Number of passes (each processes 100 SKUs, default: 1)
  --help             Show this help message

Examples:
  # Single pass (default)
  tsx src/scripts/images.ts

  # Multi-pass for large catalogs
  tsx src/scripts/images.ts --iterations 11
    `);
    process.exit(0);
  }

  let iterations = 1;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--iterations') {
      iterations = parseInt(args[++i], 10);
    }
  }

  backfillImages({ iterations })
    .then(result => {
      console.log('\n' + '='.repeat(60));
      console.log('Backfill Complete');
      console.log('='.repeat(60));
      console.log(`✓ Success: ${result.success}`);
      console.log(`✗ Failed: ${result.failed}`);
      console.log(`Total processed: ${result.total}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Backfill failed:', error);
      process.exit(1);
    })
    .finally(() => closePool());
}
