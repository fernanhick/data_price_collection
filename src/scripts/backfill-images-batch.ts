import { query, closePool } from '../db/index.js';
import { GoatScraper } from '../services/scrapers/goat.js';
import imageProcessor from '../services/imageProcessor.js';
import logger from '../utils/logger.js';

/**
 * Batch backfill images for existing SKUs
 * Runs multiple iterations to process all sneakers without images
 * Run with: npm run images:backfill-batch ITERATIONS=11
 */

interface SKURow {
  id: number;
  style_code: string;
  brand: string;
  model: string;
  image_url?: string;
}

async function backfillBatch() {
  const iterations = parseInt(process.env.ITERATIONS || '11', 10);
  console.log(
    `\n🚀 Starting batch backfill (${iterations} iterations of 100 SKUs each)\n`
  );

  // Initialize image processor
  await imageProcessor.initialize();

  try {
    let totalSuccess = 0;
    let totalFailed = 0;

    for (let iter = 1; iter <= iterations; iter++) {
      console.log(
        `\n${'='.repeat(60)}\nIteration ${iter}/${iterations}\n${'='.repeat(
          60
        )}`
      );

      // Get SKUs without local images for this iteration
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
      let iterationSuccess = 0;
      let iterationFailed = 0;

      for (const sku of skus) {
        try {
          let imageUrl = sku.image_url;

          // If no stored URL, try to fetch from GOAT
          if (!imageUrl) {
            const listing = await goatScraper.getPriceForSku(sku.style_code);
            if (listing && listing.imageUrl) {
              imageUrl = listing.imageUrl;

              await query(
                `UPDATE skus SET image_url = $1 WHERE id = $2`,
                [imageUrl, sku.id]
              );
            }
          }

          if (imageUrl) {
            const imageResult = await imageProcessor.downloadAndOptimize(
              imageUrl,
              sku.style_code
            );

            if (imageResult) {
              await query(
                `UPDATE skus
                 SET image_local_path = $1,
                     image_file_size = $2,
                     image_downloaded_at = NOW()
                 WHERE id = $3`,
                [imageResult.fullPath, imageResult.fileSize, sku.id]
              );

              iterationSuccess++;
            } else {
              iterationFailed++;
            }
          } else {
            iterationFailed++;
          }

          // Rate limiting: 2-3 seconds between requests
          await new Promise(resolve =>
            setTimeout(resolve, 2000 + Math.random() * 1000)
          );
        } catch (error) {
          logger.error({ sku, error }, `Error processing SKU ${sku.id}`);
          iterationFailed++;
        }
      }

      totalSuccess += iterationSuccess;
      totalFailed += iterationFailed;

      console.log(
        `✓ Iteration ${iter}: ${iterationSuccess}/${skus.length} success`
      );
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Batch Backfill Complete');
    console.log('='.repeat(60));
    console.log(`Total Success: ${totalSuccess}`);
    console.log(`Total Failed: ${totalFailed}`);

    // Show final stats
    const finalResult = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE image_local_path IS NOT NULL) as with_images,
        ROUND(100.0 * COUNT(*) FILTER (WHERE image_local_path IS NOT NULL) / COUNT(*), 2) as coverage
      FROM skus
    `);

    const stats = (finalResult.rows[0] as any);
    console.log(
      `\nFinal Coverage: ${stats.with_images}/${stats.total} (${stats.coverage}%)`
    );
  } catch (error) {
    logger.error({ error }, 'Batch backfill failed');
    console.error('Batch backfill failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

backfillBatch();
