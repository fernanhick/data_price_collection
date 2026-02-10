import { GoatScraper } from '../services/scrapers/goat.js';
import { query, closePool } from '../db/index.js';
import logger from '../utils/logger.js';
import imageProcessor from '../services/imageProcessor.js';

/**
 * SAFE sneaker discovery with aggressive rate limiting
 * Designed to run daily/weekly without getting blocked
 * Run with: npm run sneaker:discover-safe
 */

// Smaller set of high-value searches to avoid overwhelming the API
const searchQueries = [
  // Top tier only - most valuable sneakers
  'Jordan 1 High',
  'Jordan 4',
  'Nike Dunk Low',
  'Yeezy 350',
  'Travis Scott',
  'New Balance 550',
];

interface DiscoveredSneaker {
  sku_code: string;
  brand: string;
  model: string;
  colorway: string;
  retail_price: number | null;
  tier: number;
  goat_slug?: string;
  image_url?: string;
}

// Retry logic with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
): Promise<T | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) {
        logger.error({ error, attempt: i + 1 }, 'Max retries reached');
        return null;
      }

      const delay = initialDelay * Math.pow(2, i);
      logger.warn({ error, attempt: i + 1, retryIn: delay }, 'Request failed, retrying...');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return null;
}

// Random delay between min and max seconds
async function randomDelay(minSeconds: number, maxSeconds: number) {
  const delayMs = (minSeconds + Math.random() * (maxSeconds - minSeconds)) * 1000;
  logger.debug(`⏳ Waiting ${(delayMs / 1000).toFixed(1)}s...`);
  await new Promise(resolve => setTimeout(resolve, delayMs));
}

async function discoverSneakersSafe() {
  const goatScraper = new GoatScraper();
  const discovered: DiscoveredSneaker[] = [];
  const duplicates = new Set<string>();

  try {
    logger.info(`🔍 Starting SAFE sneaker discovery with ${searchQueries.length} queries`);
    logger.info(`⏱️  Estimated time: ${(searchQueries.length * 5)} seconds (with rate limiting)`);

    for (let i = 0; i < searchQueries.length; i++) {
      const searchQuery = searchQueries[i];
      logger.info(`\n[${i + 1}/${searchQueries.length}] Searching: "${searchQuery}"`);

      // Use retry logic for resilience
      const listings = await retryWithBackoff(
        () => goatScraper.searchProducts(searchQuery, 10),
        3,
        2000,
      );

      if (!listings || listings.length === 0) {
        logger.warn(`No results for "${searchQuery}"`);
        continue;
      }

      logger.info(`✓ Found ${listings.length} results`);

      for (const listing of listings) {
        // Skip if no SKU
        if (!listing.sku || listing.sku.trim() === '') continue;

        // Skip non-footwear items (safety check)
        const nameLower = listing.name.toLowerCase();
        const nonFootwearKeywords = ['tee', 'shirt', 'hoodie', 'jacket', 'pants', 'shorts', 'hat', 'cap', 'bag', 'socks'];
        if (nonFootwearKeywords.some(keyword => nameLower.includes(keyword))) continue;

        // Skip duplicates
        const normalizedSku = listing.sku.toUpperCase().replace(/\s+/g, '-');
        if (duplicates.has(normalizedSku)) continue;

        duplicates.add(normalizedSku);

        // Determine tier based on price premium
        let tier = 3;
        if (listing.retailPriceCents && listing.lowestPriceCents) {
          const premium = (listing.lowestPriceCents / listing.retailPriceCents) - 1;
          if (premium > 0.5) tier = 1;
          else if (premium > 0.15) tier = 2;
        }

        const parsedSneaker = parseSneakerName(listing.name, listing.brand);

        discovered.push({
          sku_code: normalizedSku,
          brand: parsedSneaker.brand || listing.brand || 'Unknown',
          model: parsedSneaker.model,
          colorway: parsedSneaker.colorway || listing.colorway || '',
          retail_price: listing.retailPriceCents ? listing.retailPriceCents / 100 : null,
          tier,
          goat_slug: listing.slug,
          image_url: listing.imageUrl,
        });

        // Create entries for alternate style codes if present
        const altStyleCodes = extractAlternateStyleCodes(normalizedSku);
        for (const altCode of altStyleCodes) {
          // Check if this alternate code doesn't already exist in discovered
          const altDuplicate = discovered.find(d => d.sku_code === altCode);
          if (!altDuplicate && !duplicates.has(altCode)) {
            discovered.push({
              sku_code: altCode,
              brand: parsedSneaker.brand || listing.brand || 'Unknown',
              model: parsedSneaker.model,
              colorway: parsedSneaker.colorway || listing.colorway || '',
              retail_price: listing.retailPriceCents ? listing.retailPriceCents / 100 : null,
              tier,
              goat_slug: listing.slug,
              image_url: listing.imageUrl,
            });
            duplicates.add(altCode);
          }
        }
      }

      // Aggressive rate limiting: 3-6 seconds between searches
      if (i < searchQueries.length - 1) {
        await randomDelay(3, 6);
      }
    }

    logger.info(`\n✅ Discovery complete: ${discovered.length} unique sneakers found`);

    // Import to database
    if (discovered.length === 0) {
      logger.warn('No sneakers to import');
      return;
    }

    logger.info(`\n📥 Importing to database...`);
    let imported = 0;
    let skipped = 0;

    for (const sneaker of discovered) {
      try {
        // Extract primary style code for database storage
        const primaryStyleCode = extractPrimaryStyleCode(sneaker.sku_code);

        const result = await query(
          `INSERT INTO skus (
            sku_code, style_code, brand, model, colorway, tier, retail_price, image_url
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (style_code) DO NOTHING
          RETURNING id`,
          [
            sneaker.sku_code,
            primaryStyleCode, // Use primary style code for uniqueness
            sneaker.brand,
            sneaker.model,
            sneaker.colorway,
            sneaker.tier,
            sneaker.retail_price,
            sneaker.image_url || null,  // Store external URL
          ],
        );

        if (result.rowCount && result.rowCount > 0) {
          const skuId = result.rows[0].id;
          logger.info(`  ✅ ${sneaker.brand} ${sneaker.model} - ${sneaker.colorway}`);
          imported++;

          // Download and optimize image if available
          if (sneaker.image_url) {
            const imageResult = await imageProcessor.downloadAndOptimize(
              sneaker.image_url,
              primaryStyleCode
            );

            if (imageResult) {
              // Update database with local path
              await query(
                `UPDATE skus
                 SET image_local_path = $1,
                     image_file_size = $2,
                     image_downloaded_at = NOW()
                 WHERE id = $3`,
                [imageResult.fullPath, imageResult.fileSize, skuId]
              );

              logger.info(
                {
                  styleCode: primaryStyleCode,
                  path: imageResult.fullPath,
                },
                'Image downloaded and stored'
              );
            }

            // Rate limiting: wait 2-3 seconds between image downloads (safe mode)
            await new Promise(resolve =>
              setTimeout(resolve, 2000 + Math.random() * 1000)
            );
          }
        } else {
          skipped++;
        }
      } catch (error) {
        logger.error({ sneaker, error }, `Failed to import: ${sneaker.sku_code}`);
      }
    }

    logger.info(`\n📊 Import Summary`);
    logger.info(`   New sneakers: ${imported}`);
    logger.info(`   Already exist: ${skipped}`);
    logger.info(`   Total in catalog: ${await getTotalCount()}`);

  } catch (error) {
    logger.error({ error }, 'Sneaker discovery failed');
    process.exit(1);
  } finally {
    await closePool();
  }
}

async function getTotalCount(): Promise<number> {
  const result = await query('SELECT COUNT(*) as count FROM skus');
  return (result.rows[0] as any).count;
}

/**
 * Extract primary style code from combined codes
 * e.g., "HF2793-600 / HF2794-600" -> "HF2793-600"
 */
function extractPrimaryStyleCode(code: string): string {
  // Split by / and take the first one
  return code.split('/')[0].trim();
}

/**
 * Extract alternate style codes from combined codes
 * e.g., "HF2793-600 / HF2794-600" -> ["HF2794-600"]
 */
function extractAlternateStyleCodes(code: string): string[] {
  const parts = code.split('/').map(p => p.trim());
  // Return everything except the first code
  return parts.length > 1 ? parts.slice(1) : [];
}

function parseSneakerName(name: string, brandHint?: string): {
  brand: string | null;
  model: string;
  colorway: string | null;
} {
  const colorwayMatch = name.match(/['"]([^'"]+)['"]/);
  const colorway = colorwayMatch ? colorwayMatch[1] : null;
  let cleanName = name.replace(/['"][^'"]+['"]/, '').trim();

  const brands = ['Nike', 'Adidas', 'New Balance', 'Asics', 'Puma', 'Reebok', 'Converse', 'Vans', 'Hoka', 'On', 'Salomon'];
  let brand: string | null = brandHint || null;

  for (const b of brands) {
    if (cleanName.toLowerCase().includes(b.toLowerCase())) {
      brand = b;
      cleanName = cleanName.replace(new RegExp(b, 'i'), '').trim();
      break;
    }
  }

  const model = cleanName.trim() || name;
  return { brand, model, colorway };
}

discoverSneakersSafe();
