/**
 * Split a marketplace product name into our catalog's model and colorway.
 * GOAT writes "<partner x >Brand Model 'Colorway'< year>": the colorway is
 * the quoted part at the END. The old version took the first pair of
 * apostrophes, so "Puma Men's MB.03 'Spark'" became model "MenSpark'",
 * colorway "s MB.03 " (and "Air Force 1 Low '07 'Ice Blue'" broke the same
 * way). The year stays in the model, as before ("1 Retro High OG 2016").
 */
const ESCAPE = /[.*+?^${}()|[\]\\]/g;

export function parseName(name: string, brand: string): { model: string; colorway: string } {
  const quoted = name.match(/\s['‘’"]([^'‘’"]+)['‘’"](\s+\d{4})?\s*$/);
  const colorway = quoted ? quoted[1].trim() : '';
  let clean = quoted ? name.slice(0, quoted.index) + (quoted[2] ?? '') : name;
  if (brand) clean = clean.replace(new RegExp(brand.replace(ESCAPE, '\\$&'), 'i'), '');
  // GOAT prefixes some men's products "Men's"; men's is our default (women's
  // keeps its "Wmns", which matters for matching and sizing).
  clean = clean.replace(/\s+/g, ' ').trim().replace(/^Men['’]s\s+/i, '');
  return { model: clean || name, colorway };
}
