import { Router, Request, Response } from 'express';
import { query as dbQuery } from '../db/index.js';
import logger from '../utils/logger.js';
import { CreateSKUSchema, UpdateSKUSchema } from '../schemas/sku.js';
import { SKU } from '../types/index.js';
import { ZodError } from 'zod';

const router = Router();

/**
 * POST /api/admin/skus
 * Create a new sneaker in the catalog
 */
router.post('/skus', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;

    // Validate request body with Zod
    const validatedData = CreateSKUSchema.parse(req.body);

    logger.info({ userId, style_code: validatedData.brand_style_code }, 'Creating new SKU');

    // Check if style code already exists
    const existingResult = await dbQuery<SKU>(
      'SELECT id FROM skus WHERE brand_style_code = $1',
      [validatedData.brand_style_code],
    );

    if (existingResult.rows.length > 0) {
      res.status(400).json({ error: 'Style code already exists' });
      return;
    }

    // Auto-generate sku_code from brand_style_code if not provided
    const sku_code = validatedData.sku_code || validatedData.brand_style_code;

    // Insert new SKU
    const result = await dbQuery<SKU>(
      `INSERT INTO skus (
        sku_code, brand_style_code, brand, model, colorway,
        release_date, retail_price, category, tier,
        stockx_id, goat_id, ebay_query
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        sku_code,
        validatedData.brand_style_code,
        validatedData.brand,
        validatedData.model,
        validatedData.colorway || null,
        validatedData.release_date || null,
        validatedData.retail_price || null,
        validatedData.category || null,
        validatedData.tier,
        validatedData.stockx_id || null,
        validatedData.goat_id || null,
        validatedData.ebay_query || null,
      ],
    );

    const createdSKU = result.rows[0];

    logger.info({ userId, skuId: createdSKU.id, style_code: createdSKU.brand_style_code }, 'SKU created successfully');

    // Map brand_style_code to style_code for API response
    res.status(201).json({
      ...createdSKU,
      style_code: createdSKU.brand_style_code,
      brand_style_code: undefined,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      logger.warn({ error: error.errors }, 'Validation error creating SKU');
      res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
      return;
    }

    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to create SKU');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/skus/:id
 * Update an existing sneaker
 */
router.put('/skus/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const skuId = parseInt(id, 10);

    if (isNaN(skuId) || skuId < 1) {
      res.status(400).json({ error: 'Invalid SKU ID' });
      return;
    }

    // Validate request body with Zod
    const validatedData = UpdateSKUSchema.parse(req.body);

    // Check if there's anything to update
    if (Object.keys(validatedData).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    logger.info({ userId, skuId }, 'Updating SKU');

    // Check if SKU exists
    const existingResult = await dbQuery<SKU>('SELECT * FROM skus WHERE id = $1', [skuId]);

    if (existingResult.rows.length === 0) {
      res.status(404).json({ error: 'SKU not found' });
      return;
    }

    // Build dynamic UPDATE query
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramCount = 1;

    Object.entries(validatedData).forEach(([key, value]) => {
      updateFields.push(`${key} = $${paramCount}`);
      updateValues.push(value);
      paramCount++;
    });

    // Always update updated_at
    updateFields.push(`updated_at = NOW()`);

    // Add SKU ID as last parameter
    updateValues.push(skuId);

    const updateQuery = `
      UPDATE skus
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await dbQuery<SKU>(updateQuery, updateValues);
    const updatedSKU = result.rows[0];

    logger.info({ userId, skuId, updatedFields: Object.keys(validatedData) }, 'SKU updated successfully');

    // Map brand_style_code to style_code for API response
    res.status(200).json({
      ...updatedSKU,
      style_code: updatedSKU.brand_style_code,
      brand_style_code: undefined,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      logger.warn({ error: error.errors }, 'Validation error updating SKU');
      res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
      return;
    }

    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to update SKU');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/skus/:id
 * Delete a sneaker from the catalog
 * CASCADE will automatically delete related prices and price_history
 */
router.delete('/skus/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const skuId = parseInt(id, 10);

    if (isNaN(skuId) || skuId < 1) {
      res.status(400).json({ error: 'Invalid SKU ID' });
      return;
    }

    logger.info({ userId, skuId }, 'Deleting SKU');

    // Check if SKU exists
    const existingResult = await dbQuery<SKU>('SELECT brand_style_code FROM skus WHERE id = $1', [skuId]);

    if (existingResult.rows.length === 0) {
      res.status(404).json({ error: 'SKU not found' });
      return;
    }

    const style_code = existingResult.rows[0].brand_style_code;

    // Delete SKU (CASCADE will handle related records)
    await dbQuery('DELETE FROM skus WHERE id = $1', [skuId]);

    logger.info({ userId, skuId, style_code }, 'SKU deleted successfully');

    res.status(200).json({
      success: true,
      message: 'SKU deleted successfully',
      id: skuId,
      style_code,
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to delete SKU');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/activity/recent-skus
 * Get recently added SKUs
 */
router.get('/activity/recent-skus', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await dbQuery<SKU & { created_at: string }>(
      `SELECT id, sku_code, brand_style_code, brand, model, colorway, tier, retail_price, created_at
       FROM skus
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );

    // Map brand_style_code to style_code for API response
    res.status(200).json({
      skus: result.rows.map(sku => ({
        ...sku,
        style_code: sku.brand_style_code,
        brand_style_code: undefined,
      })),
      count: result.rows.length,
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to fetch recent SKUs');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/activity/recent-prices
 * Get recently added price points
 */
router.get('/activity/recent-prices', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await dbQuery<{
      id: number;
      sku_id: number;
      source: string;
      price: number;
      timestamp: string;
      sku_code: string;
      brand_style_code: string;
      brand: string;
      model: string;
    }>(
      `SELECT p.id, p.sku_id, p.source, p.price, p.timestamp,
              s.sku_code, s.brand_style_code, s.brand, s.model
       FROM prices p
       JOIN skus s ON p.sku_id = s.id
       ORDER BY p.timestamp DESC
       LIMIT $1`,
      [limit],
    );

    // Map brand_style_code to style_code for API response
    res.status(200).json({
      prices: result.rows.map(row => ({
        id: row.id,
        sku_id: row.sku_id,
        source: row.source,
        price: row.price,
        timestamp: row.timestamp,
        sku_code: row.sku_code,
        style_code: row.brand_style_code,
        brand: row.brand,
        model: row.model,
      })),
      count: result.rows.length,
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to fetch recent prices');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
