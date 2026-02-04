import { Router, Request, Response } from 'express';
import { query as dbQuery } from '../db/index.js';
import logger from '../utils/logger.js';
import { SKU } from '../types/index.js';

const router = Router();

/**
 * GET /api/skus
 * List or search sneakers in catalog
 *
 * Query parameters:
 * - search: Search by name/brand/model/colorway
 * - brand: Filter by brand
 * - tier: Filter by tier (1, 2, or 3)
 * - limit: Results per page (default: 20, max: 100)
 * - offset: Pagination offset (default: 0)
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, brand, tier, limit = '20', offset = '0' } = req.query;
    const userId = (req as any).user?.userId;

    // Validate pagination
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    if (isNaN(limitNum) || limitNum < 1) {
      res.status(400).json({ error: 'limit must be a number >= 1' });
      return;
    }

    if (isNaN(offsetNum) || offsetNum < 0) {
      res.status(400).json({ error: 'offset must be a number >= 0' });
      return;
    }

    logger.info(
      { search, brand, tier, limit: limitNum, offset: offsetNum, userId },
      'Searching SKUs',
    );

    // Build query
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    // Search filter
    if (search && typeof search === 'string' && search.length > 0) {
      const searchTerm = `%${search}%`;
      whereClause += ` AND (
        sku_code ILIKE $${paramCount} OR
        brand ILIKE $${paramCount + 1} OR
        model ILIKE $${paramCount + 2} OR
        colorway ILIKE $${paramCount + 3}
      )`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      paramCount += 4;
    }

    // Brand filter
    if (brand && typeof brand === 'string' && brand.length > 0) {
      whereClause += ` AND brand = $${paramCount}`;
      params.push(brand);
      paramCount++;
    }

    // Tier filter
    if (tier && typeof tier === 'string' && ['1', '2', '3'].includes(tier)) {
      whereClause += ` AND tier = $${paramCount}`;
      params.push(parseInt(tier, 10));
      paramCount++;
    }

    // Get total count
    const countResult = await dbQuery<{ count: number }>(
      `SELECT COUNT(*) as count FROM skus ${whereClause}`,
      params,
    );
    const total = parseInt((countResult.rows[0] as any).count, 10);

    // Get paginated results
    const skuResult = await dbQuery<SKU>(
      `SELECT id, sku_code, brand, model, colorway, retail_price, tier, created_at
       FROM skus ${whereClause}
       ORDER BY tier ASC, model ASC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limitNum, offsetNum],
    );

    // Log usage
    try {
      await dbQuery(
        `INSERT INTO api_usage (user_id, endpoint, method, status_code, timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, '/api/skus', 'GET', 200, new Date()],
      );
    } catch (error) {
      logger.debug({ error }, 'Failed to log API usage');
    }

    const hasMore = offsetNum + limitNum < total;

    res.json({
      total,
      count: skuResult.rows.length,
      limit: limitNum,
      offset: offsetNum,
      has_more: hasMore,
      skus: skuResult.rows.map((sku) => ({
        id: sku.id,
        sku_code: sku.sku_code,
        brand: sku.brand,
        model: sku.model,
        colorway: sku.colorway,
        retail_price: sku.retail_price,
        tier: sku.tier,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to search SKUs');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/skus/:id
 * Get details for a single SKU
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    // Validate input
    const skuId = parseInt(typeof id === 'string' ? id : id[0], 10);
    if (isNaN(skuId) || skuId < 1) {
      res.status(400).json({ error: 'Invalid SKU ID' });
      return;
    }

    logger.info({ skuId, userId }, 'Fetching SKU details');

    // Get SKU
    const skuResult = await dbQuery<SKU>(`SELECT * FROM skus WHERE id = $1`, [skuId]);

    if (skuResult.rows.length === 0) {
      res.status(404).json({ error: 'SKU not found' });
      return;
    }

    const sku = skuResult.rows[0];

    // Get latest price data
    const priceResult = await dbQuery(
      `SELECT ecmv, confidence, timestamp FROM price_history
       WHERE sku_id = $1 ORDER BY timestamp DESC LIMIT 1`,
      [skuId],
    );

    // Get raw price count (for data quality indicator)
    const priceCountResult = await dbQuery(
      `SELECT COUNT(*) as count FROM prices WHERE sku_id = $1`,
      [skuId],
    );
    const priceCount = parseInt((priceCountResult.rows[0] as any).count, 10);

    // Log usage
    try {
      await dbQuery(
        `INSERT INTO api_usage (user_id, endpoint, method, status_code, timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, `/api/skus/${skuId}`, 'GET', 200, new Date()],
      );
    } catch (error) {
      logger.debug({ error }, 'Failed to log API usage');
    }

    res.json({
      id: sku.id,
      sku_code: sku.sku_code,
      brand_style_code: sku.brand_style_code,
      brand: sku.brand,
      model: sku.model,
      colorway: sku.colorway,
      release_date: sku.release_date,
      retail_price: sku.retail_price,
      category: sku.category,
      tier: sku.tier,
      stockx_id: sku.stockx_id,
      goat_id: sku.goat_id,
      created_at: sku.created_at,
      updated_at: sku.updated_at,
      current_price:
        priceResult.rows.length > 0
          ? {
              ecmv: priceResult.rows[0].ecmv,
              confidence: priceResult.rows[0].confidence,
              last_updated: priceResult.rows[0].timestamp,
            }
          : null,
      data_quality: {
        price_points: priceCount,
        data_available: priceCount > 0,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch SKU details');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/skus/trending/popular
 * Get most popular sneakers (most price data points)
 */
router.get('/trending/popular', async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = '10' } = req.query;
    const userId = (req as any).user?.userId;

    const limitNum = Math.min(parseInt(limit as string, 10) || 10, 50);

    logger.info({ limit: limitNum, userId }, 'Fetching popular sneakers');

    // Get SKUs with most price data
    const result = await dbQuery(
      `SELECT s.id, s.sku_code, s.brand, s.model, s.colorway, s.tier,
              COUNT(p.id) as price_count,
              AVG(p.price) as avg_price
       FROM skus s
       LEFT JOIN prices p ON s.id = p.sku_id
       GROUP BY s.id, s.sku_code, s.brand, s.model, s.colorway, s.tier
       ORDER BY price_count DESC, s.tier ASC
       LIMIT $1`,
      [limitNum],
    );

    // Log usage
    try {
      await dbQuery(
        `INSERT INTO api_usage (user_id, endpoint, method, status_code, timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, '/api/skus/trending/popular', 'GET', 200, new Date()],
      );
    } catch (error) {
      logger.debug({ error }, 'Failed to log API usage');
    }

    res.json({
      count: result.rows.length,
      trending: result.rows.map((row: any) => ({
        id: row.id,
        sku_code: row.sku_code,
        brand: row.brand,
        model: row.model,
        colorway: row.colorway,
        tier: row.tier,
        price_data_points: row.price_count,
        average_price: row.avg_price ? parseFloat(row.avg_price) : null,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch popular sneakers');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
