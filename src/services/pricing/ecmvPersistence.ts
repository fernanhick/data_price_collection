import { query as dbQuery } from '../../db/index.js';
import logger from '../../utils/logger.js';
import { SKU, PriceHistory, ConfidenceLevel } from '../../types/index.js';
import ecmvCalculator from './ecmvCalculator.js';

/**
 * ECMV Persistence Service
 *
 * Handles saving ECMV calculations to the price_history table.
 * Provides duplicate prevention and error handling for reliable persistence.
 */
export class ECMVPersistence {
  /**
   * Save ECMV data to price_history table
   * Returns the inserted record or null if failed
   */
  async saveECMV(
    skuId: number,
    styleCode: string,
    ecmv: number,
    confidence: ConfidenceLevel,
    components: any,
    userId?: string,
  ): Promise<PriceHistory | null> {
    try {
      // Check for recent duplicate (within last 5 minutes)
      const isDuplicate = await this.recentlySaved(skuId, 5);
      if (isDuplicate) {
        logger.debug(
          { skuId, styleCode },
          'Skipping ECMV save - entry exists within last 5 minutes',
        );
        return null;
      }

      // Insert new record
      const result = await dbQuery<PriceHistory>(
        `INSERT INTO price_history (sku_id, style_code, ecmv, confidence, components, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [skuId, styleCode, ecmv, confidence, JSON.stringify(components), userId || null],
      );

      if (result.rows.length === 0) {
        logger.warn({ skuId, styleCode }, 'INSERT returned no rows');
        return null;
      }

      logger.info(
        {
          skuId,
          styleCode,
          ecmv,
          confidence,
          userId,
        },
        'ECMV saved to price_history',
      );

      return result.rows[0];
    } catch (error) {
      logger.error(
        {
          skuId,
          styleCode,
          error,
        },
        'Failed to save ECMV to database',
      );
      return null;
    }
  }

  /**
   * Calculate ECMV for a SKU and save to database
   * Returns the saved PriceHistory record or null if calculation/save failed
   */
  async calculateAndSave(sku: SKU, userId?: string): Promise<PriceHistory | null> {
    try {
      // Calculate ECMV
      const calculation = await ecmvCalculator.calculateECMV(sku);

      if (!calculation) {
        logger.debug({ styleCode: sku.style_code }, 'ECMV calculation returned null');
        return null;
      }

      // Save to database
      return await this.saveECMV(
        sku.id,
        sku.style_code,
        calculation.ecmv,
        calculation.confidence,
        calculation.components,
        userId,
      );
    } catch (error) {
      logger.error(
        {
          skuId: sku.id,
          styleCode: sku.style_code,
          error,
        },
        'Failed to calculate and save ECMV',
      );
      return null;
    }
  }

  /**
   * Calculate and save ECMV for multiple SKUs
   * Returns count of successful saves
   */
  async bulkCalculateAndSave(skus: SKU[], userId?: string): Promise<number> {
    let successCount = 0;
    let failureCount = 0;

    logger.info({ count: skus.length }, 'Starting bulk ECMV calculation');

    for (const sku of skus) {
      try {
        const result = await this.calculateAndSave(sku, userId);
        if (result) {
          successCount++;
        } else {
          failureCount++;
        }
      } catch (error) {
        logger.warn(
          {
            skuId: sku.id,
            styleCode: sku.style_code,
            error,
          },
          'Error in bulk ECMV calculation',
        );
        failureCount++;
      }
    }

    logger.info(
      {
        total: skus.length,
        success: successCount,
        failed: failureCount,
      },
      'Bulk ECMV calculation completed',
    );

    return successCount;
  }

  /**
   * Check if ECMV was recently saved for this SKU
   * Returns true if entry exists within the specified minutes
   */
  async recentlySaved(skuId: number, withinMinutes: number): Promise<boolean> {
    try {
      const result = await dbQuery<{ count: number }>(
        `SELECT COUNT(*) as count FROM price_history
         WHERE sku_id = $1 AND timestamp > NOW() - INTERVAL '${withinMinutes} minutes'`,
        [skuId],
      );

      return result.rows[0].count > 0;
    } catch (error) {
      logger.error(
        {
          skuId,
          withinMinutes,
          error,
        },
        'Failed to check for recent ECMV',
      );
      // On error, assume not recently saved to allow retry
      return false;
    }
  }

  /**
   * Get the latest ECMV for a SKU from price_history
   */
  async getLatestECMV(skuId: number): Promise<PriceHistory | null> {
    try {
      const result = await dbQuery<PriceHistory>(
        `SELECT * FROM price_history
         WHERE sku_id = $1
         ORDER BY timestamp DESC
         LIMIT 1`,
        [skuId],
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error({ skuId, error }, 'Failed to get latest ECMV');
      return null;
    }
  }
}

export default new ECMVPersistence();
