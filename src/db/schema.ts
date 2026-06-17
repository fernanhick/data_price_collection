export const schema = `
-- SKU Catalog
CREATE TABLE IF NOT EXISTS skus (
  id SERIAL PRIMARY KEY,
  sku_code VARCHAR(255),  -- Optional, for backward compatibility
  style_code VARCHAR(255) UNIQUE NOT NULL,  -- Primary identifier
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  colorway VARCHAR(255),
  release_date DATE,
  retail_price DECIMAL(10,2),
  category VARCHAR(100),
  tier SMALLINT DEFAULT 2,
  stockx_id VARCHAR(100),
  goat_id VARCHAR(100),
  ebay_query VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skus_tier ON skus(tier);
CREATE INDEX IF NOT EXISTS idx_skus_brand ON skus(brand);
CREATE INDEX IF NOT EXISTS idx_skus_style_code ON skus(style_code);
CREATE INDEX IF NOT EXISTS idx_skus_sku_code ON skus(sku_code);

-- Individual Price Points from Sources
CREATE TABLE IF NOT EXISTS prices (
  id SERIAL PRIMARY KEY,
  sku_id INTEGER REFERENCES skus(id) ON DELETE CASCADE,
  source VARCHAR(50) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prices_sku_id ON prices(sku_id);
CREATE INDEX IF NOT EXISTS idx_prices_timestamp ON prices(timestamp);
CREATE INDEX IF NOT EXISTS idx_prices_sku_timestamp ON prices(sku_id, timestamp DESC);

-- Computed ECMV (Estimated Current Market Value)
CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  sku_id INTEGER REFERENCES skus(id) ON DELETE CASCADE,
  style_code VARCHAR(50),
  ecmv DECIMAL(10,2) NOT NULL,
  confidence VARCHAR(20),
  user_id VARCHAR(255),
  components JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_sku_id ON price_history(sku_id);
CREATE INDEX IF NOT EXISTS idx_price_history_timestamp ON price_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_sku_timestamp ON price_history(sku_id, timestamp DESC);

-- Fetch Logs (Operational Monitoring)
CREATE TABLE IF NOT EXISTS fetch_logs (
  id SERIAL PRIMARY KEY,
  source VARCHAR(50) NOT NULL,
  sku_id INTEGER REFERENCES skus(id) ON DELETE SET NULL,
  status VARCHAR(20),
  message TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fetch_logs_timestamp ON fetch_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_fetch_logs_source ON fetch_logs(source);

-- API Usage Tracking (Optional Analytics)
CREATE TABLE IF NOT EXISTS api_usage (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  endpoint VARCHAR(255),
  method VARCHAR(10),
  status_code INTEGER,
  response_time_ms INTEGER,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_timestamp ON api_usage(timestamp DESC);

-- Admin Users (for dashboard authentication)
CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);

-- Job Run History (for Admin Jobs UI)
CREATE TABLE IF NOT EXISTS job_runs (
  id SERIAL PRIMARY KEY,
  job_type VARCHAR(50) NOT NULL,
  params JSONB DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  stats JSONB,
  error TEXT,
  triggered_by VARCHAR(50) DEFAULT 'admin'
);

CREATE INDEX IF NOT EXISTS idx_job_runs_started ON job_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_status ON job_runs(status);

-- App-level key/value token store (OAuth tokens, etc.)
CREATE TABLE IF NOT EXISTS app_tokens (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Upcoming Sneaker Releases (sourced from external release calendars)
CREATE TABLE IF NOT EXISTS upcoming_releases (
  id SERIAL PRIMARY KEY,
  style_code VARCHAR(255) UNIQUE NOT NULL,  -- SKU / style code (dedup key)
  name VARCHAR(500) NOT NULL,
  brand VARCHAR(100),
  release_date DATE,
  image_url TEXT,
  source_url TEXT,
  source VARCHAR(50) DEFAULT 'soleretriever',
  first_seen_at TIMESTAMP DEFAULT NOW(),
  last_seen_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upcoming_releases_release_date ON upcoming_releases(release_date);
CREATE INDEX IF NOT EXISTS idx_upcoming_releases_brand ON upcoming_releases(brand);
`;
