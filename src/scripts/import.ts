import { query, closePool } from '../db/index.js';
import logger from '../utils/logger.js';

/**
 * Bulk import popular sneakers
 * Run with: npm run db:bulk-import
 */

const popularSneakers = [
  // === TIER 1: HIGH DEMAND ===

  // Jordan 1 High
  { sku_code: '555088-001', brand: 'Nike', model: 'Air Jordan 1 Retro High OG', colorway: 'Shadow', tier: 1, retail_price: 170 },
  { sku_code: '555088-105', brand: 'Nike', model: 'Air Jordan 1 Retro High OG', colorway: 'Chicago', tier: 1, retail_price: 170 },
  { sku_code: '555088-610', brand: 'Nike', model: 'Air Jordan 1 Retro High OG', colorway: 'Bred Banned', tier: 1, retail_price: 160 },
  { sku_code: 'CD0461-100', brand: 'Nike', model: 'Air Jordan 1 Retro High OG', colorway: 'Obsidian UNC', tier: 1, retail_price: 170 },
  { sku_code: '555088-134', brand: 'Nike', model: 'Air Jordan 1 Retro High OG', colorway: 'University Blue', tier: 1, retail_price: 170 },
  { sku_code: 'DZ5485-410', brand: 'Nike', model: 'Air Jordan 1 Retro High OG', colorway: 'True Blue', tier: 1, retail_price: 180 },
  { sku_code: '555088-108', brand: 'Nike', model: 'Air Jordan 1 Retro High OG', colorway: 'Black Toe', tier: 1, retail_price: 160 },

  // Jordan 1 Low
  { sku_code: '553558-161', brand: 'Nike', model: 'Air Jordan 1 Low', colorway: 'White Black', tier: 2, retail_price: 110 },
  { sku_code: 'CZ0790-106', brand: 'Nike', model: 'Air Jordan 1 Low x Travis Scott', colorway: 'Mocha', tier: 1, retail_price: 130 },
  { sku_code: 'DM7866-140', brand: 'Nike', model: 'Air Jordan 1 Low x Travis Scott x Fragment', colorway: 'Military Blue', tier: 1, retail_price: 150 },

  // Jordan 4
  { sku_code: 'DC7770-160', brand: 'Nike', model: 'Air Jordan 4 Retro', colorway: 'Military Black', tier: 1, retail_price: 215 },
  { sku_code: 'FQ8213-001', brand: 'Nike', model: 'Air Jordan 4 Retro', colorway: 'Black Canvas', tier: 1, retail_price: 215 },
  { sku_code: 'AQ9129-100', brand: 'Nike', model: 'Air Jordan 4 Retro', colorway: 'Bred', tier: 1, retail_price: 200 },
  { sku_code: 'CT8527-112', brand: 'Nike', model: 'Air Jordan 4 Retro', colorway: 'University Blue', tier: 1, retail_price: 200 },

  // Dunk Low
  { sku_code: 'DV0833-101', brand: 'Nike', model: 'Dunk Low', colorway: 'Team Green', tier: 2, retail_price: 115 },
  { sku_code: 'DV0833-102', brand: 'Nike', model: 'Dunk Low', colorway: 'Reverse Panda', tier: 1, retail_price: 115 },
  { sku_code: 'FD0804-100', brand: 'Nike', model: 'Dunk Low', colorway: 'Photon Dust', tier: 2, retail_price: 115 },
  { sku_code: 'FD0804-200', brand: 'Nike', model: 'Dunk Low', colorway: 'Safari Mix', tier: 2, retail_price: 115 },

  // Yeezy 350 V2
  { sku_code: 'GW3773', brand: 'Adidas', model: 'Yeezy Boost 350 V2', colorway: 'Bone', tier: 1, retail_price: 230 },
  { sku_code: 'FZ5240', brand: 'Adidas', model: 'Yeezy Boost 350 V2', colorway: 'MX Oat', tier: 1, retail_price: 230 },
  { sku_code: 'HP7370', brand: 'Adidas', model: 'Yeezy Boost 350 V2', colorway: 'Slate', tier: 1, retail_price: 230 },
  { sku_code: 'GZ9829', brand: 'Adidas', model: 'Yeezy Boost 350 V2', colorway: 'Bred', tier: 1, retail_price: 220 },

  // Yeezy 700
  { sku_code: 'B75571', brand: 'Adidas', model: 'Yeezy Boost 700', colorway: 'Wave Runner', tier: 1, retail_price: 300 },
  { sku_code: 'GW0297', brand: 'Adidas', model: 'Yeezy Boost 700 V2', colorway: 'Cream', tier: 2, retail_price: 300 },

  // Travis Scott Collaborations
  { sku_code: 'CD4487-100', brand: 'Nike', model: 'Air Jordan 1 Low x Travis Scott', colorway: 'Fragment', tier: 1, retail_price: 150 },
  { sku_code: 'DH3227-105', brand: 'Nike', model: 'Air Jordan 1 Retro High x Travis Scott', colorway: 'Mocha', tier: 1, retail_price: 175 },

  // === TIER 2: MEDIUM DEMAND ===

  // New Balance 550
  { sku_code: 'BB550PB1', brand: 'New Balance', model: '550', colorway: 'White Navy', tier: 2, retail_price: 120 },
  { sku_code: 'BB550VG1', brand: 'New Balance', model: '550', colorway: 'White Vintage Indigo', tier: 2, retail_price: 120 },

  // New Balance 990
  { sku_code: 'M990GL5', brand: 'New Balance', model: '990v5', colorway: 'Grey', tier: 2, retail_price: 200 },
  { sku_code: 'M990GL4', brand: 'New Balance', model: '990v4', colorway: 'Grey', tier: 2, retail_price: 185 },

  // New Balance 2002R
  { sku_code: 'ML2002RA', brand: 'New Balance', model: '2002R', colorway: 'Protection Pack Grey', tier: 2, retail_price: 160 },
  { sku_code: 'ML2002RV', brand: 'New Balance', model: '2002R', colorway: 'Rain Cloud', tier: 2, retail_price: 150 },

  // Asics Gel-Lyte III
  { sku_code: '1201A257-100', brand: 'Asics', model: 'Gel-Lyte III OG', colorway: 'White Black', tier: 2, retail_price: 120 },
  { sku_code: '1201A257-020', brand: 'Asics', model: 'Gel-Lyte III OG', colorway: 'Smoke Grey', tier: 2, retail_price: 120 },

  // Nike SB Dunk Low
  { sku_code: 'BQ6817-002', brand: 'Nike', model: 'SB Dunk Low Pro', colorway: 'Wheat Mocha', tier: 2, retail_price: 110 },
  { sku_code: 'DH7913-001', brand: 'Nike', model: 'SB Dunk Low Pro', colorway: 'Raygun Tie-Dye', tier: 2, retail_price: 120 },

  // Air Max 1
  { sku_code: 'DH4059-102', brand: 'Nike', model: 'Air Max 1', colorway: 'Corduroy', tier: 2, retail_price: 150 },
  { sku_code: 'FD9082-100', brand: 'Nike', model: 'Air Max 1', colorway: 'Crepe', tier: 2, retail_price: 160 },

  // Air Force 1
  { sku_code: 'CW2288-111', brand: 'Nike', model: 'Air Force 1 Low', colorway: 'White', tier: 2, retail_price: 110 },
  { sku_code: 'CT2302-002', brand: 'Nike', model: 'Air Force 1 Low', colorway: 'Black', tier: 2, retail_price: 110 },

  // Sacai Collaborations
  { sku_code: 'BV0073-100', brand: 'Nike', model: 'LDWaffle x Sacai', colorway: 'White Grey', tier: 2, retail_price: 180 },
  { sku_code: 'BV0073-001', brand: 'Nike', model: 'LDWaffle x Sacai', colorway: 'Black', tier: 2, retail_price: 180 },

  // === TIER 3: LONG TAIL ===

  // Reebok Classics
  { sku_code: '2214', brand: 'Reebok', model: 'Club C 85', colorway: 'White Green', tier: 3, retail_price: 80 },
  { sku_code: 'FX1364', brand: 'Reebok', model: 'Club C Revenge', colorway: 'White Black', tier: 3, retail_price: 85 },
  { sku_code: 'FZ4388', brand: 'Reebok', model: 'Question Mid', colorway: 'Ice Cold', tier: 3, retail_price: 140 },

  // Puma
  { sku_code: '380190-02', brand: 'Puma', model: 'RS-X', colorway: 'White Blue', tier: 3, retail_price: 110 },
  { sku_code: '374915-01', brand: 'Puma', model: 'Suede Classic', colorway: 'Black', tier: 3, retail_price: 70 },

  // Converse
  { sku_code: '162050C', brand: 'Converse', model: 'Chuck Taylor All Star 70 High', colorway: 'Black', tier: 3, retail_price: 85 },
  { sku_code: '162058C', brand: 'Converse', model: 'Chuck Taylor All Star 70 High', colorway: 'Parchment', tier: 3, retail_price: 85 },

  // Vans
  { sku_code: 'VN000D3HY28', brand: 'Vans', model: 'Old Skool', colorway: 'Black White', tier: 3, retail_price: 70 },
  { sku_code: 'VN0A5KXDBLK', brand: 'Vans', model: 'Knu Skool', colorway: 'Black White', tier: 3, retail_price: 90 },

  // Salomon
  { sku_code: 'L47452800', brand: 'Salomon', model: 'XT-6', colorway: 'Black', tier: 3, retail_price: 190 },
  { sku_code: 'L41731200', brand: 'Salomon', model: 'ACS Pro', colorway: 'Vanilla Ice', tier: 3, retail_price: 170 },

  // Hoka
  { sku_code: '1127893-BWHT', brand: 'Hoka', model: 'Bondi 8', colorway: 'Black White', tier: 3, retail_price: 165 },
  { sku_code: '1123202-BBLC', brand: 'Hoka', model: 'Clifton 9', colorway: 'Black', tier: 3, retail_price: 145 },

  // On Running
  { sku_code: '3MD10251518', brand: 'On', model: 'Cloudmonster', colorway: 'All Black', tier: 3, retail_price: 170 },
  { sku_code: '3WD10251030', brand: 'On', model: 'Cloud 5', colorway: 'White Black', tier: 3, retail_price: 140 },
];

async function bulkImport() {
  try {
    logger.info(`Starting bulk import of ${popularSneakers.length} sneakers...`);

    let imported = 0;
    let skipped = 0;

    for (const sneaker of popularSneakers) {
      // Set style_code same as sku_code for now
      const style_code = sneaker.sku_code;

      try {
        const result = await query(
          `INSERT INTO skus (
            sku_code, style_code, brand, model, colorway, tier, retail_price
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (style_code) DO NOTHING
          RETURNING id`,
          [
            sneaker.sku_code,
            style_code,
            sneaker.brand,
            sneaker.model,
            sneaker.colorway,
            sneaker.tier,
            sneaker.retail_price,
          ],
        );

        if (result.rowCount && result.rowCount > 0) {
          logger.info(`✅ Added: ${sneaker.brand} ${sneaker.model} - ${sneaker.colorway} (${sneaker.sku_code})`);
          imported++;
        } else {
          logger.debug(`⏭️  Skipped (already exists): ${sneaker.sku_code}`);
          skipped++;
        }
      } catch (error) {
        logger.error({ sneaker, error }, `Failed to import: ${sneaker.sku_code}`);
      }
    }

    logger.info(`\n=== Import Summary ===`);
    logger.info(`✅ Imported: ${imported} sneakers`);
    logger.info(`⏭️  Skipped: ${skipped} sneakers (already exist)`);
    logger.info(`📦 Total in list: ${popularSneakers.length}`);

    // Show total count in database
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

    // Show breakdown by brand
    const brandResult = await query(`
      SELECT brand, COUNT(*) as count
      FROM skus
      GROUP BY brand
      ORDER BY count DESC
      LIMIT 10
    `);
    logger.info('\nTop brands:');
    for (const row of brandResult.rows as any[]) {
      logger.info(`  ${row.brand}: ${row.count} sneakers`);
    }

  } catch (error) {
    logger.error({ error }, 'Bulk import failed');
    process.exit(1);
  } finally {
    await closePool();
  }
}

bulkImport();
