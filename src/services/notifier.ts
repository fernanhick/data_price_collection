import logger from '../utils/logger.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const API_URL = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage` : null;

async function send(text: string): Promise<void> {
  if (!API_URL || !CHAT_ID) return;

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Telegram notification failed');
    }
  } catch (err) {
    logger.warn({ err }, 'Telegram notification error');
  }
}

const fmt = (cents: number | null) =>
  cents && cents > 0 ? `$${(cents / 100).toFixed(0)}` : null;

export const notifier = {
  // ── Scrape events ──────────────────────────────────────────────────────

  scrapeError(tier: string, error: string): Promise<void> {
    return send(`❌ <b>Scrape failed</b> — ${tier}\n<code>${error}</code>`);
  },

  scrapeComplete(tier: string, count: number, durationMs: number): Promise<void> {
    const mins = Math.round(durationMs / 60000);
    return send(`✅ <b>${tier} scrape complete</b>\n${count} SKUs · ${mins}m`);
  },

  ecmvError(error: string): Promise<void> {
    return send(`❌ <b>ECMV calculation failed</b>\n<code>${error}</code>`);
  },

  // ── Lookup events ──────────────────────────────────────────────────────

  newSneakerAdded(opts: {
    name: string;
    styleCode: string;
    source: string;
    tier: number;
    retailPriceCents: number | null;
    lowestPriceCents: number | null;
  }): Promise<void> {
    const retail = fmt(opts.retailPriceCents);
    const market = fmt(opts.lowestPriceCents);
    const priceStr = [retail ? `Retail ${retail}` : null, market ? `Market ${market}` : null]
      .filter(Boolean).join(' · ') || 'No price yet';
    return send(
      `➕ <b>New sneaker added</b>\n` +
      `${opts.name}\n` +
      `<code>${opts.styleCode}</code> · Tier ${opts.tier} · via ${opts.source}\n` +
      priceStr,
    );
  },

  priceFetchResult(opts: {
    name: string;
    styleCode: string;
    goat: { success: boolean; price?: number };
    stockx: { success: boolean; price?: number };
    ebay: { success: boolean; price?: number };
  }): Promise<void> {
    const line = (label: string, r: { success: boolean; price?: number }) =>
      r.success && r.price ? `${label}: $${r.price}` : `${label}: —`;
    return send(
      `💰 <b>Prices fetched</b>\n` +
      `${opts.name} · <code>${opts.styleCode}</code>\n` +
      `${line('GOAT', opts.goat)} · ${line('StockX', opts.stockx)} · ${line('eBay', opts.ebay)}`,
    );
  },

  lookupNotFound(styleCode: string): Promise<void> {
    return send(`⚠️ <b>Lookup not found</b>\n<code>${styleCode}</code>\nNo results on GOAT, StockX, KicksDB, or eBay`);
  },
};

export default notifier;
