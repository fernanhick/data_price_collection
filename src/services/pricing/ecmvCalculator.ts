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
   * Cross-source price validation threshold
   * Rejects eBay prices below this percentage of GOAT/StockX baseline
   */
  private readonly MINIMUM_PRICE_THRESHOLD = 0.5; // 50% of baseline

  /**
   * Enable/disable price threshold validation
   */
  private readonly PRICE_THRESHOLD_ENABLED = process.env.ENABLE_PRICE_THRESHOLD === 'true';
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
      let eBayPrice = this.getSourceMedian(pricesBySource.ebay);
      let goatPrice = this.getSourceMedian(pricesBySource.goat);
      let stockxPrice = this.getSourceMedian(pricesBySource.stockx);

      // Apply cross-source price threshold to reject damaged/replica items
      if (this.PRICE_THRESHOLD_ENABLED) {
        const thresholdResult = this.applyPriceThreshold(eBayPrice, goatPrice, stockxPrice);
        eBayPrice = thresholdResult.eBayPrice;
      }

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
   * Get median price from source with outlier removal
   * Returns null if no prices available
   */
  private getSourceMedian(prices: Price[]): number | null {
    if (prices.length === 0) return null;

    // Convert to numbers and sort (prices come from DB as strings)
    let sorted = prices
      .map((p) => (typeof p.price === 'string' ? parseFloat(p.price) : p.price))
      .sort((a, b) => a - b);

    // Apply IQR outlier removal
    if (sorted.length >= 4) {
      const filtered = this.removeOutliers(sorted);
      if (filtered.length >= 4) {
        sorted = filtered;
      }
    }

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
   * Apply price threshold validation
   * Rejects eBay prices below 50% of GOAT/StockX baseline
   */
  private applyPriceThreshold(
    eBayPrice: number | null,
    goatPrice: number | null,
    stockxPrice: number | null,
  ): { eBayPrice: number | null } {
    if (!eBayPrice || (!goatPrice && !stockxPrice)) {
      return { eBayPrice };
    }

    // Calculate baseline from available sources
    const availablePrices = [goatPrice, stockxPrice].filter((p) => p !== null) as number[];
    if (availablePrices.length === 0) {
      return { eBayPrice };
    }

    const baseline = availablePrices.reduce((a, b) => a + b, 0) / availablePrices.length;
    const threshold = baseline * this.MINIMUM_PRICE_THRESHOLD;

    if (eBayPrice < threshold) {
      logger.warn(
        {
          eBayPrice,
          baseline,
          threshold,
          removed: true,
        },
        'eBay price rejected - below 50% threshold (possible damaged/replica item)',
      );
      return { eBayPrice: null };
    }

    return { eBayPrice };
  }

  /**
   * Remove outliers using IQR (Interquartile Range) method
   * Removes prices outside [Q1 - 1.5×IQR, Q3 + 1.5×IQR]
   */
  private removeOutliers(sorted: number[]): number[] {
    if (sorted.length < 4) {
      return sorted;
    }

    // Calculate quartiles
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);

    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const filtered = sorted.filter((price) => {
      return price >= lowerBound && price <= upperBound;
    });

    if (filtered.length !== sorted.length) {
      logger.debug(
        {
          original: sorted.length,
          filtered: filtered.length,
          lowerBound,
          upperBound,
        },
        'IQR outlier filtering applied',
      );
    }

    return filtered;
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
