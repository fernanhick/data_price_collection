import { query } from '../../db/index.js';
import logger from '../../utils/logger.js';

const TOKEN_URL = 'https://accounts.stockx.com/oauth/token';

interface StockXTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

let cached: StockXTokens | null = null;

async function loadFromDb(): Promise<StockXTokens | null> {
  try {
    const result = await query(
      `SELECT key, value FROM app_tokens WHERE key IN ('stockx_access_token', 'stockx_refresh_token', 'stockx_expires_at')`,
    );

    const map: Record<string, string> = {};
    for (const row of result.rows) {
      map[row.key] = row.value;
    }

    if (!map.stockx_access_token || !map.stockx_refresh_token) return null;

    return {
      accessToken: map.stockx_access_token,
      refreshToken: map.stockx_refresh_token,
      expiresAt: map.stockx_expires_at ? new Date(map.stockx_expires_at) : new Date(0),
    };
  } catch {
    return null;
  }
}

async function saveToDb(tokens: StockXTokens): Promise<void> {
  const pairs: [string, string][] = [
    ['stockx_access_token', tokens.accessToken],
    ['stockx_refresh_token', tokens.refreshToken],
    ['stockx_expires_at', tokens.expiresAt.toISOString()],
  ];

  for (const [key, value] of pairs) {
    await query(
      `INSERT INTO app_tokens (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, value],
    );
  }
}

async function doRefresh(): Promise<StockXTokens> {
  if (!cached?.refreshToken) throw new Error('No StockX refresh token available');

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.STOCKX_CLIENT_ID || '',
      client_secret: process.env.STOCKX_CLIENT_SECRET || '',
      refresh_token: cached.refreshToken,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`StockX token refresh failed (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as any;
  const tokens: StockXTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || cached.refreshToken,
    expiresAt: new Date(Date.now() + (data.expires_in || 43200) * 1000),
  };

  cached = tokens;
  await saveToDb(tokens);
  logger.info('StockX access token refreshed');
  return tokens;
}

export async function getAccessToken(): Promise<string> {
  if (!cached) {
    cached = await loadFromDb();
  }

  if (!cached) {
    throw new Error('StockX not authenticated — visit GET /api/auth/stockx to authorize');
  }

  // Refresh if within 5 minutes of expiry
  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() >= cached.expiresAt.getTime() - fiveMinutes) {
    await doRefresh();
  }

  return cached!.accessToken;
}

export async function storeTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
): Promise<void> {
  const tokens: StockXTokens = {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
  cached = tokens;
  await saveToDb(tokens);
  logger.info('StockX tokens stored');
}

export function clearCachedTokens(): void {
  cached = null;
}
