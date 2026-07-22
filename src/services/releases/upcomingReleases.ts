import dotenv from 'dotenv';
import { query as dbQuery, closePool } from '../../db/index.js';
import logger from '../../utils/logger.js';
import type { RawRelease } from './soleRetrieverParser.js';
import { fetchUpcomingReleasesFromKicksDB } from './kicksdbReleases.js';

const SOURCE = 'kicksdb-goat';
// How far ahead to pull the calendar. KicksDB GOAT exposes a real release_date,
// so we can show users a full year of upcoming drops (vs SoleRetriever's ~1
// week). GOAT's forward visibility flattens out ~6 months ahead, so 365d costs
// the same as 90d — still ~2 pages/run — while capturing the sparse far tail.
const HORIZON_DAYS = parseInt(process.env.RELEASES_HORIZON_DAYS || '365', 10);

export interface UpcomingRelease {
  style_code: string;
  name: string;
  brand: string | null;
  release_date: string | null;
  image_url: string | null;
  source_url: string | null;
}

export interface RefreshResult {
  fetched: number;
  inserted: number;
  updated: number;
  newReleases: RawRelease[];
  /** The full current calendar this run — emitted to Convex (the system of record). */
  allReleases: RawRelease[];
}

/**
 * Fetch the source release calendar, parse it, and dedup-upsert into
 * `upcoming_releases`. Returns counts plus the records that were newly
 * inserted (i.e. genuinely new drops) so callers can notify on them.
 */
export async function refreshUpcomingReleases(): Promise<RefreshResult> {
  const releases = await fetchUpcomingReleasesFromKicksDB(HORIZON_DAYS);

  // An empty result almost always means an API/quota problem, not "no
  // releases" — fail loudly rather than silently wiping our freshness signal.
  if (releases.length === 0) {
    throw new Error('No upcoming releases returned from source (possible API/quota issue)');
  }

  let inserted = 0;
  let updated = 0;
  const newReleases: RawRelease[] = [];

  for (const r of releases) {
    // COALESCE(EXCLUDED.x, existing.x): the GOAT feed frequently serves a null
    // image (and occasionally a null source) for shoes it hasn't photographed
    // yet — often ones we already have a good image for. Overwriting with the
    // fresh null wiped those, so we keep the stored value when the feed has none.
    const res = await dbQuery<{ inserted: boolean; image_url: string | null; source_url: string | null }>(
      `INSERT INTO upcoming_releases
         (style_code, name, brand, release_date, image_url, source_url, source, last_seen_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (style_code) DO UPDATE SET
         name = EXCLUDED.name,
         brand = EXCLUDED.brand,
         release_date = EXCLUDED.release_date,
         image_url = COALESCE(EXCLUDED.image_url, upcoming_releases.image_url),
         source_url = COALESCE(EXCLUDED.source_url, upcoming_releases.source_url),
         last_seen_at = NOW(),
         updated_at = NOW()
       RETURNING (xmax = 0) AS inserted, image_url, source_url`,
      [r.styleCode, r.name, r.brand, r.releaseDate, r.imageUrl, r.sourceUrl, SOURCE],
    );

    const row = res.rows[0] as any;
    // Carry the *persisted* (post-COALESCE) image/source back onto the record so
    // the Convex emit below ships the preserved value, not the feed's null —
    // otherwise the DB would keep the image but the app would still lose it.
    if (row) {
      r.imageUrl = row.image_url ?? r.imageUrl;
      r.sourceUrl = row.source_url ?? r.sourceUrl;
    }

    if (row?.inserted) {
      inserted++;
      newReleases.push(r);
    } else {
      updated++;
    }
  }

  logger.info({ fetched: releases.length, inserted, updated }, '✅ Upcoming releases refreshed');
  return { fetched: releases.length, inserted, updated, newReleases, allReleases: releases };
}

/** Read stored upcoming releases (defaults to today onward, soonest first). */
export async function getUpcomingReleases(
  opts: { brand?: string; limit?: number; includePast?: boolean } = {},
): Promise<UpcomingRelease[]> {
  const where: string[] = [];
  const params: any[] = [];

  if (!opts.includePast) {
    where.push(`(release_date IS NULL OR release_date >= CURRENT_DATE)`);
  }
  if (opts.brand) {
    params.push(opts.brand);
    where.push(`LOWER(brand) = LOWER($${params.length})`);
  }

  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 250);
  params.push(limit);

  const res = await dbQuery<UpcomingRelease>(
    `SELECT style_code, name, brand, release_date::text AS release_date, image_url, source_url
       FROM upcoming_releases
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY release_date ASC NULLS LAST, name ASC
       LIMIT $${params.length}`,
    params,
  );

  return res.rows;
}

// CLI: `tsx src/services/releases/upcomingReleases.ts` — manual one-off refresh.
if (import.meta.url === `file://${process.argv[1]}`) {
  dotenv.config();
  refreshUpcomingReleases()
    .then((r) => {
      console.log(
        `\n✅ Done. Fetched ${r.fetched}, inserted ${r.inserted} new, updated ${r.updated}.`,
      );
      if (r.newReleases.length) {
        console.log('\nNew releases:');
        for (const n of r.newReleases.slice(0, 20)) {
          console.log(`  • ${n.name} (${n.styleCode})${n.releaseDate ? ' — ' + n.releaseDate : ''}`);
        }
      }
    })
    .catch((err) => {
      logger.error({ err }, 'Refresh failed');
      process.exit(1);
    })
    .finally(() => closePool());
}
