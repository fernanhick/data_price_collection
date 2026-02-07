# Sneaker Price Collection API Reference

Complete API documentation for the Sneaker Price Collection system.

**Base URL**: `http://localhost:3000` (development) or your production URL
**Version**: 2.0
**Last Updated**: 2026-02-07

---

## Table of Contents

1. [Authentication](#authentication)
2. [Public Endpoints](#public-endpoints)
3. [Auth Endpoints](#auth-endpoints)
4. [Price Endpoints](#price-endpoints)
5. [SKU Endpoints](#sku-endpoints)
6. [Analytics Endpoints](#analytics-endpoints)
7. [Admin Endpoints](#admin-endpoints)
8. [Error Handling](#error-handling)
9. [Data Models](#data-models)

---

## Authentication

The API supports two authentication methods:

### 1. Convex JWT (for mobile/consumer apps)

All consumer endpoints require a **Convex JWT token** in the Authorization header:

```http
Authorization: Bearer <CONVEX_JWT_TOKEN>
```

**Getting a token from your Expo app:**
```typescript
import { useAuth } from '@convex-dev/react';

const { getToken } = useAuth();
const token = await getToken();
```

### 2. Admin Authentication (for admin dashboard)

Admin endpoints require an **admin JWT token** obtained via email/password login:

```http
Authorization: Bearer <ADMIN_JWT_TOKEN>
```

**Token lifespan**: 7 days
**Get token**: POST `/api/auth/login`

---

## Public Endpoints

### Health Check

Check server and database health status.

```http
GET /health
```

**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-07T10:00:00.000Z",
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

---

## Auth Endpoints

### Login (Admin)

Authenticate an admin user with email and password.

```http
POST /api/auth/login
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "your-password"
}
```

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "name": "Admin User"
  }
}
```

**Error Responses:**
- `400` - Missing email or password
- `401` - Invalid email or password
- `500` - Server error

---

### Get Current User

Get information about the currently authenticated admin user.

```http
GET /api/auth/me
Authorization: Bearer <ADMIN_JWT_TOKEN>
```

**Response (200 OK):**
```json
{
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "name": "Admin User",
    "created_at": "2026-01-01T00:00:00Z",
    "last_login": "2026-02-07T09:00:00Z"
  }
}
```

**Error Responses:**
- `401` - Missing or invalid token
- `404` - User not found

---

## Price Endpoints

All price endpoints require **Convex JWT** authentication.

### Get Current Price

Get the current ECMV (Estimated Current Market Value) for a sneaker.

```http
GET /api/prices/:style_code
Authorization: Bearer <CONVEX_JWT_TOKEN>
```

**Parameters:**
- `style_code` (path) - Brand style code (e.g., "555088-610")

**Response (200 OK):**
```json
{
  "sku_code": "nike-jordan-1-retro-bred-2023",
  "style_code": "555088-610",
  "ecmv": 156.75,
  "confidence": "High",
  "user_id": "user_abc123",
  "last_updated": "2026-02-07T14:00:00Z",
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

**ECMV Calculation:**
```
ECMV = (eBay × 50%) + (GOAT × 35%) + (StockX × 15%)
```

**Confidence Levels:**
- `High` - 3+ sources, <10% variance, Tier 1-2
- `Medium` - 2 sources or higher variance
- `Low` - 1 source or Tier 3

**Error Responses:**
- `400` - Invalid style_code
- `404` - SKU not found or no price data
- `401` - Unauthorized

---

### Get Price History

Get historical ECMV data for trending analysis.

```http
GET /api/prices/:style_code/history?days=30
Authorization: Bearer <CONVEX_JWT_TOKEN>
```

**Parameters:**
- `style_code` (path) - Brand style code
- `days` (query, optional) - Number of days (default: 30, max: 365)

**Response (200 OK):**
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
    }
  ],
  "raw_prices": [
    {
      "source": "ebay",
      "price": 150.00,
      "timestamp": "2026-01-04T13:45:00Z"
    }
  ]
}
```

**Error Responses:**
- `400` - Invalid parameters
- `404` - SKU not found
- `401` - Unauthorized

---

## SKU Endpoints

All SKU endpoints require **Convex JWT** authentication.

### Search/List SKUs

Search and filter the sneaker catalog.

```http
GET /api/skus?search=jordan&brand=Nike&tier=1&limit=20&offset=0
Authorization: Bearer <CONVEX_JWT_TOKEN>
```

**Query Parameters:**
- `search` (optional) - Search by brand, model, colorway, or SKU code
- `brand` (optional) - Filter by exact brand name
- `tier` (optional) - Filter by tier (1, 2, or 3)
- `limit` (optional) - Results per page (default: 20, max: 100)
- `offset` (optional) - Pagination offset (default: 0)

**Response (200 OK):**
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
      "style_code": "555088-610",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro",
      "colorway": "Bred",
      "retail_price": 170.00,
      "tier": 1
    }
  ]
}
```

**Error Responses:**
- `400` - Invalid query parameters
- `401` - Unauthorized

---

### Get Sneaker Catalog (Lightweight)

Get a lightweight catalog for mobile app "Add Sneaker" feature.

```http
GET /api/skus/catalog?search=jordan&limit=100
Authorization: Bearer <CONVEX_JWT_TOKEN>
```

**Query Parameters:**
- `search` (optional) - Filter by brand, model, colorway, style code, or SKU code
- `limit` (optional) - Max results (default: 100, max: 500)

**Response (200 OK):**
```json
{
  "count": 342,
  "catalog": [
    {
      "id": 1,
      "sku_code": "nike-jordan-1-retro-bred-2023",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro",
      "colorway": "Bred",
      "style_code": "555088-610",
      "retail_price": 170.00,
      "tier": 1,
      "display_name": "Nike Air Jordan 1 Retro - Bred"
    }
  ]
}
```

**Use Cases:**
- Autocomplete/typeahead search in mobile app
- Quick catalog lookup for sneaker selection
- Browse available sneakers with minimal data transfer

**Differences from `/api/skus`:**
- Returns `display_name` pre-formatted for UI
- Excludes timestamps and metadata
- Higher default limit (100 vs 20)
- Optimized for selection UI

**Error Responses:**
- `400` - Invalid parameters
- `401` - Unauthorized

---

### Get Trending Sneakers

Get most popular sneakers (by price data points).

```http
GET /api/skus/trending/popular?limit=10
Authorization: Bearer <CONVEX_JWT_TOKEN>
```

**Query Parameters:**
- `limit` (optional) - Number of results (default: 10, max: 50)

**Response (200 OK):**
```json
{
  "count": 10,
  "trending": [
    {
      "id": 1,
      "sku_code": "nike-jordan-1-retro-bred-2023",
      "style_code": "555088-610",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro",
      "colorway": "Bred",
      "tier": 1,
      "price_data_points": 425,
      "average_price": 158.50
    }
  ]
}
```

**Use Cases:**
- Show "hot" sneakers with most price activity
- Identify sneakers with best data coverage
- Display trending items to users

**Error Responses:**
- `400` - Invalid limit parameter
- `401` - Unauthorized

---

### Get Sneaker Details

Get detailed information about a specific sneaker.

```http
GET /api/skus/:id
Authorization: Bearer <CONVEX_JWT_TOKEN>
```

**Parameters:**
- `id` (path) - Numeric SKU ID

**Response (200 OK):**
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
  "ebay_query": "Jordan 1 Bred",
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
- `401` - Unauthorized

---

## Analytics Endpoints

All analytics endpoints require **Convex JWT** authentication.

### Get Analytics Dashboard

Get comprehensive analytics about the sneaker catalog.

```http
GET /api/analytics
Authorization: Bearer <CONVEX_JWT_TOKEN>
```

**Response (200 OK):**
```json
{
  "summary": {
    "total": 1250,
    "brands": 15,
    "avgPrice": "185.50",
    "minPrice": "60.00",
    "maxPrice": "450.00"
  },
  "brands": [
    {
      "brand": "Nike",
      "count": 650,
      "avgPrice": "178.25",
      "minPrice": "60.00",
      "maxPrice": "450.00"
    }
  ],
  "tiers": [
    {
      "tier": 1,
      "count": 300,
      "avgPrice": "195.00"
    }
  ],
  "priceRanges": [
    {
      "range": "$150-$200",
      "count": 450
    }
  ],
  "recentlyAdded": [
    {
      "sku_code": "nike-dunk-low-panda",
      "brand": "Nike",
      "model": "Dunk Low",
      "colorway": "Panda",
      "retail_price": 110.00,
      "tier": 1,
      "created_at": "2026-02-06T10:00:00Z"
    }
  ],
  "topModels": [
    {
      "model": "Air Jordan 1 Retro",
      "brand": "Nike",
      "count": 125
    }
  ],
  "avgPriceByTier": [
    {
      "tier": 1,
      "avgPrice": "195.00",
      "count": 300
    }
  ]
}
```

**Error Responses:**
- `401` - Unauthorized
- `500` - Server error

---

## Admin Endpoints

All admin endpoints require **Admin JWT** authentication (both JWT + admin role).

### Create SKU

Create a new sneaker in the catalog.

```http
POST /api/admin/skus
Authorization: Bearer <ADMIN_JWT_TOKEN>
Content-Type: application/json
```

**Request Body:**
```json
{
  "brand_style_code": "555088-610",
  "sku_code": "nike-jordan-1-retro-bred-2023",
  "brand": "Nike",
  "model": "Air Jordan 1 Retro",
  "colorway": "Bred",
  "release_date": "2023-01-01",
  "retail_price": 170.00,
  "category": "Basketball",
  "tier": 1,
  "stockx_id": "air-jordan-1-retro-bred-2023",
  "goat_id": "nike-air-jordan-1-retro-bred",
  "ebay_query": "Jordan 1 Bred"
}
```

**Required Fields:**
- `brand_style_code` (string) - Manufacturer style code (primary identifier)
- `brand` (string) - Brand name
- `model` (string) - Model name
- `tier` (number) - Demand tier (1, 2, or 3)

**Optional Fields:**
- `sku_code` (string) - Defaults to `brand_style_code` if not provided
- `colorway` (string)
- `release_date` (string, YYYY-MM-DD)
- `retail_price` (number)
- `category` (string)
- `stockx_id` (string)
- `goat_id` (string)
- `ebay_query` (string)

**Response (201 Created):**
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
  "ebay_query": "Jordan 1 Bred",
  "created_at": "2026-02-07T10:00:00Z",
  "updated_at": "2026-02-07T10:00:00Z"
}
```

**Error Responses:**
- `400` - Validation error or style code already exists
- `401` - Unauthorized
- `500` - Server error

---

### Update SKU

Update an existing sneaker in the catalog.

```http
PUT /api/admin/skus/:id
Authorization: Bearer <ADMIN_JWT_TOKEN>
Content-Type: application/json
```

**Parameters:**
- `id` (path) - Numeric SKU ID

**Request Body:**
```json
{
  "retail_price": 180.00,
  "tier": 2,
  "colorway": "Bred (Updated)"
}
```

**Note:** Only include fields you want to update. All fields are optional.

**Response (200 OK):**
```json
{
  "id": 1,
  "sku_code": "nike-jordan-1-retro-bred-2023",
  "brand_style_code": "555088-610",
  "brand": "Nike",
  "model": "Air Jordan 1 Retro",
  "colorway": "Bred (Updated)",
  "release_date": "2023-01-01",
  "retail_price": 180.00,
  "category": "Basketball",
  "tier": 2,
  "stockx_id": "air-jordan-1-retro-bred-2023",
  "goat_id": "nike-air-jordan-1-retro-bred",
  "ebay_query": "Jordan 1 Bred",
  "created_at": "2026-02-07T10:00:00Z",
  "updated_at": "2026-02-07T10:30:00Z"
}
```

**Error Responses:**
- `400` - Invalid SKU ID or validation error
- `404` - SKU not found
- `401` - Unauthorized
- `500` - Server error

---

### Delete SKU

Delete a sneaker from the catalog (CASCADE deletes related prices and history).

```http
DELETE /api/admin/skus/:id
Authorization: Bearer <ADMIN_JWT_TOKEN>
```

**Parameters:**
- `id` (path) - Numeric SKU ID

**Response (200 OK):**
```json
{
  "success": true,
  "message": "SKU deleted successfully",
  "id": 1,
  "style_code": "555088-610"
}
```

**Error Responses:**
- `400` - Invalid SKU ID
- `404` - SKU not found
- `401` - Unauthorized
- `500` - Server error

---

### Get Recent SKUs

Get recently added SKUs for the activity dashboard.

```http
GET /api/admin/activity/recent-skus?limit=10
Authorization: Bearer <ADMIN_JWT_TOKEN>
```

**Query Parameters:**
- `limit` (optional) - Number of results (default: 10)

**Response (200 OK):**
```json
{
  "skus": [
    {
      "id": 150,
      "sku_code": "nike-dunk-low-panda",
      "brand_style_code": "DD1391-100",
      "brand": "Nike",
      "model": "Dunk Low",
      "colorway": "Panda",
      "tier": 1,
      "retail_price": 110.00,
      "created_at": "2026-02-07T09:00:00Z"
    }
  ],
  "count": 10
}
```

**Error Responses:**
- `401` - Unauthorized
- `500` - Server error

---

### Get Recent Prices

Get recently added price points for the activity dashboard.

```http
GET /api/admin/activity/recent-prices?limit=10
Authorization: Bearer <ADMIN_JWT_TOKEN>
```

**Query Parameters:**
- `limit` (optional) - Number of results (default: 10)

**Response (200 OK):**
```json
{
  "prices": [
    {
      "id": 5432,
      "sku_id": 150,
      "source": "ebay",
      "price": 125.00,
      "timestamp": "2026-02-07T09:45:00Z",
      "sku_code": "nike-dunk-low-panda",
      "brand_style_code": "DD1391-100",
      "brand": "Nike",
      "model": "Dunk Low"
    }
  ],
  "count": 10
}
```

**Error Responses:**
- `401` - Unauthorized
- `500` - Server error

---

## Error Handling

### Standard Error Response

All error responses follow this format:

```json
{
  "error": "Error message",
  "message": "Optional detailed message",
  "details": [
    {
      "field": "brand_style_code",
      "message": "Required field missing"
    }
  ]
}
```

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Data returned successfully |
| 201 | Created | SKU created successfully |
| 400 | Bad Request | Invalid query parameters or validation error |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | Valid JWT but insufficient permissions |
| 404 | Not Found | SKU doesn't exist |
| 500 | Server Error | Database connection failed |
| 503 | Service Unavailable | Temporary server issue |

---

## Data Models

### SKU Object

```typescript
{
  id: number;
  sku_code: string;
  brand_style_code: string;  // Primary identifier (e.g., "555088-610")
  brand: string;
  model: string;
  colorway?: string;
  release_date?: string;     // YYYY-MM-DD format
  retail_price?: number;
  category?: string;
  tier: 1 | 2 | 3;          // 1=High demand, 2=Medium, 3=Long-tail
  stockx_id?: string;
  goat_id?: string;
  ebay_query?: string;
  created_at: string;        // ISO 8601
  updated_at: string;        // ISO 8601
}
```

### Price Response

```typescript
{
  sku_code: string;
  style_code: string;
  ecmv: number;              // Estimated Current Market Value
  confidence: "High" | "Medium" | "Low";
  user_id: string;
  last_updated: string;      // ISO 8601
  components: {
    ebay_price?: number;
    goat_price?: number;
    stockx_price?: number;
    weights: {
      w1: number;            // eBay weight (0.50)
      w2: number;            // GOAT weight (0.35)
      w3: number;            // StockX weight (0.15)
    }
  }
}
```

### Tier System

| Tier | Update Frequency | Example Sneakers |
|------|-----------------|------------------|
| 1 | 4x daily (6h apart) | Jordan 1, Dunk SB, Yeezy 350 |
| 2 | 1x daily (24h) | Popular retros, recent releases |
| 3 | 2x weekly (3.5 days) | Long-tail, niche releases |

---

## Rate Limiting

All endpoints are rate-limited:

- **Per User**: Based on JWT identity
- **Global**: 100 requests per minute per IP (configurable)
- **Response Headers**: `X-RateLimit-*` headers included

**Rate limit response (429):**
```json
{
  "error": "Rate limit exceeded",
  "retry_after": 30
}
```

---

## Mobile App Integration Example

### React Native / Expo

```typescript
// hooks/useSneakerAPI.ts
import { useAuth } from '@convex-dev/react';

const API_BASE = 'https://api.yourdomain.com';

export function useSneakerAPI() {
  const { getToken } = useAuth();

  const getPrice = async (styleCode: string) => {
    const token = await getToken();
    const response = await fetch(
      `${API_BASE}/api/prices/${styleCode}`,
      {
        headers: { 'Authorization': `Bearer ${token}` },
      }
    );
    return response.json();
  };

  const searchCatalog = async (query: string) => {
    const token = await getToken();
    const response = await fetch(
      `${API_BASE}/api/skus/catalog?search=${encodeURIComponent(query)}`,
      {
        headers: { 'Authorization': `Bearer ${token}` },
      }
    );
    return response.json();
  };

  return { getPrice, searchCatalog };
}

// Usage in component
function PriceScreen() {
  const { getPrice } = useSneakerAPI();

  const fetchPrice = async () => {
    const data = await getPrice('555088-610');
    console.log(`Price: $${data.ecmv}`);
  };

  return <Button onPress={fetchPrice} title="Get Price" />;
}
```

---

## Changelog

### Version 2.0 (2026-02-07)
- Added admin authentication system (email/password)
- Changed primary identifier from `sku_code` to `brand_style_code` (style code)
- Added `/api/auth/login` and `/api/auth/me` endpoints
- Added admin activity endpoints (`/api/admin/activity/recent-skus`, `/api/admin/activity/recent-prices`)
- Separated admin JWT from Convex JWT
- Updated all endpoints to use `style_code` consistently

### Version 1.0 (2026-02-02)
- Initial release with price endpoints and catalog search
- Convex JWT authentication
- Basic CRUD operations for SKUs
- ECMV calculation and price history

---

## Support

**Documentation**: See `/docs` folder for additional guides
**Issues**: Report issues in your project tracker
**Environment**: Check `/health` endpoint for system status
