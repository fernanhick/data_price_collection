// SKU Tier Levels
export enum SKUTier {
  TIER_1 = 1, // High-demand, 4x daily updates
  TIER_2 = 2, // Medium-demand, 1x daily
  TIER_3 = 3, // Long-tail, 2x weekly
}

// Price Data Sources
export enum PriceSource {
  EBAY = 'ebay',
  GOAT = 'goat',
  STOCKX = 'stockx',
}

// Confidence Levels for ECMV
export enum ConfidenceLevel {
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

// Database Models
export interface SKU {
  id: number;
  sku_code?: string;  // Now optional
  style_code: string;  // Required - primary identifier
  brand: string;
  model: string;
  colorway: string;
  release_date?: Date;
  retail_price?: number;
  category?: string;
  tier: SKUTier;
  stockx_id?: string;
  goat_id?: string;
  ebay_query?: string;
  image_url?: string;               // External URL from GOAT/StockX
  image_local_path?: string;        // Local filesystem path to optimized image
  image_downloaded_at?: Date;       // When image was downloaded
  image_file_size?: number;         // File size in bytes
  created_at: Date;
  updated_at: Date;
}

export interface Price {
  id: number;
  sku_id: number;
  source: PriceSource;
  price: number;
  timestamp: Date;
}

export interface PriceHistory {
  id: number;
  sku_id: number;
  style_code?: string;
  ecmv: number; // Estimated Current Market Value
  confidence: ConfidenceLevel;
  user_id?: string; // From JWT token
  components: {
    ebay_price?: number;
    goat_price?: number;
    stockx_price?: number;
    weights?: {
      w1: number;
      w2: number;
      w3?: number;
    };
  };
  timestamp: Date;
}

export interface FetchLog {
  id: number;
  source: PriceSource;
  sku_id?: number;
  status: 'success' | 'failed' | 'rate_limited';
  message?: string;
  timestamp: Date;
}

// JWT Token Claims (from Convex)
export interface JWTPayload {
  sub: string; // User ID
  iss: string; // Issuer (Convex)
  tokenId: string;
  iat: number;
  exp: number;
}

// API Request/Response Types
export interface PriceResponse {
  sku_code?: string;  // Deprecated, optional for backward compatibility
  style_code: string;  // Primary identifier
  ecmv: number;
  confidence: ConfidenceLevel;
  user_id?: string;
  last_updated: Date;
  components: PriceHistory['components'];
}

export interface SKUSearchResponse {
  id: number;
  sku_code: string;
  brand: string;
  model: string;
  colorway: string;
  retail_price?: number;
  tier: SKUTier;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  database: {
    connected: boolean;
    latency_ms: number;
  };
  redis: {
    connected: boolean;
    latency_ms: number;
  };
  prices: {
    tier1_last_update: Date | null;
    tier2_last_update: Date | null;
    tier3_last_update: Date | null;
    total_skus: number;
    total_prices: number;
  };
}

// Scraper Result Types
export interface eBayListing {
  title: string;
  price: number;
  url: string;
  condition?: string;       // Parsed condition text
  conditionId?: number | null;    // Numeric code (1000, 3000, etc.)
  timestamp: Date;
}

export interface GOATListing {
  name: string;
  slug: string;
  sku: string;
  lowestPriceCents: number;
  retailPriceCents: number | null;
  instantShipPriceCents: number | null;
  brand: string;
  colorway: string;
  imageUrl: string;
  url: string;
  timestamp: Date;
}

export interface StockXListing {
  name: string;
  urlKey: string;
  sku: string;
  lowestAsk: number;
  highestBid: number | null;
  lastSale: number | null;
  retailPrice: number | null;
  brand: string;
  colorway: string;
  imageUrl: string;
  url: string;
  timestamp: Date;
}

// A single Convex releases-ingest endpoint to fan new drops out to.
export interface ReleasesIngestTarget {
  label: string; // 'prod' | 'dev' | env name — for logging only
  url: string;
  secret: string;
}

// Configuration
export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  apiBaseUrl: string;
  database: {
    url: string;
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  redis: {
    url: string;
    host: string;
    port: number;
  };
  convex: {
    url: string;
    jwksUrl: string;
  };
  releasesNotifier: {
    // Every fully-configured Convex deployment to notify. Usually just prod,
    // but dev can be added alongside so test pushes flow without taking prod
    // offline. Empty array = notifying is disabled.
    targets: ReleasesIngestTarget[];
  };
  scraper: {
    timeoutMs: number;
    retryAttempts: number;
    proxyUrl?: string;
    ebay?: {
      conditionCodes?: string[];
      minConditionThreshold?: number;
      enableOutlierFiltering?: boolean;
    };
  };
  api: {
    maxRequestsPerMinute: number;
    cacheTtlSeconds: number;
  };
  scheduler: {
    enabled: boolean;
    skipStockX: boolean;
    tier1Cron: string;
    tier2Cron: string;
    tier3Cron: string;
    ecmvCron: string;
    releasesCron: string;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };
  admin: {
    userIds: string[];
  };
  s3: {
    bucket: string;
    region: string;
    cloudfrontUrl: string;
  };
  stockx: {
    clientId: string;
    clientSecret: string;
    apiKey: string;
  };
}
