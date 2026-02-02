# Sneaker Market Value Consumer App - Implementation Plan

**Status**: Ready for Development
**Last Updated**: 2026-02-01

---

## 1. Project Overview

### Vision
A robust **backend API and database infrastructure** that aggregates sneaker market prices from public sources, maintains price history, and provides **simple, credible, and current estimates** of market value through a secured interface for mobile apps.

### Scope
- Backend data extraction and normalization
- Time-series database for price history tracking
- Secured REST API for mobile app consumption
- NO frontend/mobile app implementation (external responsibility)

### Core Value Proposition
Reliable, defensible price data accessible securely by any mobile app without legal or operational risk from unauthorized data access.

### Non-Goals
- Not an official marketplace
- Not a trading or escrow platform
- Not an authoritative price oracle
- No direct StockX API integration (ToS violation)

### Key Constraints
- No StockX API access
- No paid third-party data sources
- High legal and platform scrutiny
- Must maintain legal defensibility

### Important: Read-Only Reference Data with API Key Protection

**This system collects and serves REFERENCE DATA ONLY:**
- ✅ API Key authentication (simple, not per-user)
- ✅ No personal user data stored
- ✅ No payment processing
- ✅ No trading functionality
- ✅ No data retention requirements
- ✅ Simple compliance (just add disclaimer)

**Result**: Significantly simplified architecture, controlled access via API keys, minimal legal overhead.

---

## 2. Data Strategy

### 2.1 Primary Data Sources (Production)

#### Source 1: eBay Sold Listings (Primary Signal)
- **Role**: Primary price indicator
- **Data Quality**: Reflects real transactions with high liquidity
- **Access**: Publicly accessible without authentication
- **Update Frequency**: 1–2 pulls/day per SKU
- **Legal Status**: ✅ Approved

#### Source 2: GOAT Public Product Pages (Secondary Signal)
- **Role**: Secondary price indicator
- **Data Point**: Lowest ask (availability pressure indicator)
- **Update Frequency**: Daily
- **Legal Status**: ✅ Approved

#### Source 3: StockX (Optional Calibration Only)
- **Role**: Sparse calibration reference for top SKUs
- **Constraints**:
  - Top SKUs only (~300 Tier 1)
  - ≤1×/day maximum
  - Never exposed as official pricing
  - Internal use only
- **Legal Status**: ⚠️ Restricted (ToS violation mitigation via sparse usage)

### 2.2 Rejected/Restricted Options

| Option | Status | Reason |
|--------|--------|--------|
| Direct StockX Scraping | ❌ Rejected | React-rendered, Cloudflare protected, high ban risk |
| StockX Private API | ⚠️ Restricted | Feasible but ToS-violating (limited prototyping only) |
| Hybrid API + Browser Automation | ⚠️ Restricted | More resilient but still ToS-violating |
| Licensed Data Providers | ❌ Unavailable | Cost constraints |
| User-Contributed Data | ⚠️ Supplemental | Cannot be primary (bias & sparsity) |

### 2.3 Pricing Model (ECMV)

**Formula**: Estimated Current Market Value (ECMV)

```
ECMV = w1 × eBay_Price + w2 × GOAT_Price + w3 × StockX_Price (optional)
```

**Weight Factors**:
- Liquidity (transaction volume)
- Freshness (data recency)
- Volatility (price stability)

**Smoothing**:
- Rolling 24–72h median to suppress spikes
- Confidence score: High / Medium / Low

**User Disclosure**:
- Displayed as "Estimated market value"
- "Based on public marketplace data"
- "For informational purposes only"
- Disclaimer on lag and estimation uncertainty

---

## 3. SKU Tiering Strategy

Tiering reduces operational risk by distributing refresh frequency based on demand.

### Tier 1: High-Demand SKUs (~300)
- Update frequency: 4× daily
- Examples: Latest Jordan releases, hyped drops

### Tier 2: Medium-Demand SKUs (~700)
- Update frequency: Daily
- Examples: Popular retros, general releases

### Tier 3: Long-Tail SKUs (~1,000)
- Update frequency: Weekly
- Examples: Older models, niche colorways

**Rationale**: Price movement follows power-law distribution; heavy concentration in top 300 SKUs.

---

## 4. Data Pipeline Architecture

### 4.1 Pipeline Flow

```
Scheduler → Fetchers → Normalizers → Storage → Public API
```

### 4.2 Components

#### Scheduler
- Cron-based job dispatcher
- Tier-aware frequency management
- Handles retry scheduling

#### Fetchers
- eBay sold listings scraper
- GOAT public page fetcher
- StockX sparse calibration (top SKUs only)
- HTTP request pooling with rate limiting

#### Normalizers
- Price extraction and validation
- Currency/unit standardization
- Data validation and schema enforcement

#### Storage
- Time-series database for price history
- Metadata cache (SKU attributes, categories)
- Diff-based writes to minimize I/O

#### Public API
- REST endpoints for client consumption
- Real-time and cached queries
- Authentication/rate limiting layer

### 4.3 Key Controls

| Control | Purpose |
|---------|---------|
| Global rate limiting | Prevent IP bans and platform abuse |
| SKU tiering | Distribute load and reduce frequency |
| Circuit breakers | Graceful degradation per data source |
| Backoff on 429/403 | Respect platform rate limits |
| Diff-based writes | Reduce database I/O |

---

## 5. Risk Management

### 5.1 Legal Risks

| Risk | Mitigation |
|------|-----------|
| ToS enforcement from platforms | Use derived pricing, aggregation, no branding misuse |
| Claims of unauthorized access | Sparse usage, low frequency, public data only |
| Price accuracy liability | Confidence scores, clear disclaimers |

### 5.2 Technical Risks

| Risk | Mitigation |
|------|-----------|
| IP bans from rate limiting | Low update frequency, SKU tiering, request pooling |
| Data source outages | Multi-source aggregation, fallback to cached data |
| Performance degradation | Database indexing, caching layer, async pipelines |

### 5.3 Product Risks

| Risk | Mitigation |
|------|-----------|
| User trust erosion | Confidence scores, transparent pricing methodology |
| Data staleness complaints | Clear update frequency disclosure, Tier 1 priority |

---

## 6. Recommended Technology Stack

### Why This Stack?

This configuration balances **reliability, scalability, cost, and operational simplicity** for the data collection and API serving requirements.

### 6.1 Backend (Node.js + TypeScript)

**Primary Language**: TypeScript (Node.js 18+)

**Rationale**:
- ✅ Event-driven I/O perfect for parallel HTTP fetching
- ✅ Rich ecosystem for web scraping (cheerio, puppeteer) and HTTP clients (axios, node-fetch)
- ✅ Single language for backend + scheduler (reduced toolchain complexity)
- ✅ Fast JSON serialization (native support)
- ✅ Excellent async/await support for data pipeline orchestration
- ✅ Good JSON validation libraries (zod, joi)

**Key Dependencies**:
- `express` or `fastify`: REST API framework
- `cheerio`: HTML parsing for eBay/GOAT
- `axios` or `undici`: HTTP client with retry/timeout support
- `node-cron` or `bull`: Job scheduling for tier-based updates
- `pg`: PostgreSQL client
- `redis`: Rate limiting, caching, job queue
- `zod`: Type-safe data validation
- `pino`: Structured logging

### 6.2 Database (PostgreSQL)

**Rationale**:
- ✅ JSONB support for flexible price metadata
- ✅ TimescaleDB extension for efficient time-series storage
- ✅ ACID compliance for data integrity
- ✅ Full-text search for SKU discovery
- ✅ Excellent connection pooling with pgBouncer
- ✅ Cost-effective open-source option

**Schema Highlights** (Convex JWT, no separate auth table):
```sql
-- NO separate API key table needed!
-- JWT comes from Convex, VPS just verifies signature

-- SKU catalog
CREATE TABLE skus (
  id SERIAL PRIMARY KEY,
  sku_code VARCHAR(100) UNIQUE, -- Internal identifier (e.g., "nike-air-jordan-1-retro-bred-2023")
  brand_style_code VARCHAR(50), -- Official brand code (e.g., Nike: 555088-610, Adidas: G28052)
  brand VARCHAR(100),
  model VARCHAR(100),
  colorway VARCHAR(255),
  release_date DATE,
  retail_price DECIMAL(10,2),
  category VARCHAR(100),
  tier SMALLINT, -- 1, 2, or 3
  stockx_id VARCHAR(100), -- External reference to StockX
  goat_id VARCHAR(100), -- External reference to GOAT
  ebay_query VARCHAR(255), -- Search query that works well on eBay
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Individual price points from sources
CREATE TABLE prices (
  id SERIAL PRIMARY KEY,
  sku_id INTEGER REFERENCES skus(id),
  source VARCHAR(50), -- 'ebay', 'goat', 'stockx'
  price DECIMAL(10,2),
  timestamp TIMESTAMP DEFAULT NOW(),
  INDEX (sku_id, timestamp)
);

-- Computed market value (ECMV)
CREATE TABLE price_history (
  id SERIAL PRIMARY KEY,
  sku_id INTEGER REFERENCES skus(id),
  style_code VARCHAR(50),
  ecmv DECIMAL(10,2), -- Estimated Current Market Value
  confidence VARCHAR(20), -- High, Medium, Low
  user_id VARCHAR(255), -- From JWT token (for analytics)
  components JSONB, -- {ebay_price, goat_price, weights}
  timestamp TIMESTAMP DEFAULT NOW(),
  INDEX (sku_id, timestamp),
  INDEX (user_id, timestamp)
);

-- Fetch logs (operational monitoring only)
CREATE TABLE fetch_logs (
  id SERIAL PRIMARY KEY,
  source VARCHAR(50),
  sku_id INTEGER REFERENCES skus(id),
  status VARCHAR(20), -- 'success', 'failed', 'rate_limited'
  timestamp TIMESTAMP DEFAULT NOW()
);
```

### 6.3 Caching & Queue (Redis)

**Rationale**:
- ✅ In-memory rate limiting (sliding window, token bucket)
- ✅ Job queue for distributed fetchers
- ✅ Cache layer for popular SKU lookups
- ✅ Pub/Sub for event-driven updates

**Usage**:
```
- Rate limit keys: source:ip_address
- Job queue: tier_1_fetch, tier_2_fetch, tier_3_fetch
- Cache: skus:{sku_id}, ecmv:{sku_id}
- Pub/Sub: price_updates
```

### 6.4 Deployment & Infrastructure (Free Tier)

| Component | Recommendation | Setup |
|-----------|-----------------|-------|
| App Server | Docker on Ubuntu Linux (VPS or local server) | Self-hosted Node.js app in containers |
| Scheduler | node-cron or node-schedule (in-app scheduling) | Built into Node.js app, no external service |
| Database | PostgreSQL (self-hosted on same VPS) | Open-source, free, runs on Linux |
| Cache | Redis (self-hosted on same VPS) | Open-source, free, in-memory cache |
| Storage (Logs) | File-based logs or Loki (self-hosted) | Local filesystem or free ELK stack alternative |
| Reverse Proxy | Nginx (open-source, free) | Handle HTTPS, routing, load balancing |
| SSL/TLS | Let's Encrypt (free certificates) | Automatic renewal via Certbot |

**Minimal Setup Option**:
- Single Ubuntu VPS (~$5-10/month from DigitalOcean, Linode, Vultr, or Hetzner)
- Docker + Docker Compose to run:
  - Node.js app (backend + scheduler)
  - PostgreSQL database (reference data only)
  - Redis cache
  - Nginx reverse proxy
- **Backup strategy**: Optional (data can be re-fetched from sources)
  - If desired: Daily cron job to backup PostgreSQL locally
  - Alternative: Just restart the scheduler to re-populate database from public sources

### 6.5 Free Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│         Ubuntu VPS ($5-15/month)                │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  Docker Container #1: Node.js App        │  │
│  │  - Express API server                    │  │
│  │  - Data fetcher (eBay, GOAT, StockX)    │  │
│  │  - Scheduler (cron jobs)                 │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  Docker Container #2: PostgreSQL         │  │
│  │  - Price history storage                 │  │
│  │  - SKU metadata                          │  │
│  │  - Audit logs                            │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  Docker Container #3: Redis              │  │
│  │  - Rate limiting                         │  │
│  │  - API response caching                  │  │
│  │  - Session management                    │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  Nginx Reverse Proxy                     │  │
│  │  - HTTPS (Let's Encrypt)                 │  │
│  │  - Load balancing                        │  │
│  │  - Rate limiting (backup layer)          │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  Local File System                       │  │
│  │  - Application logs                      │  │
│  │  - Database backups (daily)              │  │
│  │  - Cache dumps                           │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
└─────────────────────────────────────────────────┘

Mobile App ──HTTPS──> Nginx ──> Node.js API ──> PostgreSQL + Redis
```

### 6.6 API Key Implementation Guide

**Backend (Node.js)**:

```typescript
import bcrypt from 'bcrypt';
import express from 'express';

// Generate API key
async function generateApiKey(name: string) {
  const key = `sk_${Math.random().toString(36).substring(2, 15)}`;
  const keyHash = await bcrypt.hash(key, 10);

  // Store keyHash in database, return key to user once
  await db.query(
    'INSERT INTO api_keys (key_hash, name) VALUES ($1, $2)',
    [keyHash, name]
  );

  return key; // Return to user, never store plain key
}

// API Key middleware
async function validateApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    return res.status(401).json({ error: 'Missing X-API-Key header' });
  }

  // Compare provided key with hashes in database
  const result = await db.query(
    'SELECT id, name, rate_limit FROM api_keys WHERE is_active = true AND revoked_at IS NULL'
  );

  let validKey = null;
  for (const row of result.rows) {
    if (await bcrypt.compare(apiKey, row.key_hash)) {
      validKey = row;
      break;
    }
  }

  if (!validKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // Attach key info to request
  req.user = { apiKeyId: validKey.id, name: validKey.name, rateLimit: validKey.rate_limit };
  next();
}

// Use middleware on protected routes
app.get('/api/prices/:sku_id', validateApiKey, (req, res) => {
  // Your handler here
});
```

**Client (Mobile App)**:
```javascript
const API_KEY = 'sk_your_api_key_here';

async function getPrice(skuId) {
  const response = await fetch(`https://api.yoursite.com/api/prices/${skuId}`, {
    headers: {
      'X-API-Key': API_KEY
    }
  });

  if (response.status === 401) {
    throw new Error('Invalid API key');
  }
  if (response.status === 429) {
    throw new Error('Rate limited');
  }

  return response.json();
}
```

### 6.7 Docker Compose Setup (Free)

**Sample docker-compose.yml**:
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://user:pass@postgres:5432/prices
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis
    restart: always

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: prices
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: always

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/letsencrypt:ro
    depends_on:
      - app
    restart: always

volumes:
  postgres_data:
  redis_data:
```

**Benefits**:
- Single command to start: `docker-compose up -d`
- All services isolated and networked automatically
- Easy to scale (duplicate containers if needed)
- Simple to backup (volume snapshots)
- Easy to update (change image version, restart)

---

## 7. SKU Catalog Builder Utility

### 7.1 Immediate Launch Strategy with Daily Updates

Since you need to launch **immediately with daily price updates**, use a **fast-start approach**:

```
Day 1: Minimal catalog bootstrap (100 popular sneakers)
    ↓
Day 1: Deploy price scraper (daily schedule)
    ↓
Day 2+: Expand catalog & discover new sneakers while collecting prices
```

#### Fast-Start vs. Complete Catalog

| Approach | Tradeoff |
|----------|----------|
| **Complete Catalog First** (2 weeks) | Perfect data, but slow launch |
| **Fast-Start + Expand** (Day 1) | Launch immediately, expand continuously ✅ |

**Recommended: Fast-Start**
- Start with top 100-200 popular sneakers (manual list or quick StockX pull)
- Deploy price scraper immediately (daily updates begin)
- Expand catalog progressively as you discover sneakers
- Better to have partial data immediately than perfect data in 2 weeks

**Phase 0: Catalog Bootstrap (Weeks 1-2)**

**Data Sources for Initial Catalog**:
1. **StockX API** (sparse, top SKUs only - use your existing access)
   - Top 300-500 sneakers by trading volume
   - Reliable brand/model/colorway data

2. **GOAT Public Data**
   - Extract catalog from their listings
   - Brand, model, size ranges, release dates

3. **Manual Curation** (optional, for completeness)
   - Add iconic releases (Jordan 1s, Dunks, etc.)
   - Historical sneakers for collectors
   - Upcoming releases

**Initial Catalog Size Goal**: 1,000-2,000 SKUs
- This gives enough reference for price scraper to find listings
- Still manageable to maintain
- Can expand as you discover new releases

**Catalog Schema**:
```sql
CREATE TABLE skus (
  id SERIAL PRIMARY KEY,
  sku_code VARCHAR(100) UNIQUE, -- e.g., "nike-air-jordan-1-retro-bred-2023"
  brand VARCHAR(100), -- Nike, Adidas, Jordan, etc.
  model VARCHAR(100), -- Air Jordan 1, Dunk Low, etc.
  colorway VARCHAR(255), -- Bred, Chicago, Royal, etc.
  release_date DATE,
  retail_price DECIMAL(10,2),
  tier SMALLINT (1-3), -- 1=Popular, 2=Medium, 3=Niche
  image_url VARCHAR(500),
  stockx_id VARCHAR(100), -- Reference to StockX if available
  goat_id VARCHAR(100), -- Reference to GOAT if available
  source VARCHAR(50), -- 'stockx', 'goat', 'manual', 'ebay'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 7.3 Catalog Builder Implementation

**Catalog Builder Utility** (separate from price scraper):

```typescript
// CatalogBuilder.ts
import { StockXScraper } from './sources/StockXScraper';
import { GoatScraper } from './sources/GoatScraper';
import { Database } from './db';

class CatalogBuilder {

  // Bootstrap: One-time catalog population
  async bootstrapCatalog() {
    console.log('Starting catalog bootstrap...');

    // Phase 1: Fetch from StockX (top sneakers)
    const stockxSneakers = await StockXScraper.getTopSneakers(500);
    await this.insertCatalogBatch(stockxSneakers, 'stockx');

    // Phase 2: Fetch from GOAT (popular listings)
    const goatSneakers = await GoatScraper.getCatalog();
    await this.insertCatalogBatch(goatSneakers, 'goat');

    // Phase 3: Merge duplicates, assign tiers
    await this.deduplicateAndTier();

    console.log('Catalog bootstrap complete!');
  }

  // Continuous: Auto-discover new releases from price scraper findings
  async discoverNewSneakers(source: string) {
    // Price scraper finds a listing not in catalog
    // Catalog builder adds it automatically
    const unknownListings = await this.findUnmappedListings();

    for (const listing of unknownListings) {
      const sku = await this.extractSkuInfo(listing);
      await Database.query(
        `INSERT INTO skus (sku_code, brand, model, colorway, source)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [sku.code, sku.brand, sku.model, sku.colorway, source]
      );
    }
  }

  // Utility: Import manual sneaker list (CSV, JSON)
  async importFromCSV(filePath: string) {
    const sneakers = await readCSV(filePath);
    await this.insertCatalogBatch(sneakers, 'manual');
  }

  private async insertCatalogBatch(sneakers: any[], source: string) {
    for (const sneaker of sneakers) {
      await Database.query(
        `INSERT INTO skus (sku_code, brand, model, colorway, source, tier)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (sku_code) DO UPDATE SET updated_at = NOW()`,
        [
          sneaker.code,
          sneaker.brand,
          sneaker.model,
          sneaker.colorway,
          source,
          this.assignTier(sneaker.popularity)
        ]
      );
    }
  }

  private assignTier(popularity: number): number {
    if (popularity > 1000) return 1; // High demand
    if (popularity > 100) return 2;  // Medium demand
    return 3;                         // Long tail
  }
}

// Usage
const builder = new CatalogBuilder();
await builder.bootstrapCatalog(); // One-time setup
```

### 7.4 How Price Scraper Uses Catalog

**Price Scraper References Catalog**:

```typescript
// PriceScraper.ts
import { Database } from './db';

class PriceScraper {

  async scrapeEbayForSku(skuId: number) {
    // Get SKU details from catalog
    const sku = await Database.query(
      'SELECT sku_code, brand, model, colorway FROM skus WHERE id = $1',
      [skuId]
    );

    // Search eBay using SKU details
    const query = `${sku.brand} ${sku.model} ${sku.colorway}`;
    const listings = await this.ebaySearch(query);

    // Only collect listings, catalog already exists
    return listings;
  }

  async discoverNewAndAddToCatalog(listing: any) {
    // If price scraper finds a sneaker not in catalog
    // Automatically add it (triggered by price scraper)
    await CatalogBuilder.discoverNewSneakers('ebay');
  }
}
```

### 7.5 Deployment Strategy for Catalog

**Phase 0 (Week 1-2): Build Catalog**
```
1. Deploy CatalogBuilder utility
2. Bootstrap with StockX + GOAT data
3. Manually add iconic/niche sneakers if needed
4. Assign tiers based on demand
5. Result: 1,000-2,000 SKUs in `skus` table
```

**Phase 1 (Week 3-4): Start Price Scraper**
```
1. PriceScraper queries catalog for SKUs to scrape
2. Uses tier information (Tier 1 = 4x daily, etc.)
3. If unknown sneaker found, log it for manual review
```

**Phase 2+ (Week 5+): Auto-Discovery**
```
1. Price scraper automatically discovers new releases
2. CatalogBuilder adds them to catalog
3. Within 24 hours, new sneaker gets price history
```

### 7.6 API Endpoints for Catalog

Once catalog is built, expose via API:

```
GET /api/skus                    # List all sneakers
GET /api/skus?brand=Nike         # Filter by brand
GET /api/skus?search=jordan      # Search by name
GET /api/skus?tier=1             # Filter by demand tier
GET /api/skus/{id}               # Get single SKU details
GET /api/skus/{id}/prices        # Get prices for SKU
```

---

## 8. Development Roadmap

**Scope**: Backend infrastructure, sneaker catalog, database for price history, and secured API access for external mobile apps.

**Timeline**: 4-5 weeks total (fast-start launch Day 1, then expand)

### Phase 0: Fast-Start Minimal Catalog + Immediate Price Scraper (Day 1)

**Goals**: Launch price scraper TODAY with daily updates, expand catalog continuously

**Day 1 Deliverables** (4-6 hours):
- [ ] Create `skus` table schema
- [ ] Manual bootstrap: Add 100-200 popular sneakers (JSON file or quick manual entry)
  - Top Jordan releases (1, 3, 4, 11)
  - Dunk lows/highs (popular colorways)
  - Yeezy releases
  - Travis Scott collabs
- [ ] Deploy eBay + GOAT scraper (daily scheduler)
  - Tier 1: Run 4×/day on 20 popular SKUs
  - Tier 2: Run 1×/day on 80 remaining SKUs
- [ ] Set up PostgreSQL + Redis with initial schema
- [ ] Deploy to VPS and start collecting prices

**Data Sources for Bootstrap**:
- Hardcoded JSON list (100-200 top sneakers)
- OR: Quick manual export from your StockX sparse access (fastest)

**Deliverables**:
- Price scraper running with daily updates
- First price data collected immediately
- Catalog expanding as new sneakers discovered

**Acceptance Criteria**:
- Prices updating daily for 100+ sneakers
- No errors after 24 hours running
- New sneakers auto-added to catalog
- API returning current prices with 200ms latency

### Phase 1: Expand Catalog & Optimize Scraper (Days 2-7)

**Goals**: Expand catalog while maintaining daily price updates, optimize scraper performance

- [ ] Expand catalog from 100 to 500+ sneakers
  - Pull additional sneakers from StockX (sparse, ≤1×/day)
  - Scrape GOAT for popular listings (batch weekly)
  - Auto-discover new sneakers from eBay/GOAT listings
- [ ] Refine tier assignments based on trading volume
- [ ] Add circuit breakers for rate limiting
- [ ] Implement backoff strategy (429 responses)
- [ ] Set up structured logging (pino)
- [ ] Daily price update verification (monitoring)

**Schedule During This Phase**:
- Tier 1 (20 sneakers): 4×/day (6am, 12pm, 6pm, 12am UTC)
- Tier 2 (80+ sneakers): 1×/day (daily at 2pm UTC)
- New discoveries: 1×/week categorization

**Acceptance Criteria**:
- 500+ SKUs in catalog
- Zero missed daily updates
- Zero IP bans for 7 consecutive days
- New sneakers auto-discovered and priced within 24h

### Phase 2: Pricing Engine & Convex JWT Authenticated API (Days 8-14)

**Goals**: Implement ECMV calculation and expose authenticated REST API using Convex JWT

- [ ] Implement weighted averaging logic (w1, w2, w3)
- [ ] Add 24–72h rolling median smoothing
- [ ] Implement confidence score calculation
- [ ] Create REST API endpoints:
  - `GET /api/prices/{sku_code}` (requires Bearer JWT)
  - `GET /api/prices/{sku_code}/history?days=30` (for trending)
  - `GET /api/skus?search=jordan` (catalog search)
- [ ] Implement JWT verification middleware
  - Fetch and cache Convex public key (.well-known/jwks.json)
  - Verify RS256 signature on every request
  - Extract user ID from token claims
  - No database lookup needed (stateless!)
- [ ] Add request validation with zod
- [ ] Implement Redis caching (2-hour TTL for prices)
- [ ] Add CORS configuration for Expo app domain
- [ ] Track requests: Store user_id (from JWT) for analytics
- [ ] Scheduler: Daily price update cron jobs (locked to specific times)
  - 2pm UTC: Tier 2 prices update
  - 6am, 12pm, 6pm, 12am UTC: Tier 1 prices update
- [ ] Optional: Global IP-based rate limiting as backup
- [ ] Dashboard: Monitor daily update success/failures
- [ ] Documentation (OpenAPI spec with JWT examples)
- [ ] HTTPS/TLS via Let's Encrypt

**Dependencies to add**:
```bash
npm install jsonwebtoken jwk-to-pem express-rate-limit
```

**Acceptance Criteria**:
- Prices updating daily without manual intervention
- JWT verification succeeds for authenticated Convex users
- API responds <200ms (p99) with stateless verification
- 100% uptime for scheduled price updates (past 7 days)
- Mobile app receives current prices with <5 sec latency
- Zero database queries for JWT validation per request

### Phase 3: Monitoring, Legal & Hardening (Days 15-21)

**Goals**: Production hardening, monitoring, and legal compliance

- [ ] Set up logging & alerting (file-based logs or Loki)
- [ ] Monitor daily price update success rate (target: 100%)
- [ ] Alert on scraper failures (eBay/GOAT/StockX down)
- [ ] Alert on API errors (5xx responses)
- [ ] Create incident runbooks (what to do if scraper fails)
- [ ] Legal review of terms and disclaimers
- [ ] Add audit logging for data source access
- [ ] Database backup strategy (daily snapshots)
- [ ] Load testing (1000+ concurrent users)
- [ ] Security: API key rotation procedures

**Monitoring Dashboard**:
```
- Daily price update status (per tier)
- eBay/GOAT/StockX scraper health
- API response time (p50, p99)
- Cache hit rate
- Database disk usage
- Last 7 days price data completeness
```

**Acceptance Criteria**:
- 99.9% uptime (pricing data available)
- <5 min detection of scraper failures
- 100% daily price updates for 14 consecutive days
- Legal team sign-off on all user-facing language

### Phase 4: Scale & Optimize (Week 4+)

**Goals**: Production scaling and continuous improvement

- [ ] Monitor data quality (compare estimates vs. actual sales)
- [ ] Gather mobile app user feedback
- [ ] Optimize weights (w1, w2, w3) based on actual trading patterns
- [ ] Expand catalog to 1000+ sneakers (progressively)
- [ ] Add new tiers if needed (hot releases)
- [ ] Performance tuning based on real traffic
- [ ] Add optional features:
  - Price alerts (if price drops X%)
  - Historical trends (weekly/monthly)
  - User-contributed prices (supplemental, optional)

**Metrics to Track**:
- Price accuracy vs. peer estimates
- Catalog coverage % (of all trading sneakers)
- User engagement (API call patterns)
- Data freshness (age of last update)

---

## 8. Authenticated API using Convex JWT

**JWT-based authentication via Convex (stateless, scalable, user-aware).**

### Overview

Your Expo app already authenticates users via Convex. Use that same JWT token to authenticate requests to the VPS backend API:

```
Expo App (Convex Auth) → Get JWT from Convex → Send to VPS API
VPS Backend → Verify JWT signature (no DB lookup) → Return price data
```

### API Access (JWT Required)

All requests require a JWT token in the `Authorization` header:

```
Mobile App (Expo):
  const token = await getToken(); // From Convex auth

Request headers:
  Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
  Content-Type: application/json

Endpoints:
  GET /api/prices/{sku_code}
  GET /api/skus?search=jordan
  GET /api/prices/{sku_code}/history?days=30

Response:
  {
    sku_code: "nike-jordan-1-bred-2023",
    style_code: "555088-610",
    ecmv: 150.50,
    confidence: "High",
    user_id: "user_abc123",
    last_updated: "2024-01-15T14:00:00Z"
  }
```

### JWT Token Flow

**Step 1: User authenticates in Expo**
- User logs in via Convex (Google, password, etc.)
- Convex issues JWT token (24-hour expiry)
- Token stored in Expo app

**Step 2: Get token in Expo**
```typescript
import { useAuth } from "@convex-dev/react";

const { getToken } = useAuth();
const jwtToken = await getToken();
```

**Step 3: Send JWT to VPS**
```typescript
fetch('https://api.yourdomain.com/api/prices/nike-jordan-1', {
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  }
});
```

**Step 4: VPS verifies JWT**
- Extract token from header
- Get Convex public key (cached)
- Verify signature (no database query!)
- Extract user ID from token claims
- Return price data

### Database Schema (No API Keys Table Needed)

```sql
-- NO separate api_keys table needed!
-- JWT comes from Convex, VPS just verifies signature

-- SKU catalog (unchanged)
CREATE TABLE skus (
  id SERIAL PRIMARY KEY,
  sku_code VARCHAR(100) UNIQUE,
  style_code VARCHAR(50),
  brand VARCHAR(100),
  model VARCHAR(100),
  colorway VARCHAR(255),
  tier SMALLINT,
  created_at TIMESTAMP
);

-- Prices (unchanged)
CREATE TABLE prices (
  id SERIAL PRIMARY KEY,
  sku_id INTEGER REFERENCES skus(id),
  style_code VARCHAR(50),
  source VARCHAR(50),
  price DECIMAL(10,2),
  timestamp TIMESTAMP
);

-- Price history (now includes user_id for tracking)
CREATE TABLE price_history (
  id SERIAL PRIMARY KEY,
  sku_id INTEGER REFERENCES skus(id),
  style_code VARCHAR(50),
  ecmv DECIMAL(10,2),
  confidence VARCHAR(20),
  user_id VARCHAR(255),  -- From JWT token
  components JSONB,
  timestamp TIMESTAMP
);

-- Optional: Usage tracking (for analytics)
CREATE TABLE api_usage (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),  -- From JWT
  endpoint VARCHAR(255),
  status_code INT,
  timestamp TIMESTAMP
);
```

### JWT Verification Middleware

VPS backend validates JWT on every request:

```typescript
// src/middleware/verifyConvexJWT.ts
import jwt from "jsonwebtoken";

export async function verifyConvexJWT(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing authorization header" });
    }

    const token = authHeader.substring(7);

    // Get Convex public key (cached)
    const publicKey = await getConvexPublicKey();

    // Verify token signature (stateless, no DB query!)
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: "https://your-convex-deployment.convex.cloud",
    });

    // Attach user info to request
    req.user = {
      userId: decoded.sub,
      tokenId: decoded.tokenId,
    };

    console.log(`✅ JWT verified for user: ${decoded.sub}`);
    next();
  } catch (err) {
    console.error("❌ JWT verification failed:", err);
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Cache Convex public key
let cachedPublicKey: string | null = null;
let cacheTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

async function getConvexPublicKey(): Promise<string> {
  const now = Date.now();

  if (cachedPublicKey && (now - cacheTime) < CACHE_DURATION) {
    return cachedPublicKey;
  }

  const response = await fetch(
    "https://your-convex-deployment.convex.cloud/.well-known/jwks.json"
  );
  const jwks = await response.json();
  cachedPublicKey = convertJWKToPEM(jwks.keys[0]);
  cacheTime = now;

  return cachedPublicKey;
}
```

### API Endpoints with JWT

```typescript
// Apply JWT middleware to all protected routes
router.use(verifyConvexJWT);

// Get price for sneaker
router.get('/api/prices/:sku_code', async (req, res) => {
  const { sku_code } = req.params;
  const userId = req.user.userId;  // From JWT

  console.log(`User ${userId} requested: ${sku_code}`);

  const price = await db.query(
    'SELECT * FROM price_history WHERE style_code = $1 ORDER BY timestamp DESC LIMIT 1',
    [sku_code]
  );

  res.json({
    sku_code: price.rows[0].sku_code,
    ecmv: price.rows[0].ecmv,
    confidence: price.rows[0].confidence,
    user_id: userId,
    last_updated: price.rows[0].timestamp
  });
});

// Search sneakers
router.get('/api/skus', async (req, res) => {
  const { search } = req.query;
  const userId = req.user.userId;

  console.log(`User ${userId} searched: ${search}`);

  const results = await db.query(
    'SELECT * FROM skus WHERE sku_code ILIKE $1 LIMIT 20',
    [`%${search}%`]
  );

  res.json(results.rows);
});
```

### Security Measures

| Control | Implementation |
|---------|-----------------|
| Transport Security | TLS 1.2+ via Let's Encrypt (free) |
| JWT Signature | RS256 algorithm, verified with Convex public key |
| Token Expiry | 24-hour expiry (Convex manages) |
| Stateless Verification | No database lookup per request |
| Input Validation | Validate SKU IDs, search queries with zod |
| CORS | Configure for your Expo app domain |
| User Tracking | Extract user ID from JWT for analytics |
| Rate Limiting | Global IP-based backup limiting |

### Rate Limiting (Optional)

For additional protection, add per-user or global rate limiting:

```typescript
import rateLimit from "express-rate-limit";

// Rate limit by IP (if JWT verification fails)
const limiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 100,             // 100 requests per minute
});

app.use(limiter);

// Or rate limit by user ID (for analytics)
const getUserLimiter = (userId: string) => {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 1000,
    keyGenerator: (req) => userId,
  });
};
```

### Mobile App Integration (Expo)

```typescript
// api/priceAPI.ts
import { useAuth } from "@convex-dev/react";

const VPS_API_BASE = "https://api.yourdomain.com";

export function usePriceAPI() {
  const { getToken } = useAuth();

  const getPrice = async (sku_code: string) => {
    // Get JWT token from Convex (user already authenticated)
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");

    // Call VPS API with JWT
    const response = await fetch(
      `${VPS_API_BASE}/api/prices/${sku_code}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (response.status === 401) {
      throw new Error("Unauthorized - JWT invalid");
    }

    return response.json();
  };

  return { getPrice };
}

// Usage in component
export default function PriceScreen() {
  const { getPrice } = usePriceAPI();

  const fetchPrice = async () => {
    try {
      const data = await getPrice("nike-jordan-1-bred-2023");
      console.log(`Price: $${data.ecmv}`);
    } catch (err) {
      console.error("Error:", err);
    }
  };

  return (
    <Button onPress={fetchPrice} title="Get Price" />
  );
}
```

---

## 9. Daily Price Update Schedule

**Since prices must update daily minimum, here's the automatic scheduler setup:**

### Tier-Based Daily Schedule

```
Tier 1 (20 Popular Sneakers) - 4× Daily:
├─ 06:00 UTC: eBay sold listings
├─ 12:00 UTC: GOAT lowest ask
├─ 18:00 UTC: eBay + GOAT aggregate
└─ 00:00 UTC: StockX sparse check (top SKUs only)

Tier 2 (80+ Medium Demand) - 1× Daily:
└─ 14:00 UTC: eBay + GOAT + calculate ECMV

Tier 3 (Niche/Long Tail) - 2× Weekly:
├─ Monday 10:00 UTC: eBay scan
└─ Thursday 10:00 UTC: GOAT scan

New Discoveries:
└─ Continuous: Auto-add to catalog, schedule for Tier 2
```

### Node.js Scheduler Implementation

**Using `node-cron`**:
```typescript
import cron from 'node-cron';
import { PriceScraper } from './PriceScraper';
import { CatalogBuilder } from './CatalogBuilder';

class PriceUpdateScheduler {

  // Tier 1: 4× daily (6am, 12pm, 6pm, 12am UTC)
  startTier1Schedule() {
    cron.schedule('0 6,12,18,0 * * *', async () => {
      console.log('Tier 1 price update started');
      try {
        await PriceScraper.fetchTier1Prices();
        await PriceScraper.calculateECMV();
      } catch (err) {
        console.error('Tier 1 update failed:', err);
        // Alert! (email, Slack, etc.)
      }
    });
  }

  // Tier 2: Daily at 2pm UTC
  startTier2Schedule() {
    cron.schedule('0 14 * * *', async () => {
      console.log('Tier 2 price update started');
      try {
        await PriceScraper.fetchTier2Prices();
        await PriceScraper.calculateECMV();
        await CatalogBuilder.discoverNewSneakers(); // Auto-expand
      } catch (err) {
        console.error('Tier 2 update failed:', err);
      }
    });
  }

  // Tier 3: Twice weekly (Mon/Thu 10am UTC)
  startTier3Schedule() {
    cron.schedule('0 10 * * 1,4', async () => {
      console.log('Tier 3 price update started');
      try {
        await PriceScraper.fetchTier3Prices();
      } catch (err) {
        console.error('Tier 3 update failed:', err);
      }
    });
  }

  startAll() {
    this.startTier1Schedule();
    this.startTier2Schedule();
    this.startTier3Schedule();
    console.log('All price update schedules started');
  }
}

// In main.ts
const scheduler = new PriceUpdateScheduler();
scheduler.startAll();
```

### Monitoring Daily Updates

**Add to your API to verify updates are happening**:

```typescript
// GET /api/health/prices
// Returns: Last update time for each tier
app.get('/api/health/prices', async (req, res) => {
  const health = {
    tier1_last_update: await db.query(
      'SELECT MAX(timestamp) FROM prices WHERE source = "ebay" AND sku_id IN (SELECT id FROM skus WHERE tier = 1)'
    ),
    tier2_last_update: await db.query(
      'SELECT MAX(timestamp) FROM prices WHERE source = "ebay" AND sku_id IN (SELECT id FROM skus WHERE tier = 2)'
    ),
    prices_count: await db.query('SELECT COUNT(*) FROM prices'),
    unique_skus: await db.query('SELECT COUNT(DISTINCT sku_id) FROM prices'),
    last_error: await db.query('SELECT * FROM fetch_logs WHERE status = "failed" ORDER BY timestamp DESC LIMIT 1')
  };
  res.json(health);
});
```

**Check endpoint daily** (or set up monitoring):
```bash
curl https://api.yoursite.com/api/health/prices
```

---

## 10. Key Metrics & Success Criteria

### Technical KPIs

| Metric | Target | Purpose |
|--------|--------|---------|
| API Response Time (p99) | <200ms | Mobile app UX |
| Data Freshness (Tier 1) | <6 hours | Data quality |
| Price ECMV Accuracy | ±5% of peer estimates | Model validation |
| Uptime | 99.9% | Service reliability |
| IP Ban Events | 0 per month | Legal/technical safety |
| Unauthorized API Access | 0 incidents | Security |

### Operational KPIs

| Metric | Target | Purpose |
|--------|--------|---------|
| Database Query Latency (p99) | <50ms | API response speed |
| Data Pipeline Completion | <30 min per tier | Price data freshness |
| Cache Hit Rate | >80% | Reduces database load |
| API Error Rate | <0.1% | Service reliability |
| Fetch Failures (per source) | <1% | Data collection health |

---

## 11. Security & Compliance Checklist

**Convex JWT Authentication + Reference Data Only:**

- [ ] JWT verification on all protected endpoints (Bearer token required)
- [ ] Convex public key cached locally (updated daily)
- [ ] JWT signature verified with RS256 algorithm
- [ ] Token issuer verified as Convex deployment
- [ ] User ID extracted from JWT claims for tracking
- [ ] Global IP-based rate limiting as backup
- [ ] StockX data never exposed to users (internal use only)
- [ ] All API responses over HTTPS/TLS 1.2+
- [ ] No hardcoded credentials (use environment variables)
- [ ] JWT token expiry handled gracefully (24-hour default)
- [ ] Database backups (for data recovery only)
- [ ] Terms of Service includes: "Reference data only, not for trading"
- [ ] Price disclaimer visible in app: "Estimates may lag real-time market"
- [ ] Logging: User requests (user_id, endpoint, timestamp) for analytics
- [ ] CORS configured for your Expo app domain only
- [ ] Convex secret key stored securely on VPS

**What you DON'T need:**
- ❌ Separate API key management system
- ❌ GDPR/CCPA compliance (no personal data collected)
- ❌ User consent forms
- ❌ Privacy policy (unless collecting analytics)
- ❌ Manual token rotation (Convex handles it)

---

## 12. Testing Strategy

### Unit Tests
- Pricing calculation logic
- Data normalization functions
- Validation schemas

### Integration Tests
- Data pipeline end-to-end
- API endpoints with mocked data sources
- Database operations

### End-to-End Tests
- Mobile app on real devices
- Full data flow: fetch → normalize → calculate → serve
- Failure scenarios (rate limits, network outages, source unavailability)

### Load Testing
- Target: 10,000 concurrent users
- Tools: k6, JMeter, or Locust

---

## 13. Deployment & Release Strategy

### Pre-Production (Staging)

```
git push → GitHub Actions → Run tests → Build Docker image →
Deploy to staging cluster → Smoke tests → Ready for review
```

### Production

```
Staging approval → Kubernetes rolling update →
Canary rollout (5% → 25% → 50% → 100%) → Monitor metrics
```

### Database Migrations

```
Create migration script → Test on staging → Apply to production
with automatic rollback on failure → Verify data integrity
```

---

## 14. Cost Estimation (First Year) - Free Tier

| Component | Service | Monthly Cost | Notes |
|-----------|---------|--------------|-------|
| VPS Server | DigitalOcean / Linode / Vultr / Hetzner | $5–15 | 2GB RAM + 50GB SSD sufficient to start |
| Database | PostgreSQL (self-hosted) | $0 | Included on VPS |
| Cache | Redis (self-hosted) | $0 | Included on VPS |
| Backup Storage | S3 free tier or local | $0–5 | Amazon S3 free tier: 5GB storage |
| Domain | Namecheap / Domain.com | $0–12/year | First year often discounted |
| SSL/TLS | Let's Encrypt | $0 | Free automatic certificates |
| Monitoring | Free tier (Uptime Robot, etc.) | $0 | Basic uptime monitoring |
| **Total** | | **~$5–15/month** | Minimal overhead, pay-as-you-grow |

**Scaling Path**:
- Start: $5–15/month (single VPS)
- 10k users: $20–50/month (upgrade VPS to 4GB RAM, 100GB SSD)
- 100k users: $100–200/month (dedicated database VPS + app VPS + backup strategy)
- 1M+ users: Consider managed services or Kubernetes (at that point, budget exists)

---

## 15. Success Criteria & Next Steps

### Launch Success =

✅ Zero legal incidents
✅ 99.9% uptime for 30 days
✅ <200ms API response (p99)
✅ 10,000+ downloads in month 1
✅ Confidence scores align with market signals
✅ Zero IP bans / data source blocks

### Immediate Next Steps (DAY 1) - Fast-Start Launch

**By End of Day 1, you should have:**
- ✅ Backend running with prices updating
- ✅ 100-200 sneakers in catalog
- ✅ Daily price updates scheduled
- ✅ API accepting Convex JWT tokens

**Step-by-Step (6-8 hours)**:

1. **Setup VPS** (1 hour):
   - Rent Ubuntu VPS from DigitalOcean ($5/month)
   - SSH, install Docker + Docker Compose
   - Note your Convex deployment URL

2. **Bootstrap Database** (30 min):
   - Create PostgreSQL with `skus` + `prices` + `price_history` tables
   - Insert 100-200 popular sneakers (hardcoded JSON or manual list)
   - Assign Tier 1 (20), Tier 2 (80+)

3. **Deploy Scrapers** (2 hours):
   - Implement eBay sold listings scraper
   - Implement GOAT public page fetcher
   - Test on 5-10 sneakers locally first
   - Deploy to VPS

4. **Setup Scheduler** (1 hour):
   - Install `node-cron`
   - Configure daily updates (Tier 1: 4×/day, Tier 2: 1×/day)
   - Test one update cycle

5. **Deploy JWT-Authenticated API** (1.5 hours):
   - Create REST API endpoints (`/api/prices/{sku_code}`, `/api/skus`)
   - Add JWT verification middleware
   - Get Convex public key from `.well-known/jwks.json`
   - Cache public key for performance
   - Deploy to VPS with Nginx + Let's Encrypt
   - Install dependencies: `npm install jsonwebtoken jwk-to-pem`

6. **Test & Monitor** (30 min):
   - Get JWT token from Expo app (already authenticated via Convex)
   - Test API with: `curl -H "Authorization: Bearer {JWT}" https://api.yourdomain.com/api/prices/nike-jordan-1`
   - Verify prices updated in first 24h
   - Check logs for JWT verification success

**Start collecting price data immediately, Convex JWT handles auth!**

---

## 16. Appendix: Technology Decision Rationale

### Why NOT Python?
- GIL limitations for parallel HTTP fetching
- Slower JSON serialization than Node.js
- Deployment overhead vs. Node.js containers

### Why NOT Go?
- Overkill for this workload
- Slower development velocity
- Larger binary size for mobile/Expo constraints

### Why NOT Java/Spring?
- Heavier memory footprint
- Slower startup time (not ideal for serverless scheduling)
- Longer development cycle

### Why Node.js + TypeScript?
- ✅ Best-in-class async I/O for data fetching
- ✅ Minimal runtime overhead
- ✅ Fastest JSON serialization
- ✅ Single language across backend + scheduler + build tools
- ✅ Vibrant ecosystem for web scraping and HTTP utilities
- ✅ Type safety with TypeScript reduces bugs
- ✅ Excellent cloud deployment support (Docker, Kubernetes)

---

**End of PLAN.md**

Generated for: Sneaker Market Value Consumer App
Framework: Agile RFC-based Implementation
Status: Ready for Development
Last Updated: 2026-02-01
