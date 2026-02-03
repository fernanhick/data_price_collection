# API Testing Guide

Quick guide to test the API endpoints locally.

## Prerequisites

1. Server running: `npm run dev`
2. Database seeded: `npm run db:seed`
3. Prices collected: `npm run scraper:test` (or wait for scheduler)

## Testing Without JWT (Development)

For development, you can test the public `/health` endpoint without JWT:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-02T23:30:00Z",
  "environment": "development",
  "scheduler": {
    "enabled": true,
    "tier1": { "running": true, ... },
    "tier2": { "running": true, ... },
    "tier3": { "running": true, ... }
  }
}
```

## Getting a JWT Token

For testing protected endpoints, you need a JWT token. There are two ways:

### Option 1: Use Your Convex App

If you have the Expo app with Convex auth:

```typescript
// In your Expo app console or component
import { useAuth } from '@convex-dev/react';

const { getToken } = useAuth();
const token = await getToken();
console.log(token);
```

### Option 2: Create a Test JWT (Development Only)

For development/testing without Convex, you can create a fake JWT:

```bash
# Create a test JWT (use this for development only)
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { sub: 'test-user-123', iss: 'https://your-convex-url.convex.cloud' },
  'your-secret-key'
);
console.log('JWT:', token);
"
```

**⚠️ Note**: This won't work in production since the signature won't match Convex's public key. For production testing, use your actual Convex app.

## Testing API Endpoints

### 1. Health Check (No JWT needed)

```bash
curl http://localhost:3000/health | jq
```

### 2. Search Sneaker Catalog

```bash
# Search for Jordan
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  'http://localhost:3000/api/skus?search=jordan' | jq

# Get all Tier 1 sneakers
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  'http://localhost:3000/api/skus?tier=1' | jq

# Search Nike brand
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  'http://localhost:3000/api/skus?brand=Nike&limit=5' | jq
```

### 3. Get Sneaker Details

```bash
# Get SKU with ID 1
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  'http://localhost:3000/api/skus/1' | jq
```

### 4. Get Current Price

```bash
# Get price for specific sneaker
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  'http://localhost:3000/api/prices/nike-jordan-1-retro-bred-2023' | jq
```

### 5. Get Price History

```bash
# Get last 7 days of price history
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  'http://localhost:3000/api/prices/nike-jordan-1-retro-bred-2023/history?days=7' | jq
```

### 6. Get Trending Sneakers

```bash
# Get top 10 trending sneakers
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  'http://localhost:3000/api/skus/trending/popular?limit=10' | jq
```

## Full Testing Script

Save this as `test-api.sh`:

```bash
#!/bin/bash

# Configuration
API_BASE="http://localhost:3000"
JWT_TOKEN="${1:-}"

if [ -z "$JWT_TOKEN" ]; then
  echo "Usage: ./test-api.sh <JWT_TOKEN>"
  echo ""
  echo "If you don't have a JWT token, test the public endpoint:"
  echo "  curl $API_BASE/health | jq"
  exit 1
fi

echo "🧪 Testing Sneaker Price API"
echo ""

# Test 1: Health check
echo "✓ Test 1: Health Check (no JWT needed)"
curl -s "$API_BASE/health" | jq .status
echo ""

# Test 2: Search sneakers
echo "✓ Test 2: Search for Jordan"
curl -s -H "Authorization: Bearer $JWT_TOKEN" \
  "$API_BASE/api/skus?search=jordan&limit=3" | jq '.skus[0]'
echo ""

# Test 3: Get sneaker details
echo "✓ Test 3: Get sneaker with ID 1"
curl -s -H "Authorization: Bearer $JWT_TOKEN" \
  "$API_BASE/api/skus/1" | jq '.id, .sku_code, .brand'
echo ""

# Test 4: Get price
echo "✓ Test 4: Get current price"
FIRST_SKU=$(curl -s -H "Authorization: Bearer $JWT_TOKEN" \
  "$API_BASE/api/skus?limit=1" | jq -r '.skus[0].sku_code')

if [ "$FIRST_SKU" != "null" ] && [ -n "$FIRST_SKU" ]; then
  echo "Getting price for: $FIRST_SKU"
  curl -s -H "Authorization: Bearer $JWT_TOKEN" \
    "$API_BASE/api/prices/$FIRST_SKU" | jq '.ecmv, .confidence'
else
  echo "No SKU found in catalog"
fi
echo ""

# Test 5: Get price history
echo "✓ Test 5: Get price history (last 7 days)"
if [ "$FIRST_SKU" != "null" ] && [ -n "$FIRST_SKU" ]; then
  curl -s -H "Authorization: Bearer $JWT_TOKEN" \
    "$API_BASE/api/prices/$FIRST_SKU/history?days=7" | jq '.stats'
fi
echo ""

# Test 6: Get trending
echo "✓ Test 6: Get trending sneakers"
curl -s -H "Authorization: Bearer $JWT_TOKEN" \
  "$API_BASE/api/skus/trending/popular?limit=5" | jq '.trending[0]'
echo ""

echo "✅ All tests completed!"
```

Run it:
```bash
chmod +x test-api.sh
./test-api.sh "your-jwt-token-here"
```

## Testing with Postman

Import this collection:

```json
{
  "info": {
    "name": "Sneaker Price API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Health Check",
      "request": {
        "method": "GET",
        "url": "http://localhost:3000/health"
      }
    },
    {
      "name": "Search SKUs",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{jwt_token}}"
          }
        ],
        "url": "http://localhost:3000/api/skus?search=jordan"
      }
    },
    {
      "name": "Get Price",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{jwt_token}}"
          }
        ],
        "url": "http://localhost:3000/api/prices/nike-jordan-1-retro-bred-2023"
      }
    }
  ]
}
```

Set `jwt_token` variable in Postman with your token.

## Testing with React/TypeScript

Create `src/api-test.ts`:

```typescript
const API_BASE = 'http://localhost:3000';

async function testAPI(jwtToken: string) {
  console.log('Testing API...');

  try {
    // Test 1: Search
    const searchRes = await fetch(
      `${API_BASE}/api/skus?search=jordan&limit=5`,
      {
        headers: { 'Authorization': `Bearer ${jwtToken}` },
      }
    );
    const sneakers = await searchRes.json();
    console.log('✓ Search:', sneakers.skus[0]);

    // Test 2: Get price
    const sku = sneakers.skus[0];
    const priceRes = await fetch(
      `${API_BASE}/api/prices/${sku.sku_code}`,
      {
        headers: { 'Authorization': `Bearer ${jwtToken}` },
      }
    );
    const price = await priceRes.json();
    console.log('✓ Price:', price.ecmv, `(${price.confidence})`);

    // Test 3: Get history
    const histRes = await fetch(
      `${API_BASE}/api/prices/${sku.sku_code}/history?days=7`,
      {
        headers: { 'Authorization': `Bearer ${jwtToken}` },
      }
    );
    const history = await histRes.json();
    console.log('✓ History:', history.stats);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

export { testAPI };
```

## Troubleshooting

### "Unauthorized" Error

**Problem**: `401 Unauthorized`

**Solution**:
1. Make sure you have a valid JWT token
2. Check token is not expired
3. Verify Authorization header format: `Bearer <token>` (with space)

**Test**:
```bash
# Wrong format (no Bearer)
curl -H "Authorization: $TOKEN" http://localhost:3000/api/skus

# Correct format
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/skus
```

### "SKU Not Found" Error

**Problem**: `404 Not found`

**Solution**:
1. Run `npm run db:seed` to add sample sneakers
2. Use correct SKU code (check with search endpoint)
3. Check database has data: `psql -d sneaker_prices -c "SELECT COUNT(*) FROM skus;"`

### "No Price Data Available"

**Problem**: Endpoint returns no price data

**Solution**:
1. Run `npm run scraper:test` to collect price data
2. Wait for scheduled update (check `/health` for scheduler status)
3. Check database: `psql -d sneaker_prices -c "SELECT COUNT(*) FROM prices;"`

### Database Connection Error

**Problem**: `ECONNREFUSED 127.0.0.1:5432`

**Solution**:
1. Start PostgreSQL: `docker-compose up -d`
2. Run migrations: `npm run db:migrate`
3. Check database running: `docker-compose ps`

## Performance Testing

Test API performance with concurrent requests:

```bash
# Install Apache Bench if needed
# brew install httpd (macOS)
# apt-get install apache2-utils (Linux)

# Test 100 requests, 10 concurrent
ab -n 100 -c 10 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/skus?limit=1
```

Expected:
- Response time: < 200ms (p99)
- Throughput: > 50 req/sec

## Load Testing

Use k6 for more comprehensive load testing:

```bash
npm install -g k6
```

Create `load-test.js`:

```javascript
import http from 'k6/http';
import { check } from 'k6';

const API_BASE = 'http://localhost:3000';
const JWT_TOKEN = __ENV.JWT_TOKEN;

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m30s', target: 100 },
    { duration: '20s', target: 0 },
  ],
};

export default function () {
  const headers = { 'Authorization': `Bearer ${JWT_TOKEN}` };

  // Test price endpoint
  const res = http.get(`${API_BASE}/api/prices/nike-jordan-1-retro-bred-2023`, { headers });
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
```

Run:
```bash
k6 run --env JWT_TOKEN="your-token" load-test.js
```

## Next Steps

✅ API endpoints implemented
✅ JWT authentication working
✅ Database integration complete

Next phase:
- [ ] Deploy to production VPS
- [ ] Setup HTTPS with Let's Encrypt
- [ ] Configure CORS for Expo app
- [ ] Setup monitoring and alerts
- [ ] Add caching layer (Redis)
