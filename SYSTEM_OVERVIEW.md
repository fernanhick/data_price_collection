# System Overview - How the Sneaker Price API Works

A comprehensive explanation of the entire system architecture and data flow.

---

## 🎯 What Does This System Do?

**In simple terms**: Your system automatically collects sneaker prices from public marketplaces (eBay, GOAT) every day and serves them to your mobile app via an API.

**In technical terms**: A backend service that:
1. Scrapes sneaker prices from multiple sources daily
2. Calculates a weighted average price (ECMV)
3. Stores price history in a database
4. Exposes prices via an authenticated REST API
5. Caches frequently accessed data

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      YOUR MOBILE APP                        │
│                   (iOS / Android / Web)                     │
└────────────────────────────┬────────────────────────────────┘
                             │
                             │ (HTTPS Request with API Key)
                             │ GET /api/prices/nike-jordan-1
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                    NGINX REVERSE PROXY                      │
│               (Handles HTTPS, routing, rate limiting)       │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                    NODE.JS BACKEND (API)                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 1. Validate API Key                                │   │
│  │ 2. Check Redis Cache (instant response)            │   │
│  │ 3. If not cached, query PostgreSQL                 │   │
│  │ 4. Return JSON response to mobile app              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Also runs Scheduler:                                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Every day at scheduled times:                       │   │
│  │ - 6am, 12pm, 6pm, 12am: Scrape Tier 1 sneakers    │   │
│  │ - 2pm: Scrape Tier 2 sneakers                      │   │
│  │ - Combine prices from all sources                   │   │
│  │ - Calculate ECMV (Estimated Current Market Value)  │   │
│  │ - Store in database                                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────┬──────────────────────────┬──────────────────────────┬─┘
      │                          │                          │
      ↓                          ↓                          ↓
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│ PostgreSQL  │         │    Redis     │         │ Scraper Jobs │
│  Database   │         │    Cache     │         │              │
│             │         │              │         │ eBay         │
│ - SKUs      │         │ Caches:      │         │ GOAT         │
│ - Prices    │         │ - Price data │         │ StockX       │
│ - History   │         │ - SKU list   │         │              │
│             │         │              │         │ (Fetch real  │
│ Stores all  │         │ 2-hour TTL   │         │  marketplace │
│ historical  │         │              │         │  data)       │
│ data        │         │ Fast lookups │         │              │
└─────────────┘         └──────────────┘         └──────────────┘
      ↑                                                    │
      │                                                    │
      └────────────────────────────────────────────────────┘
              (Store calculated prices)
```

---

## 📊 Data Flow: How a Price Update Happens

### Example: Daily Price Update for Nike Air Jordan 1

```
Day 1, 6:00 AM UTC
│
├─ Scheduler says: "Time to update Tier 1 sneakers"
│
├─ Backend triggers PriceScraper for "nike-air-jordan-1-retro-bred"
│
├─ Scraper does:
│  │
│  ├─ Search eBay for: "Nike Air Jordan 1 Bred"
│  │  Result: 5 listings found
│  │  Prices: $150, $155, $152, $160, $158
│  │  Median: $155 ✅
│  │
│  ├─ Search GOAT for: "Nike Air Jordan 1 Bred"
│  │  Result: 8 listings found
│  │  Lowest ask: $148 ✅
│  │
│  └─ Check StockX (sparse, once per day)
│     Result: Last sale price: $152 ✅
│
├─ Backend calculates ECMV:
│  │
│  ├─ Formula: (eBay_price × 0.5) + (GOAT_price × 0.3) + (StockX × 0.2)
│  │
│  ├─ ECMV = ($155 × 0.5) + ($148 × 0.3) + ($152 × 0.2)
│  │         = $77.50 + $44.40 + $30.40
│  │         = $152.30 ✅
│  │
│  └─ Confidence: High (all sources agree, many listings)
│
├─ Store in Database:
│  │
│  └─ INSERT INTO price_history:
│     {
│       sku_id: 42,
│       ecmv: 152.30,
│       confidence: "High",
│       components: {
│         ebay: 155,
│         goat: 148,
│         stockx: 152
│       },
│       timestamp: "2024-01-15T06:00:00Z"
│     }
│
└─ Cache in Redis for fast access (2-hour TTL)

Later that day, User's Mobile App:
│
├─ Sends: GET /api/prices/nike-air-jordan-1-retro-bred
│         Header: X-API-Key: sk_xxxxx
│
├─ Backend:
│  ├─ Checks API key: ✅ Valid
│  ├─ Checks Redis cache: ✅ Found (6 hours old, still valid)
│  └─ Returns cached result (instant, <50ms)
│
├─ Mobile App receives:
│  {
│    "sku_id": 42,
│    "sku_code": "nike-air-jordan-1-retro-bred",
│    "brand": "Nike",
│    "model": "Air Jordan 1 Retro",
│    "colorway": "Bred",
│    "ecmv": 152.30,
│    "confidence": "High",
│    "last_updated": "2024-01-15T06:00:00Z",
│    "sources": {
│      "ebay": 155,
│      "goat": 148,
│      "stockx": 152
│    }
│  }
│
└─ User sees: "Jordan 1 Bred - Estimated: $152.30 (High confidence)"
```

---

## 🔄 Daily Schedule (Automatic)

Your system runs on a fixed daily schedule. No manual intervention needed.

```
6:00 AM UTC
├─ Tier 1 Scrape (20 popular sneakers)
│  └─ eBay + GOAT → Calculate prices
│
12:00 PM UTC
├─ Tier 1 Scrape (20 popular sneakers)
│  └─ eBay + GOAT → Update prices
│
2:00 PM UTC
├─ Tier 2 Scrape (80+ medium demand)
│  └─ eBay + GOAT → Calculate prices
│
6:00 PM UTC
├─ Tier 1 Scrape (20 popular sneakers)
│  └─ eBay + GOAT → Update prices
│
Midnight UTC
├─ Tier 1 Scrape (20 popular sneakers)
│  └─ eBay + GOAT + StockX (sparse) → Update prices
│
Monday & Thursday at 10:00 AM UTC
├─ Tier 3 Scrape (niche/long-tail)
│  └─ Weekly update for slow-moving sneakers
```

**Result**: Tier 1 prices updated 4 times daily, Tier 2 daily, Tier 3 weekly.

---

## 🗂️ Database Structure

### Table 1: `skus` (Sneaker Catalog)
```
id | sku_code | brand | model | colorway | tier | created_at
---|----------|-------|-------|----------|------|----------
1  | nike-air-jordan-1-retro-bred | Nike | Air Jordan 1 Retro | Bred | 1 | 2024-01-01
2  | nike-dunk-low-pro-panda | Nike | Dunk Low Pro | Panda | 2 | 2024-01-01
...
```

**Purpose**: Reference table of all sneakers you track
**Size**: 1,000-2,000 entries

### Table 2: `prices` (Raw Price Data)
```
id | sku_id | source | price | timestamp
---|--------|--------|-------|----------
1  | 1      | ebay   | 155   | 2024-01-15 06:00:00
2  | 1      | goat   | 148   | 2024-01-15 06:05:00
3  | 1      | stockx | 152   | 2024-01-15 06:10:00
4  | 2      | ebay   | 98    | 2024-01-15 06:15:00
...
```

**Purpose**: Store individual prices from each source
**Growth**: ~100 rows per day (scales with catalog size)

### Table 3: `price_history` (Calculated Market Value)
```
id | sku_id | ecmv | confidence | components | timestamp
---|--------|------|------------|------------|----------
1  | 1      | 152.30 | High | {ebay:155, goat:148, stockx:152} | 2024-01-15 06:00:00
2  | 2      | 98.50  | Medium | {ebay:98, goat:99} | 2024-01-15 06:15:00
...
```

**Purpose**: The "answer" - calculated market prices with confidence scores
**Usage**: Mobile app queries this table

### Table 4: `api_keys` (Authentication)
```
id | key_hash | name | rate_limit | is_active | created_at
---|----------|------|------------|-----------|----------
1  | bcrypt_hash_of_key | Mobile App v1 | 1000 | true | 2024-01-01
```

**Purpose**: Store API keys (hashed) for mobile app access
**Security**: Never store plain keys, always use bcrypt hashes

---

## 🔐 Security Flow

```
Mobile App makes request:
│
├─ Request headers:
│  X-API-Key: sk_abc123xyz
│  Content-Type: application/json
│
├─ Backend validates:
│  1. Is the key present? (401 if missing)
│  2. Does bcrypt hash match stored hash? (401 if no)
│  3. Is the key active (not revoked)? (401 if revoked)
│  4. Have rate limits been exceeded? (429 if yes)
│
├─ If all pass: ✅ Request allowed
│
└─ If any fail: ❌ Return error (401 or 429)
```

---

## 💾 Caching Strategy

Why caching matters: Database queries are slow, cache is fast.

```
Mobile App requests: GET /api/prices/nike-jordan-1

Backend process:
│
├─ Check Redis cache for key: "prices:nike-jordan-1"
│
├─ Cache hit? ✅ (exists, <2 hours old)
│  └─ Return immediately (<50ms) ← FAST!
│
├─ Cache miss? (doesn't exist or expired)
│  ├─ Query PostgreSQL database
│  ├─ Store result in Redis (2-hour TTL)
│  └─ Return to client (may take 100-200ms) ← SLOWER
│
└─ Next request in <2 hours: cache hit again ✅
```

**Cache invalidation**: Automatic after 2 hours, or manually when prices update.

---

## 📱 Mobile App Integration

Your mobile app needs:

1. **API Endpoint**: `https://api.yourdomain.com`
2. **API Key**: `sk_xxxxxxxxxxxxx` (stored securely)
3. **HTTP Library**: Any (fetch, axios, etc.)

### Example Code:

```javascript
// Store API key securely (never in plain text)
const API_KEY = SecureStorage.get('api_key');
const API_BASE = 'https://api.yourdomain.com';

// Function to get price
async function getPrice(skuCode) {
  try {
    const response = await fetch(
      `${API_BASE}/api/prices/${skuCode}`,
      {
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 401) {
      throw new Error('Invalid API key');
    }
    if (response.status === 429) {
      throw new Error('Rate limited - try again in 1 minute');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching price:', error);
    // Show cached price or placeholder
  }
}

// Usage
const price = await getPrice('nike-air-jordan-1-retro-bred');
console.log(`Current price: $${price.ecmv}`);
```

---

## 🚀 Infrastructure Components

All running on a single VPS (~$5-10/month):

### 1. Docker Container: Node.js App
- Runs the API server
- Runs the price update scheduler
- Listens on port 3000 (internal)
- Communicates with PostgreSQL and Redis

### 2. Docker Container: PostgreSQL
- Stores all data (SKUs, prices, history)
- Listens on port 5432 (internal)
- Data persists in volumes
- Daily backups created

### 3. Docker Container: Redis
- In-memory cache
- Listens on port 6379 (internal)
- Stores temporary data (2-hour cache)
- Fast key-value lookups

### 4. Nginx (Host OS)
- Reverse proxy
- Listens on port 80 (HTTP) → redirects to 443
- Listens on port 443 (HTTPS)
- Handles SSL/TLS certificates
- Routes requests to Node.js app

### 5. File System (Host OS)
- Logs (application and system)
- Database backups
- Configuration files

---

## 🔄 API Endpoints

Your mobile app will call these endpoints:

### Get Price for Single Sneaker
```
GET /api/prices/{sku_code}
Headers: X-API-Key: sk_xxxxx
Response: {sku_code, ecmv, confidence, sources, last_updated}
```

Example:
```bash
curl -H "X-API-Key: sk_abc123" \
  https://api.yourdomain.com/api/prices/nike-jordan-1-retro-bred
```

### Get Price History
```
GET /api/prices/{sku_code}/history?days=30
Headers: X-API-Key: sk_xxxxx
Response: [Array of prices over time]
```

For showing 30-day trend charts.

### Search Sneakers
```
GET /api/skus?search=jordan
Headers: X-API-Key: sk_xxxxx
Response: [Array of matching SKUs]
```

For search functionality in mobile app.

### Get All Sneakers
```
GET /api/skus?tier=1
Headers: X-API-Key: sk_xxxxx
Response: [Array of all Tier 1 sneakers]
```

For filtering by popularity.

### Health Check (optional)
```
GET /api/health/prices
No auth needed
Response: {tier1_last_update, tier2_last_update, prices_count, errors}
```

For monitoring the system.

---

## 📈 Growth Over Time

### Week 1: MVP Launch
- 100-200 sneakers in catalog
- Prices updating 2-4 times daily
- Basic API working
- ~100 price records in database

### Week 2-4: Expansion
- 500+ sneakers in catalog
- Auto-discovery of new releases
- Mobile app fully integrated
- ~500 price records daily
- Database size: ~100MB

### Month 2+: Scaling
- 1,000+ sneakers in catalog
- Real user feedback
- Weight optimization based on market trends
- ~1,000+ price records daily
- Database size: ~500MB

---

## ⚠️ What Happens if Something Breaks?

### Scraper Fails (can't fetch from eBay/GOAT)
- ✅ Automatic retry with backoff
- ✅ Alert sent (email/Slack)
- ✅ Uses cached prices for 24h
- ✅ Price data becomes 1-24h stale
- ❌ Eventually shows outdated prices

**Recovery**: Usually fixes itself when service comes back online.

### Database Goes Down
- ❌ Can't store new prices
- ✅ API still returns cached prices (2-hour window)
- ✅ Automatic restart attempts every 30 seconds

**Recovery**: Restore from backup, re-run last 24h scrapes.

### API Server Crashes
- ❌ Mobile app gets connection error
- ✅ Shows app's last cached price

**Recovery**: Automatic restart via Docker healthchecks.

### Rate Limit Hit (429 response)
- ✅ Scheduler automatically backs off
- ✅ Retries after 1 hour
- ❌ Might miss one update cycle

**Prevention**: Keep scraper frequency low (1-4x per sneaker daily).

---

## 🎯 Key Metrics to Monitor

**Daily**:
- ✅ Did Tier 1 update 4 times?
- ✅ Did Tier 2 update 1 time?
- ✅ Any errors in logs?
- ✅ API responding <200ms?

**Weekly**:
- ✅ Database size growing normally?
- ✅ New sneakers being discovered?
- ✅ Zero IP bans?
- ✅ Cache hit rate >80%?

**Monthly**:
- ✅ Price accuracy vs. market?
- ✅ User feedback on prices?
- ✅ Need to expand catalog?
- ✅ Performance optimization needed?

---

## 📝 Summary

**What the system does**:
1. Automatically scrapes prices daily on a fixed schedule
2. Calculates weighted average prices (ECMV)
3. Stores data in database with 2-year history
4. Serves prices to mobile app via authenticated REST API
5. Caches responses for performance

**Key design principles**:
- Automation first (no manual updates)
- Data aggregation (multiple sources)
- API-first (mobile app uses REST)
- Security (API key + rate limiting)
- Reliability (backups, monitoring, alerts)

**Tech stack**:
- Node.js (backend + scheduler)
- PostgreSQL (data storage)
- Redis (caching)
- Nginx (reverse proxy)
- Docker (containerization)

**Cost**: ~$5-15/month (single VPS)

**Maintenance**: 5-10 min daily monitoring, 1-2 hours weekly expansion.

---

**The system is designed to be autonomous and reliable**, running without your intervention after the initial setup. Your mobile app simply calls the API and gets current sneaker prices! 🚀
