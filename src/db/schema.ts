export const schema = `
-- SKU Catalog
CREATE TABLE IF NOT EXISTS skus (
  id SERIAL PRIMARY KEY,
  sku_code VARCHAR(100) UNIQUE NOT NULL,
  brand_style_code VARCHAR(50),
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
`;
