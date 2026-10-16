import { query as dbQuery } from '../../db/index.js';
import { STYLE_KEY_SQL, letterOZeroVariants, styleKey } from '../../db/styleCode.js';
import logger from '../../utils/logger.js';
import { parseName } from '../../utils/sneakerName.js';
import { GoatScraper } from '../scrapers/goat.js';
import { KicksDBScraper } from '../scrapers/kicksdb.js';
import { matchScore } from '../scrapers/stockxMatch.js';

/**
 * Automatic verification of a user's catalog submission (a sneaker the user
 * added that our catalog didn't have). No manual review: every outcome is
 * approved, rejected or unverified, always with a reason the user is shown.
 *
 *   1. Code format: no real style code ("\", "BLACK", "1234") -> rejected.
 *   2. Exact code, in our catalog (link) or on GOAT / KicksDB (StockX's
 *      catalog), also trying the letter-O / zero swap typed in Nike codes.
 *      Exact means the code with separators removed is equal: never a
 *      marketplace's first search result.
 *   3. Typo: GOAT searched by the typed name; a result whose code is one
 *      edit (or two swapped characters) from the typed one is the same shoe.
 *   4. Otherwise unverified: re-checked later, then AI review.
 */

export type Decision = 'approved' | 'rejected' | 'unverified';

export interface CatalogEntry {
  style_code: string;
  brand: string;
  model: string;
  colorway: string;
  retail_price: number | null;
  image_url: string | null;
}

export interface Verification {
  decision: Decision;
  /** Shown to the user. */
  reason: string;
  /** The code to file it under; differs from the submitted one after a typo fix. */
  styleCode: string;
  correctedFrom?: string;
  verifiedBy?: 'catalog' | 'goat' | 'kicksdb' | 'goat-typo';
  catalogEntry?: CatalogEntry;
  /** True when the entry is already in our catalog (nothing to insert). */
  alreadyInCatalog?: boolean;
  evidence: { checked: string[]; closest?: { styleCode: string; name: string; codeDistance: number; nameScore: number } };
}

export interface SubmissionInput {
  brand: string;
  model: string;
  colorway: string;
  styleCode: string;
  /** 0 on the first check; re-checks count up (KicksDB only on 0 and every 7th). */
  attempt?: number;
  /** The caller can file the entry under a corrected code. */
  supportsCorrection?: boolean;
}

const goat = new GoatScraper();
const kicksdb = new KicksDBScraper();

// Same brand under different names on marketplaces and in user input.
const BRAND_FAMILIES: [string, RegExp][] = [
  ['nike', /\b(nike|jordan|air jordan|converse)\b/i],
  ['adidas', /\b(adidas|yeezy|yzy)\b/i],
  ['asics', /\b(asics|onitsuka)\b/i],
  ['newbalance', /\bnew\s*balance\b/i],
  ['puma', /\bpuma\b/i],
  ['reebok', /\breebok\b/i],
  ['vans', /\bvans\b/i],
  ['timberland', /\btimberland\b/i],
];
export function brandFamily(brand: string | null | undefined): string {
  const b = brand ?? '';
  return BRAND_FAMILIES.find(([, re]) => re.test(b))?.[0] ?? b.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Optimal string alignment distance: edits plus swaps of two neighbours. */
export function codeDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Why the code can't be a style code, or null when it plausibly is one. */
export function formatProblem(code: string): string | null {
  const k = styleKey(code);
  if (k.length < 5) return 'too short';
  if (!/\d/.test(k)) return 'no digits';
  if (/^(.)\1+$/.test(k)) return 'one repeated character';
  if ('0123456789'.includes(k) || '9876543210'.includes(k)) return 'a number sequence';
  return null;
}

const INVALID_CODE_REASON =
  "That doesn't look like a style code, so we couldn't check it. The style code is printed on the label inside the tongue or on the box (for example DD1391-100 or GY7657).";

/** "AO4550" typed as "A04550" (and the reverse): letter O and zero in the prefix. */
function codeVariants(code: string): string[] {
  return letterOZeroVariants(styleKey(code));
}

function fromGoatName(name: string, brand: string, styleCode: string, retailCents: number | null, image: string | null): CatalogEntry {
  const { model, colorway } = parseName(name, brand);
  return { style_code: styleCode, brand, model, colorway, retail_price: retailCents ? retailCents / 100 : null, image_url: image };
}

/** Does what the user typed describe this product? Empty or "null" models count as "no information". */
function detailsAgree(input: SubmissionInput, productName: string, productBrand: string): { ok: boolean; score: number } {
  const model = /^(null|undefined|-)?$/i.test(input.model.trim()) ? '' : input.model;
  const score = matchScore({ model, colorway: input.colorway }, productName);
  const brandOk = brandFamily(input.brand) === brandFamily(productBrand);
  // Little to compare (no model): trust the exact code. Otherwise the typed
  // name must at least partly agree, or it may be a code of another shoe.
  return { ok: score < 0 || !model || score >= 0.4 || (brandOk && score >= 0.25), score };
}

export async function verifySubmission(input: SubmissionInput): Promise<Verification> {
  const submitted = input.styleCode.trim();
  const checked: string[] = [];
  const attempt = input.attempt ?? 0;

  // 1. Format
  const problem = formatProblem(submitted);
  if (problem) {
    return { decision: 'rejected', reason: INVALID_CODE_REASON, styleCode: submitted, evidence: { checked: [`format: ${problem}`] } };
  }

  for (const variant of codeVariants(submitted)) {
    const corrected = variant !== styleKey(submitted);
    if (corrected && !input.supportsCorrection) continue;

    // 2a. Our catalog
    checked.push(`catalog:${variant}`);
    const row = (
      await dbQuery<CatalogEntry>(
        `SELECT style_code, brand, model, colorway, retail_price, COALESCE(image_local_path, image_url) AS image_url
         FROM skus WHERE ${STYLE_KEY_SQL} = $1`,
        [variant],
      )
    ).rows[0];
    if (row) {
      return {
        decision: 'approved',
        reason: corrected ? `Found under the style code ${row.style_code} (we corrected a typo).` : 'Already in our catalog.',
        styleCode: row.style_code,
        ...(corrected ? { correctedFrom: submitted } : {}),
        verifiedBy: 'catalog',
        catalogEntry: row,
        alreadyInCatalog: true,
        evidence: { checked },
      };
    }

    // 2b. GOAT, exact code only
    checked.push(`goat:${variant}`);
    const hits = await goat.searchForDiscovery(variant, 10).catch((e) => {
      logger.warn({ variant, error: e instanceof Error ? e.message : String(e) }, 'Verifier: GOAT search failed');
      return [];
    });
    const exact = hits.find((h) => styleKey(h.sku) === variant);
    if (exact) {
      const agree = detailsAgree(input, exact.name, exact.brand);
      if (!agree.ok) {
        return {
          decision: 'unverified',
          reason: `The style code belongs to "${exact.name}", which doesn't look like the sneaker you described.`,
          styleCode: exact.sku || submitted,
          evidence: { checked, closest: { styleCode: exact.sku, name: exact.name, codeDistance: 0, nameScore: agree.score } },
        };
      }
      const code = exact.sku || submitted;
      return {
        decision: 'approved',
        reason: corrected ? `Verified on GOAT as ${code} (we corrected a typo).` : 'Verified on GOAT.',
        styleCode: code,
        ...(corrected ? { correctedFrom: submitted } : {}),
        verifiedBy: 'goat',
        catalogEntry: fromGoatName(exact.name, exact.brand, code, exact.retailPriceCents, exact.imageUrl || null),
        evidence: { checked },
      };
    }

    // 2c. KicksDB (StockX's catalog): free quota, so first check + weekly
    if (attempt === 0 || attempt % 7 === 0) {
      checked.push(`kicksdb:${variant}`);
      const k = (await kicksdb.searchByStyleCode(variant, 5).catch(() => [])).find((x) => styleKey(x.styleId) === variant);
      if (k) {
        const agree = detailsAgree(input, `${k.name} ${k.colorway}`, k.brand);
        if (agree.ok) {
          const model = k.name.replace(new RegExp(`^${k.brand}\\s+`, 'i'), '').trim();
          return {
            decision: 'approved',
            reason: corrected ? `Verified on StockX as ${k.styleId} (we corrected a typo).` : 'Verified on StockX.',
            styleCode: k.styleId,
            ...(corrected ? { correctedFrom: submitted } : {}),
            verifiedBy: 'kicksdb',
            catalogEntry: { style_code: k.styleId, brand: k.brand, model, colorway: k.colorway, retail_price: k.retailPrice, image_url: k.imageUrl || null },
            evidence: { checked },
          };
        }
      }
    }
  }

  // 3. Typo: search GOAT by the typed name, accept a code one edit away
  const model = /^(null|undefined|-)?$/i.test(input.model.trim()) ? '' : input.model;
  const queryText = `${model} ${input.colorway}`.replace(/\s+/g, ' ').trim();
  let closest: Verification['evidence']['closest'];
  if (queryText) {
    checked.push(`goat-name:${queryText}`);
    const hits = await goat.searchForDiscovery(queryText, 10).catch(() => []);
    const ranked = hits
      .map((h) => ({ h, nameScore: matchScore({ model, colorway: input.colorway }, h.name), dist: codeDistance(styleKey(submitted), styleKey(h.sku)) }))
      .filter((x) => x.nameScore >= 0.6 && brandFamily(x.h.brand) === brandFamily(input.brand))
      .sort((a, b) => a.dist - b.dist || b.nameScore - a.nameScore);
    const best = ranked[0];
    if (best) closest = { styleCode: best.h.sku, name: best.h.name, codeDistance: best.dist, nameScore: best.nameScore };
    if (best && best.dist <= 1 && input.supportsCorrection) {
      return {
        decision: 'approved',
        reason: `Verified on GOAT as ${best.h.sku}: the code you entered looks like a typo of it.`,
        styleCode: best.h.sku,
        correctedFrom: submitted,
        verifiedBy: 'goat-typo',
        catalogEntry: fromGoatName(best.h.name, best.h.brand, best.h.sku, best.h.retailPriceCents, best.h.imageUrl || null),
        evidence: { checked, closest },
      };
    }
  }

  // 4. Unverified
  return {
    decision: 'unverified',
    reason: "We couldn't find this style code on GOAT or StockX yet. New releases can take a few days to appear; we'll keep checking.",
    styleCode: submitted,
    evidence: { checked, ...(closest ? { closest } : {}) },
  };
}
