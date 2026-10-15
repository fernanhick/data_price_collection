import dotenv from 'dotenv';
import { AppConfig, ReleasesIngestTarget } from '../types/index.js';

// Load environment variables
dotenv.config();

// Select Convex/Clerk instance based on CONVEX_ENV (default: NODE_ENV)
const convexEnv = process.env.CONVEX_ENV || process.env.NODE_ENV || 'development';
const convexUrl = convexEnv === 'production'
  ? (process.env.CONVEX_URL_PROD || process.env.CONVEX_URL || '')
  : (process.env.CONVEX_URL_DEV  || process.env.CONVEX_URL || '');
const convexJwksUrl = convexEnv === 'production'
  ? (process.env.CONVEX_JWKS_URL_PROD || process.env.CONVEX_JWKS_URL || '')
  : (process.env.CONVEX_JWKS_URL_DEV  || process.env.CONVEX_JWKS_URL || '');
if (convexEnv !== 'development') {
  console.log(`🔐 Convex env: ${convexEnv}`);
}

// Convex releases-ingest endpoints. Push delivery (device tokens, opt-ins, Expo
// fan-out) lives entirely in Convex now; the server just POSTs new drops here.
//
// We notify EVERY fully-configured deployment, not just the CONVEX_ENV-selected
// one. That lets dev run alongside prod: set both the *_DEV and *_PROD pairs and
// new drops fan out to both, so you can test pushes in a dev build without
// taking the live prod notifier offline. A pair counts only if its URL *and*
// secret are present; unset pairs are skipped. The bare CONVEX_RELEASES_INGEST_URL
// pair is kept as a single-deployment fallback and labelled with the active env.
function buildIngestTargets(): ReleasesIngestTarget[] {
  const candidates: ReleasesIngestTarget[] = [
    { label: 'prod', url: process.env.CONVEX_RELEASES_INGEST_URL_PROD || '', secret: process.env.RELEASES_INGEST_SECRET_PROD || '' },
    { label: 'dev',  url: process.env.CONVEX_RELEASES_INGEST_URL_DEV  || '', secret: process.env.RELEASES_INGEST_SECRET_DEV  || '' },
    { label: convexEnv, url: process.env.CONVEX_RELEASES_INGEST_URL || '', secret: process.env.RELEASES_INGEST_SECRET || '' },
  ];
  const seen = new Set<string>();
  const targets: ReleasesIngestTarget[] = [];
  for (const t of candidates) {
    if (!t.url || !t.secret) continue;   // only fully-configured pairs
    if (seen.has(t.url)) continue;       // dedup if the same URL is set twice
    seen.add(t.url);
    targets.push(t);
  }
  return targets;
}
const releasesIngestTargets = buildIngestTargets();

// Select database based on DB_TARGET: 'local' (default) or 'ec2'
const dbTarget = process.env.DB_TARGET || 'local';
const databaseUrl = dbTarget === 'ec2'
  ? (process.env.DATABASE_URL_EC2 || process.env.DATABASE_URL || 'postgresql://localhost/sneaker_prices')
  : (process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL || 'postgresql://localhost/sneaker_prices');

if (dbTarget !== 'local') {
  console.log(`🎯 Database target: ${dbTarget}`);
}

const config: AppConfig = {
  nodeEnv: (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test',
  port: parseInt(process.env.PORT || '3000', 10),
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',

  database: {
    url: databaseUrl,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'sneaker_prices',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },

  convex: {
    url: convexUrl,
    jwksUrl: convexJwksUrl,
  },

  releasesNotifier: {
    targets: releasesIngestTargets,
  },

  scraper: {
    timeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '10000', 10),
    retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3', 10),
    proxyUrl: process.env.SCRAPER_PROXY_URL || undefined,
    // StockX only. StockX blocks datacenter (AWS) traffic, so its browser can
    // exit through a residential connection, e.g. socks5://127.0.0.1:1080 from
    // the reverse SSH tunnel the home VPS keeps open. Falls back to proxyUrl.
    stockxProxyUrl: process.env.STOCKX_PROXY_URL || undefined,
    // Persistent Chrome profile so StockX sees a returning visitor (cookies)
    // instead of a brand-new browser on every search.
    stockxProfileDir: process.env.STOCKX_PROFILE_DIR || undefined,
    // Max StockX lookups per UTC day across scheduled runs and on-demand
    // lookups, and how old a stored StockX price must be (days, by tier)
    // before a scheduled run looks it up again. Keeps the residential IP's
    // traffic modest so it doesn't get flagged like AWS did. Usage is counted
    // in the stockx_lookups table, so a restart no longer resets it.
    stockxDailyBudget: parseInt(process.env.STOCKX_DAILY_BUDGET || '400', 10),
    // First StockX price for sneakers users add (not yet in the catalog) has
    // its own allowance on top of the daily budget. The cap only guards the
    // residential IP against a runaway (bug, scripted adds); busiest day so
    // far was ~104. Past it, new sneakers get GOAT/eBay now and StockX from
    // the queue, which takes never-priced SKUs first.
    stockxNewSkuDailyCap: parseInt(process.env.STOCKX_NEW_SKU_DAILY_CAP || '250', 10),
    // StockX runs from its own queue, paced across the whole UTC day, instead
    // of inside the tier runs (which spent the whole budget on tier 1 by
    // breakfast). Each tier is guaranteed this share (percent) of the budget
    // while it has stale SKUs; a tier with nothing stale frees its share.
    // At 400/day: tier 1 ~5-day, tier 2 ~13-day, tier 3 ~25-day refresh.
    stockxQueueEnabled: process.env.STOCKX_QUEUE_ENABLED !== 'false',
    stockxTierShares: {
      1: parseFloat(process.env.STOCKX_SHARE_TIER1 || '30'),
      2: parseFloat(process.env.STOCKX_SHARE_TIER2 || '20'),
      3: parseFloat(process.env.STOCKX_SHARE_TIER3 || '50'),
    },
    stockxStaleDays: {
      1: parseFloat(process.env.STOCKX_STALE_DAYS_TIER1 || '3'),
      2: parseFloat(process.env.STOCKX_STALE_DAYS_TIER2 || '7'),
      3: parseFloat(process.env.STOCKX_STALE_DAYS_TIER3 || '21'),
    },
    ebay: {
      conditionCodes: (process.env.EBAY_CONDITION_CODES || '1000,1500,3000,4000').split(',').map(c => c.trim()),
      minConditionThreshold: parseInt(process.env.EBAY_MIN_CONDITION || '3000', 10),
      enableOutlierFiltering: process.env.EBAY_OUTLIER_FILTERING === 'true',
    },
  },

  api: {
    maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE || '100', 10),
    cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '7200', 10),
  },

  scheduler: {
    enabled: process.env.ENABLE_SCHEDULER === 'true',
    skipStockX: process.env.SKIP_STOCKX === 'true',
    // Heavy Chrome scrapers packed into the global (US+EU) pre-dawn lull,
    // spaced so no two ever overlap. ECMV (internal calc) runs every 6h.
    tier1Cron: process.env.TIER_1_CRON || '0 3 * * *',
    tier2Cron: process.env.TIER_2_CRON || '0 5 * * *',
    tier3Cron: process.env.TIER_3_CRON || '0 7 * * 1,4',
    ecmvCron: process.env.ECMV_CRON || '0 0,6,12,18 * * *',
    // Every 3rd day at 04:00 UTC. The 90-day KicksDB calendar changes slowly and
    // each sync spends ~2 of our 1000 monthly KicksDB requests, so a low cadence
    // keeps quota for the manual catalog import (~20 req/month here).
    releasesCron: process.env.RELEASES_CRON || '0 4 */3 * *',
  },

  logging: {
    level: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
  },

  admin: {
    userIds: process.env.ADMIN_USER_IDS?.split(',').map((id) => id.trim()) || [],
  },
  stockx: {
    clientId: process.env.STOCKX_CLIENT_ID || '',
    clientSecret: process.env.STOCKX_CLIENT_SECRET || '',
    apiKey: process.env.STOCKX_API_KEY || '',
  },
  s3: {
    bucket: process.env.S3_BUCKET || '',
    region: process.env.S3_REGION || 'eu-north-1',
    cloudfrontUrl: process.env.CLOUDFRONT_URL || '',
  },
};

// Validate required config
if (!convexUrl)     console.warn(`⚠️  Convex URL not set for env: ${convexEnv}`);
if (!convexJwksUrl) console.warn(`⚠️  Convex JWKS URL not set for env: ${convexEnv}`);

// A misconfigured prod deploy must not silently stop notifying — fail loudly.
if (convexEnv === 'production') {
  if (releasesIngestTargets.length === 0) {
    throw new Error('No Convex releases ingest target configured (set CONVEX_RELEASES_INGEST_URL[_PROD] and its secret) — required in production');
  }
} else if (releasesIngestTargets.length === 0) {
  console.warn(`⚠️  No Convex releases ingest target configured for env: ${convexEnv}`);
}
if (releasesIngestTargets.length > 0) {
  console.log(`📣 Convex releases ingest targets: ${releasesIngestTargets.map((t) => t.label).join(', ')}`);
}

export default config;
