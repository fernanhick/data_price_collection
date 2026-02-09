import { query as dbQuery } from '../../db/index.js';
import logger from '../../utils/logger.js';
import { ConfidenceLevel, SKU, Price } from '../../types/index.js';

/**
 * ECMV (Estimated Current Market Value) Calculator
 *
 * Calculates weighted average price from multiple sources:
 * ECMV = w1 × eBay_Price + w2 × GOAT_Price + w3 × StockX_Price
 *
 * Weights are based on:
 * - Liquidity (trading volume)
 * - Freshness (data recency)
 * - Volatility (price stability)
 */
export class ECMVCalculator {
  /**
   * Calculate ECMV for a single SKU
   */
  async calculateECMV(
    sku: SKU,
  ): Promise<{ ecmv: number; confidence: ConfidenceLevel; components: any } | null> {
    try {
      // Fetch latest prices from each source (last 72 hours)
      // Using 72h window to cover all tier schedules:
      // - Tier 1: 4x daily (always fresh)
      // - Tier 2: 1x daily (up to 36h between fetches)
      // - Tier 3: 2x weekly (covered if recently fetched)
      const prices = await this.getPricesForSku(sku.id, 72);

      if (prices.length === 0) {
        logger.warn({ styleCode: sku.style_code }, 'No prices found for ECMV calculation');
        return null;
      }

      // Group by source
      const pricesBySource = this.groupBySource(prices);

      // Get representative price from each source (median of last prices)
      const eBayPrice = this.getSourceMedian(pricesBySource.ebay);
      const goatPrice = this.getSourceMedian(pricesBySource.goat);
      const stockxPrice = this.getSourceMedian(pricesBySource.stockx);

      // Calculate weighted average
      const { ecmv, weights } = this.calculateWeightedAverage(eBayPrice, goatPrice, stockxPrice);

      // Calculate confidence score
      const confidence = this.calculateConfidence(pricesBySource, prices, sku.tier);

      logger.debug(
        {
          styleCode: sku.style_code,
          eBayPrice,
          goatPrice,
          stockxPrice,
          ecmv,
          confidence,
          weights,
        },
        'ECMV calculated',
      );

      return {
        ecmv,
        confidence,
        components: {
          ebay_price: eBayPrice,
          goat_price: goatPrice,
          stockx_price: stockxPrice,
          weights,
        },
      };
    } catch (error) {
      logger.error({ styleCode: sku.style_code, error }, 'Failed to calculate ECMV');
      return null;
    }
  }

  /**
   * Get prices for SKU from last N hours
   */
  private async getPricesForSku(skuId: number, hours: number): Promise<Price[]> {
    const result = await dbQuery<Price>(
      `SELECT * FROM prices
       WHERE sku_id = $1 AND timestamp > NOW() - INTERVAL '${hours} hours'
       ORDER BY timestamp DESC`,
      [skuId],
    );
    return result.rows;
  }

  /**
   * Group prices by source
   */
  private groupBySource(prices: Price[]): {
    ebay: Price[];
    goat: Price[];
    stockx: Price[];
  } {
    return {
      ebay: prices.filter((p) => p.source === 'ebay'),
      goat: prices.filter((p) => p.source === 'goat'),
      stockx: prices.filter((p) => p.source === 'stockx'),
    };
  }

  /**
   * Get median price from source
   * Returns null if no prices available
   */
  private getSourceMedian(prices: Price[]): number | null {
    if (prices.length === 0) return null;

    // Convert to numbers and sort (prices come from DB as strings)
    const sorted = prices
      .map((p) => (typeof p.price === 'string' ? parseFloat(p.price) : p.price))
      .sort((a, b) => a - b);

    // Calculate median
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  /**
   * Calculate weighted average ECMV
   *
   * Weights:
   * - eBay: 50% (high liquidity, reflects actual transactions)
   * - GOAT: 35% (secondary signal, lowest ask price)
   * - StockX: 15% (optional calibration, sparse usage)
   */
  private calculateWeightedAverage(
    eBayPrice: number | null,
    goatPrice: number | null,
    stockxPrice: number | null,
  ): { ecmv: number; weights: { w1: number; w2: number; w3: number } } {
    const w1 = 0.5; // eBay weight
    const w2 = 0.35; // GOAT weight
    const w3 = 0.15; // StockX weight

    // Count available sources
    const availableSources = [eBayPrice, goatPrice, stockxPrice].filter((p) => p !== null).length;

    if (availableSources === 0) {
      throw new Error('No prices available for ECMV calculation');
    }

    // Calculate ECMV from available sources
    let ecmv = 0;
    let totalWeight = 0;

    if (eBayPrice !== null) {
      ecmv += eBayPrice * w1;
      totalWeight += w1;
    }
    if (goatPrice !== null) {
      ecmv += goatPrice * w2;
      totalWeight += w2;
    }
    if (stockxPrice !== null) {
      ecmv += stockxPrice * w3;
      totalWeight += w3;
    }

    // Normalize to ensure weights sum to 1
    ecmv = ecmv / totalWeight;

    return {
      ecmv,
      weights: { w1, w2, w3 },
    };
  }

  /**
   * Calculate confidence score
   *
   * High: 3+ sources, <10% variance, Tier 1-2
   * Medium: 2 sources or high variance
   * Low: 1 source or Tier 3
   */
  private calculateConfidence(
    pricesBySource: Record<string, Price[]>,
    allPrices: Price[],
    tier: number,
  ): ConfidenceLevel {
    const sourceCount = [
      pricesBySource.ebay.length > 0,
      pricesBySource.goat.length > 0,
      pricesBySource.stockx.length > 0,
    ].filter((v) => v).length;

    // Calculate variance
    const prices = allPrices.map((p) => p.price);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / avg;

    // Determine confidence
    if (sourceCount >= 2 && coefficientOfVariation < 0.1 && tier <= 2) {
      return ConfidenceLevel.HIGH;
    }

    if (sourceCount >= 2 || (sourceCount === 1 && coefficientOfVariation < 0.15 && tier <= 2)) {
      return ConfidenceLevel.MEDIUM;
    }

    return ConfidenceLevel.LOW;
  }

  /**
   * Calculate rolling median (smoothing)
   * Reduces impact of outlier prices
   */
  static calculateRollingMedian(prices: number[], window: number = 5): number {
    if (prices.length === 0) return 0;
    if (prices.length <= window) {
      return prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];
    }

    const recentPrices = prices.slice(-window).sort((a, b) => a - b);
    const mid = Math.floor(recentPrices.length / 2);
    return recentPrices.length % 2 === 0
      ? (recentPrices[mid - 1] + recentPrices[mid]) / 2
      : recentPrices[mid];
  }
}

export default new ECMVCalculator();
