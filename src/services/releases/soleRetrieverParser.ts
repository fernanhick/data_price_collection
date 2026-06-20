import * as cheerio from 'cheerio';
import { cleanImageUrl } from '../../utils/imageUrl.js';

/**
 * SoleRetriever release-calendar parser.
 *
 * Pure HTML → records: no network, no DB, no app dependencies. SoleRetriever
 * embeds upcoming releases as schema.org JSON-LD (a CollectionPage whose
 * mainEntity is an ItemList of Product nodes), which is stable SEO markup.
 *
 * Kept dependency-free on purpose so the exact same extraction logic can be
 * lifted into a standalone Apify actor untouched if we ever get IP-blocked.
 */

export interface RawRelease {
  styleCode: string; // schema.org "sku" — our dedup key
  name: string;
  brand: string | null;
  releaseDate: string | null; // YYYY-MM-DD
  imageUrl: string | null;
  sourceUrl: string | null;
}

/** Recursively collect any ItemList nodes whose elements look like Products. */
function collectProductLists(node: unknown, out: any[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) collectProductLists(n, out);
    return;
  }
  const obj = node as Record<string, any>;
  if (obj['@type'] === 'ItemList' && Array.isArray(obj.itemListElement)) {
    const first = obj.itemListElement[0];
    const product = first && (first.item || first);
    if (product && product.sku) out.push(obj);
  }
  for (const key of Object.keys(obj)) collectProductLists(obj[key], out);
}

function extractImage(image: any): string | null {
  if (!image) return null;
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) return extractImage(image[0]);
  return image.url || null;
}

function extractBrand(brand: any): string | null {
  if (!brand) return null;
  if (typeof brand === 'string') return brand;
  return brand.name || null;
}

export function parseReleases(html: string): RawRelease[] {
  const $ = cheerio.load(html);
  const releases: RawRelease[] = [];
  const seen = new Set<string>();

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return; // skip malformed blocks rather than failing the whole parse
    }

    const lists: any[] = [];
    collectProductLists(json, lists);

    for (const list of lists) {
      for (const li of list.itemListElement) {
        const p = li.item || li;
        if (!p || !p.sku) continue;

        const styleCode = String(p.sku).trim();
        if (!styleCode || seen.has(styleCode)) continue;
        seen.add(styleCode);

        const releaseDate =
          typeof p.releaseDate === 'string' ? p.releaseDate.slice(0, 10) : null;
        const sourceUrl = String(p['@id'] || p.url || '').replace(/#product$/, '') || null;

        releases.push({
          styleCode,
          name: String(p.name || '').trim(),
          brand: extractBrand(p.brand),
          releaseDate,
          imageUrl: cleanImageUrl(extractImage(p.image)) || null,
          sourceUrl,
        });
      }
    }
  });

  return releases;
}

export default parseReleases;
