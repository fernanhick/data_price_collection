import cron from 'node-cron';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { PriceFetcher } from './pricing/priceFetcher.js';
import { query as dbQuery } from '../db/index.js';

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
  private tier1Running = false;
  private tier2Running = false;
  private tier3Running = false;

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
        await this.priceFetcher.fetchAllPrices(1);
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
        await this.priceFetcher.fetchAllPrices(2);
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
        await this.priceFetcher.fetchAllPrices(3);
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
    };
  }
}

export default new PriceUpdateScheduler();
