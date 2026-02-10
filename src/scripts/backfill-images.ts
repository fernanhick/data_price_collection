import { query, closePool } from '../db/index.js';
import { GoatScraper } from '../services/scrapers/goat.js';
import imageProcessor from '../services/imageProcessor.js';
import logger from '../utils/logger.js';

/**
 * Backfill images for existing SKUs that don't have local images cached
 * Run with: npm run backfill-images
 */

interface SKURow {
  id: number;
  style_code: string;
  brand: string;
  model: string;
  image_url?: string;
}

async function backfillImages() {
  console.log('Starting image backfill process...\n');

  // Initialize image processor
  await imageProcessor.initialize();

  try {
    // Get SKUs without local images, prioritize by tier
    const result = await query<SKURow>(`
      SELECT id, style_code, brand, model, image_url
      FROM skus
      WHERE image_local_path IS NULL
      ORDER BY tier ASC, id ASC
      LIMIT 100
    `);

    const skus = result.rows as SKURow[];
    console.log(`Found ${skus.length} SKUs without images\n`);

    if (skus.length === 0) {
      console.log('No SKUs need image backfill!');
      return;
    }

    const goatScraper = new GoatScraper();
    let successCount = 0;
    let failCount = 0;

    for (const sku of skus) {
      try {
        console.log(
          `Processing: ${sku.brand} ${sku.model} (${sku.style_code})`
        );

        let imageUrl = sku.image_url;

        // If no stored URL, try to fetch from GOAT
        if (!imageUrl) {
          const listing = await goatScraper.getPriceForSku(sku.style_code);
          if (listing && listing.imageUrl) {
            imageUrl = listing.imageUrl;

            // Update database with found URL
            await query(
              `UPDATE skus SET image_url = $1 WHERE id = $2`,
              [imageUrl, sku.id]
            );
          }
        }

        if (imageUrl) {
          // Download and optimize
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

            console.log(`✓ Success: ${imageResult.fullPath}\n`);
            successCount++;
          } else {
            console.log(`✗ Failed to process image\n`);
            failCount++;
          }
        } else {
          console.log(`✗ No image URL available\n`);
          failCount++;
        }

        // Rate limiting: 2-3 seconds between requests
        await new Promise(resolve =>
          setTimeout(resolve, 2000 + Math.random() * 1000)
        );
      } catch (error) {
        logger.error({ sku, error }, `Error processing SKU ${sku.id}`);
        console.error(`Error processing SKU ${sku.id}:`, error);
        failCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Backfill Complete');
    console.log('='.repeat(60));
    console.log(`✓ Success: ${successCount}`);
    console.log(`✗ Failed: ${failCount}`);
    console.log(`Total processed: ${skus.length}`);
  } catch (error) {
    logger.error({ error }, 'Backfill failed');
    console.error('Backfill failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

backfillImages();
