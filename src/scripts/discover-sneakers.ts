import { GoatScraper } from '../services/scrapers/goat.js';
import { query, closePool } from '../db/index.js';
import logger from '../utils/logger.js';

/**
 * Automatically discover and import popular sneakers from GOAT
 * Run with: npm run sneaker:discover
 */

// Popular search terms to discover trending sneakers
const searchQueries = [
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

async function discoverSneakers() {
  const goatScraper = new GoatScraper();
  const discovered: DiscoveredSneaker[] = [];
  const duplicates = new Set<string>();

  try {
    logger.info(`Starting sneaker discovery with ${searchQueries.length} search queries...`);

    for (const searchQuery of searchQueries) {
      logger.info(`\n🔍 Searching: "${searchQuery}"`);

      try {
        // Search GOAT for this query
        const listings = await goatScraper.searchProducts(searchQuery, 15);

        logger.info(`Found ${listings.length} results for "${searchQuery}"`);

        for (const listing of listings) {
          // Skip if no SKU
          if (!listing.sku || listing.sku.trim() === '') {
            logger.debug(`Skipped (no SKU): ${listing.name}`);
            continue;
          }

          // Skip duplicates
          const normalizedSku = listing.sku.toUpperCase().replace(/\s+/g, '-');
          if (duplicates.has(normalizedSku)) {
            logger.debug(`Skipped (duplicate): ${listing.sku}`);
            continue;
          }

          duplicates.add(normalizedSku);

          // Determine tier based on price premium
          let tier = 3; // Default to tier 3
          if (listing.retailPriceCents && listing.lowestPriceCents) {
            const premium = (listing.lowestPriceCents / listing.retailPriceCents) - 1;
            if (premium > 0.5) {
              tier = 1; // High demand (50%+ premium)
            } else if (premium > 0.15) {
              tier = 2; // Medium demand (15-50% premium)
            }
          }

          // Parse brand and model from name
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

          logger.info(`✅ Discovered: ${listing.brand} ${parsedSneaker.model} - ${parsedSneaker.colorway} (${normalizedSku})`);
        }

        // Rate limiting - wait 2-4 seconds between searches (randomized)
        const delay = 2000 + Math.random() * 2000; // 2-4 seconds
        logger.debug(`Waiting ${(delay / 1000).toFixed(1)}s before next search...`);
        await new Promise(resolve => setTimeout(resolve, delay));

      } catch (error) {
        logger.error({ searchQuery, error }, `Failed to search: "${searchQuery}"`);
      }
    }

    logger.info(`\n=== Discovery Complete ===`);
    logger.info(`Total discovered: ${discovered.length} unique sneakers`);

    // Import to database
    logger.info(`\nImporting to database...`);
    let imported = 0;
    let skipped = 0;

    for (const sneaker of discovered) {
      try {
        const result = await query(
          `INSERT INTO skus (
            sku_code, style_code, brand, model, colorway, tier, retail_price
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (style_code) DO NOTHING
          RETURNING id`,
          [
            sneaker.sku_code,
            sneaker.sku_code, // Use sku_code as style_code
            sneaker.brand,
            sneaker.model,
            sneaker.colorway,
            sneaker.tier,
            sneaker.retail_price,
          ],
        );

        if (result.rowCount && result.rowCount > 0) {
          imported++;
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

    // Show updated database stats
    const countResult = await query('SELECT COUNT(*) as count FROM skus');
    const totalCount = (countResult.rows[0] as any).count;
    logger.info(`🗄️  Total SKUs in database: ${totalCount}`);

    // Show breakdown by tier
    const tierResult = await query(`
      SELECT tier, COUNT(*) as count
      FROM skus
      GROUP BY tier
      ORDER BY tier
    `);
    logger.info('\nSKUs by tier:');
    for (const row of tierResult.rows as any[]) {
      logger.info(`  Tier ${row.tier}: ${row.count} sneakers`);
    }

    // Show top brands
    const brandResult = await query(`
      SELECT brand, COUNT(*) as count
      FROM skus
      GROUP BY brand
      ORDER BY count DESC
      LIMIT 10
    `);
    logger.info('\nTop 10 brands:');
    for (const row of brandResult.rows as any[]) {
      logger.info(`  ${row.brand}: ${row.count} sneakers`);
    }

  } catch (error) {
    logger.error({ error }, 'Sneaker discovery failed');
    process.exit(1);
  } finally {
    await closePool();
  }
}

/**
 * Parse sneaker name into brand, model, and colorway
 */
function parseSneakerName(name: string, brandHint?: string): {
  brand: string | null;
  model: string;
  colorway: string | null;
} {
  // Common patterns:
  // "Nike Air Jordan 1 Retro High OG 'Chicago'"
  // "Adidas Yeezy Boost 350 V2 'Zebra'"
  // "New Balance 550 'White Navy'"

  // Extract colorway (usually in quotes)
  const colorwayMatch = name.match(/['"]([^'"]+)['"]/);
  const colorway = colorwayMatch ? colorwayMatch[1] : null;

  // Remove colorway from name
  let cleanName = name.replace(/['"][^'"]+['"]/, '').trim();

  // Try to extract brand
  const brands = ['Nike', 'Adidas', 'New Balance', 'Asics', 'Puma', 'Reebok', 'Converse', 'Vans', 'Hoka', 'On', 'Salomon'];
  let brand: string | null = brandHint || null;

  for (const b of brands) {
    if (cleanName.toLowerCase().includes(b.toLowerCase())) {
      brand = b;
      cleanName = cleanName.replace(new RegExp(b, 'i'), '').trim();
      break;
    }
  }

  // What's left is the model
  const model = cleanName.trim() || name;

  return { brand, model, colorway };
}

discoverSneakers();
