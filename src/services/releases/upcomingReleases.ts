import dotenv from 'dotenv';
import { fetchUrl } from '../../utils/http.js';
import { query as dbQuery, closePool } from '../../db/index.js';
import logger from '../../utils/logger.js';
import { parseReleases, RawRelease } from './soleRetrieverParser.js';

const SOURCE = 'soleretriever';
const RELEASES_URL =
  process.env.RELEASES_SOURCE_URL || 'https://www.soleretriever.com/sneaker-release-dates';

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
}

/**
 * Fetch the source release calendar, parse it, and dedup-upsert into
 * `upcoming_releases`. Returns counts plus the records that were newly
 * inserted (i.e. genuinely new drops) so callers can notify on them.
 */
export async function refreshUpcomingReleases(): Promise<RefreshResult> {
  const html = await fetchUrl(RELEASES_URL, { retries: 3 });
  const releases = parseReleases(html);

  // An empty parse almost always means a block or a layout change, not "no
  // releases" — fail loudly rather than silently wiping our freshness signal.
  if (releases.length === 0) {
    throw new Error('No releases parsed from source (possible block or layout change)');
  }

  let inserted = 0;
  let updated = 0;
  const newReleases: RawRelease[] = [];

  for (const r of releases) {
    const res = await dbQuery<{ inserted: boolean }>(
      `INSERT INTO upcoming_releases
         (style_code, name, brand, release_date, image_url, source_url, source, last_seen_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (style_code) DO UPDATE SET
         name = EXCLUDED.name,
         brand = EXCLUDED.brand,
         release_date = EXCLUDED.release_date,
         image_url = EXCLUDED.image_url,
         source_url = EXCLUDED.source_url,
         last_seen_at = NOW(),
         updated_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [r.styleCode, r.name, r.brand, r.releaseDate, r.imageUrl, r.sourceUrl, SOURCE],
    );

    if ((res.rows[0] as any)?.inserted) {
      inserted++;
      newReleases.push(r);
    } else {
      updated++;
    }
  }

  logger.info({ fetched: releases.length, inserted, updated }, '✅ Upcoming releases refreshed');
  return { fetched: releases.length, inserted, updated, newReleases };
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
