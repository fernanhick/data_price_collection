import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query as dbQuery } from '../db/index.js';
import logger from '../utils/logger.js';
import ecmvCalculator from '../services/pricing/ecmvCalculator.js';
import { SKU, PriceResponse } from '../types/index.js';

const router = Router();

/**
 * GET /api/prices/:sku_code
 * Get current ECMV and price breakdown for a sneaker
 */
router.get('/:sku_code', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sku_code } = req.params;
    const userId = (req as any).user?.userId; // From JWT

    // Validate input
    if (!sku_code || typeof sku_code !== 'string' || sku_code.length === 0) {
      res.status(400).json({ error: 'Invalid sku_code' });
      return;
    }

    logger.info({ sku_code, userId }, 'Fetching price');

    // Get SKU from database
    const skuResult = await dbQuery<SKU>(
      'SELECT * FROM skus WHERE sku_code = $1',
      [sku_code],
    );

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
      logger.debug({ sku_code, age: Date.now() - new Date(priceData.timestamp).getTime() },
        'Using cached ECMV');
    } else {
      // Calculate ECMV on the fly if not cached
      logger.debug({ sku_code }, 'ECMV not cached, calculating');
      const calc = await ecmvCalculator.calculateECMV(sku);

      if (!calc) {
        res.status(404).json({
          error: 'No price data available',
          message: 'Try again after first price update',
        });
        return;
      }

      priceData = calc;
    }

    // Log API usage
    try {
      await dbQuery(
        `INSERT INTO api_usage (user_id, endpoint, method, status_code, timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, `/api/prices/${sku_code}`, 'GET', 200, new Date()],
      );
    } catch (error) {
      logger.debug({ error }, 'Failed to log API usage');
    }

    // Format response
    const response: PriceResponse = {
      sku_code: sku.sku_code,
      style_code: sku.brand_style_code,
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
 * GET /api/prices/:sku_code/history
 * Get price history for a sneaker (for trending)
 */
router.get('/:sku_code/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sku_code } = req.params;
    const { days = '30' } = req.query;
    const userId = (req as any).user?.userId;

    // Validate input
    if (!sku_code || typeof sku_code !== 'string') {
      res.status(400).json({ error: 'Invalid sku_code' });
      return;
    }

    const daysNum = Math.min(parseInt(days as string, 10) || 30, 365); // Max 365 days
    if (isNaN(daysNum) || daysNum < 1) {
      res.status(400).json({ error: 'days must be a number >= 1' });
      return;
    }

    logger.info({ sku_code, days: daysNum, userId }, 'Fetching price history');

    // Get SKU
    const skuResult = await dbQuery<SKU>(
      'SELECT * FROM skus WHERE sku_code = $1',
      [sku_code],
    );

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
        [userId, `/api/prices/${sku_code}/history`, 'GET', 200, new Date()],
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
      sku_code,
      style_code: sku.brand_style_code,
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
