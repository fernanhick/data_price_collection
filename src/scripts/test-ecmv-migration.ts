import { query as dbQuery, closePool } from '../db/index.js';
import logger from '../utils/logger.js';
import ecmvCalculator from '../services/pricing/ecmvCalculator.js';
import { SKU } from '../types/index.js';

async function testECMV() {
  try {
    // Get a SKU with recent prices
    const result = await dbQuery<SKU>(
      `SELECT s.* FROM skus s
       JOIN prices p ON s.id = p.sku_id
       GROUP BY s.id
       HAVING COUNT(p.id) > 5
       ORDER BY MAX(p.timestamp) DESC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      logger.warn('No SKUs with prices found');
      return;
    }

    const sku = result.rows[0];
    logger.info({
      id: sku.id,
      sku_code: sku.sku_code,
      style_code: sku.brand_style_code,
      brand: sku.brand,
      model: sku.model
    }, 'Testing ECMV calculation with new structure');

    // Calculate ECMV
    const ecmvResult = await ecmvCalculator.calculateECMV(sku);

    if (ecmvResult) {
      logger.info({
        style_code: sku.brand_style_code,
        ecmv: ecmvResult.ecmv,
        confidence: ecmvResult.confidence,
        components: ecmvResult.components
      }, '✅ ECMV calculated successfully');
    } else {
      logger.warn('No ECMV calculated (no recent prices)');
    }

  } catch (error) {
    logger.error({ error }, 'ECMV test failed');
  } finally {
    await closePool();
  }
}

testECMV();
