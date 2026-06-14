import dotenv from 'dotenv';
import { AppConfig } from '../types/index.js';

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

  scraper: {
    timeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '10000', 10),
    retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3', 10),
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
    tier1Cron: process.env.TIER_1_CRON || '0 6,12,18,0 * * *',
    tier2Cron: process.env.TIER_2_CRON || '0 14 * * *',
    tier3Cron: process.env.TIER_3_CRON || '0 10 * * 1,4',
    ecmvCron: process.env.ECMV_CRON || '0 7,13,19,1 * * *',
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

export default config;
