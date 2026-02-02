import { query, closePool } from '../db/index.js';
import logger from '../utils/logger.js';

// Initial popular sneakers for bootstrapping
const initialSneakers = [
  // Jordan 1
  { sku_code: 'nike-jordan-1-retro-bred-2023', brand: 'Nike', model: 'Air Jordan 1 Retro', colorway: 'Bred', tier: 1, retail_price: 170 },
  { sku_code: 'nike-jordan-1-retro-chicago-2023', brand: 'Nike', model: 'Air Jordan 1 Retro', colorway: 'Chicago', tier: 1, retail_price: 170 },
  { sku_code: 'nike-jordan-1-retro-royal-2023', brand: 'Nike', model: 'Air Jordan 1 Retro', colorway: 'Royal', tier: 1, retail_price: 170 },

  // Dunk Low
  { sku_code: 'nike-dunk-low-sb-panda-2023', brand: 'Nike', model: 'Dunk Low SB', colorway: 'Panda', tier: 1, retail_price: 125 },
  { sku_code: 'nike-dunk-low-vintage-green-2023', brand: 'Nike', model: 'Dunk Low', colorway: 'Vintage Green', tier: 2, retail_price: 130 },

  // Yeezy
  { sku_code: 'adidas-yeezy-boost-350-v2-oreo-2023', brand: 'Adidas', model: 'Yeezy Boost 350 V2', colorway: 'Oreo', tier: 1, retail_price: 220 },
  { sku_code: 'adidas-yeezy-boost-350-v2-zebra-2023', brand: 'Adidas', model: 'Yeezy Boost 350 V2', colorway: 'Zebra', tier: 1, retail_price: 220 },

  // Travis Scott
  { sku_code: 'nike-jordan-1-travis-scott-low-2023', brand: 'Nike', model: 'Air Jordan 1 x Travis Scott', colorway: 'Reverse Mocha', tier: 1, retail_price: 190 },

  // New Balance
  { sku_code: 'new-balance-990v6-grey-2023', brand: 'New Balance', model: '990v6', colorway: 'Grey', tier: 2, retail_price: 210 },
  { sku_code: 'new-balance-550-white-black-2023', brand: 'New Balance', model: '550', colorway: 'White Black', tier: 2, retail_price: 150 },

  // Reebok
  { sku_code: 'reebok-question-mid-black-2023', brand: 'Reebok', model: 'Question Mid', colorway: 'Black', tier: 2, retail_price: 160 },

  // Tier 3 (Long tail)
  { sku_code: 'nike-air-max-90-white-black-2023', brand: 'Nike', model: 'Air Max 90', colorway: 'White Black', tier: 3, retail_price: 140 },
  { sku_code: 'adidas-stan-smith-white-green-2023', brand: 'Adidas', model: 'Stan Smith', colorway: 'White Green', tier: 3, retail_price: 90 },
  { sku_code: 'puma-rs-x-black-white-2023', brand: 'Puma', model: 'RS-X', colorway: 'Black White', tier: 3, retail_price: 110 },
];

async function seed() {
  try {
    logger.info('Starting database seed...');

    // Check if data already exists
    const existingResult = await query('SELECT COUNT(*) as count FROM skus');
    const existingCount = (existingResult.rows[0] as any).count;

    if (existingCount > 0) {
      logger.info(`Database already has ${existingCount} SKUs. Skipping seed.`);
      return;
    }

    // Insert sneakers
    for (const sneaker of initialSneakers) {
      const result = await query(
        `INSERT INTO skus (
          sku_code, brand, model, colorway, tier, retail_price
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (sku_code) DO NOTHING
        RETURNING id`,
        [sneaker.sku_code, sneaker.brand, sneaker.model, sneaker.colorway, sneaker.tier, sneaker.retail_price],
      );

      if (result.rowCount > 0) {
        logger.info(`Added: ${sneaker.sku_code}`);
      }
    }

    logger.info(`✅ Seeded ${initialSneakers.length} sneakers`);
  } catch (error) {
    logger.error({ error }, 'Seed failed');
    process.exit(1);
  } finally {
    await closePool();
  }
}

seed();
