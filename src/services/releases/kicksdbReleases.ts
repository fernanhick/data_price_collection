import logger from '../../utils/logger.js';
import type { RawRelease } from './soleRetrieverParser.js';

/**
 * KicksDB upcoming-releases source.
 *
 * Pulls the GOAT product feed (the only KicksDB endpoint that carries a real
 * `release_date`) for the next `horizonDays`, and maps it to the same
 * `RawRelease` shape the rest of the release pipeline already consumes. This
 * replaced the SoleRetriever HTML scrape, which only ever exposed ~1 week.
 *
 * Quota-conscious by design: KicksDB's free tier is 1000 requests/month, shared
 * with the manual catalog import. A server-side date range (`> today AND
 * < today+horizon`) narrows the result so the whole 90-day window fits in two
 * paged requests (limit 100), so one sync costs exactly `pages` requests.
 */

const API_KEY = process.env.KICKSDB_API_KEY;
const API_BASE = process.env.KICKSDB_API_BASE || 'https://api.kicks.dev';
const PER_PAGE = 100; // KicksDB hard max
const MAX_PAGES = 4; // safety cap; 90d is ~2 pages today, leaves headroom

/** GOAT's date range filter only works as a string comparison on the ISO field. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Canonical style code: uppercase, whitespace → single hyphen. GOAT returns
 * skus with a space ("IM0701 001") where SoleRetriever used a hyphen
 * ("IM0701-001"); normalizing keeps our `style_code` dedup key stable across
 * sources and consistent with the catalog's canonicalization.
 */
function canonicalStyleCode(sku: string): string {
  return sku.trim().toUpperCase().replace(/\s+/g, '-');
}

function toRawRelease(p: any): RawRelease | null {
  const rawSku = typeof p?.sku === 'string' ? p.sku.trim() : '';
  if (!rawSku) return null; // unidentifiable — can't dedup, drop it
  const releaseDate =
    typeof p.release_date === 'string' ? p.release_date.slice(0, 10) : null;
  const slug = typeof p.slug === 'string' ? p.slug : '';
  return {
    styleCode: canonicalStyleCode(rawSku),
    name: String(p.name || '').trim(),
    brand: p.brand ? String(p.brand) : null,
    releaseDate,
    imageUrl: p.image_url ? String(p.image_url) : null,
    // Clean canonical GOAT URL from the slug — the API's `link` is an affiliate redirect.
    sourceUrl: slug ? `https://www.goat.com/sneakers/${slug}` : null,
  };
}

async function fetchPage(filters: string, page: number): Promise<any[]> {
  const params = new URLSearchParams({
    filters,
    limit: String(PER_PAGE),
    page: String(page),
  });
  const url = `${API_BASE}/v3/goat/products?${params}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`KicksDB GOAT releases error (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as any;
  return Array.isArray(json?.data) ? json.data : [];
}

/**
 * Fetch upcoming releases from KicksDB for the next `horizonDays`. Returns
 * deduped `RawRelease[]` sorted by release date ascending. Throws on a missing
 * key or transport error — the caller treats that like a failed scrape.
 */
export async function fetchUpcomingReleasesFromKicksDB(horizonDays = 90): Promise<RawRelease[]> {
  if (!API_KEY) throw new Error('KICKSDB_API_KEY not configured');

  const now = new Date();
  const cap = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);
  const today = isoDate(now);
  const capDate = isoDate(cap);
  // `> today` excludes already-released items; `< cap` bounds the horizon so the
  // result fits in a couple of pages. The filter narrows the pool but GOAT's
  // `release_date` is a string field, so its boundary comparison leaks a few
  // out-of-range rows — we re-check the window client-side below to be exact.
  const filters = `release_date > '${today}' AND release_date < '${capDate}'`;

  const byStyleCode = new Map<string, RawRelease>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const products = await fetchPage(filters, page);
    if (products.length === 0) break; // past the last page
    for (const p of products) {
      const r = toRawRelease(p);
      if (!r) continue;
      // Exact horizon guard: drop the past/far-future rows the string filter leaks,
      // and anything without a usable date (can't place it on a calendar).
      if (!r.releaseDate || r.releaseDate < today || r.releaseDate > capDate) continue;
      if (!byStyleCode.has(r.styleCode)) byStyleCode.set(r.styleCode, r);
    }
    if (products.length < PER_PAGE) break; // last page reached
  }

  const releases = [...byStyleCode.values()].sort((a, b) =>
    (a.releaseDate ?? '9999').localeCompare(b.releaseDate ?? '9999'),
  );
  logger.info({ count: releases.length, horizonDays }, 'Fetched upcoming releases from KicksDB');
  return releases;
}

export default fetchUpcomingReleasesFromKicksDB;
