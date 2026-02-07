import { query, closePool } from '../db/index.js';
import logger from '../utils/logger.js';

// Initial popular sneakers for bootstrapping
// Using manufacturer style codes as the universal identifier
const initialSneakers = [
  // Jordan 1
  {
    sku_code: '555088-063',
    brand_style_code: '555088-063',
    brand: 'Nike',
    model: 'Air Jordan 1 Retro High OG',
    colorway: 'Bred Toe',
    tier: 1,
    retail_price: 170,
  },
  {
    sku_code: 'DZ5485-612',
    brand_style_code: 'DZ5485-612',
    brand: 'Nike',
    model: 'Air Jordan 1 Retro High OG',
    colorway: 'Lost and Found',
    tier: 1,
    retail_price: 180,
  },
  {
    sku_code: '555088-007',
    brand_style_code: '555088-007',
    brand: 'Nike',
    model: 'Air Jordan 1 Retro High OG',
    colorway: 'Royal',
    tier: 1,
    retail_price: 160,
  },

  // Dunk Low
  {
    sku_code: 'DD1391-100',
    brand_style_code: 'DD1391-100',
    brand: 'Nike',
    model: 'Dunk Low',
    colorway: 'Panda',
    tier: 1,
    retail_price: 110,
  },
  {
    sku_code: 'DV0833-300',
    brand_style_code: 'DV0833-300',
    brand: 'Nike',
    model: 'Dunk Low',
    colorway: 'Vintage Green',
    tier: 2,
    retail_price: 115,
  },

  // Yeezy
  {
    sku_code: 'BY1604',
    brand_style_code: 'BY1604',
    brand: 'Adidas',
    model: 'Yeezy Boost 350 V2',
    colorway: 'Core Black White',
    tier: 1,
    retail_price: 220,
  },
  {
    sku_code: 'CP9654',
    brand_style_code: 'CP9654',
    brand: 'Adidas',
    model: 'Yeezy Boost 350 V2',
    colorway: 'Zebra',
    tier: 1,
    retail_price: 220,
  },

  // Travis Scott
  {
    sku_code: 'DM7866-162',
    brand_style_code: 'DM7866-162',
    brand: 'Nike',
    model: 'Air Jordan 1 Low x Travis Scott',
    colorway: 'Reverse Mocha',
    tier: 1,
    retail_price: 150,
  },

  // New Balance
  {
    sku_code: 'M990GL6',
    brand_style_code: 'M990GL6',
    brand: 'New Balance',
    model: '990v6',
    colorway: 'Grey',
    tier: 2,
    retail_price: 210,
  },
  {
    sku_code: 'BB550WT1',
    brand_style_code: 'BB550WT1',
    brand: 'New Balance',
    model: '550',
    colorway: 'White Green',
    tier: 2,
    retail_price: 120,
  },

  // Reebok
  {
    sku_code: 'FZ4387',
    brand_style_code: 'FZ4387',
    brand: 'Reebok',
    model: 'Question Mid',
    colorway: 'Black Chalk',
    tier: 2,
    retail_price: 140,
  },

  // Tier 3 (Long tail)
  {
    sku_code: 'CN8490-100',
    brand_style_code: 'CN8490-100',
    brand: 'Nike',
    model: 'Air Max 90',
    colorway: 'White Black',
    tier: 3,
    retail_price: 130,
  },
  {
    sku_code: 'FX5501',
    brand_style_code: 'FX5501',
    brand: 'Adidas',
    model: 'Stan Smith',
    colorway: 'White Green',
    tier: 3,
    retail_price: 90,
  },
  {
    sku_code: '369449-01',
    brand_style_code: '369449-01',
    brand: 'Puma',
    model: 'RS-X',
    colorway: 'Black White',
    tier: 3,
    retail_price: 110,
  },
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
          sku_code, brand_style_code, brand, model, colorway, tier, retail_price
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (brand_style_code) DO UPDATE SET
          sku_code = EXCLUDED.sku_code,
          brand = EXCLUDED.brand,
          model = EXCLUDED.model,
          colorway = EXCLUDED.colorway,
          tier = EXCLUDED.tier,
          retail_price = EXCLUDED.retail_price
        RETURNING id`,
        [
          sneaker.sku_code,
          sneaker.brand_style_code,
          sneaker.brand,
          sneaker.model,
          sneaker.colorway,
          sneaker.tier,
          sneaker.retail_price,
        ],
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
