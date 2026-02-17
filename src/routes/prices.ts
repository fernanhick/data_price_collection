import { Router, Request, Response } from 'express';
import { query as dbQuery } from '../db/index.js';
import logger from '../utils/logger.js';
import ecmvPersistence from '../services/pricing/ecmvPersistence.js';
import { SKU, PriceResponse } from '../types/index.js';

const router = Router();

const MAX_BATCH_SIZE = 50;

/**
 * POST /api/prices/batch (public - no auth required)
 * Get current ECMV and price breakdown for multiple sneakers at once
 * Body: { style_codes: ["DD1391-100", "CW2288-111", ...] }
 */
export const batchRouter = Router();
batchRouter.post('/batch', async (req: Request, res: Response): Promise<void> => {
  try {
    const { style_codes } = req.body;

    if (!Array.isArray(style_codes) || style_codes.length === 0) {
      res.status(400).json({ error: 'style_codes must be a non-empty array' });
      return;
    }

    if (style_codes.length > MAX_BATCH_SIZE) {
      res.status(400).json({ error: `Maximum ${MAX_BATCH_SIZE} style codes per request` });
      return;
    }

    // Validate all codes are strings
    if (!style_codes.every((c: any) => typeof c === 'string' && c.length > 0)) {
      res.status(400).json({ error: 'All style_codes must be non-empty strings' });
      return;
    }

    logger.info({ count: style_codes.length }, 'Batch price lookup');

    // Fetch all matching SKUs in one query
    const placeholders = style_codes.map((_: string, i: number) => `$${i + 1}`).join(', ');
    const skuResult = await dbQuery<SKU>(
      `SELECT * FROM skus WHERE style_code IN (${placeholders})`,
      style_codes,
    );

    const skuMap = new Map(skuResult.rows.map((s: SKU) => [s.style_code, s]));

    // Fetch latest price_history for all found SKUs in one query
    const skuIds = skuResult.rows.map((s: SKU) => s.id);
    let priceMap = new Map<number, any>();

    if (skuIds.length > 0) {
      const idPlaceholders = skuIds.map((_: number, i: number) => `$${i + 1}`).join(', ');
      const historyResult = await dbQuery(
        `SELECT DISTINCT ON (sku_id) *
         FROM price_history
         WHERE sku_id IN (${idPlaceholders})
         ORDER BY sku_id, timestamp DESC`,
        skuIds,
      );
      priceMap = new Map(historyResult.rows.map((h: any) => [h.sku_id, h]));
    }

    // Build response for each requested style code
    const results: Record<string, PriceResponse | { error: string }> = {};

    for (const code of style_codes) {
      const sku = skuMap.get(code);
      if (!sku) {
        results[code] = { error: 'SKU not found' };
        continue;
      }

      const priceData = priceMap.get(sku.id);
      if (!priceData) {
        results[code] = { error: 'No price data available' };
        continue;
      }

      results[code] = {
        style_code: sku.style_code,
        ecmv: priceData.ecmv,
        confidence: priceData.confidence,
        last_updated: priceData.timestamp,
        components: priceData.components,
      };
    }

    // Log API usage
    try {
      await dbQuery(
        `INSERT INTO api_usage (user_id, endpoint, method, status_code, timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [null, '/api/prices/batch', 'POST', 200, new Date()],
      );
    } catch (error) {
      logger.debug({ error }, 'Failed to log API usage');
    }

    res.json({
      count: Object.keys(results).length,
      results,
    });
  } catch (error) {
    logger.error({ error }, 'Failed batch price lookup');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/prices/:style_code
 * Get current ECMV and price breakdown for a sneaker
 */
router.get('/:style_code', async (req: Request, res: Response): Promise<void> => {
  try {
    const { style_code } = req.params;
    const userId = (req as any).user?.userId; // From JWT

    // Validate input
    if (!style_code || typeof style_code !== 'string' || style_code.length === 0) {
      res.status(400).json({ error: 'Invalid style_code' });
      return;
    }

    logger.info({ style_code, userId }, 'Fetching price');

    // Get SKU from database
    const skuResult = await dbQuery<SKU>('SELECT * FROM skus WHERE style_code = $1', [style_code]);

    if (skuResult.rows.length === 0) {
      res.status(404).json({ error: 'SKU not found' });
      return;
    }

    const sku = skuResult.rows[0];

    // Try to get cached ECMV from price_history
    const historyResult = await dbQuery(
      'SELECT * FROM price_history WHERE sku_id = $1 ORDER BY timestamp DESC LIMIT 1',
      [sku.id],
    );

    let priceData: any;

    if (historyResult.rows.length > 0) {
      // Use most recent calculated ECMV
      priceData = historyResult.rows[0];
      logger.debug(
        { style_code, age: Date.now() - new Date(priceData.timestamp).getTime() },
        'Using cached ECMV',
      );
    } else {
      // Calculate ECMV and save to database
      logger.debug({ style_code }, 'ECMV not cached, calculating and saving');
      const saved = await ecmvPersistence.calculateAndSave(sku, userId);

      if (!saved) {
        res.status(404).json({
          error: 'No price data available',
          message: 'Try again after first price update',
        });
        return;
      }

      priceData = saved;
    }

    // Log API usage
    try {
      await dbQuery(
        `INSERT INTO api_usage (user_id, endpoint, method, status_code, timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, `/api/prices/${style_code}`, 'GET', 200, new Date()],
      );
    } catch (error) {
      logger.debug({ error }, 'Failed to log API usage');
    }

    // Format response
    const response: PriceResponse = {
      sku_code: sku.sku_code,  // Deprecated but included for backward compatibility
      style_code: sku.style_code,
      ecmv: priceData.ecmv,
      confidence: priceData.confidence,
      user_id: userId,
      last_updated: priceData.timestamp,
      components: priceData.components,
    };

    res.json(response);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch price');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/prices/:style_code/history
 * Get price history for a sneaker (for trending)
 */
router.get('/:style_code/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const { style_code } = req.params;
    const { days = '30' } = req.query;
    const userId = (req as any).user?.userId;

    // Validate input
    if (!style_code || typeof style_code !== 'string') {
      res.status(400).json({ error: 'Invalid style_code' });
      return;
    }

    const daysNum = Math.min(parseInt(days as string, 10) || 30, 365); // Max 365 days
    if (isNaN(daysNum) || daysNum < 1) {
      res.status(400).json({ error: 'days must be a number >= 1' });
      return;
    }

    logger.info({ style_code, days: daysNum, userId }, 'Fetching price history');

    // Get SKU
    const skuResult = await dbQuery<SKU>('SELECT * FROM skus WHERE style_code = $1', [style_code]);

    if (skuResult.rows.length === 0) {
      res.status(404).json({ error: 'SKU not found' });
      return;
    }

    const sku = skuResult.rows[0];

    // Get price history
    const historyResult = await dbQuery(
      `SELECT * FROM price_history
       WHERE sku_id = $1 AND timestamp > NOW() - INTERVAL '${daysNum} days'
       ORDER BY timestamp ASC`,
      [sku.id],
    );

    // Get raw prices too
    const pricesResult = await dbQuery(
      `SELECT source, price, timestamp FROM prices
       WHERE sku_id = $1 AND timestamp > NOW() - INTERVAL '${daysNum} days'
       ORDER BY timestamp ASC`,
      [sku.id],
    );

    // Log usage
    try {
      await dbQuery(
        `INSERT INTO api_usage (user_id, endpoint, method, status_code, timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, `/api/prices/${style_code}/history`, 'GET', 200, new Date()],
      );
    } catch (error) {
      logger.debug({ error }, 'Failed to log API usage');
    }

    // Calculate statistics
    const ecmvValues = historyResult.rows.map((h: any) => h.ecmv);
    const stats = {
      min: Math.min(...ecmvValues),
      max: Math.max(...ecmvValues),
      avg: ecmvValues.reduce((a: number, b: number) => a + b, 0) / ecmvValues.length,
      current: ecmvValues[ecmvValues.length - 1],
    };

    res.json({
      sku_code: sku.sku_code,  // Deprecated but included
      style_code: sku.style_code,
      days: daysNum,
      data_points: historyResult.rows.length,
      stats,
      history: historyResult.rows,
      raw_prices: pricesResult.rows,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch price history');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
