import { GoatScraper } from '../services/scrapers/goat.js';
import { query, closePool } from '../db/index.js';
import logger from '../utils/logger.js';
import imageProcessor from '../services/imageProcessor.js';

/**
 * COMPREHENSIVE SNEAKER DISCOVERY
 *
 * Discover 2000-3000+ sneakers including:
 * - Historical releases (2015-2023)
 * - Classic colorways and retros
 * - General releases (GR models)
 * - Complete brand catalogs
 * - Collaborations across all years
 *
 * Run with: npm run discover:comprehensive
 *
 * WARNING: Takes 30-45 minutes, makes ~300+ API calls
 * Discovers significantly more sneakers than mega discovery
 */

// Comprehensive search queries including historical releases
const comprehensiveSearchQueries = [
  // === NIKE JORDAN (All Years) ===
  // Jordan 1 Historical
  'Jordan 1 Retro High OG',
  'Jordan 1 Retro Low OG',
  'Jordan 1 Retro Mid OG',
  'Jordan 1 High 2024 2025',
  'Jordan 1 Low 2024 2025',
  'Jordan 1 Retro High 2020 2021 2022 2023',
  'Jordan 1 Shadow',
  'Jordan 1 Chicago',
  'Jordan 1 Bred',
  'Jordan 1 Royal',
  'Jordan 1 Neutral Grey',
  'Jordan 1 Satin Black',
  'Jordan 1 Crimson',

  // Jordan 3 All Eras
  'Jordan 3 Retro',
  'Jordan 3 Black Cement',
  'Jordan 3 White Cement',
  'Jordan 3 Fire Red',
  'Jordan 3 True Blue',
  'Jordan 3 Katrina',

  // Jordan 4 All Eras
  'Jordan 4 Retro',
  'Jordan 4 Black Cat',
  'Jordan 4 Cement Grey',
  'Jordan 4 Thunder',
  'Jordan 4 Military Blue',
  'Jordan 4 Bred',

  // Jordan 5-12
  'Jordan 5 Retro',
  'Jordan 5 Grape',
  'Jordan 5 Fire Red',
  'Jordan 6 Retro',
  'Jordan 6 Carmine',
  'Jordan 6 Black Cat',
  'Jordan 11 Retro',
  'Jordan 11 Bred',
  'Jordan 11 Concord',
  'Jordan 12 Retro',
  'Jordan 12 Playoff',
  'Jordan 13 Retro',

  // === NIKE DUNK (All Eras) ===
  'Nike Dunk Low Retro',
  'Nike Dunk High Retro',
  'Nike Dunk SB',
  'Nike Dunk Panda',
  'Nike Dunk University',
  'Nike Dunk Reverse Panda',
  'Nike Dunk Chicago',
  'Nike Dunk Black White',
  'Nike Dunk Low 2020 2021 2022',

  // === NIKE AIR MAX ===
  'Nike Air Max 1',
  'Nike Air Max 90',
  'Nike Air Max 95',
  'Nike Air Max 97',
  'Nike Air Max 98',
  'Nike Air Max Plus',
  'Nike Air Max TN',

  // === NIKE CLASSIC ===
  'Nike Air Force 1 Low',
  'Nike Air Force 1 High',
  'Nike Blazer Low',
  'Nike Blazer Mid',
  'Nike Blazer High',
  'Nike Cortez',
  'Nike Waffle Trainer',
  'Nike Venture Racer',

  // === YEEZY (All Models/Years) ===
  'Yeezy 350 V2',
  'Yeezy 350 V2 Zebra',
  'Yeezy 350 V2 Bred',
  'Yeezy 350 V2 Beluga',
  'Yeezy 350 V2 Cream',
  'Yeezy 350 V2 Static',
  'Yeezy 350 V2 Reflective',
  'Yeezy 700',
  'Yeezy 700 Wave Runner',
  'Yeezy 700 Inertia',
  'Yeezy 700 Static',
  'Yeezy 700 Analog',
  'Yeezy 700 Mauve',
  'Yeezy 500',
  'Yeezy 500 Utility Black',
  'Yeezy 500 Soft Vision',
  'Yeezy 500 Brown',
  'Yeezy Foam Runner',
  'Yeezy Foam Clog',
  'Yeezy Slide',
  'Yeezy 450',
  'Yeezy 450 Dark Slate',

  // === ADIDAS CLASSIC ===
  'Adidas Samba',
  'Adidas Samba OG',
  'Adidas Gazelle',
  'Adidas Campus',
  'Adidas Campus 00s',
  'Adidas Spezial',
  'Adidas Forum',
  'Adidas Forum Low',
  'Adidas Superstar',
  'Adidas Stan Smith',
  'Adidas ZX 500',
  'Adidas ZX 750',
  'Adidas ZX Flux',

  // === NEW BALANCE ===
  'New Balance 550',
  'New Balance 990',
  'New Balance 990 Version 2',
  'New Balance 990 Version 3',
  'New Balance 990 Version 4',
  'New Balance 990 Version 5',
  'New Balance 990 Version 6',
  'New Balance 991',
  'New Balance 992',
  'New Balance 993',
  'New Balance 2002R',
  'New Balance 2002',
  'New Balance 574',
  'New Balance 577',
  'New Balance 580',
  'New Balance 997',
  'New Balance M1906R',
  'New Balance M1500',

  // === ASICS ===
  'Asics Gel-Lyte III',
  'Asics Gel-Lyte V',
  'Asics Gel Kayano',
  'Asics GT-2160',
  'Asics Gel-Nimbus',
  'Asics Gel-Cumulus',
  'Asics Gel-Saga',
  'Asics Gel-Mai',

  // === COLLABORATIONS (Multiple Years) ===
  'Off-White Nike Dunk',
  'Off-White Nike Air Force 1',
  'Off-White Air Jordan 1',
  'Off-White Air Jordan 5',
  'Sacai Nike LDWaffle',
  'Sacai Nike Vaporwaffle',
  'Union Nike Air Jordan 1',
  'Union Nike Dunk Low',
  'Fragment Design Nike',
  'Fragment Design Jordan 1',
  'Travis Scott Air Jordan 1',
  'Travis Scott Air Jordan 4',
  'Travis Scott SB Dunk Low',
  'A Ma Maniere Jordan 3',
  'A Ma Maniere Jordan 2',
  'JJJJound New Balance',
  'Salehe Bembury New Balance',
  'Patta Nike',
  'Clot Nike',
  'Muslin Nike',
  'Verdy Nike SB',
  'Stussy Nike',
  'Undefeated Nike',
  'Supreme Nike SB',
  'Supreme The North Face',

  // === CONVERSE ===
  'Converse Chuck Taylor 70',
  'Converse Chuck Taylor High',
  'Converse Chuck Taylor Low',
  'Converse One Star',
  'Converse Jack Purcell',
  'Converse Weapon',

  // === VANS ===
  'Vans Old Skool',
  'Vans Sk8-Hi',
  'Vans Era',
  'Vans Style 36',
  'Vans Authentic',
  'Vans Knu Skool',

  // === PUMA ===
  'Puma Suede',
  'Puma Clyde',
  'Puma RS-X',
  'Puma Future Rider',
  'Puma Mirage Sport',

  // === REEBOK ===
  'Reebok Club C',
  'Reebok Classic Leather',
  'Reebok Pump',
  'Reebok Instapump',
  'Reebok Question',

  // === RUNNING/PERFORMANCE ===
  'Nike Air Zoom Pegasus',
  'Nike Revolution',
  'Nike Cortez Running',
  'Adidas Ultraboost',
  'Adidas NMD',
  'Adidas EQT',
  'New Balance Fresh Foam',
  'Asics Gel Lyte',
  'Saucony Grid',
  'Hoka Clifton',
  'Hoka Bondi',
  'On Cloud',
  'On Cloudmonster',

  // === VINTAGE/RETRO NIKE ===
  'Nike Air Max Vintage',
  'Nike Air Max 2090',
  'Nike Air Max 95 OG',
  'Nike Air Max 90 OG',
  'Nike Air Huarache',
  'Nike Air Diamond Turf',
  'Nike Air Trainer',

  // === LUXURY/DESIGNER ===
  'Bottega Veneta Sneaker',
  'Balenciaga Triple S',
  'Balenciaga Track',
  'Gucci Ace',
  'Gucci Rhyton',
  'Louis Vuitton Trainer',
  'Golden Goose',
  'Maison Margiela Replica',
  'Valentino Rockrunner',
  'Common Projects Achilles',

  // === EMERGING BRANDS ===
  'Salomon XT-6',
  'Salomon ACS Pro',
  'Altra Lone Peak',
  'Arc\'teryx Vertex',
  'Karhu Synchron',
  'ASICS Gel Kayano',
  'Saucony Ride',
  'HOKA ONE ONE',

  // === CHINESE/ASIAN BRANDS ===
  'Li-Ning Way of Wade',
  'Li-Ning Cloud',
  'Anta KT',
  'Peak Basketball',
  'Erke Retro',
  'Skechers GO Run',

  // === ADDITIONAL BRANDS ===
  'Timberland Boot',
  'Dr. Martens 1461',
  'Clarks Wallabee',
  'Salewa Mountain Trainer',
  'Columbia Newton Ridge',
  'The North Face Nuptse Bootie',
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

async function discoverComprehensive() {
  const goatScraper = new GoatScraper();
  const discovered: DiscoveredSneaker[] = [];
  const duplicates = new Set<string>();

  try {
    logger.info('');
    logger.info('═'.repeat(70));
    logger.info('🚀 COMPREHENSIVE SNEAKER DISCOVERY');
    logger.info('═'.repeat(70));
    logger.info(`📊 Queries: ${comprehensiveSearchQueries.length}`);
    logger.info(`🎯 Target: 2000-3000+ sneakers`);
    logger.info(`⏱️  Estimated time: 30-45 minutes`);
    logger.info('');

    for (let i = 0; i < comprehensiveSearchQueries.length; i++) {
      const searchQuery = comprehensiveSearchQueries[i];
      const progress = `[${i + 1}/${comprehensiveSearchQueries.length}]`;

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

        if ((i + 1) % 20 === 0) {
          const elapsedMinutes = (Date.now() - startTime) / 1000 / 60;
          const elapsed = elapsedMinutes.toFixed(1);
          const eta = (elapsedMinutes / (i + 1)) * (comprehensiveSearchQueries.length - i - 1);
          logger.info(`  📈 Progress: ${i + 1}/${comprehensiveSearchQueries.length} (${((i + 1) / comprehensiveSearchQueries.length * 100).toFixed(0)}%) | ⏱️  ${elapsed}m | ETA: ${eta.toFixed(1)}m | 🎯 ${totalUnique}`);
        }

        if (i < comprehensiveSearchQueries.length - 1) {
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
    logger.info(`⏱️  Time: ${totalTime}m | 🔍 Queries: ${totalSearched} | 📦 Results: ${totalFound} | ✨ Unique: ${totalUnique}`);
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

            await new Promise(resolve => setTimeout(resolve, 500));
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
      LIMIT 15
    `);

    logger.info('Top 15 brands:');
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
    logger.info('✅ COMPREHENSIVE DISCOVERY COMPLETE!');
    logger.info('═'.repeat(70));
    logger.info('');
    logger.info('Your catalog is now significantly expanded!');
    logger.info('Scheduler will automatically update all prices.');
    logger.info('');

    return { imported, skipped, total: totalCount };

  } catch (error) {
    logger.error({ error }, 'Comprehensive discovery failed');
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

  const brands = ['Nike', 'Adidas', 'New Balance', 'Asics', 'Puma', 'Reebok', 'Converse', 'Vans', 'Hoka', 'On', 'Salomon', 'Arc\'teryx', 'Karhu', 'Li-Ning', 'Anta', 'Saucony', 'Brooks', 'Skechers', 'Timberland', 'Dr Martens', 'Clarks', 'Salewa', 'Columbia', 'The North Face', 'Altra', 'ASICS', 'Yeezy', 'Jordan', 'Air Jordan'];
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

discoverComprehensive();
