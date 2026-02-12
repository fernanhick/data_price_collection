import { GoatScraper } from '../services/scrapers/goat.js';
import { query, closePool } from '../db/index.js';
import logger from '../utils/logger.js';
import imageProcessor from '../services/imageProcessor.js';

/**
 * BRAND-BY-BRAND DISCOVERY
 *
 * Discover ALL sneakers per brand systematically:
 * - Nike (all lines: Sportswear, Jordan, Basketball, Running)
 * - Adidas (all lines: Originals, Performance, Yeezy)
 * - New Balance, Asics, Puma, Reebok, Converse, Vans, etc.
 * - Plus sub-brand variations (Men, Women, Kids, Retro, etc.)
 *
 * Run with: npm run discover:by-brand
 *
 * WARNING: Takes 45-60+ minutes, makes ~400+ API calls
 * Discovers 3,000-5,000+ sneakers for comprehensive catalog
 */

// Brand discovery strategy - multiple searches per brand to get ALL products
const brandSearchQueries = [
  // === NIKE (Most comprehensive) ===
  'Nike',
  'Nike Men',
  'Nike Women',
  'Nike Kids',
  'Nike Running',
  'Nike Basketball',
  'Nike Lifestyle',
  'Nike SB Skateboarding',
  'Nike ACG',
  'Nike Sportswear',

  // === JORDAN BRAND ===
  'Jordan',
  'Air Jordan',
  'Air Jordan Men',
  'Air Jordan Women',
  'Air Jordan Retro',

  // === ADIDAS (All lines) ===
  'Adidas',
  'Adidas Men',
  'Adidas Women',
  'Adidas Kids',
  'Adidas Running',
  'Adidas Basketball',
  'Adidas Originals',
  'Adidas Performance',
  'Adidas Football',
  'Adidas Tennis',
  'Adidas NMD',
  'Adidas Ultraboost',
  'Adidas EQT',

  // === YEEZY ===
  'Yeezy',
  'Yeezy Adidas',

  // === NEW BALANCE ===
  'New Balance',
  'New Balance Men',
  'New Balance Women',
  'New Balance Kids',
  'New Balance Running',
  'New Balance Basketball',
  'New Balance Lifestyle',
  'New Balance 990',
  'New Balance 574',
  'New Balance 2002',

  // === ASICS ===
  'Asics',
  'Asics Men',
  'Asics Women',
  'Asics Running',
  'Asics Gel',
  'Asics GT',

  // === PUMA ===
  'Puma',
  'Puma Men',
  'Puma Women',
  'Puma Kids',
  'Puma Running',
  'Puma Basketball',
  'Puma Suede',
  'Puma RS-X',

  // === REEBOK ===
  'Reebok',
  'Reebok Men',
  'Reebok Women',
  'Reebok Running',
  'Reebok Basketball',
  'Reebok Classic',
  'Reebok Pump',

  // === CONVERSE ===
  'Converse',
  'Converse Men',
  'Converse Women',
  'Converse Chuck Taylor',
  'Converse All Star',
  'Converse One Star',

  // === VANS ===
  'Vans',
  'Vans Men',
  'Vans Women',
  'Vans Kids',
  'Vans Skateboarding',
  'Vans Old Skool',
  'Vans Sk8-Hi',

  // === SAUCONY ===
  'Saucony',
  'Saucony Running',
  'Saucony Women',

  // === BROOKS ===
  'Brooks',
  'Brooks Running',
  'Brooks Women',

  // === HOKA ===
  'Hoka',
  'Hoka Running',
  'Hoka Women',

  // === ON (Cloud) ===
  'On',
  'On Cloud',
  'On Running',
  'On Women',

  // === SALOMON ===
  'Salomon',
  'Salomon Running',
  'Salomon Trail',
  'Salomon Hiking',

  // === ALTRA ===
  'Altra',
  'Altra Running',

  // === KARHU ===
  'Karhu',
  'Karhu Running',

  // === SKECHERS ===
  'Skechers',
  'Skechers Men',
  'Skechers Women',
  'Skechers Running',

  // === TIMBERLAND ===
  'Timberland',
  'Timberland Men',
  'Timberland Women',
  'Timberland Boots',
  'Timberland 6 Inch',

  // === DR. MARTENS ===
  'Dr Martens',
  'Dr Martens 1461',
  'Dr Martens Women',

  // === CLARKS ===
  'Clarks',
  'Clarks Wallabee',
  'Clarks Desert',

  // === COLUMBIA ===
  'Columbia',
  'Columbia Hiking',
  'Columbia Running',

  // === THE NORTH FACE ===
  'The North Face',
  'North Face Boots',
  'North Face Hiking',

  // === SALEWA ===
  'Salewa',
  'Salewa Mountain',
  'Salewa Hiking',

  // === LI-NING ===
  'Li-Ning',
  'Li-Ning Basketball',
  'Li-Ning Running',

  // === ANTA ===
  'Anta',
  'Anta Basketball',
  'Anta Running',

  // === PEAK ===
  'Peak',
  'Peak Basketball',

  // === ERKE ===
  'Erke',
  'Erke Running',

  // === LUXURY/DESIGNER COLLECTIBLES ===
  'Golden Goose',
  'Balenciaga Sneaker',
  'Gucci Sneaker',
  'Louis Vuitton',
  'Bottega Veneta',
  'Maison Margiela',
  'Valentino',
  'Common Projects',
  'Dior Sneaker',
  'Prada Sneaker',
  'Yohji Yamamoto',
  'Comme des Garçons',
  'Rick Owens',
  'Undercover',
  'Visvim',
  'Craig Green',
  'Marine Serre',
  'A-Cold-Wall',

  // === VINTAGE/RETRO COLLECTIBLE BRANDS ===
  'LA Gear',
  'Fila',
  'Fila Vintage',
  'Diadora',
  'K-Swiss',
  'Etonic',
  'Spot-Bilt',
  'Pro-Keds',
  'Onitsuka Tiger',
  'Onitsuka Tiger Heritage',
  'Asahi',
  'Superga',
  'Veja',
  'Allbirds',
  'Keds',
  'Sperry',

  // === SKATEBOARD/LIFESTYLE COLLECTIBLES ===
  'Emerica',
  'Lakai',
  'DVS',
  'éS',
  'Circa',
  'Supra',
  'Osiris',
  'Etnies',

  // === ASIAN HERITAGE & COLLECTIBLES ===
  'Asahi Sneaker',
  'Mizuno',
  'Mizuno Running',
  'New Balance Japan',
  'Asics Onitsuka',

  // === BOUTIQUE/LIMITED BRANDS ===
  'Concepts',
  'Hanon',
  'Sneakersnstuff',
  'Offspring',
  'AAPE',
  'Kasina',

  // === JAPANESE DESIGNER COLLECTIBLES ===
  'Visvim Footwear',
  'Needles',
  'South2West8',
  'The North Face Purple',
  'Beams',
  'Beauty & Youth',
  'Atmos',
  'Mita Sneakers',

  // === EXPANDED COLLABORATIONS ===
  'Nike Concepts',
  'Nike Kasina',
  'ASICS Concepts',
  'ASICS Ronnie Fieg',
  'ASICS Ubiq',
  'ASICS Hanon',
  'New Balance Concepts',
  'New Balance Bodega',
  'New Balance Hanon',
  'Adidas Concepts',
  'Reebok Hanon',
  'Vans Syndicate',
  'Converse Fragment',
  'Puma Hanon',
  'Asahi Collaborations',
  'Sneakersnstuff Collab',
  'Offspring Collab',

  // === HERITAGE RUNNING COLLECTIBLES ===
  'Nike Waffle',
  'Nike Challenger',
  'Nike Revolution',
  'Adidas Ozweego',
  'Adidas ZX 500',
  'New Balance Heritage',
  'Saucony Ride',

  // === ADDITIONAL COLLECTIBLE BRANDS ===
  'Karhu Synchron',
  'ASICS Gel-Lyte Retro',
  'Nike Air Max Plus',
  'Nike Air Max TN',
  'Nike Air Trainer',
  'Adidas Forum Collectible',
  'Puma Suede Vintage',
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

let totalSearched = 0;
let totalFound = 0;
let totalUnique = 0;
const startTime = Date.now();

async function randomDelay(minSeconds: number, maxSeconds: number) {
  const delayMs = (minSeconds + Math.random() * (maxSeconds - minSeconds)) * 1000;
  await new Promise(resolve => setTimeout(resolve, delayMs));
}

async function discoverByBrand() {
  const goatScraper = new GoatScraper();
  const discovered: DiscoveredSneaker[] = [];
  const duplicates = new Set<string>();

  try {
    logger.info('');
    logger.info('═'.repeat(70));
    logger.info('🏢 BRAND-BY-BRAND COMPREHENSIVE DISCOVERY');
    logger.info('═'.repeat(70));
    logger.info(`📊 Queries: ${brandSearchQueries.length}`);
    logger.info(`🎯 Target: 3,000-5,000+ sneakers (ALL releases per brand)`);
    logger.info(`⏱️  Estimated time: 45-60 minutes`);
    logger.info('');

    for (let i = 0; i < brandSearchQueries.length; i++) {
      const searchQuery = brandSearchQueries[i];
      const progress = `[${i + 1}/${brandSearchQueries.length}]`;

      logger.info(`${progress} 🏷️  "${searchQuery}"`);

      try {
        // Get up to 30 results per brand query
        const listings = await goatScraper.searchProducts(searchQuery, 30);

        totalSearched++;
        totalFound += listings.length;

        if (listings.length === 0) {
          logger.info(`  ⚠️  No results`);
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

        if ((i + 1) % 20 === 0) {
          const elapsedMinutes = (Date.now() - startTime) / 1000 / 60;
          const elapsed = elapsedMinutes.toFixed(1);
          const eta = (elapsedMinutes / (i + 1)) * (brandSearchQueries.length - i - 1);
          logger.info(`  📈 Progress: ${i + 1}/${brandSearchQueries.length} (${((i + 1) / brandSearchQueries.length * 100).toFixed(0)}%) | ⏱️  ${elapsed}m | ETA: ${eta.toFixed(1)}m | 🎯 ${totalUnique}`);
        }

        if (i < brandSearchQueries.length - 1) {
          await randomDelay(2, 4);
        }

      } catch (error) {
        logger.error({ searchQuery, error }, `Failed: "${searchQuery}"`);
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    logger.info('');
    logger.info('═'.repeat(70));
    logger.info('✅ DISCOVERY PHASE COMPLETE');
    logger.info('═'.repeat(70));
    logger.info(`⏱️  Time: ${totalTime}m | 🏷️  Queries: ${totalSearched} | 📦 Results: ${totalFound} | ✨ Unique: ${totalUnique}`);
    logger.info('');

    if (discovered.length === 0) {
      logger.warn('No sneakers to import');
      return { imported: 0, skipped: 0, total: 0 };
    }

    logger.info('');
    logger.info('═'.repeat(70));
    logger.info('📥 IMPORTING TO DATABASE');
    logger.info('═'.repeat(70));
    logger.info(`📊 Processing ${discovered.length} sneakers...`);
    logger.info('');

    let imported = 0;
    let skipped = 0;

    for (let idx = 0; idx < discovered.length; idx++) {
      const sneaker = discovered[idx];
      try {
        const primaryStyleCode = extractPrimaryStyleCode(sneaker.sku_code);

        const result = await query(
          `INSERT INTO skus (
            sku_code, style_code, brand, model, colorway, tier, retail_price, image_url
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (style_code) DO NOTHING
          RETURNING id`,
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
          imported++;

          if (imported % 100 === 0) {
            logger.info(`  📦 Imported ${imported}/${discovered.length}...`);
          }

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

            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } else {
          skipped++;
        }
      } catch (error) {
        logger.error({ sneaker, error }, `Failed to import: ${sneaker.sku_code}`);
      }
    }

    logger.info('');
    logger.info('═'.repeat(70));
    logger.info('📊 FINAL SUMMARY');
    logger.info('═'.repeat(70));

    const totalCount = await getTotalCount();
    logger.info(`✅ Imported: ${imported} new sneakers`);
    logger.info(`⏭️  Skipped: ${skipped} (already exist)`);
    logger.info(`🗄️  Total catalog: ${totalCount}`);
    logger.info('');

    // Show breakdown
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

    const brandResult = await query(`
      SELECT brand, COUNT(*) as count
      FROM skus
      GROUP BY brand
      ORDER BY count DESC
      LIMIT 20
    `);

    logger.info('Top 20 brands:');
    for (const row of brandResult.rows as any[]) {
      logger.info(`  ${row.brand}: ${row.count}`);
    }

    logger.info('');

    const imageResult = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN image_local_path IS NOT NULL THEN 1 END) as with_images
      FROM skus
    `);

    const stats = imageResult.rows[0] as any;
    const percent = ((stats.with_images / stats.total) * 100).toFixed(1);

    logger.info('Image coverage:');
    logger.info(`  With images: ${stats.with_images}/${stats.total} (${percent}%)`);

    logger.info('');
    logger.info('═'.repeat(70));
    logger.info('✅ BRAND-BY-BRAND DISCOVERY COMPLETE!');
    logger.info('═'.repeat(70));
    logger.info('');
    logger.info('Your catalog now covers ALL brand releases!');
    logger.info('Next: Scheduler will automatically update all prices.');
    logger.info('');

    return { imported, skipped, total: totalCount };

  } catch (error) {
    logger.error({ error }, 'Brand-by-brand discovery failed');
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

  const brands = ['Nike', 'Adidas', 'New Balance', 'Asics', 'Puma', 'Reebok', 'Converse', 'Vans', 'Hoka', 'On', 'Salomon', 'Arc\'teryx', 'Karhu', 'Li-Ning', 'Anta', 'Peak', 'Erke', 'Saucony', 'Brooks', 'Skechers', 'Timberland', 'Dr Martens', 'Clarks', 'Salewa', 'Columbia', 'The North Face', 'Altra', 'ASICS', 'Yeezy', 'Jordan', 'Air Jordan', 'Golden Goose', 'Balenciaga', 'Gucci', 'Louis Vuitton', 'Bottega Veneta', 'Maison Margiela', 'Valentino', 'Common Projects', 'Dior', 'Prada'];
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

discoverByBrand();
