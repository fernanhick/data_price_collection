/**
 * Image URL quality helpers.
 *
 * Sources (notably GOAT's Algolia feed) return a fixed placeholder / "no photo"
 * graphic when they have no real product image. These are valid image files that
 * render as a blank/white box in the app, which cannot distinguish them from a
 * real photo. We must drop them at the source so they never get stored or served.
 */

/**
 * Known placeholder substrings that appear in source image URLs. Matching is
 * case-insensitive against the full URL. Keep this list conservative — it should
 * only catch unambiguous "no image" assets, never real product photos.
 */
const PLACEHOLDER_URL_PATTERNS: RegExp[] = [
  /\/placeholders?\//, // GOAT: image.goat.com/375/placeholders/product_templates/...
  /\/missing\.[a-z]+(\?|$)/, // GOAT: .../missing.png
  /placeholder/,
  /no[-_]?image/,
  /coming[-_]?soon/,
  /\bdefault\b/,
  /\bblank\b/,
  /\bspacer\b/,
  /1x1/,
  /\bpixel\b/,
];

/**
 * Returns true when an image URL is unusable as a real product photo: empty,
 * not http(s), or a known placeholder asset.
 */
export function isPlaceholderImageUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  if (!/^https?:\/\//i.test(url)) return true;

  const lower = url.toLowerCase();
  return PLACEHOLDER_URL_PATTERNS.some((re) => re.test(lower));
}

/**
 * Returns the URL if it's a real product photo, otherwise an empty string.
 * Use when populating an `imageUrl` field that should be omitted when not real.
 */
export function cleanImageUrl(url: string | null | undefined): string {
  return isPlaceholderImageUrl(url) ? '' : (url as string);
}
