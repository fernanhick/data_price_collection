# Sneaker Price Collection API

Backend API for aggregating sneaker market prices from public sources (eBay, GOAT, StockX) with Convex JWT authentication.

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 13+
- Redis (optional, for caching)
- npm or yarn

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment

Copy `.env.example` to `.env` and configure your values:

```bash
cp .env.example .env
```

**Key Configuration**:
- `CONVEX_URL`: Your Convex deployment URL
- `CONVEX_JWKS_URL`: Your Convex JWKS endpoint (`.well-known/jwks.json`)
- `DATABASE_URL`: PostgreSQL connection string
- `NODE_ENV`: Set to `development` for local development

### 3. Initialize Database

```bash
npm run db:migrate
```

This creates all required tables (skus, prices, price_history, etc.)

### 4. Seed Initial Data

```bash
npm run db:seed
```

This adds ~15 popular sneakers to get started.

### 5. Start Development Server

```bash
npm run dev
```

Server runs on `http://localhost:3000`

## Project Structure

```
src/
├── config/          # Configuration loading
├── db/              # Database setup and schema
├── middleware/      # Express middleware (JWT verification, etc.)
├── routes/          # API route handlers
├── services/        # Business logic
│   ├── scrapers/    # eBay, GOAT, StockX data fetchers
│   └── pricing/     # ECMV calculation engine
├── scripts/         # CLI utilities (migration, seeding)
├── types/           # TypeScript type definitions
├── utils/           # Utility functions (logger, etc.)
└── index.ts         # Express app entry point
```

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run compiled JavaScript
- `npm test` - Run test suite
- `npm run db:migrate` - Initialize database schema
- `npm run db:seed` - Add initial sneaker data
- `npm run scraper:test` - Test scraper functionality
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## API Endpoints

### Health Check (Public)
```
GET /health
```

Returns server and database health status.

### Get Price (Protected)
```
GET /api/prices/:sku_code
Authorization: Bearer <JWT_TOKEN>
```

Returns current ECMV and price breakdown for a sneaker.

### Search Sneakers (Protected)
```
GET /api/skus?search=jordan
Authorization: Bearer <JWT_TOKEN>
```

Search catalog for sneakers by name.

## Authentication

All protected endpoints require a Convex JWT token in the `Authorization` header:

```
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

The JWT is verified stateless using Convex's public key (cached 24 hours).

## Development Roadmap

### Phase 0: Environment Setup ✅
- Project structure
- Database schema
- Basic API skeleton
- JWT verification

### Phase 1: Data Collection
- eBay scraper
- GOAT scraper
- Price storage
- Scheduler setup

### Phase 2: Price Calculation
- ECMV calculation engine
- Confidence scoring
- Price smoothing

### Phase 3: Production Hardening
- Error handling
- Monitoring
- Load testing
- Documentation

## Testing

```bash
npm test
```

## Deployment

### Docker (Recommended)

```bash
docker build -t sneaker-api .
docker run -p 3000:3000 --env-file .env sneaker-api
```

### Environment Variables for Production

Ensure these are set in your production environment:
- `NODE_ENV=production`
- `CONVEX_URL` - Your Convex deployment
- `DATABASE_URL` - Production PostgreSQL
- `REDIS_URL` - Production Redis (optional)

## Database

Tables created by migration:
- `skus` - Sneaker catalog
- `prices` - Individual price points from sources
- `price_history` - Calculated ECMV values
- `fetch_logs` - Scraper operation logs
- `api_usage` - Usage analytics (optional)

## Logging

Logs are output to console in development (pretty-printed) and JSON in production.

Log level configurable via `LOG_LEVEL` environment variable (debug, info, warn, error).

## Legal & Compliance

- All data sourced from **public** sources only (eBay, GOAT)
- StockX usage restricted to sparse calibration (Tier 1 only, ≤1x/day)
- No personal user data collected (JWT-based, stateless)
- Reference data only - not for trading
- Full ToS and disclaimer in mobile app

## Support

For issues or questions, refer to:
- `PLAN.md` - Architecture and design decisions
- `SYSTEM_OVERVIEW.md` - System architecture
- `CODE_NAMING_STANDARDS.md` - Code style guide
