import { Router, Request, Response } from 'express';
import { query as dbQuery } from '../db/index.js';
import logger from '../utils/logger.js';
import { SKU } from '../types/index.js';
import { GoatScraper } from '../services/scrapers/goat.js';
import imageProcessor from '../services/imageProcessor.js';

const goatScraper = new GoatScraper();

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
      `SELECT id, sku_code, style_code, brand, model, colorway, retail_price, tier, image_url, image_local_path, created_at
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
        style_code: sku.style_code,
        brand: sku.brand,
        model: sku.model,
        colorway: sku.colorway,
        retail_price: sku.retail_price,
        tier: sku.tier,
        image_url: sku.image_local_path || sku.image_url,
        image_thumbnail_url: sku.image_local_path
          ? sku.image_local_path.replace('/sneakers/', '/sneakers/thumbs/')
          : null,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to search SKUs');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/skus/catalog
 * Get lightweight catalog for sneaker selection in mobile app
 * Returns all sneakers with minimal fields for autocomplete/selection
 *
 * IMPORTANT: This route must be before /:id to avoid path collision
 */
router.get('/catalog', async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, limit = '100', offset = '0' } = req.query;
    const userId = (req as any).user?.userId;

    const limitNum = Math.min(parseInt(limit as string, 10) || 100, 500);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    logger.info({ search, limit: limitNum, userId }, 'Fetching catalog');

    let whereClause = '';
    const params: any[] = [];

    // Optional search filter
    if (search && typeof search === 'string' && search.length > 0) {
      const searchTerm = `%${search}%`;
      whereClause = `WHERE (
        sku_code ILIKE $1 OR
        brand ILIKE $2 OR
        model ILIKE $3 OR
        colorway ILIKE $4 OR
        style_code ILIKE $5
      )`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Get total count
    const countResult = await dbQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM skus ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get catalog with minimal fields
    const result = await dbQuery<SKU>(
      `SELECT id, sku_code, style_code, brand, model, colorway, retail_price, tier, image_url, image_local_path
       FROM skus ${whereClause}
       ORDER BY tier ASC, brand ASC, model ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offsetNum],
    );

    // Log usage
    try {
      await dbQuery(
        `INSERT INTO api_usage (user_id, endpoint, method, status_code, timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, '/api/skus/catalog', 'GET', 200, new Date()],
      );
    } catch (error) {
      logger.debug({ error }, 'Failed to log API usage');
    }

    res.json({
      total,
      count: result.rows.length,
      limit: limitNum,
      offset: offsetNum,
      has_more: offsetNum + limitNum < total,
      catalog: result.rows.map((sku) => ({
        id: sku.id,
        sku_code: sku.sku_code,
        brand: sku.brand,
        model: sku.model,
        colorway: sku.colorway,
        style_code: sku.style_code,
        retail_price: sku.retail_price,
        tier: sku.tier,
        image_url: sku.image_local_path || sku.image_url,
        image_thumbnail_url: sku.image_local_path
          ? sku.image_local_path.replace('/sneakers/', '/sneakers/thumbs/')
          : null,
        display_name: `${sku.brand} ${sku.model}${sku.colorway ? ' - ' + sku.colorway : ''}`,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch catalog');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/skus/lookup?style_code=CW2288-111
 * Look up a sneaker by style code. If not in DB, discovers it from GOAT,
 * downloads the image, and persists it before returning.
 *
 * IMPORTANT: This route must be before /:id to avoid path collision
 */
router.get('/lookup', async (req: Request, res: Response): Promise<void> => {
  try {
    const { style_code } = req.query;

    if (!style_code || typeof style_code !== 'string' || style_code.trim().length === 0) {
      res.status(400).json({ error: 'style_code query parameter is required' });
      return;
    }

    // Normalize: uppercase, spaces → hyphens
    const styleCode = style_code.trim().toUpperCase().replace(/\s+/g, '-');

    logger.info({ styleCode }, 'SKU lookup requested');

    // Check DB first
    const existing = await dbQuery<SKU>(
      `SELECT id, sku_code, style_code, brand, model, colorway, retail_price, tier, image_url, image_local_path
       FROM skus WHERE style_code = $1`,
      [styleCode],
    );

    if (existing.rows.length > 0) {
      const sku = existing.rows[0];
      const imageUrl = sku.image_local_path || sku.image_url;
      res.json({
        discovered: false,
        sku: {
          id: sku.id,
          sku_code: sku.sku_code,
          style_code: sku.style_code,
          brand: sku.brand,
          model: sku.model,
          colorway: sku.colorway,
          retail_price: sku.retail_price,
          tier: sku.tier,
          image_url: imageUrl,
          image_thumbnail_url: sku.image_local_path
            ? sku.image_local_path.replace('/sneakers/', '/sneakers/thumbs/')
            : null,
          display_name: `${sku.brand} ${sku.model}${sku.colorway ? ' - ' + sku.colorway : ''}`,
        },
      });
      return;
    }

    // Not in DB — discover from GOAT
    const listings = await goatScraper.searchProducts(styleCode, 5);

    if (listings.length === 0) {
      res.status(404).json({ error: 'Sneaker not found' });
      return;
    }

    // Find exact SKU match first, fall back to first result
    const normalize = (s: string) => s.replace(/[-\s]/g, '').toLowerCase();
    const listing = listings.find((l) => normalize(l.sku) === normalize(styleCode)) || listings[0];

    // Derive model from listing name (strip brand prefix and quoted colorway)
    const colorwayMatch = listing.name.match(/['"]([^'"]+)['"]/);
    const derivedColorway = colorwayMatch ? colorwayMatch[1] : (listing.colorway || '');
    let cleanName = listing.name.replace(/['"][^'"]+['"]/, '').trim();
    if (listing.brand) {
      cleanName = cleanName.replace(new RegExp(listing.brand, 'i'), '').trim();
    }
    const model = cleanName.trim() || listing.name;

    // Calculate tier
    let tier = 3;
    if (listing.retailPriceCents && listing.lowestPriceCents) {
      const premium = (listing.lowestPriceCents / listing.retailPriceCents) - 1;
      if (premium > 0.5) tier = 1;
      else if (premium > 0.15) tier = 2;
    }

    const brand = listing.brand || 'Unknown';
    const retailPrice = listing.retailPriceCents ? listing.retailPriceCents / 100 : null;

    // Insert into DB (ON CONFLICT handles race conditions)
    const insertResult = await dbQuery<{ id: number }>(
      `INSERT INTO skus (sku_code, style_code, brand, model, colorway, retail_price, tier, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (style_code) DO NOTHING
       RETURNING id`,
      [styleCode, styleCode, brand, model, derivedColorway, retailPrice, tier, listing.imageUrl],
    );

    let skuId: number;
    if (insertResult.rows.length > 0) {
      skuId = insertResult.rows[0].id;
    } else {
      // Race condition: row already exists, re-query
      const requery = await dbQuery<{ id: number }>(
        `SELECT id FROM skus WHERE style_code = $1`,
        [styleCode],
      );
      skuId = requery.rows[0].id;
    }

    // Download and optimize image
    let imageLocalPath: string | null = null;
    let fileSize: number | null = null;
    if (listing.imageUrl) {
      try {
        const imgResult = await imageProcessor.downloadAndOptimize(listing.imageUrl, styleCode);
        if (imgResult) {
          imageLocalPath = imgResult.fullPath;
          fileSize = imgResult.fileSize;
          await dbQuery(
            `UPDATE skus SET image_local_path = $1, image_file_size = $2, image_downloaded_at = NOW() WHERE id = $3`,
            [imageLocalPath, fileSize, skuId],
          );
        }
      } catch (imgErr) {
        logger.warn({ imgErr, styleCode }, 'Image download failed during lookup; continuing without image');
      }
    }

    const finalImageUrl = imageLocalPath || listing.imageUrl;
    res.json({
      discovered: true,
      sku: {
        id: skuId,
        sku_code: styleCode,
        style_code: styleCode,
        brand,
        model,
        colorway: derivedColorway,
        retail_price: retailPrice,
        tier,
        image_url: finalImageUrl,
        image_thumbnail_url: imageLocalPath
          ? imageLocalPath.replace('/sneakers/', '/sneakers/thumbs/')
          : null,
        display_name: `${brand} ${model}${derivedColorway ? ' - ' + derivedColorway : ''}`,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to lookup SKU');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/skus/trending/popular
 * Get most popular sneakers (most price data points)
 *
 * IMPORTANT: This route must be before /:id to avoid path collision
 */
router.get('/trending/popular', async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = '10' } = req.query;
    const userId = (req as any).user?.userId;

    const limitNum = Math.min(parseInt(limit as string, 10) || 10, 50);

    logger.info({ limit: limitNum, userId }, 'Fetching popular sneakers');

    // Get SKUs with most price data
    const result = await dbQuery(
      `SELECT s.id, s.sku_code, s.style_code, s.brand, s.model, s.colorway, s.tier,
              COUNT(p.id) as price_count,
              AVG(p.price) as avg_price
       FROM skus s
       LEFT JOIN prices p ON s.id = p.sku_id
       GROUP BY s.id, s.sku_code, s.style_code, s.brand, s.model, s.colorway, s.tier
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
        style_code: row.style_code,
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
      style_code: sku.style_code,  // Changed from style_code for consistency
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

export default router;
