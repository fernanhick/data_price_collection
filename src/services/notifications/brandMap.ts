/**
 * Canonical push-target brand mapping for the Convex releases ingest.
 *
 * Convex targets pushes by an EXACT, case-insensitive match against the app's
 * fixed brand-chip set. This is the SINGLE source of that mapping for the
 * scraper — keep it here so it never drifts from the app's chips. It is
 * deliberately separate from `utils/brand.ts` (the catalog's brand
 * canonicalization, e.g. "Adidas"/"Jordan"), which uses a different taxonomy.
 *
 * Rules (see ingest contract):
 * - Map every raw scraper brand to one of CANONICAL before sending.
 * - A brand not in the list is still sent (shows in the catalog) but won't be
 *   brand-targeted — so we return the original string rather than dropping it.
 */

// Exact app brand chips. Casing matters for display but match is case-insensitive.
export const CANONICAL_BRANDS = [
  'Jordan',
  'Nike',
  'adidas',
  'Yeezy',
  'New Balance',
  'ASICS',
  'Puma',
  'Converse',
  'Vans',
  'Reebok',
] as const;

// Lowercased alias → canonical. Extend as new raw brand strings appear.
const ALIASES: Record<string, string> = {
  // Jordan
  'jordan': 'Jordan',
  'air jordan': 'Jordan',
  'jordan brand': 'Jordan',
  'aj': 'Jordan',
  // Nike
  'nike': 'Nike',
  'nike sportswear': 'Nike',
  'nike sb': 'Nike',
  'nikelab': 'Nike',
  // adidas
  'adidas': 'adidas',
  'adidas originals': 'adidas',
  // Yeezy (split out from adidas — targeted separately)
  'yeezy': 'Yeezy',
  'adidas yeezy': 'Yeezy',
  // New Balance
  'new balance': 'New Balance',
  'nb': 'New Balance',
  // ASICS
  'asics': 'ASICS',
  'onitsuka tiger': 'ASICS',
  // straight-through
  'puma': 'Puma',
  'converse': 'Converse',
  'vans': 'Vans',
  'reebok': 'Reebok',
};

/**
 * Map a raw scraper brand to the canonical push-target value. Returns null only
 * for an empty input; an unrecognized brand is returned trimmed (catalog-only,
 * not brand-targeted) rather than dropped.
 */
export function mapPushBrand(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  if (ALIASES[key]) return ALIASES[key];
  const canonical = CANONICAL_BRANDS.find((b) => b.toLowerCase() === key);
  return canonical ?? raw.trim();
}

export default mapPushBrand;
