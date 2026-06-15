/**
 * Sneaker Discovery Script (Consolidated)
 *
 * Discovers and imports sneakers from GOAT marketplace.
 * Replaces: discover-sneakers.ts, discover-sneakers-safe.ts, discover-sneakers-mega.ts,
 *           discover-sneakers-comprehensive.ts, discover-sneakers-by-brand.ts,
 *           full-discovery-with-prices.ts
 *
 * Usage:
 *   tsx src/scripts/discover.ts [options]
 *
 * Options:
 *   --preset <safe|basic|mega>   Query preset (default: basic)
 *   --with-prices                Fetch prices after discovery
 *   --limit <n>                  Max results per query (default: 15)
 *   --help                       Show help
 */

import { GoatScraper } from '../services/scrapers/goat.js';
import { query, closePool } from '../db/index.js';
import logger from '../utils/logger.js';
import imageProcessor from '../services/imageProcessor.js';
import { normalizeBrand } from '../utils/brand.js';

const QUERY_PRESETS: Record<string, string[]> = {
  safe: [
    'Jordan 1 High',
    'Jordan 4',
    'Nike Dunk Low',
    'Yeezy 350',
    'Travis Scott',
    'New Balance 550',
  ],
  basic: [
    // Jordan Brand
    'Jordan 1 High',
    'Jordan 1 Low',
    'Jordan 4',
    'Jordan 3',
    'Jordan 11',
    'Jordan 5',
    // Nike Dunk
    'Nike Dunk Low',
    'Nike Dunk High',
    'Nike SB Dunk',
    // Yeezy
    'Yeezy 350',
    'Yeezy 700',
    'Yeezy Slide',
    'Yeezy Foam Runner',
    // New Balance
    'New Balance 550',
    'New Balance 990',
    'New Balance 2002R',
    // Nike Other
    'Air Max 1',
    'Air Force 1',
    'Travis Scott',
    // Adidas
    'Adidas Samba',
    'Adidas Gazelle',
    'Adidas Campus',
    // Other Brands
    'Asics Gel-Lyte',
    'Salomon XT-6',
    'Hoka Clifton',
    'On Cloudmonster',
  ],
  mega: [
    // === NIKE JORDAN ===
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
    // === NIKE DUNK ===
    'Nike Dunk Low Panda',
    'Nike Dunk Low Retro',
    'Nike Dunk High',
    'Nike Dunk Low 2024',
    'Nike Dunk Low 2025',
    'Nike SB Dunk Low',
    'Nike SB Dunk High',
    // === TRAVIS SCOTT ===
    'Travis Scott Jordan 1',
    'Travis Scott Jordan 4',
    'Travis Scott Nike',
    'Travis Scott Fragment',
    // === YEEZY ===
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
    // === NEW BALANCE ===
    'New Balance 550',
    'New Balance 990',
    'New Balance 991',
    'New Balance 992',
    'New Balance 993',
    'New Balance 2002R',
    'New Balance 1906R',
    'New Balance 327',
    // === ADIDAS ===
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
  ],
};

export interface DiscoverOptions {
  preset?: 'safe' | 'basic' | 'mega';
  withPrices?: boolean;
  limit?: number;
}

export interface DiscoverResult {
  discovered: number;
  imported: number;
  skipped: number;
}

/**
 * Core discovery function — does NOT call closePool() so it can be used as a library.
 */
export async function discoverSneakers(options: DiscoverOptions = {}): Promise<DiscoverResult> {
  const {
    preset = 'basic',
    withPrices = false,
    limit = 15,
  } = options;

  const searchQueries = QUERY_PRESETS[preset] || QUERY_PRESETS.basic;

  await imageProcessor.initialize();

  const goatScraper = new GoatScraper();
  const discovered: Array<{
    sku_code: string;
    brand: string;
    model: string;
    colorway: string;
    retail_price: number | null;
    tier: number;
    goat_slug?: string;
    image_url?: string;
  }> = [];
  const duplicates = new Set<string>();

  logger.info(`Starting sneaker discovery (preset: ${preset}, ${searchQueries.length} queries)...`);

  for (const searchQuery of searchQueries) {
    logger.info(`\n🔍 Searching: "${searchQuery}"`);

    try {
      const listings = await goatScraper.searchProducts(searchQuery, limit);
      logger.info(`Found ${listings.length} results for "${searchQuery}"`);

      for (const listing of listings) {
        if (!listing.sku || listing.sku.trim() === '') {
          logger.debug(`Skipped (no SKU): ${listing.name}`);
          continue;
        }

        const nameLower = listing.name.toLowerCase();
        const nonFootwearKeywords = ['tee', 'shirt', 'hoodie', 'jacket', 'pants', 'shorts', 'hat', 'cap', 'bag', 'socks'];
        if (nonFootwearKeywords.some(keyword => nameLower.includes(keyword))) {
          logger.debug(`Skipped (non-footwear): ${listing.name}`);
          continue;
        }

        const normalizedSku = listing.sku.toUpperCase().replace(/\s+/g, '-');
        if (duplicates.has(normalizedSku)) {
          logger.debug(`Skipped (duplicate): ${listing.sku}`);
          continue;
        }

        duplicates.add(normalizedSku);

        let tier = 3;
        if (listing.retailPriceCents && listing.lowestPriceCents) {
          const premium = (listing.lowestPriceCents / listing.retailPriceCents) - 1;
          if (premium > 0.5) tier = 1;
          else if (premium > 0.15) tier = 2;
        }

        const parsedSneaker = parseSneakerName(listing.name, listing.brand);

        discovered.push({
          sku_code: normalizedSku,
          brand: normalizeBrand(parsedSneaker.brand || listing.brand || 'Unknown'),
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
              brand: normalizeBrand(parsedSneaker.brand || listing.brand || 'Unknown'),
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

        logger.info(`✅ Discovered: ${listing.brand} ${parsedSneaker.model} - ${parsedSneaker.colorway} (${normalizedSku})`);
      }

      // Rate limiting: 3-6s in safe mode, 2-4s otherwise
      const delay = preset === 'safe'
        ? 3000 + Math.random() * 3000
        : 2000 + Math.random() * 2000;
      await new Promise(resolve => setTimeout(resolve, delay));

    } catch (error) {
      logger.error({ searchQuery, error }, `Failed to search: "${searchQuery}"`);
    }
  }

  logger.info(`\n=== Discovery Complete ===`);
  logger.info(`Total discovered: ${discovered.length} unique sneakers`);

  let imported = 0;
  let skipped = 0;

  for (const sneaker of discovered) {
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

        if (sneaker.image_url) {
          const imageResult = await imageProcessor.downloadAndOptimize(
            sneaker.image_url,
            primaryStyleCode,
          );

          if (imageResult) {
            await query(
              `UPDATE skus SET image_local_path = $1, image_file_size = $2, image_downloaded_at = NOW() WHERE id = $3`,
              [imageResult.fullPath, imageResult.fileSize, skuId],
            );
          }

          await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
        }
      } else {
        skipped++;
      }
    } catch (error) {
      logger.error({ sneaker, error }, `Failed to import: ${sneaker.sku_code}`);
    }
  }

  logger.info(`\n=== Import Summary ===`);
  logger.info(`✅ Imported: ${imported} new sneakers`);
  logger.info(`⏭️  Skipped: ${skipped} sneakers (already exist)`);

  const countResult = await query('SELECT COUNT(*) as count FROM skus');
  logger.info(`🗄️  Total SKUs in database: ${(countResult.rows[0] as any).count}`);

  if (withPrices && imported > 0) {
    logger.info('\n💰 Fetching prices for newly discovered sneakers...');
    try {
      const { fetchPricesManual } = await import('./prices.js');
      await fetchPricesManual({ limit: imported, skipStockX: true });
    } catch (err) {
      logger.warn({ err }, 'Price fetch after discovery failed');
    }
  }

  return { discovered: discovered.length, imported, skipped };
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

  return { brand, model: cleanName.trim() || name, colorway };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`
Sneaker Discovery Script

Discover and import sneakers from GOAT marketplace.

Usage:
  tsx src/scripts/discover.ts [options]

Options:
  --preset <safe|basic|mega>   Query preset (default: basic)
    safe:  6 queries  (~30s, safe for daily/weekly runs)
    basic: 26 queries (~5 min, good for regular use)
    mega:  80+ queries (~15 min, for catalog building)
  --with-prices                Also fetch prices after discovery
  --limit <n>                  Max results per search query (default: 15)
  --help                       Show this help message

Examples:
  # Basic discovery (default)
  tsx src/scripts/discover.ts

  # Safe daily run
  tsx src/scripts/discover.ts --preset safe

  # Mega catalog build with prices
  tsx src/scripts/discover.ts --preset mega --with-prices
    `);
    process.exit(0);
  }

  const options: DiscoverOptions = { preset: 'basic', withPrices: false, limit: 15 };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--preset': options.preset = args[++i] as any; break;
      case '--with-prices': options.withPrices = true; break;
      case '--limit': options.limit = parseInt(args[++i], 10); break;
    }
  }

  console.log(`🚀 Starting sneaker discovery (preset: ${options.preset})...\n`);

  discoverSneakers(options)
    .then(result => {
      console.log('\n' + '='.repeat(60));
      console.log('✅ Discovery completed!');
      console.log(`   Discovered: ${result.discovered}`);
      console.log(`   Imported: ${result.imported}`);
      console.log(`   Skipped: ${result.skipped}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    })
    .finally(() => closePool());
}
