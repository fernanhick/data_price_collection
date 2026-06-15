/**
 * Different scraper sources (GOAT, StockX, KicksDB) report the same brand under
 * inconsistent names/casing (e.g. "Air Jordan" vs "Jordan", "Adidas" vs "adidas").
 * Normalize to a single canonical value so the catalog doesn't fragment by source.
 */
const BRAND_ALIASES: Record<string, string> = {
  'air jordan': 'Jordan',
  adidas: 'Adidas',
};

export function normalizeBrand(brand: string): string {
  return BRAND_ALIASES[brand.toLowerCase()] || brand;
}
