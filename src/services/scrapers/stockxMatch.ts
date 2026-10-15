/**
 * Pick the StockX search result that is actually our sneaker.
 *
 * StockX search is a similarity search: a style code returns the shoe plus
 * lookalikes, and for a code StockX doesn't carry it returns only lookalikes.
 * Search results carry no style code, so we match on words instead: the share
 * of our model + colorway words found in the result's title. The best result
 * wins (StockX's order breaks ties); below the threshold nothing matches, and
 * a match that has no ask means "no StockX price", not "take the next one".
 */

export const MIN_MATCH_SCORE = 0.6;

const STOP_WORDS = new Set(['x', 'the', 'and', 'of', 'a', 'to', 'in', 'with', 'for', 'by']);

export function nameTokens(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP_WORDS.has(t));
}

export interface MatchTarget {
  model?: string | null;
  colorway?: string | null;
}

export interface MatchCandidate {
  name: string;
  lowestAsk: number | null;
  // StockX productCategory: "sneakers" for all footwear (slides, mules and
  // boots included), "streetwear" for apparel, then collectibles, handbags,
  // watches, trading cards... null when the page didn't say.
  category?: string | null;
}

// Our catalog has no reliable category (mostly empty), but a few dozen SKUs
// are apparel or accessories. Recognise them by name.
const NON_FOOTWEAR = new RegExp(
  '\\b(hoodie|hoody|tee|t-shirt|tshirt|shirt|polo|jersey|jacket|vest|sweatshirt|sweater|crewneck|pullover|' +
    'pants|trousers|shorts|joggers|sweatpants|leggings|socks?|cap|hat|beanie|bucket hat|gloves|scarf|' +
    'bag|backpack|tote|wallet|keychain|watch|figure|poster|lego)\\b',
  'i',
);

// Shoe words that win over the list above: "LEGO x UltraBoost", "Nardwuar x
// Dunk Low SB Tam O'Shanter Hat" are shoes.
const FOOTWEAR = /\b(ultra ?boost|boost|dunk|air max|air force|chuck|retro|yeezy|foamposite|sneakers?|shoes?|slides?|clogs?|boots?|trainers?|runners?)\b/i;

/**
 * "sneakers" for footwear SKUs (the default), "other" for apparel and
 * accessories. Looks at the model only: colorways name shoes after clothes
 * ("Cap and Gown", "Lucky Shorts", "Christmas Sweater", "Bag Lady").
 */
export function expectedCategory(target: MatchTarget | undefined): 'sneakers' | 'other' {
  const model = target?.model ?? '';
  return NON_FOOTWEAR.test(model) && !FOOTWEAR.test(model) ? 'other' : 'sneakers';
}

/**
 * Never price a shoe with a non-shoe (or the reverse). Results without a
 * category (older markup) are let through to the name match.
 */
export function categoryAllowed(expected: 'sneakers' | 'other', category: string | null | undefined): boolean {
  if (!category) return true;
  return expected === 'sneakers' ? category === 'sneakers' : category !== 'sneakers';
}

export interface MatchResult<T> {
  best: T | null;
  score: number;
}

// Words that say nothing about which colorway it is. Our colorway field also
// holds split-off leftovers like "07" from "Air Force 1 '07".
const NON_COLOR_WORDS = new Set([
  'pack', 'edition', 'premium', 'prm', 'se', 'qs', 'og', 'sp', 'lv8', 'retro', 'low', 'mid', 'high', 'nrg', 'tier',
]);

/** One edit apart (insert, delete or substitute a letter). */
function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Same word, allowing a plural "s" and, for long words, one typo. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return false;
  if (a + 's' === b || b + 's' === a) return true;
  return a.length >= 6 && b.length >= 6 && oneEditApart(a, b);
}

/** Score 0..1, or -1 when the target has no words to match on. */
export function matchScore(target: MatchTarget, title: string): number {
  const ours = [...new Set([...nameTokens(target.model), ...nameTokens(target.colorway)])];
  if (ours.length === 0) return -1;
  const theirs = nameTokens(title);
  const found = (t: string) => theirs.some((w) => sameWord(t, w));
  // A colorway we know must show up at least once, or two colorways of the
  // same model ("Dunk Low Panda" vs "Dunk Low UNC") would match each other.
  const colorway = [...new Set(nameTokens(target.colorway))].filter(
    (t) => t.length >= 3 && !/^\d+$/.test(t) && !NON_COLOR_WORDS.has(t),
  );
  if (colorway.length > 0 && !colorway.some(found)) return 0;
  return ours.filter(found).length / ours.length;
}

// Size range. StockX lists kids' versions as separate products with the same
// name plus a suffix, "Jordan 9 Retro OG Space Jam (2026) (GS)", at very
// different prices (adult $207, GS $130, PS $57). Titles: only that suffix
// counts, so a "Baby Blue" colorway is not a baby shoe. Our SKUs: the model,
// when it says so ("Air Force 1 Highness GS"); most kids' SKUs don't.
type KidSize = 'gs' | 'ps' | 'td' | 'kids';

const TITLE_KID_SUFFIX: [KidSize, RegExp][] = [
  ['gs', /\((gs|youth|big kids?)\)/i],
  ['ps', /\((ps|preschool|little kids?)\)/i],
  ['td', /\((td|toddler|infants?|i)\)/i],
  ['kids', /\(kids?\)/i],
];
// No bare "kid"/"youth": "Kid Cudi x Torsion", "Beauty & Youth x Samba".
const MODEL_KID_WORDS: [KidSize, RegExp][] = [
  ['gs', /\b(gs|grade school|big kids?)\b/i],
  ['ps', /\b(ps|pre-?school|little kids?)\b/i],
  ['td', /\b(td|toddlers?|infants?|crib)\b/i],
  ['kids', /\bkids\b/i],
];
const TITLE_WOMENS = /\(women'?s\)/i;
const MODEL_WOMENS = /\b(wmns|womens|women'?s)\b/i;

function kidSize(text: string, patterns: [KidSize, RegExp][]): KidSize | null {
  return patterns.find(([, re]) => re.test(text))?.[0] ?? null;
}

/**
 * A kids' listing only for the same kids' size; adult SKUs never take one.
 * Our size range is in the model ("1 Mid GS") or, from how names were split,
 * a suffix on the colorway ("Medium Olive (GS)").
 */
export function sizeRangeAllowed(target: MatchTarget, title: string): boolean {
  const ours =
    kidSize(target.model ?? '', MODEL_KID_WORDS) ?? kidSize(target.colorway ?? '', TITLE_KID_SUFFIX);
  const theirs = kidSize(title, TITLE_KID_SUFFIX);
  // No colorway and no size marker: we can't tell, and StockX's ranking for
  // the exact style code (often a GS listing) beats any adult lookalike.
  if (ours === null && !target.colorway?.trim()) return true;
  if (ours === null) return theirs === null;
  if (ours === 'kids' || theirs === 'kids') return theirs !== null;
  return ours === theirs;
}

export function pickMatch<T extends MatchCandidate>(target: MatchTarget, candidates: T[]): MatchResult<T> {
  let best: T | null = null;
  let bestScore = 0;
  // Women's is only a tie-break: many women's-only releases sit in our
  // catalog without "Wmns", so a hard rule would block them for good.
  const oursWomens = MODEL_WOMENS.test(target.model ?? '');
  for (const c of candidates) {
    let score = matchScore(target, c.name);
    if (score < 0) {
      // Nothing to match on: keep the old behaviour, first result with a price.
      const first = candidates.find((x) => x.lowestAsk && x.lowestAsk > 0) ?? null;
      return { best: first, score: -1 };
    }
    if (!sizeRangeAllowed(target, c.name)) continue;
    if (TITLE_WOMENS.test(c.name) !== oursWomens) score -= 0.001;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return bestScore >= MIN_MATCH_SCORE ? { best, score: bestScore } : { best: null, score: bestScore };
}
