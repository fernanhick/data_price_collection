/**
 * Placeholder Image Cleanup Script
 *
 * Removes "no photo" placeholder images that were baked into storage before
 * source/blank filtering existed. Clearing image_url + image_local_path makes
 * those SKUs eligible for re-attempt (via images.ts) and lets the app show its
 * own clean placeholder in the meantime instead of a white box.
 *
 * Two passes:
 *   1. URL pass (always): nulls SKUs whose source image_url matches a known
 *      placeholder pattern (e.g. GOAT .../placeholders/.../missing.png).
 *   2. Content scan (--scan-content): downloads each stored image_local_path and
 *      nulls any that are near-uniform/blank. Catches placeholders that had a
 *      normal-looking URL. Slower (one HTTP fetch per image).
 *
 * Usage:
 *   tsx src/scripts/cleanPlaceholderImages.ts [--scan-content] [--apply]
 *
 * Without --apply the script runs as a dry-run and only reports what it would do.
 */

import axios from 'axios';
import { query, closePool } from '../db/index.js';
import { isPlaceholderImageUrl } from '../utils/imageUrl.js';
import { isBlankImage } from '../services/imageProcessor.js';
import logger from '../utils/logger.js';

interface SKURow {
  id: number;
  style_code: string;
  image_url: string | null;
  image_local_path: string | null;
}

async function clearSku(id: number, apply: boolean): Promise<void> {
  if (!apply) return;
  await query(
    `UPDATE skus
       SET image_url = NULL,
           image_local_path = NULL,
           image_file_size = NULL,
           image_downloaded_at = NULL
     WHERE id = $1`,
    [id]
  );
}

async function urlPass(apply: boolean): Promise<number> {
  const { rows } = await query<SKURow>(
    `SELECT id, style_code, image_url, image_local_path
       FROM skus
      WHERE image_url IS NOT NULL`
  );

  let cleared = 0;
  for (const sku of rows as SKURow[]) {
    if (isPlaceholderImageUrl(sku.image_url)) {
      console.log(`  [url] ${sku.style_code}: ${sku.image_url}`);
      await clearSku(sku.id, apply);
      cleared++;
    }
  }
  return cleared;
}

async function contentScan(apply: boolean): Promise<number> {
  const { rows } = await query<SKURow>(
    `SELECT id, style_code, image_url, image_local_path
       FROM skus
      WHERE image_local_path IS NOT NULL`
  );

  const skus = rows as SKURow[];
  console.log(`  Scanning ${skus.length} stored images for blank content...`);

  let cleared = 0;
  let scanned = 0;
  for (const sku of skus) {
    const url = sku.image_local_path!;
    // Only scannable if it's a fetchable http(s) URL (S3/CloudFront mode).
    if (!/^https?:\/\//i.test(url)) continue;
    try {
      const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
      if (await isBlankImage(Buffer.from(res.data))) {
        console.log(`  [content] ${sku.style_code}: ${url}`);
        await clearSku(sku.id, apply);
        cleared++;
      }
    } catch (error) {
      logger.warn(
        { styleCode: sku.style_code, url, error: error instanceof Error ? error.message : String(error) },
        'Failed to scan stored image'
      );
    }
    scanned++;
    if (scanned % 100 === 0) console.log(`    ...${scanned}/${skus.length}`);
  }
  return cleared;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const scan = args.includes('--scan-content');

  console.log(`\nPlaceholder image cleanup (${apply ? 'APPLY' : 'DRY-RUN'})\n`);

  console.log('URL pass:');
  const urlCleared = await urlPass(apply);
  console.log(`  → ${urlCleared} SKU(s) with placeholder URLs\n`);

  let contentCleared = 0;
  if (scan) {
    console.log('Content scan:');
    contentCleared = await contentScan(apply);
    console.log(`  → ${contentCleared} SKU(s) with blank stored images\n`);
  } else {
    console.log('(skipping content scan; pass --scan-content to enable)\n');
  }

  const total = urlCleared + contentCleared;
  console.log('='.repeat(50));
  console.log(`${apply ? 'Cleared' : 'Would clear'}: ${total} SKU(s)`);
  if (!apply && total > 0) console.log('Re-run with --apply to persist changes.');
  console.log('Then run: tsx src/scripts/images.ts --iterations <n> to re-attempt.');
}

main()
  .catch((error) => {
    console.error('Cleanup failed:', error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
