import dotenv from 'dotenv';
import logger from '../utils/logger.js';
import { closePool } from '../db/index.js';
import { refreshUpcomingReleases } from '../services/releases/upcomingReleases.js';
import { notifyConvexOfReleases } from '../services/notifications/convexReleaseNotifier.js';

/**
 * One-time releases seed.
 *
 * Fetches the full upcoming-release calendar, upserts it into our DB, and emits
 * it to every configured Convex ingest target with `suppressPush: true` — so
 * Convex backfills the calendar WITHOUT firing a push for every drop. Run once
 * per deployment to populate Convex; after that the normal scheduled runs emit
 * without suppression and Convex's idempotency means only genuinely-new ids
 * notify.
 *
 * Usage: `node dist/scripts/seedReleases.js`  (or `npm run releases:seed`)
 */
async function main() {
  dotenv.config();
  logger.info('🌱 Seeding upcoming releases to Convex (suppressPush=true)');

  const result = await refreshUpcomingReleases();
  logger.info(
    { fetched: result.fetched, inserted: result.inserted, updated: result.updated },
    'Calendar refreshed; emitting to Convex with push suppressed',
  );

  const notified = await notifyConvexOfReleases(result.allReleases, { suppressPush: true });
  if (notified) {
    logger.info({ accepted: notified.accepted, emitted: result.allReleases.length }, '✅ Seed complete');
  } else {
    logger.error('Seed emit could not be confirmed (no target accepted) — check ingest config');
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    logger.error({ err }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(() => closePool());
