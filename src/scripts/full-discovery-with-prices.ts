import { GoatScraper } from '../services/scrapers/goat.js';
import { PriceFetcher } from '../services/pricing/priceFetcher.js';
import { query, closePool } from '../db/index.js';
import logger from '../utils/logger.js';
import imageProcessor from '../services/imageProcessor.js';
import { SKU } from '../types/index.js';

/**
 * FULL DISCOVERY + PRICE UPDATE
 *
 * Complete one-command operation:
 * 1. Discover 500-1000+ new sneakers via GOAT
 * 2. Download and optimize images
 * 3. Fetch initial market prices from eBay, GOAT, StockX
 * 4. Generate comprehensive catalog statistics
 *
 * Run with: npm run discovery:full
 *
 * ⏱️  Total time: 45-60 minutes
 * 📊 Makes ~500+ API calls
 * 🖼️  Downloads ~1000+ images
 * 💰 Fetches prices for all discovered sneakers
 */

// Comprehensive search queries covering all major brands, models, and years
const megaSearchQueries = [
  // === NIKE JORDAN (High Volume) ===
  'Jordan 1 High OG 2024',
  'Jordan 1 High OG 2025',
  'Jordan 1 Low 2024',
  'Jordan 1 Low 2025',
  'Jordan 1 Mid',
  'Jordan 1 Retro High',
  'Jordan 4 Retro 2024',
  'Jordan 4 Retro 2025',
  'Jordan 4 Military',
  'Jordan 4 Thunder',
  'Jordan 3 Retro',
  'Jordan 5 Retro',
  'Jordan 6 Retro',
  'Jordan 11 Retro',
  'Jordan 12 Retro',

  // === NIKE DUNK (High Volume) ===
  'Nike Dunk Low Panda',
  'Nike Dunk Low Retro',
  'Nike Dunk High',
  'Nike Dunk Low 2024',
  'Nike Dunk Low 2025',
  'Nike SB Dunk Low',
  'Nike SB Dunk High',

  // === TRAVIS SCOTT (High Value) ===
  'Travis Scott Jordan 1',
  'Travis Scott Jordan 4',
  'Travis Scott Nike',
  'Travis Scott Fragment',

  // === YEEZY (All Models) ===
  'Yeezy 350 V2',
  'Yeezy 350 Zebra',
  'Yeezy 350 Bred',
  'Yeezy 700 V1',
  'Yeezy 700 V2',
  'Yeezy 700 V3',
  'Yeezy Slide',
  'Yeezy Foam Runner',
  'Yeezy 500',
  'Yeezy 450',

  // === NIKE SPORTSWEAR ===
  'Air Max 1',
  'Air Max 90',
  'Air Max 95',
  'Air Max 97',
  'Air Force 1 Low',
  'Air Force 1 High',
  'Blazer Mid',
  'Cortez',

  // === NEW BALANCE (Growing Market) ===
  'New Balance 550',
  'New Balance 990',
  'New Balance 991',
  'New Balance 992',
  'New Balance 993',
  'New Balance 2002R',
  'New Balance 1906R',
  'New Balance 327',

  // === ADIDAS (Non-Yeezy) ===
  'Adidas Samba',
  'Adidas Gazelle',
  'Adidas Campus',
  'Adidas Spezial',
  'Adidas Forum',
  'Adidas Superstar',
  'Adidas Stan Smith',

  // === COLLABORATIONS ===
  'Off-White Nike',
  'Sacai Nike',
  'Union Jordan',
  'Fragment Jordan',
  'Bad Bunny Adidas',
  'Salehe Bembury',
  'JJJJound',
  'A Ma Maniere',

  // === ASICS ===
  'Asics Gel-Lyte III',
  'Asics Gel-Kayano',
  'Asics GT-2160',

  // === CONVERSE ===
  'Converse Chuck 70',
  'Converse One Star',

  // === VANS ===
  'Vans Old Skool',
  'Vans Sk8-Hi',
  'Vans Knu Skool',

  // === PERFORMANCE/RUNNING ===
  'Hoka Clifton',
  'Hoka Bondi',
  'On Cloudmonster',
  'On Cloud 5',
  'Salomon XT-6',
  'Salomon ACS Pro',

  // === LUXURY/DESIGNER ===
  'Maison Margiela Replica',
  'Bottega Veneta',
  'Balenciaga Triple S',
  'Golden Goose',
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

// Progress tracking
let totalSearched = 0;
let totalFound = 0;
let totalUnique = 0;
let totalImported = 0;
let startTime = Date.now();

async function randomDelay(minSeconds: number, maxSeconds: number) {
  const delayMs = (minSeconds + Math.random() * (maxSeconds - minSeconds)) * 1000;
  await new Promise(resolve => setTimeout(resolve, delayMs));
}

async function discoverSneakers(): Promise<{ imported: number; skipped: number; skus: SKU[] }> {
  const goatScraper = new GoatScraper();
  const discovered: DiscoveredSneaker[] = [];
  const duplicates = new Set<string>();

  try {
    logger.info('');
    logger.info('═'.repeat(70));
    logger.info('🚀 PHASE 1: MEGA SNEAKER DISCOVERY');
    logger.info('═'.repeat(70));
    logger.info(`📊 Queries: ${megaSearchQueries.length}`);
    logger.info(`🎯 Target: 500-1000+ sneakers`);
    logger.info('');

    for (let i = 0; i < megaSearchQueries.length; i++) {
      const searchQuery = megaSearchQueries[i];
      const progress = `[${i + 1}/${megaSearchQueries.length}]`;

      logger.info(`${progress} 🔍 "${searchQuery}"`);

      try {
        const listings = await goatScraper.searchProducts(searchQuery, 30);

        totalSearched++;
        totalFound += listings.length;

        if (listings.length === 0) {
          continue;
        }

        logger.info(`  ✓ Found ${listings.length} results`);

        let newInQuery = 0;
        for (const listing of listings) {
          if (!listing.sku || listing.sku.trim() === '') continue;

          const nameLower = listing.name.toLowerCase();
          const nonFootwearKeywords = ['tee', 'shirt', 'hoodie', 'jacket', 'pants', 'shorts', 'hat', 'cap', 'bag', 'socks'];
          if (nonFootwearKeywords.some(keyword => nameLower.includes(keyword))) continue;

          const normalizedSku = listing.sku.toUpperCase().replace(/\s+/g, '-');
          if (duplicates.has(normalizedSku)) continue;

          duplicates.add(normalizedSku);
          newInQuery++;

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

          const altStyleCodes = extractAlternateStyleCodes(normalizedSku);
          for (const altCode of altStyleCodes) {
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
              newInQuery++;
            }
          }
        }

        totalUnique = discovered.length;

        if ((i + 1) % 10 === 0) {
          const elapsedMinutes = (Date.now() - startTime) / 1000 / 60;
          const elapsed = elapsedMinutes.toFixed(1);
          const eta = (elapsedMinutes / (i + 1)) * (megaSearchQueries.length - i - 1);
          logger.info(`  📈 Progress: ${i + 1}/${megaSearchQueries.length} | ⏱️  ${elapsed}m | ETA: ${eta.toFixed(1)}m | 🎯 ${totalUnique} unique`);
        }

        if (i < megaSearchQueries.length - 1) {
          await randomDelay(2, 4);
        }

      } catch (error) {
        logger.error({ searchQuery, error }, `Failed: "${searchQuery}"`);
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    logger.info('');
    logger.info('─'.repeat(70));
    logger.info('✅ DISCOVERY PHASE COMPLETE');
    logger.info('─'.repeat(70));
    logger.info(`⏱️  Time: ${totalTime}m | 🔍 Queries: ${totalSearched} | 📦 Results: ${totalFound} | ✨ Unique: ${totalUnique}`);
    logger.info('');

    // Import to database
    if (discovered.length === 0) {
      logger.warn('No sneakers to import');
      return { imported: 0, skipped: 0, skus: [] };
    }

    logger.info('');
    logger.info('═'.repeat(70));
    logger.info('📥 PHASE 2: IMPORTING SNEAKERS & IMAGES');
    logger.info('═'.repeat(70));
    logger.info(`📊 Importing ${discovered.length} sneakers...`);
    logger.info('');

    let imported = 0;
    let skipped = 0;
    const importedSkus: SKU[] = [];

    for (const sneaker of discovered) {
      try {
        const primaryStyleCode = extractPrimaryStyleCode(sneaker.sku_code);

        const result = await query(
          `INSERT INTO skus (
            sku_code, style_code, brand, model, colorway, tier, retail_price, image_url
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (style_code) DO NOTHING
          RETURNING *`,
          [
            sneaker.sku_code,
            primaryStyleCode,
            sneaker.brand,
            sneaker.model,
            sneaker.colorway,
            sneaker.tier,
            sneaker.retail_price,
            sneaker.image_url || null,
          ],
        );

        if (result.rowCount && result.rowCount > 0) {
          const skuId = result.rows[0].id;
          const skuData = result.rows[0] as SKU;
          importedSkus.push(skuData);
          imported++;
          totalImported++;

          if (imported % 50 === 0) {
            logger.info(`  📦 Imported ${imported}/${discovered.length}...`);
          }

          // Download and optimize image
          if (sneaker.image_url) {
            try {
              const imageResult = await imageProcessor.downloadAndOptimize(
                sneaker.image_url,
                primaryStyleCode
              );

              if (imageResult) {
                await query(
                  `UPDATE skus
                   SET image_local_path = $1,
                       image_file_size = $2,
                       image_downloaded_at = NOW()
                   WHERE id = $3`,
                  [imageResult.fullPath, imageResult.fileSize, skuId]
                );
              }
            } catch (imgError) {
              logger.debug({ error: imgError }, `Failed to download image for ${primaryStyleCode}`);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } else {
          skipped++;
        }
      } catch (error) {
        logger.error({ sneaker, error }, `Failed to import: ${sneaker.sku_code}`);
      }
    }

    logger.info('');
    logger.info('✅ IMPORT COMPLETE');
    logger.info(`  Imported: ${imported} | Skipped: ${skipped} | Total in DB: ${await getTotalCount()}`);
    logger.info('');

    return { imported, skipped, skus: importedSkus };

  } catch (error) {
    logger.error({ error }, 'Discovery failed');
    throw error;
  }
}

async function fetchPricesForNewSneakers(skus: SKU[]): Promise<{ success: number; failed: number }> {
  if (skus.length === 0) {
    logger.warn('No sneakers to fetch prices for');
    return { success: 0, failed: 0 };
  }

  logger.info('');
  logger.info('═'.repeat(70));
  logger.info('💰 PHASE 3: FETCHING INITIAL MARKET PRICES');
  logger.info('═'.repeat(70));
  logger.info(`📊 Fetching prices for ${skus.length} sneakers...`);
  logger.info('');

  const priceFetcher = new PriceFetcher();
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < skus.length; i++) {
    const sku = skus[i];

    try {
      const results = await priceFetcher.fetchAllPricesForSku(sku);

      const ebaySuccess = results.ebay.success;
      const goatSuccess = results.goat.success;
      const stockxSuccess = results.stockx.success;

      if (ebaySuccess || goatSuccess || stockxSuccess) {
        successCount++;
      } else {
        failedCount++;
      }

      if ((i + 1) % 10 === 0) {
        const elapsedMinutes = (Date.now() - startTime) / 1000 / 60;
        logger.info(`  ✓ ${i + 1}/${skus.length} | ${successCount} success | ⏱️  ${elapsedMinutes.toFixed(1)}m`);
      }
    } catch (error) {
      logger.error({ sku: sku.sku_code, error }, 'Failed to fetch prices');
      failedCount++;
    }

    if (i < skus.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  logger.info('');
  logger.info('✅ PRICE FETCH COMPLETE');
  logger.info(`  Success: ${successCount} | Failed: ${failedCount}`);
  logger.info('');

  return { success: successCount, failed: failedCount };
}

async function printFinalReport() {
  logger.info('');
  logger.info('═'.repeat(70));
  logger.info('📊 FINAL CATALOG REPORT');
  logger.info('═'.repeat(70));

  const totalCount = await getTotalCount();
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  logger.info(`⏱️  Total time: ${totalTime} minutes`);
  logger.info(`🎯 Total sneakers in catalog: ${totalCount}`);
  logger.info(`✨ New sneakers added: ${totalImported}`);
  logger.info('');

  // By tier
  const tierResult = await query(`
    SELECT tier, COUNT(*) as count
    FROM skus
    GROUP BY tier
    ORDER BY tier
  `);

  logger.info('Catalog by tier:');
  for (const row of tierResult.rows as any[]) {
    logger.info(`  Tier ${row.tier}: ${row.count} sneakers`);
  }

  logger.info('');

  // Top brands
  const brandResult = await query(`
    SELECT brand, COUNT(*) as count
    FROM skus
    GROUP BY brand
    ORDER BY count DESC
    LIMIT 15
  `);

  logger.info('Top 15 brands:');
  for (const row of brandResult.rows as any[]) {
    logger.info(`  ${row.brand}: ${row.count}`);
  }

  logger.info('');

  // Image stats
  const imageResult = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN image_local_path IS NOT NULL THEN 1 END) as with_images,
      COUNT(CASE WHEN image_local_path IS NULL THEN 1 END) as without_images
    FROM skus
  `);

  const stats = imageResult.rows[0] as any;
  const imagePercent = ((stats.with_images / stats.total) * 100).toFixed(1);

  logger.info('Image coverage:');
  logger.info(`  With images: ${stats.with_images}/${stats.total} (${imagePercent}%)`);
  logger.info(`  Without images: ${stats.without_images}`);

  logger.info('');

  // Price data
  const priceResult = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN image_local_path IS NOT NULL THEN 1 END) as with_prices
    FROM skus s
    LEFT JOIN prices p ON s.id = p.sku_id
  `);

  logger.info('Price data:');
  logger.info(`  Sneakers with price data: ${priceResult.rows.length}`);

  logger.info('');
  logger.info('═'.repeat(70));
  logger.info('✅ FULL DISCOVERY + PRICE UPDATE COMPLETE!');
  logger.info('═'.repeat(70));
  logger.info('');
  logger.info('Next steps:');
  logger.info('  1. Scheduler will automatically update prices based on tier');
  logger.info('  2. Tier 1: Every 6 hours');
  logger.info('  3. Tier 2: Once daily (2pm)');
  logger.info('  4. Tier 3: 2x weekly (Mon/Thu 10am)');
  logger.info('');
}

async function main() {
  try {
    // Phase 1: Discovery
    const { imported, skipped, skus } = await discoverSneakers();

    if (skus.length === 0) {
      logger.warn('No new sneakers to fetch prices for');
      await printFinalReport();
      return;
    }

    // Phase 2: Fetch prices for new sneakers
    const priceResults = await fetchPricesForNewSneakers(skus);

    // Phase 3: Report
    await printFinalReport();

  } catch (error) {
    logger.error({ error }, 'Full discovery failed');
    process.exit(1);
  } finally {
    await closePool();
  }
}

async function getTotalCount(): Promise<number> {
  const result = await query('SELECT COUNT(*) as count FROM skus');
  return (result.rows[0] as any).count;
}

function extractPrimaryStyleCode(code: string): string {
  return code.split('/')[0].trim();
}

function extractAlternateStyleCodes(code: string): string[] {
  const parts = code.split('/').map(p => p.trim());
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

main();
