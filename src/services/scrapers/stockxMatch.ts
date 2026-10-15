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

export function pickMatch<T extends MatchCandidate>(target: MatchTarget, candidates: T[]): MatchResult<T> {
  let best: T | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = matchScore(target, c.name);
    if (score < 0) {
      // Nothing to match on: keep the old behaviour, first result with a price.
      const first = candidates.find((x) => x.lowestAsk && x.lowestAsk > 0) ?? null;
      return { best: first, score: -1 };
    }
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return bestScore >= MIN_MATCH_SCORE ? { best, score: bestScore } : { best: null, score: bestScore };
}
