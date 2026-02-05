import { GoatScraper } from '../services/scrapers/goat.js';
import { query, closePool } from '../db/index.js';
import logger from '../utils/logger.js';

/**
 * MEGA sneaker discovery - Build comprehensive catalog
 * One-time run to populate a large catalog (500-1000+ sneakers)
 * Run with: npm run sneaker:discover-mega
 *
 * WARNING: Takes 10-15 minutes, makes ~100+ API calls
 * Use this ONCE for initial catalog building, then use regular discovery
 */

// Comprehensive search queries covering all major brands, models, and years
const megaSearchQueries = [
  // === NIKE JORDAN (High Volume) ===
  // Jordan 1
  'Jordan 1 High OG 2024',
  'Jordan 1 High OG 2025',
  'Jordan 1 Low 2024',
  'Jordan 1 Low 2025',
  'Jordan 1 Mid',
  'Jordan 1 Retro High',

  // Jordan 4
  'Jordan 4 Retro 2024',
  'Jordan 4 Retro 2025',
  'Jordan 4 Military',
  'Jordan 4 Thunder',

  // Jordan 3, 5, 6, 11
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

async function randomDelay(minSeconds: number, maxSeconds: number) {
  const delayMs = (minSeconds + Math.random() * (maxSeconds - minSeconds)) * 1000;
  await new Promise(resolve => setTimeout(resolve, delayMs));
}

async function discoverSneakersMega() {
  const goatScraper = new GoatScraper();
  const discovered: DiscoveredSneaker[] = [];
  const duplicates = new Set<string>();

  const startTime = Date.now();

  try {
    logger.info(`🚀 Starting MEGA sneaker discovery`);
    logger.info(`📊 Queries: ${megaSearchQueries.length}`);
    logger.info(`🎯 Target: 500-1000+ sneakers`);
    logger.info(`⏱️  Estimated time: 10-15 minutes`);
    logger.info('');

    for (let i = 0; i < megaSearchQueries.length; i++) {
      const searchQuery = megaSearchQueries[i];
      const progress = `[${i + 1}/${megaSearchQueries.length}]`;

      logger.info(`${progress} 🔍 Searching: "${searchQuery}"`);

      try {
        // Get 30 results per query (was 10-15)
        const listings = await goatScraper.searchProducts(searchQuery, 30);

        totalSearched++;
        totalFound += listings.length;

        if (listings.length === 0) {
          logger.warn(`  ⚠️  No results for "${searchQuery}"`);
          continue;
        }

        logger.info(`  ✓ Found ${listings.length} results`);

        let newInQuery = 0;
        for (const listing of listings) {
          if (!listing.sku || listing.sku.trim() === '') continue;

          const normalizedSku = listing.sku.toUpperCase().replace(/\s+/g, '-');
          if (duplicates.has(normalizedSku)) continue;

          duplicates.add(normalizedSku);
          newInQuery++;

          // Determine tier
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
        }

        totalUnique = discovered.length;
        logger.info(`  ➕ ${newInQuery} new unique (Total unique: ${totalUnique})`);

        // Show progress every 10 queries
        if ((i + 1) % 10 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
          const eta = (elapsed / (i + 1)) * (megaSearchQueries.length - i - 1);
          logger.info('');
          logger.info(`📈 Progress: ${i + 1}/${megaSearchQueries.length} (${((i + 1) / megaSearchQueries.length * 100).toFixed(0)}%)`);
          logger.info(`⏱️  Elapsed: ${elapsed}m | ETA: ${eta.toFixed(1)}m`);
          logger.info(`🎯 Unique sneakers: ${totalUnique}`);
          logger.info('');
        }

        // Rate limiting: 2-4 seconds between searches
        if (i < megaSearchQueries.length - 1) {
          await randomDelay(2, 4);
        }

      } catch (error) {
        logger.error({ searchQuery, error }, `Failed: "${searchQuery}"`);
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    logger.info('');
    logger.info('='.repeat(60));
    logger.info('🎉 MEGA DISCOVERY COMPLETE');
    logger.info('='.repeat(60));
    logger.info(`⏱️  Total time: ${totalTime} minutes`);
    logger.info(`🔍 Queries searched: ${totalSearched}`);
    logger.info(`📦 Total results: ${totalFound}`);
    logger.info(`✨ Unique sneakers: ${totalUnique}`);
    logger.info('');

    // Import to database
    if (discovered.length === 0) {
      logger.warn('No sneakers to import');
      return;
    }

    logger.info(`📥 Importing ${discovered.length} sneakers to database...`);
    logger.info('');

    let imported = 0;
    let skipped = 0;

    for (const sneaker of discovered) {
      try {
        const result = await query(
          `INSERT INTO skus (
            sku_code, brand_style_code, brand, model, colorway, tier, retail_price
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (sku_code) DO NOTHING
          RETURNING id`,
          [
            sneaker.sku_code,
            sneaker.sku_code,
            sneaker.brand,
            sneaker.model,
            sneaker.colorway,
            sneaker.tier,
            sneaker.retail_price,
          ],
        );

        if (result.rowCount && result.rowCount > 0) {
          imported++;
          if (imported % 50 === 0) {
            logger.info(`  📦 Imported ${imported}...`);
          }
        } else {
          skipped++;
        }
      } catch (error) {
        logger.error({ sneaker, error }, `Failed to import: ${sneaker.sku_code}`);
      }
    }

    logger.info('');
    logger.info('='.repeat(60));
    logger.info('📊 FINAL SUMMARY');
    logger.info('='.repeat(60));
    logger.info(`✅ Imported: ${imported} new sneakers`);
    logger.info(`⏭️  Skipped: ${skipped} already exist`);
    logger.info(`🗄️  Total catalog: ${await getTotalCount()}`);
    logger.info('');

    // Show breakdown
    const tierResult = await query(`
      SELECT tier, COUNT(*) as count
      FROM skus
      GROUP BY tier
      ORDER BY tier
    `);

    logger.info('By tier:');
    for (const row of tierResult.rows as any[]) {
      logger.info(`  Tier ${row.tier}: ${row.count} sneakers`);
    }

    const brandResult = await query(`
      SELECT brand, COUNT(*) as count
      FROM skus
      GROUP BY brand
      ORDER BY count DESC
      LIMIT 15
    `);

    logger.info('');
    logger.info('Top 15 brands:');
    for (const row of brandResult.rows as any[]) {
      logger.info(`  ${row.brand}: ${row.count} sneakers`);
    }

    logger.info('');
    logger.info('='.repeat(60));
    logger.info('✅ MEGA DISCOVERY COMPLETE!');
    logger.info('='.repeat(60));

  } catch (error) {
    logger.error({ error }, 'Mega discovery failed');
    process.exit(1);
  } finally {
    await closePool();
  }
}

async function getTotalCount(): Promise<number> {
  const result = await query('SELECT COUNT(*) as count FROM skus');
  return (result.rows[0] as any).count;
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

discoverSneakersMega();
