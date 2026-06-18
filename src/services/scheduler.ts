import cron from 'node-cron';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { PriceFetcher } from './pricing/priceFetcher.js';
import ecmvPersistence from './pricing/ecmvPersistence.js';
import { query as dbQuery } from '../db/index.js';
import { SKU } from '../types/index.js';
import notifier from './notifier.js';
import { refreshUpcomingReleases } from './releases/upcomingReleases.js';
import { notifyConvexOfReleases } from './notifications/convexReleaseNotifier.js';

/**
 * Price Update Scheduler (all times UTC)
 *
 * Heavy Puppeteer/Chrome scrapers are packed into the global (US+EU) pre-dawn
 * lull and spaced so no two ever run at once (the box is 1GB; concurrent Chrome
 * = OOM). ECMV is internal calc (no Chrome) so it runs through the day.
 * - Tier 1 (popular):    03:00 daily
 * - Releases (HTTP):     04:00 daily
 * - Tier 2 (medium ⅓):   05:00 daily
 * - Tier 3 (long-tail):  07:00 Mon & Thu
 * - ECMV (recompute):    00:00, 06:00, 12:00, 18:00
 */
export class PriceUpdateScheduler {
  private priceFetcher = new PriceFetcher();
  private tier1Task: cron.ScheduledTask | null = null;
  private tier2Task: cron.ScheduledTask | null = null;
  private tier3Task: cron.ScheduledTask | null = null;
  private ecmvTask: cron.ScheduledTask | null = null;
  private releasesTask: cron.ScheduledTask | null = null;
  private tier1Running = false;
  private tier2Running = false;
  private tier3Running = false;
  private ecmvRunning = false;
  private releasesRunning = false;

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
    this.startReleasesSchedule();

    logger.info('✅ All price update schedules started');
  }

  /**
   * Tier 1: High-demand sneakers (1x daily)
   * Schedule: 03:00 UTC
   */
  private startTier1Schedule(): void {
    logger.info(`Tier 1 schedule: ${config.scheduler.tier1Cron}`);

    this.tier1Task = cron.schedule(config.scheduler.tier1Cron, async () => {
      logger.info('🚀 Starting Tier 1 price update (high-demand sneakers)');
      const start = Date.now();
      try {
        const count = await this.priceFetcher.fetchAllPrices(1, config.scheduler.skipStockX);
        logger.info('✅ Tier 1 price update completed');
        await notifier.scrapeComplete('Tier 1', count ?? 0, Date.now() - start);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error({ error: msg }, '❌ Tier 1 price update failed');
        await this.logFetchFailure('tier1');
        await notifier.scrapeError('Tier 1', msg);
      }
    });
    this.tier1Running = true;
  }

  /**
   * Tier 2: Medium-demand sneakers (1x daily, ⅓ rotation)
   * Schedule: 05:00 UTC
   */
  private startTier2Schedule(): void {
    logger.info(`Tier 2 schedule: ${config.scheduler.tier2Cron}`);

    this.tier2Task = cron.schedule(config.scheduler.tier2Cron, async () => {
      const slot = Math.floor(Date.now() / 86400000) % 3;
      logger.info({ slot }, '🚀 Starting Tier 2 price update (medium-demand sneakers, rotation 1/3)');
      const start = Date.now();
      try {
        const count = await this.priceFetcher.fetchAllPrices(2, config.scheduler.skipStockX, slot);
        logger.info({ slot }, '✅ Tier 2 price update completed');
        await notifier.scrapeComplete('Tier 2', count ?? 0, Date.now() - start);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error({ error: msg }, '❌ Tier 2 price update failed');
        await this.logFetchFailure('tier2');
        await notifier.scrapeError('Tier 2', msg);
      }
    });
    this.tier2Running = true;
  }

  /**
   * Tier 3: Long-tail sneakers (2x weekly)
   * Schedule: Monday & Thursday at 07:00 UTC
   */
  private startTier3Schedule(): void {
    logger.info(`Tier 3 schedule: ${config.scheduler.tier3Cron}`);

    this.tier3Task = cron.schedule(config.scheduler.tier3Cron, async () => {
      logger.info('🚀 Starting Tier 3 price update (long-tail sneakers)');
      const start = Date.now();
      try {
        const count = await this.priceFetcher.fetchAllPrices(3, config.scheduler.skipStockX);
        logger.info('✅ Tier 3 price update completed');
        await notifier.scrapeComplete('Tier 3', count ?? 0, Date.now() - start);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error({ error: msg }, '❌ Tier 3 price update failed');
        await this.logFetchFailure('tier3');
        await notifier.scrapeError('Tier 3', msg);
      }
    });
    this.tier3Running = true;
  }

  /**
   * ECMV Calculation: Calculate ECMV for recently updated SKUs
   * Schedule: Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC), offset from all scraper starts
   * Internal calc only (no Chrome), so it is safe to run during the day.
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
        const msg = error instanceof Error ? error.message : String(error);
        logger.error({ error: msg }, '❌ ECMV calculation failed');
        await this.logFetchFailure('ecmv');
        await notifier.ecmvError(msg);
      }
    });
    this.ecmvRunning = true;
  }

  /**
   * Upcoming Releases: refresh the upcoming-release calendar from the source.
   * Schedule: 04:00 UTC daily (light HTTP fetch, no Chrome).
   */
  private startReleasesSchedule(): void {
    logger.info(`Upcoming releases schedule: ${config.scheduler.releasesCron}`);

    this.releasesTask = cron.schedule(config.scheduler.releasesCron, async () => {
      logger.info('🆕 Starting upcoming releases refresh');
      try {
        const result = await refreshUpcomingReleases();
        await notifier.upcomingReleases({
          inserted: result.inserted,
          updated: result.updated,
          samples: result.newReleases.map((r) => ({ name: r.name, releaseDate: r.releaseDate })),
        });
        // Hand the same genuinely-new drops (xmax = 0) to Convex, which fans
        // them out to devices via Expo push. Isolated in its own try/catch so a
        // notify failure can't fail the refresh job — Telegram already fired and
        // the price refresh must still complete. The notifier never throws, but
        // belt-and-suspenders here regardless.
        if (result.newReleases.length > 0) {
          try {
            const notified = await notifyConvexOfReleases(result.newReleases);
            if (notified) {
              logger.info({ accepted: notified.accepted }, '[releases] notified Convex');
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error({ error: msg }, '[releases] Convex notify failed');
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error({ error: msg }, '❌ Upcoming releases refresh failed');
        await this.logFetchFailure('releases');
        await notifier.releasesError(msg);
      }
    });
    this.releasesRunning = true;
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
    if (this.releasesTask) {
      this.releasesTask.stop();
      this.releasesRunning = false;
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
    releases: { running: boolean; schedule: string };
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
      releases: {
        running: this.releasesRunning,
        schedule: config.scheduler.releasesCron,
      },
    };
  }
}

export default new PriceUpdateScheduler();
