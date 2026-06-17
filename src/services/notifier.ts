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

export const notifier = {
  scrapeError(tier: string, error: string): Promise<void> {
    return send(`❌ <b>Scrape failed</b> — ${tier}\n<code>${error}</code>`);
  },

  scrapeComplete(tier: string, count: number, durationMs: number): Promise<void> {
    const mins = Math.round(durationMs / 60000);
    return send(`✅ <b>${tier} scrape complete</b>\n${count} SKUs in ${mins}m`);
  },

  ecmvError(error: string): Promise<void> {
    return send(`❌ <b>ECMV calculation failed</b>\n<code>${error}</code>`);
  },
};

export default notifier;
