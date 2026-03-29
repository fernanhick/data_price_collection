import cron from 'node-cron';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { PriceFetcher } from './pricing/priceFetcher.js';
import ecmvPersistence from './pricing/ecmvPersistence.js';
import { query as dbQuery } from '../db/index.js';
import { SKU } from '../types/index.js';

/**
 * Price Update Scheduler
 *
 * Manages tier-based price update schedules:
 * - Tier 1 (20 popular): 4x daily
 * - Tier 2 (80+ medium): 1x daily
 * - Tier 3 (long-tail): 2x weekly
 */
export class PriceUpdateScheduler {
  private priceFetcher = new PriceFetcher();
  private tier1Task: cron.ScheduledTask | null = null;
  private tier2Task: cron.ScheduledTask | null = null;
  private tier3Task: cron.ScheduledTask | null = null;
  private ecmvTask: cron.ScheduledTask | null = null;
  private tier1Running = false;
  private tier2Running = false;
  private tier3Running = false;
  private ecmvRunning = false;

  /**
   * Start all scheduler tasks
   */
  startAll(): void {
    if (!config.scheduler.enabled) {
      logger.info('Scheduler is disabled');
      return;
    }

    logger.info('Starting price update scheduler');

    this.startTier1Schedule();
    this.startTier2Schedule();
    this.startTier3Schedule();
    this.startECMVSchedule();

    logger.info('✅ All price update schedules started');
  }

  /**
   * Tier 1: High-demand sneakers (4x daily)
   * Schedule: 6am, 12pm, 6pm, 12am UTC
   */
  private startTier1Schedule(): void {
    logger.info(`Tier 1 schedule: ${config.scheduler.tier1Cron}`);

    this.tier1Task = cron.schedule(config.scheduler.tier1Cron, async () => {
      logger.info('🚀 Starting Tier 1 price update (high-demand sneakers)');
      try {
        await this.priceFetcher.fetchAllPrices(1, config.scheduler.skipStockX);
        logger.info('✅ Tier 1 price update completed');
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          '❌ Tier 1 price update failed',
        );
        await this.logFetchFailure('tier1');
      }
    });
    this.tier1Running = true;
  }

  /**
   * Tier 2: Medium-demand sneakers (1x daily)
   * Schedule: 2pm UTC
   */
  private startTier2Schedule(): void {
    logger.info(`Tier 2 schedule: ${config.scheduler.tier2Cron}`);

    this.tier2Task = cron.schedule(config.scheduler.tier2Cron, async () => {
      logger.info('🚀 Starting Tier 2 price update (medium-demand sneakers)');
      try {
        await this.priceFetcher.fetchAllPrices(2, config.scheduler.skipStockX);
        logger.info('✅ Tier 2 price update completed');
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          '❌ Tier 2 price update failed',
        );
        await this.logFetchFailure('tier2');
      }
    });
    this.tier2Running = true;
  }

  /**
   * Tier 3: Long-tail sneakers (2x weekly)
   * Schedule: Monday & Thursday at 10am UTC
   */
  private startTier3Schedule(): void {
    logger.info(`Tier 3 schedule: ${config.scheduler.tier3Cron}`);

    this.tier3Task = cron.schedule(config.scheduler.tier3Cron, async () => {
      logger.info('🚀 Starting Tier 3 price update (long-tail sneakers)');
      try {
        await this.priceFetcher.fetchAllPrices(3, config.scheduler.skipStockX);
        logger.info('✅ Tier 3 price update completed');
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          '❌ Tier 3 price update failed',
        );
        await this.logFetchFailure('tier3');
      }
    });
    this.tier3Running = true;
  }

  /**
   * ECMV Calculation: Calculate ECMV for recently updated SKUs
   * Schedule: Every 6 hours, 1 hour after tier1 price fetches (7am, 1pm, 7pm, 1am UTC)
   * Only processes SKUs with price updates in last 24 hours (efficient)
   */
  private startECMVSchedule(): void {
    logger.info(`ECMV calculation schedule: ${config.scheduler.ecmvCron}`);

    this.ecmvTask = cron.schedule(config.scheduler.ecmvCron, async () => {
      logger.info('🧮 Starting ECMV calculation for recently updated SKUs');
      const startTime = Date.now();

      try {
        // Get SKUs with price updates in last 24 hours
        const result = await dbQuery<SKU>(
          `SELECT DISTINCT s.*
           FROM skus s
           INNER JOIN prices p ON s.id = p.sku_id
           WHERE p.timestamp > NOW() - INTERVAL '24 hours'
           ORDER BY s.tier ASC, s.id ASC`,
          [],
        );

        const skus = result.rows;
        logger.info({ count: skus.length }, 'Found SKUs with recent price updates');

        if (skus.length === 0) {
          logger.info('No SKUs with recent price updates, skipping ECMV calculation');
          return;
        }

        // Calculate and save ECMV for each SKU
        const successCount = await ecmvPersistence.bulkCalculateAndSave(skus, 'scheduler');

        const duration = Date.now() - startTime;
        logger.info(
          {
            total: skus.length,
            success: successCount,
            failed: skus.length - successCount,
            duration_ms: duration,
          },
          '✅ ECMV calculation completed',
        );
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          '❌ ECMV calculation failed',
        );
        await this.logFetchFailure('ecmv');
      }
    });
    this.ecmvRunning = true;
  }

  /**
   * Log fetch failure for monitoring
   */
  private async logFetchFailure(tier: string): Promise<void> {
    try {
      await dbQuery(
        `INSERT INTO fetch_logs (source, status, message, timestamp)
         VALUES ($1, $2, $3, $4)`,
        ['scheduler', 'failed', `${tier} price fetch failed`, new Date()],
      );
    } catch (error) {
      logger.error({ error }, 'Failed to log fetch failure');
    }
  }

  /**
   * Stop all scheduler tasks
   */
  stopAll(): void {
    logger.info('Stopping price update scheduler');

    if (this.tier1Task) {
      this.tier1Task.stop();
      this.tier1Running = false;
    }
    if (this.tier2Task) {
      this.tier2Task.stop();
      this.tier2Running = false;
    }
    if (this.tier3Task) {
      this.tier3Task.stop();
      this.tier3Running = false;
    }
    if (this.ecmvTask) {
      this.ecmvTask.stop();
      this.ecmvRunning = false;
    }

    logger.info('✅ All price update schedules stopped');
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    enabled: boolean;
    tier1: { running: boolean; schedule: string };
    tier2: { running: boolean; schedule: string };
    tier3: { running: boolean; schedule: string };
    ecmv: { running: boolean; schedule: string };
  } {
    return {
      enabled: config.scheduler.enabled,
      tier1: {
        running: this.tier1Running,
        schedule: config.scheduler.tier1Cron,
      },
      tier2: {
        running: this.tier2Running,
        schedule: config.scheduler.tier2Cron,
      },
      tier3: {
        running: this.tier3Running,
        schedule: config.scheduler.tier3Cron,
      },
      ecmv: {
        running: this.ecmvRunning,
        schedule: config.scheduler.ecmvCron,
      },
    };
  }
}

export default new PriceUpdateScheduler();
