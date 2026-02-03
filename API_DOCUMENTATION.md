# API Documentation - Sneaker Price Collection API

## Overview

The API provides authenticated access to sneaker price data aggregated from eBay, GOAT, and StockX (sparse calibration).

All endpoints require **Convex JWT authentication** (except `/health`).

## Authentication

### JWT Token Requirement

All protected endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Getting a Token

From your Expo app authenticated with Convex:

```typescript
import { useAuth } from '@convex-dev/react';

const { getToken } = useAuth();
const jwtToken = await getToken();
```

### Token Validation

- **Algorithm**: RS256 (asymmetric)
- **Signature**: Verified against Convex public key
- **Issuer**: Your Convex deployment URL
- **Expiry**: Handled by Convex (typically 24 hours)
- **User ID**: Available in JWT claims as `sub` (subject)

## Endpoints

### 1. Health Check (Public)

```
GET /health
```

No authentication required. Returns server and database health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-02T23:30:00.000Z",
  "environment": "development",
  "scheduler": {
    "enabled": true,
    "tier1": {
      "running": true,
      "schedule": "0 6,12,18,0 * * *"
    },
    "tier2": {
      "running": true,
      "schedule": "0 14 * * *"
    },
    "tier3": {
      "running": true,
      "schedule": "0 10 * * 1,4"
    }
  }
}
```

### 2. Get Current Price (ECMV)

```
GET /api/prices/:sku_code
Authorization: Bearer <JWT_TOKEN>
```

Get the current Estimated Current Market Value (ECMV) for a sneaker.

**Parameters:**
- `sku_code` (path, required) - Unique sneaker identifier
  - Example: `nike-jordan-1-retro-bred-2023`

**Response (200):**
```json
{
  "sku_code": "nike-jordan-1-retro-bred-2023",
  "style_code": "555088-610",
  "ecmv": 156.75,
  "confidence": "High",
  "user_id": "user_abc123",
  "last_updated": "2026-02-02T14:00:00Z",
  "components": {
    "ebay_price": 155.00,
    "goat_price": 160.00,
    "stockx_price": 158.00,
    "weights": {
      "w1": 0.5,
      "w2": 0.35,
      "w3": 0.15
    }
  }
}
```

**Error Responses:**
- `400` - Invalid SKU code
- `404` - SKU not found or no price data available
- `401` - Unauthorized (missing or invalid JWT)

**How ECMV is Calculated:**
```
ECMV = (eBay_Price × 0.50) + (GOAT_Price × 0.35) + (StockX_Price × 0.15)

Weights:
- eBay: 50% (highest liquidity, actual transactions)
- GOAT: 35% (secondary signal, lowest ask)
- StockX: 15% (optional calibration, sparse)
```

**Confidence Levels:**
- `High`: 3+ sources, <10% variance, Tier 1-2 demand
- `Medium`: 2 sources or higher variance
- `Low`: 1 source or Tier 3 (long-tail) sneaker

### 3. Get Price History

```
GET /api/prices/:sku_code/history?days=30
Authorization: Bearer <JWT_TOKEN>
```

Get historical ECMV data for trending analysis.

**Parameters:**
- `sku_code` (path, required) - Unique sneaker identifier
- `days` (query, optional) - Number of days to retrieve (default: 30, max: 365)

**Response (200):**
```json
{
  "sku_code": "nike-jordan-1-retro-bred-2023",
  "style_code": "555088-610",
  "days": 30,
  "data_points": 120,
  "stats": {
    "min": 145.00,
    "max": 175.00,
    "avg": 158.30,
    "current": 156.75
  },
  "history": [
    {
      "id": 1,
      "sku_id": 5,
      "style_code": "555088-610",
      "ecmv": 152.00,
      "confidence": "Medium",
      "components": { ... },
      "timestamp": "2026-01-04T14:00:00Z"
    },
    ...
  ],
  "raw_prices": [
    {
      "source": "ebay",
      "price": 150.00,
      "timestamp": "2026-01-04T13:45:00Z"
    },
    ...
  ]
}
```

**Error Responses:**
- `400` - Invalid parameters (SKU code, days)
- `404` - SKU not found
- `401` - Unauthorized (missing or invalid JWT)

### 4. Search Sneaker Catalog

```
GET /api/skus?search=jordan&brand=Nike&tier=1&limit=20&offset=0
Authorization: Bearer <JWT_TOKEN>
```

Search and filter the sneaker catalog.

**Parameters:**
- `search` (query, optional) - Text search (brand, model, colorway, SKU code)
- `brand` (query, optional) - Filter by exact brand name
- `tier` (query, optional) - Filter by tier (1, 2, or 3)
- `limit` (query, optional) - Results per page (default: 20, max: 100)
- `offset` (query, optional) - Pagination offset (default: 0)

**Response (200):**
```json
{
  "total": 342,
  "count": 20,
  "limit": 20,
  "offset": 0,
  "has_more": true,
  "skus": [
    {
      "id": 1,
      "sku_code": "nike-jordan-1-retro-bred-2023",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro",
      "colorway": "Bred",
      "retail_price": 170.00,
      "tier": 1
    },
    ...
  ]
}
```

**Example Queries:**
```bash
# Search for Jordan sneakers
GET /api/skus?search=jordan

# Get all Tier 1 (popular) sneakers
GET /api/skus?tier=1

# Search Nike brand
GET /api/skus?brand=Nike&limit=50

# Paginate results
GET /api/skus?limit=20&offset=20
```

**Error Responses:**
- `400` - Invalid query parameters
- `401` - Unauthorized (missing or invalid JWT)

### 5. Get Sneaker Details

```
GET /api/skus/:id
Authorization: Bearer <JWT_TOKEN>
```

Get detailed information about a specific sneaker.

**Parameters:**
- `id` (path, required) - Numeric SKU ID

**Response (200):**
```json
{
  "id": 1,
  "sku_code": "nike-jordan-1-retro-bred-2023",
  "brand_style_code": "555088-610",
  "brand": "Nike",
  "model": "Air Jordan 1 Retro",
  "colorway": "Bred",
  "release_date": "2023-01-01",
  "retail_price": 170.00,
  "category": "Basketball",
  "tier": 1,
  "stockx_id": "air-jordan-1-retro-bred-2023",
  "goat_id": "nike-air-jordan-1-retro-bred",
  "created_at": "2026-02-01T00:00:00Z",
  "updated_at": "2026-02-02T12:00:00Z",
  "current_price": {
    "ecmv": 156.75,
    "confidence": "High",
    "last_updated": "2026-02-02T14:00:00Z"
  },
  "data_quality": {
    "price_points": 425,
    "data_available": true
  }
}
```

**Error Responses:**
- `400` - Invalid SKU ID
- `404` - SKU not found
- `401` - Unauthorized (missing or invalid JWT)

### 6. Get Trending Sneakers

```
GET /api/skus/trending/popular?limit=10
Authorization: Bearer <JWT_TOKEN>
```

Get most actively tracked sneakers (by price data points).

**Parameters:**
- `limit` (query, optional) - Number of results (default: 10, max: 50)

**Response (200):**
```json
{
  "count": 10,
  "trending": [
    {
      "id": 1,
      "sku_code": "nike-jordan-1-retro-bred-2023",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro",
      "colorway": "Bred",
      "tier": 1,
      "price_data_points": 425,
      "average_price": 158.50
    },
    ...
  ]
}
```

**Use Cases:**
- Show "hot" sneakers with most price activity
- Identify which sneakers have best data coverage
- Display trending items to users

**Error Responses:**
- `400` - Invalid limit parameter
- `401` - Unauthorized (missing or invalid JWT)

## Error Handling

### Standard Error Response

```json
{
  "error": "Error message",
  "message": "Optional detailed message"
}
```

### Common HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Price data returned |
| 400 | Bad Request | Invalid query parameters |
| 401 | Unauthorized | Missing or invalid JWT token |
| 404 | Not Found | SKU doesn't exist |
| 500 | Server Error | Database connection failed |
| 503 | Service Unavailable | Temporary server issue |

## Rate Limiting

All endpoints are rate-limited to prevent abuse:

- **Per User**: Based on JWT identity
- **Global**: 100 requests per minute per IP (configurable)
- **Response Header**: `X-RateLimit-*` headers included in responses

If rate limited, API returns:
```json
{
  "error": "Rate limit exceeded",
  "retry_after": 30
}
```

## Data Freshness

Price update frequency depends on demand tier:

| Tier | Examples | Update Frequency | Confidence |
|------|----------|------------------|-----------|
| 1 | Jordan 1, Dunk SB, Yeezy | 4x daily (6h apart) | High |
| 2 | Popular retros, recent | 1x daily (24h) | Medium |
| 3 | Long-tail, niche | 2x weekly (3.5 days) | Low |

**Last Updated** field in response indicates data age:
- < 6 hours: Fresh (Tier 1)
- 6-24 hours: Moderate (Tier 2)
- > 24 hours: Stale (Tier 3)

## Mobile App Integration

### Example: React Native / Expo

```typescript
import { useAuth } from '@convex-dev/react';

const API_BASE = 'https://api.yourdomain.com';

export function useSneakerPrices() {
  const { getToken } = useAuth();

  const getPrice = async (skuCode: string) => {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(
      `${API_BASE}/api/prices/${skuCode}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
  };

  const searchSneakers = async (query: string) => {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(
      `${API_BASE}/api/skus?search=${encodeURIComponent(query)}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
  };

  const getPriceHistory = async (skuCode: string, days: number = 30) => {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(
      `${API_BASE}/api/prices/${skuCode}/history?days=${days}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
  };

  return { getPrice, searchSneakers, getPriceHistory };
}

// Usage in component
function PriceScreen() {
  const { getPrice } = useSneakerPrices();

  const fetchPrice = async () => {
    try {
      const data = await getPrice('nike-jordan-1-retro-bred-2023');
      console.log(`Price: $${data.ecmv}`);
      console.log(`Confidence: ${data.confidence}`);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return <Button onPress={fetchPrice} title="Get Price" />;
}
```

## Legal & Compliance

### Data Disclaimer

> "This service provides **reference market value estimates** based on public marketplace data. These estimates are for informational purposes only and may not reflect real-time market conditions. Prices may lag actual trading by several hours."

### Data Sources

- **eBay**: Public sold listings (primary signal - 50% weight)
- **GOAT**: Public product pages (secondary signal - 35% weight)
- **StockX**: Sparse calibration only (top 300 SKUs, ≤1x/day - 15% weight)

### Usage Rights

- ✅ Use for price estimation in your app
- ✅ Display to end users for reference
- ✅ Store historical data
- ❌ Resell or redistribute data
- ❌ Use for speculative trading decisions
- ❌ Violate data source Terms of Service

## Support & Debugging

### Check API Status

```bash
curl https://api.yourdomain.com/health
```

### Test JWT Verification

```bash
# Get token from Expo app
TOKEN=$(get_token_from_expo)

# Test endpoint
curl -H "Authorization: Bearer $TOKEN" \
  https://api.yourdomain.com/api/skus?limit=1
```

### Check Database

```bash
psql postgresql://localhost/sneaker_prices
SELECT COUNT(*) FROM skus;
SELECT COUNT(*) FROM prices;
SELECT COUNT(*) FROM price_history;
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-02 | Initial release with price endpoints and catalog search |

## Roadmap

Planned features:
- [ ] Price alerts / webhooks
- [ ] Historical trend analysis
- [ ] User watchlists (Convex integration)
- [ ] GOAT scraper integration
- [ ] StockX expanded coverage (with caching)
- [ ] Real-time WebSocket updates
- [ ] Analytics dashboard
