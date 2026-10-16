/**
 * Style codes are written with a hyphen, a space or nothing between the parts
 * ("DD1391-100", "DD1391 100", "DD1391100") and all mean the same sneaker:
 * the colorway is part of the code. Match and dedupe on the code with those
 * separators removed. The brand is deliberately not part of the key: the same
 * shoe is stored as "Air Jordan", "Jordan" or "Nike" (a third of the 406
 * duplicate pairs merged on 2026-10-15), while real cross-brand clashes were
 * zero in 6,252 SKUs.
 *
 * skus has a UNIQUE index on STYLE_KEY_SQL, so a second spelling can never be
 * inserted; inserts use a bare ON CONFLICT DO NOTHING to reuse the row.
 */
export const STYLE_KEY_SQL = "upper(translate(style_code, '- ', ''))";

export function styleKey(code: string): string {
  return code.toUpperCase().replace(/[-\s]/g, '');
}

/**
 * The code itself plus its letter-O / zero swaps in the prefix: Nike codes
 * like "AO1696-010" are often typed "A01696-010" (and the reverse). Keeps the
 * caller's spelling (separators), uppercased; the code itself comes first.
 */
export function letterOZeroVariants(code: string): string[] {
  const c = code.toUpperCase();
  return [...new Set([c, c.replace(/^([A-Z])0/, '$1O'), c.replace(/^([A-Z])O/, '$10'), c.replace(/^([A-Z]{2})0/, '$1O')])];
}
