# Development Guide - Sneaker Price API

## Getting Started

### 1. Prerequisites

- Node.js 18+ (https://nodejs.org/)
- PostgreSQL 13+ (https://www.postgresql.org/)
- Docker & Docker Compose (for local PostgreSQL/Redis, optional)
- Git

### 2. Local Development Setup

#### Step 1: Install Dependencies

```bash
npm install
```

#### Step 2: Setup Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
NODE_ENV=development
PORT=3000

# Database (PostgreSQL)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sneaker_prices
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sneaker_prices
DB_USER=postgres
DB_PASSWORD=postgres

# Redis (optional, for caching)
REDIS_URL=redis://localhost:6379

# Convex Configuration
CONVEX_URL=https://your-convex-deployment.convex.cloud
CONVEX_JWKS_URL=https://your-convex-deployment.convex.cloud/.well-known/jwks.json

# API Configuration
MAX_REQUESTS_PER_MINUTE=100
CACHE_TTL_SECONDS=7200

# Scraper Configuration
REQUEST_TIMEOUT_MS=10000
RETRY_ATTEMPTS=3

# Logging
LOG_LEVEL=info

# Scheduler
ENABLE_SCHEDULER=true
TIER_1_CRON=0 5 * * *
TIER_2_CRON=0 14 * * *
TIER_3_CRON=0 10 * * 1,4
```

### 3. Database Setup

#### Using Docker Compose (Recommended)

Start PostgreSQL and Redis containers:

```bash
docker-compose up -d
```

This creates:
- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`

#### Using Local PostgreSQL

Create the database manually:

```sql
createdb sneaker_prices
```

### 4. Initialize Database Schema

Run migrations to create tables:

```bash
npm run db:migrate
```

This creates:
- `skus` - Sneaker catalog
- `prices` - Individual price points
- `price_history` - Calculated ECMV values
- `fetch_logs` - Scraper operation logs
- `api_usage` - Usage analytics

### 5. Seed Initial Data

Add 15 popular sneakers to test:

```bash
npm run db:seed
```

### 6. Start Development Server

```bash
npm run dev
```

Server starts on `http://localhost:3000`

Test health endpoint:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-02T23:30:00.000Z",
  "environment": "development",
  "scheduler": {
    "enabled": true,
    "tier1": { "running": true, "schedule": "0 5 * * *" },
    "tier2": { "running": true, "schedule": "0 14 * * *" },
    "tier3": { "running": true, "schedule": "0 10 * * 1,4" }
  }
}
```

## Testing the eBay Scraper

### Quick Test

```bash
npm run scraper:test
```

This will:
1. Test direct eBay searches for sample sneakers
2. Fetch prices from the database
3. Store results in PostgreSQL
4. Display price statistics

### Manual Testing

Test a single eBay query:

```typescript
import { EbayScraper } from './src/services/scrapers/ebay';

const scraper = new EbayScraper();
const listings = await scraper.searchSoldListings('Nike Jordan 1 Bred', 10);
console.log(listings);
```

## Architecture

### Project Structure

```
src/
├── config/              # Configuration loading
├── db/                  # Database setup & schema
├── middleware/          # Express middleware
│   └── verifyJWT.ts    # Convex JWT verification
├── routes/              # API route handlers (TODO)
├── services/
│   ├── scrapers/
│   │   └── ebay.ts     # eBay scraper
│   ├── pricing/
│   │   └── priceFetcher.ts  # Price storage & fetching
│   └── scheduler.ts     # Cron-based price updates
├── scripts/
│   ├── migrate.ts       # Database schema
│   ├── seed.ts          # Initial data
│   └── test-scraper.ts  # Scraper testing
├── types/               # TypeScript definitions
├── utils/
│   ├── logger.ts        # Pino logger
│   └── http.ts          # HTTP utilities with retry
└── index.ts             # Express app entry
```

### Data Pipeline

```
┌──────────────────────────────────────────┐
│      Scheduler (Tier-based)              │
│  Tier 1: 1x/day  |  Tier 2: 1x/day     │
│                  |  Tier 3: 2x/week    │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│    PriceFetcher Service                  │
│  - Fetches from eBay, GOAT, StockX     │
│  - Calculates statistics (median, avg)  │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│    eBay Scraper                          │
│  - Searches public sold listings        │
│  - Extracts prices from HTML            │
│  - Handles retries & rate limiting      │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│    PostgreSQL Database                   │
│  - Stores raw prices & price history    │
│  - Maintains SKU catalog               │
│  - Logs fetch operations                │
└──────────────────────────────────────────┘
```

## Convex JWT Integration

### Setting Up Convex

1. Deploy your Expo app with Convex authentication
2. Get your Convex deployment URL: `https://your-deployment.convex.cloud`
3. The public JWKS URL is at: `https://your-deployment.convex.cloud/.well-known/jwks.json`

### Environment Setup

Add to `.env`:
```env
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_JWKS_URL=https://your-deployment.convex.cloud/.well-known/jwks.json
```

### JWT Verification Flow

1. Expo app authenticates user via Convex
2. Convex issues RS256-signed JWT token
3. Mobile app sends JWT in `Authorization: Bearer <token>` header
4. VPS backend verifies JWT signature against Convex public key
5. No database lookup needed (stateless!)

**Example request from Expo app:**
```typescript
const token = await getToken(); // From Convex auth

const response = await fetch('https://api.yourdomain.com/api/prices/nike-jordan-1', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

## Building Features

### Add a New API Endpoint

1. Create route handler in `src/routes/`
2. Import `verifyConvexJWT` middleware
3. Register in `src/index.ts`

Example:
```typescript
// src/routes/prices.ts
import { Router } from 'express';
import { verifyConvexJWT } from '../middleware/verifyJWT.js';

const router = Router();

router.get('/:sku_code', verifyConvexJWT, async (req, res) => {
  const { sku_code } = req.params;
  const userId = (req as any).user.userId; // From JWT

  // Get price from database
  // Return to client
});

export default router;
```

### Add a New Scraper

1. Create scraper class in `src/services/scrapers/`
2. Implement data fetching and parsing
3. Use `fetchUrl()` from `src/utils/http.ts` for HTTP requests
4. Store results using `query()` from `src/db/index.ts`

Example:
```typescript
// src/services/scrapers/goat.ts
export class GOATScraper {
  async searchListings(query: string): Promise<GOATListing[]> {
    const url = this.buildUrl(query);
    const html = await fetchUrl(url);
    const listings = this.parseHTML(html);
    return listings;
  }
}
```

## Deployment

### System Dependencies for Puppeteer/Chrome (StockX scraper)

The `StockxScraper` launches Puppeteer's bundled headless Chrome, which requires
several system shared libraries (GTK, X11, audio, etc.) that are NOT installed
by default on minimal Ubuntu/Debian server images (e.g. EC2 instances). Without
them, Chrome fails to launch with `error while loading shared libraries: ...`
and StockX price fetches silently fail.

On any new deployment server, run:

```bash
./scripts/install-chrome-deps.sh
```

### Proxy for StockX/GOAT (optional)

Set `SCRAPER_PROXY_URL` (format: `http://username:password@host:port`) to route
StockX (Puppeteer) and GOAT (Algolia API) requests through a proxy, reducing the
risk of IP-based blocking. Leave unset to use the server's own IP (current
default behavior, no proxy).

### Runbook: StockX/GOAT IP block (no proxy configured yet)

Until `SCRAPER_PROXY_URL` is set up, the server's Elastic IP is the only IP
StockX/GOAT ever see. If scrapes start failing consistently (StockX circuit
breaker tripping every run, GOAT 403s), the IP is likely flagged. Quick reset:

1. AWS Console → EC2 → Elastic IPs → select the IP attached to the instance.
2. Actions → Disassociate address, then Actions → Associate address → pick a
   new/different Elastic IP and attach it to the instance.
3. No app restart needed — outbound requests immediately use the new IP.
4. If you have a spare Elastic IP, swapping back and forth between two takes
   seconds; otherwise allocate a new one (AWS allows a few free per account).

This is a stopgap. Once `SCRAPER_PROXY_URL` is configured, requests route
through the proxy and this step shouldn't be needed.

### Docker Build

```bash
# Build image
docker build -t sneaker-api:latest .

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e CONVEX_URL=https://... \
  sneaker-api:latest
```

### Environment Variables for Production

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/db
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_JWKS_URL=https://your-deployment.convex.cloud/.well-known/jwks.json
LOG_LEVEL=info
ENABLE_SCHEDULER=true
```

### Using Docker Compose

```bash
docker-compose up -d
```

This starts:
- PostgreSQL (port 5432)
- Redis (port 6379)
- Optional: Node.js app (port 3000, uncomment in docker-compose.yml)

## Monitoring

### Check Server Health

```bash
curl http://localhost:3000/health
```

### View Logs

Development (pretty-printed):
```bash
npm run dev
```

Production (JSON):
Check container logs:
```bash
docker logs <container-id>
```

### Database Queries

Connect to PostgreSQL:
```bash
psql postgresql://postgres:postgres@localhost:5432/sneaker_prices
```

Check latest prices:
```sql
SELECT * FROM prices ORDER BY timestamp DESC LIMIT 10;
```

Check SKU inventory:
```sql
SELECT COUNT(*) FROM skus;
SELECT * FROM skus WHERE tier = 1;
```

## Common Issues

### Database Connection Failed

**Error**: `ECONNREFUSED 127.0.0.1:5432`

**Solution**:
1. Check PostgreSQL is running: `docker-compose ps`
2. Verify DATABASE_URL in `.env`
3. Create database: `createdb sneaker_prices`

### Scraper Returns No Results

**Cause**: Website structure changed or IP blocked

**Solution**:
1. Check User-Agent header in `src/utils/http.ts`
2. Add delay between requests: see `MIN_REQUEST_INTERVAL_MS`
3. Check eBay website directly in browser
4. Verify search query format

### JWT Verification Fails

**Error**: `Invalid or expired token`

**Solution**:
1. Verify `CONVEX_JWKS_URL` in `.env`
2. Check Convex deployment is live
3. Ensure token is recent (not expired)
4. Verify issuer matches `CONVEX_URL`

## Development Workflow

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes and test locally
3. Run linting: `npm run lint`
4. Format code: `npm run format`
5. Commit: `git add . && git commit -m "Add feature"`
6. Push: `git push origin feature/my-feature`
7. Create pull request

## Next Steps

- [ ] Implement `GET /api/prices/:sku_code` endpoint
- [ ] Implement `GET /api/skus` search endpoint
- [ ] Add GOAT scraper
- [ ] Add StockX sparse calibration
- [ ] Implement ECMV calculation
- [ ] Add Redis caching layer
- [ ] Setup production monitoring
- [ ] Load testing (1000+ concurrent users)
