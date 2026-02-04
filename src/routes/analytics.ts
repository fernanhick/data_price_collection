import { Router, Request, Response } from 'express';
import { query } from '../db/index.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * Get comprehensive analytics about the sneaker catalog
 */
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    logger.info({ userId }, 'Fetching analytics');

    // Get total counts
    const totalResult = await query('SELECT COUNT(*) as total FROM skus');
    const total = parseInt(totalResult.rows[0].total);

    // Brand breakdown
    const brandResult = await query(`
      SELECT
        brand,
        COUNT(*) as count,
        AVG(retail_price) as avg_price,
        MIN(retail_price) as min_price,
        MAX(retail_price) as max_price
      FROM skus
      WHERE retail_price IS NOT NULL
      GROUP BY brand
      ORDER BY count DESC
    `);

    // Tier distribution
    const tierResult = await query(`
      SELECT
        tier,
        COUNT(*) as count,
        AVG(retail_price) as avg_price
      FROM skus
      GROUP BY tier
      ORDER BY tier
    `);

    // Price ranges
    const priceRanges = await query(`
      SELECT
        CASE
          WHEN retail_price < 100 THEN 'Under $100'
          WHEN retail_price >= 100 AND retail_price < 150 THEN '$100-$150'
          WHEN retail_price >= 150 AND retail_price < 200 THEN '$150-$200'
          WHEN retail_price >= 200 AND retail_price < 300 THEN '$200-$300'
          WHEN retail_price >= 300 THEN '$300+'
          ELSE 'Unknown'
        END as price_range,
        COUNT(*) as count
      FROM skus
      WHERE retail_price IS NOT NULL
      GROUP BY price_range
      ORDER BY
        CASE
          WHEN price_range = 'Under $100' THEN 1
          WHEN price_range = '$100-$150' THEN 2
          WHEN price_range = '$150-$200' THEN 3
          WHEN price_range = '$200-$300' THEN 4
          WHEN price_range = '$300+' THEN 5
          ELSE 6
        END
    `);

    // Recently added (last 30 days)
    const recentResult = await query(`
      SELECT
        sku_code,
        brand,
        model,
        colorway,
        retail_price,
        tier,
        created_at
      FROM skus
      ORDER BY created_at DESC
      LIMIT 10
    `);

    // Top models
    const topModels = await query(`
      SELECT
        model,
        COUNT(*) as count,
        brand
      FROM skus
      GROUP BY model, brand
      ORDER BY count DESC
      LIMIT 10
    `);

    // Average price by tier
    const avgPriceByTier = await query(`
      SELECT
        tier,
        AVG(retail_price) as avg_price,
        COUNT(*) as count
      FROM skus
      WHERE retail_price IS NOT NULL
      GROUP BY tier
      ORDER BY tier
    `);

    res.json({
      summary: {
        total,
        brands: brandResult.rows.length,
        avgPrice: parseFloat(
          (await query('SELECT AVG(retail_price) as avg FROM skus WHERE retail_price IS NOT NULL')).rows[0].avg || 0
        ).toFixed(2),
        minPrice: parseFloat(
          (await query('SELECT MIN(retail_price) as min FROM skus WHERE retail_price IS NOT NULL')).rows[0].min || 0
        ).toFixed(2),
        maxPrice: parseFloat(
          (await query('SELECT MAX(retail_price) as max FROM skus WHERE retail_price IS NOT NULL')).rows[0].max || 0
        ).toFixed(2),
      },
      brands: brandResult.rows.map(row => ({
        brand: row.brand,
        count: parseInt(row.count),
        avgPrice: row.avg_price ? parseFloat(row.avg_price).toFixed(2) : null,
        minPrice: row.min_price ? parseFloat(row.min_price).toFixed(2) : null,
        maxPrice: row.max_price ? parseFloat(row.max_price).toFixed(2) : null,
      })),
      tiers: tierResult.rows.map(row => ({
        tier: parseInt(row.tier),
        count: parseInt(row.count),
        avgPrice: row.avg_price ? parseFloat(row.avg_price).toFixed(2) : null,
      })),
      priceRanges: priceRanges.rows.map(row => ({
        range: row.price_range,
        count: parseInt(row.count),
      })),
      recentlyAdded: recentResult.rows.map(row => ({
        sku_code: row.sku_code,
        brand: row.brand,
        model: row.model,
        colorway: row.colorway,
        retail_price: row.retail_price,
        tier: row.tier,
        created_at: row.created_at,
      })),
      topModels: topModels.rows.map(row => ({
        model: row.model,
        brand: row.brand,
        count: parseInt(row.count),
      })),
      avgPriceByTier: avgPriceByTier.rows.map(row => ({
        tier: parseInt(row.tier),
        avgPrice: parseFloat(row.avg_price).toFixed(2),
        count: parseInt(row.count),
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch analytics');
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
