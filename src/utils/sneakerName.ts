/**
 * Split a marketplace product name into our catalog's model and colorway.
 * GOAT writes "<partner x >Brand Model 'Colorway'< year>": the colorway is
 * the quoted part at the END, opened by the last space+quote. That keeps
 * apostrophes inside it ('I'm Back', 'Keepin' it Running', 'World's Fair')
 * and year marks in the model (Blazer Mid '77, Air Force 1 '07, '86 OG).
 * The old version took the first pair of apostrophes, so
 * "Puma Men's MB.03 'Spark'" became model "MenSpark'", colorway "s MB.03 ".
 * The release year stays in the model, as before ("1 Retro High OG 2016").
 */
const ESCAPE = /[.*+?^${}()|[\]\\]/g;
const QUOTE = `'‘’"`;

export function parseName(name: string, brand: string): { model: string; colorway: string } {
  let rest = name.trim();
  let year = '';
  const y = rest.match(/\s+(\d{4})$/);
  if (y && QUOTE.includes(rest[rest.length - y[0].length - 1] ?? '')) {
    year = ` ${y[1]}`;
    rest = rest.slice(0, -y[0].length);
  }

  let model = name.trim();
  let colorway = '';
  if (QUOTE.includes(rest[rest.length - 1] ?? '')) {
    let open = -1;
    for (const q of QUOTE) open = Math.max(open, rest.lastIndexOf(` ${q}`, rest.length - 2));
    if (open >= 0) {
      colorway = rest.slice(open + 2, -1).trim();
      model = rest.slice(0, open) + year;
    }
  }

  if (brand) model = model.replace(new RegExp(brand.replace(ESCAPE, '\\$&'), 'i'), '');
  // GOAT prefixes some men's products "Men's"; men's is our default (women's
  // keeps its "Wmns", which matters for matching and sizing).
  model = model.replace(/\s+/g, ' ').trim().replace(/^Men['’]s\s+/i, '');
  return { model: model || name, colorway };
}
