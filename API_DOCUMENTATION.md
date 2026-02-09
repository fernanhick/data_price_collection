# Sneaker Price API Documentation

## Table of Contents
- [Overview](#overview)
- [Base URL](#base-url)
- [Authentication](#authentication)
- [Common Response Formats](#common-response-formats)
- [Error Codes](#error-codes)
- [Rate Limiting](#rate-limiting)
- [Endpoints](#endpoints)
  - [Health Check](#health-check)
  - [Authentication](#authentication-endpoints)
  - [SKUs (Sneaker Catalog)](#skus-endpoints)
  - [Prices](#price-endpoints)
  - [Analytics](#analytics-endpoints)
  - [Admin (Protected)](#admin-endpoints)
- [Data Models](#data-models)
- [Examples](#examples)

---

## Overview

The Sneaker Price API provides real-time footwear market data aggregated from multiple sources (StockX, GOAT, eBay). It calculates ECMV (Estimated Current Market Value) for sneakers using weighted algorithms.

**Features:**
- 1,000+ footwear products (sneakers, boots, slides, sandals)
- Real-time price aggregation from multiple marketplaces
- Tiered update frequency (Tier 1: 4x daily, Tier 2: 1x daily, Tier 3: 2x weekly)
- Advanced search and filtering
- Price history tracking
- Analytics and trending data

---

## Base URL

```
Production: https://api.sneakersbook.com
Development: http://localhost:3000
```

All endpoints are prefixed with `/api` unless otherwise noted.

---

## Authentication

### JWT Authentication (Required for all API endpoints except `/health` and `/api/auth/*`)

The API uses JWT tokens issued by Convex for authentication.

**Header Format:**
```
Authorization: Bearer <your-jwt-token>
```

**Token Structure:**
- Issuer: Convex
- Algorithm: RS256
- Contains: `userId`, `tokenId`, `iat`, `exp`

**Getting a Token:**
Use the `/api/auth/login` endpoint (currently for admin only) or implement Convex authentication in your mobile app.

### Admin Authorization

Admin endpoints require both:
1. Valid JWT token
2. User ID in the admin whitelist (configured server-side)

---

## Common Response Formats

### Success Response
```json
{
  "data": { ... },
  "timestamp": "2026-02-09T01:00:00.000Z"
}
```

### Error Response
```json
{
  "error": "Error message",
  "details": "Additional error details (optional)"
}
```

### Paginated Response
```json
{
  "total": 1064,
  "count": 20,
  "limit": 20,
  "offset": 0,
  "has_more": true,
  "data": [ ... ]
}
```

---

## Error Codes

| Status Code | Meaning |
|------------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad Request - Invalid parameters |
| `401` | Unauthorized - Missing or invalid JWT token |
| `403` | Forbidden - Valid token but insufficient permissions |
| `404` | Not Found - Resource doesn't exist |
| `429` | Too Many Requests - Rate limit exceeded |
| `500` | Internal Server Error |
| `503` | Service Unavailable - Database or service down |

---

## Rate Limiting

- **Default**: No hard rate limit currently enforced
- **Recommended**: Max 60 requests per minute per user
- **API Usage Tracking**: All requests are logged with user_id for analytics

---

## Endpoints

### Health Check

#### `GET /health`

Check API and database health status.

**Authentication:** None required

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-09T01:00:00.000Z",
  "environment": "production",
  "scheduler": {
    "tier1": { "active": true, "schedule": "0 6,12,18,0 * * *" },
    "tier2": { "active": true, "schedule": "0 14 * * *" },
    "tier3": { "active": true, "schedule": "0 10 * * 1,4" }
  }
}
```

---

### Authentication Endpoints

#### `POST /api/auth/login`

Admin login endpoint (for admin dashboard access).

**Authentication:** None required

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "securepassword"
}
```

**Response:**
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
- `401`: Invalid credentials
- `400`: Missing email or password

---

### SKUs Endpoints

#### `GET /api/skus`

Search and list footwear products in the catalog.

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `search` | string | No | - | Search by name, brand, model, or colorway |
| `brand` | string | No | - | Filter by exact brand name |
| `tier` | integer | No | - | Filter by tier (1, 2, or 3) |
| `limit` | integer | No | 20 | Results per page (max: 100) |
| `offset` | integer | No | 0 | Pagination offset |

**Response:**
```json
{
  "total": 1064,
  "count": 20,
  "limit": 20,
  "offset": 0,
  "has_more": true,
  "skus": [
    {
      "id": 1,
      "sku_code": "555088-001",
      "style_code": "555088-001",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro High OG",
      "colorway": "Shadow",
      "retail_price": 170.00,
      "tier": 1
    }
  ]
}
```

**Example Requests:**
```bash
# Search for Jordan 1s
GET /api/skus?search=Jordan%201&limit=10

# Filter by brand
GET /api/skus?brand=Nike&tier=1&limit=50

# Pagination
GET /api/skus?limit=20&offset=20
```

---

#### `GET /api/skus/catalog`

Get lightweight catalog for autocomplete/selection (optimized for mobile).

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `search` | string | No | - | Search across all fields including style_code |
| `limit` | integer | No | 100 | Results limit (max: 500) |

**Response:**
```json
{
  "count": 100,
  "catalog": [
    {
      "id": 1,
      "sku_code": "555088-001",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro High OG",
      "colorway": "Shadow",
      "style_code": "555088-001",
      "retail_price": 170.00,
      "tier": 1,
      "display_name": "Nike Air Jordan 1 Retro High OG - Shadow"
    }
  ]
}
```

**Use Case:** Ideal for mobile app autocomplete fields, product selection dropdowns.

---

#### `GET /api/skus/trending/popular`

Get most popular sneakers based on price data volume.

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | integer | No | 10 | Number of trending items (max: 50) |

**Response:**
```json
{
  "count": 10,
  "trending": [
    {
      "id": 1,
      "sku_code": "555088-001",
      "style_code": "555088-001",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro High OG",
      "colorway": "Shadow",
      "tier": 1,
      "price_data_points": 247,
      "average_price": 185.50
    }
  ]
}
```

---

#### `GET /api/skus/:id`

Get detailed information for a single SKU including current price.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | integer | Yes | SKU database ID |

**Response:**
```json
{
  "id": 1,
  "sku_code": "555088-001",
  "style_code": "555088-001",
  "brand": "Nike",
  "model": "Air Jordan 1 Retro High OG",
  "colorway": "Shadow",
  "release_date": "2018-04-14",
  "retail_price": 170.00,
  "category": "basketball",
  "tier": 1,
  "stockx_id": "air-jordan-1-retro-high-og-shadow-2018",
  "goat_id": null,
  "created_at": "2026-01-15T10:30:00.000Z",
  "updated_at": "2026-02-09T01:00:00.000Z",
  "current_price": {
    "ecmv": 185.50,
    "confidence": "High",
    "last_updated": "2026-02-09T00:45:00.000Z"
  },
  "data_quality": {
    "price_points": 247,
    "data_available": true
  }
}
```

**Error Responses:**
- `400`: Invalid SKU ID
- `404`: SKU not found

---

### Price Endpoints

#### `GET /api/prices/:style_code`

Get current market price (ECMV) for a specific sneaker by style code.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `style_code` | string | Yes | Product style code (e.g., "555088-001") |

**Response:**
```json
{
  "style_code": "555088-001",
  "ecmv": 185.50,
  "confidence": "High",
  "last_updated": "2026-02-09T00:45:00.000Z",
  "components": {
    "ebay_price": 180.00,
    "goat_price": 190.00,
    "stockx_price": 187.00,
    "weights": {
      "w1": 0.3,
      "w2": 0.4,
      "w3": 0.3
    }
  }
}
```

**Confidence Levels:**
- `High`: 10+ price data points
- `Medium`: 5-9 price data points
- `Low`: 1-4 price data points

**Error Responses:**
- `400`: Invalid or missing style_code
- `404`: Style code not found
- `404`: No price data available for this SKU

---

#### `GET /api/prices/:style_code/history`

Get historical price data for a specific sneaker.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `style_code` | string | Yes | Product style code |

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `days` | integer | No | 30 | Number of days of history (max: 365) |
| `limit` | integer | No | 100 | Max data points (max: 1000) |

**Response:**
```json
{
  "style_code": "555088-001",
  "history": [
    {
      "ecmv": 185.50,
      "confidence": "High",
      "timestamp": "2026-02-09T00:00:00.000Z",
      "components": {
        "ebay_price": 180.00,
        "goat_price": 190.00,
        "stockx_price": 187.00
      }
    },
    {
      "ecmv": 183.00,
      "confidence": "High",
      "timestamp": "2026-02-08T00:00:00.000Z",
      "components": {
        "ebay_price": 178.00,
        "goat_price": 188.00,
        "stockx_price": 185.00
      }
    }
  ],
  "summary": {
    "current_price": 185.50,
    "min_price": 175.00,
    "max_price": 192.00,
    "avg_price": 184.25,
    "data_points": 30
  }
}
```

---

#### `POST /api/prices/refresh/:style_code`

Trigger manual price refresh for a specific SKU (fetches latest prices from all sources).

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `style_code` | string | Yes | Product style code |

**Response:**
```json
{
  "success": true,
  "style_code": "555088-001",
  "ecmv": 185.50,
  "confidence": "High",
  "sources_updated": ["ebay", "goat", "stockx"],
  "timestamp": "2026-02-09T01:00:00.000Z"
}
```

**Notes:**
- Price updates are rate-limited to prevent abuse
- Updates may take 10-30 seconds to complete
- Response includes newly calculated ECMV

---

### Analytics Endpoints

#### `GET /api/analytics`

Get analytics overview and statistics.

**Authentication:** Required

**Response:**
```json
{
  "total_skus": 1064,
  "total_prices": 245789,
  "by_tier": {
    "tier_1": { "count": 156, "avg_price": 215.50 },
    "tier_2": { "count": 423, "avg_price": 145.75 },
    "tier_3": { "count": 485, "avg_price": 95.25 }
  },
  "top_brands": [
    { "brand": "Nike", "count": 487, "avg_price": 175.50 },
    { "brand": "Adidas", "count": 234, "avg_price": 145.25 },
    { "brand": "New Balance", "count": 145, "avg_price": 155.75 }
  ],
  "recently_added": [
    {
      "id": 1064,
      "style_code": "DZ5485-410",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro High OG",
      "colorway": "True Blue",
      "created_at": "2026-02-08T14:30:00.000Z"
    }
  ],
  "price_update_status": {
    "tier_1_last_update": "2026-02-09T00:00:00.000Z",
    "tier_2_last_update": "2026-02-08T14:00:00.000Z",
    "tier_3_last_update": "2026-02-07T10:00:00.000Z"
  }
}
```

---

### Admin Endpoints

**Note:** All admin endpoints require both JWT authentication AND admin authorization.

#### `GET /api/admin/dashboard`

Get admin dashboard statistics and activity summary.

**Authentication:** Required (Admin only)

**Response:**
```json
{
  "total_skus": 1064,
  "total_prices": 245789,
  "total_admin_users": 3,
  "recent_activity": [
    {
      "id": 15234,
      "user_id": "user_123",
      "endpoint": "/api/prices/555088-001",
      "method": "GET",
      "status_code": 200,
      "timestamp": "2026-02-09T00:55:00.000Z"
    }
  ],
  "system_health": {
    "database": "healthy",
    "scheduler": "active"
  }
}
```

---

#### `GET /api/admin/skus`

Get paginated list of all SKUs with admin metadata.

**Authentication:** Required (Admin only)

**Query Parameters:** Same as `/api/skus`

**Response:** Same as `/api/skus` with additional admin fields

---

#### `POST /api/admin/skus`

Add a new SKU to the catalog.

**Authentication:** Required (Admin only)

**Request Body:**
```json
{
  "style_code": "555088-105",
  "sku_code": "555088-105",
  "brand": "Nike",
  "model": "Air Jordan 1 Retro High OG",
  "colorway": "Chicago",
  "retail_price": 170.00,
  "tier": 1,
  "category": "basketball",
  "release_date": "2015-05-30"
}
```

**Required Fields:**
- `style_code` (unique)
- `brand`
- `model`
- `tier` (1, 2, or 3)

**Response:**
```json
{
  "id": 1065,
  "style_code": "555088-105",
  "sku_code": "555088-105",
  "brand": "Nike",
  "model": "Air Jordan 1 Retro High OG",
  "colorway": "Chicago",
  "retail_price": 170.00,
  "tier": 1,
  "category": "basketball",
  "release_date": "2015-05-30",
  "created_at": "2026-02-09T01:00:00.000Z",
  "updated_at": "2026-02-09T01:00:00.000Z"
}
```

**Error Responses:**
- `400`: Validation error (missing required fields)
- `409`: Style code already exists

---

#### `PUT /api/admin/skus/:id`

Update an existing SKU.

**Authentication:** Required (Admin only)

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | integer | Yes | SKU database ID |

**Request Body:** (all fields optional)
```json
{
  "tier": 2,
  "retail_price": 180.00,
  "category": "lifestyle"
}
```

**Response:**
```json
{
  "id": 1065,
  "style_code": "555088-105",
  "brand": "Nike",
  "model": "Air Jordan 1 Retro High OG",
  "colorway": "Chicago",
  "retail_price": 180.00,
  "tier": 2,
  "category": "lifestyle",
  "updated_at": "2026-02-09T01:05:00.000Z"
}
```

---

#### `DELETE /api/admin/skus/:id`

Delete a SKU from the catalog.

**Authentication:** Required (Admin only)

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | integer | Yes | SKU database ID |

**Response:**
```json
{
  "success": true,
  "message": "SKU deleted successfully",
  "id": 1065
}
```

**Notes:**
- Deleting a SKU will cascade delete all associated price data
- This action is irreversible

---

#### `GET /api/admin/recent-skus`

Get recently added SKUs for admin dashboard.

**Authentication:** Required (Admin only)

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | integer | No | 10 | Number of SKUs (max: 100) |

**Response:**
```json
{
  "recent_skus": [
    {
      "id": 1064,
      "style_code": "DZ5485-410",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro High OG",
      "colorway": "True Blue",
      "tier": 1,
      "created_at": "2026-02-08T14:30:00.000Z"
    }
  ]
}
```

---

#### `GET /api/admin/recent-prices`

Get recent price updates for monitoring.

**Authentication:** Required (Admin only)

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | integer | No | 20 | Number of records (max: 100) |

**Response:**
```json
{
  "recent_prices": [
    {
      "id": 245789,
      "sku_id": 1,
      "style_code": "555088-001",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro High OG",
      "ecmv": 185.50,
      "confidence": "High",
      "timestamp": "2026-02-09T00:45:00.000Z"
    }
  ]
}
```

---

## Data Models

### SKU (Sneaker Product)

```typescript
{
  id: number;                  // Unique database ID
  sku_code?: string;           // Optional legacy SKU code
  style_code: string;          // Primary identifier (UNIQUE)
  brand: string;               // Brand name (e.g., "Nike", "Adidas")
  model: string;               // Model name (e.g., "Air Jordan 1 Retro High OG")
  colorway: string;            // Colorway description (e.g., "Shadow", "Chicago")
  release_date?: string;       // ISO date string (YYYY-MM-DD)
  retail_price?: number;       // Original retail price in USD
  category?: string;           // Product category (e.g., "basketball", "running")
  tier: 1 | 2 | 3;            // Update frequency tier
  stockx_id?: string;          // StockX product identifier
  goat_id?: string;            // GOAT product identifier
  ebay_query?: string;         // eBay search query
  created_at: string;          // ISO timestamp
  updated_at: string;          // ISO timestamp
}
```

### Price Data

```typescript
{
  style_code: string;          // Product identifier
  ecmv: number;                // Estimated Current Market Value (USD)
  confidence: "High" | "Medium" | "Low";  // Data confidence level
  last_updated: string;        // ISO timestamp
  components: {
    ebay_price?: number;       // eBay average price
    goat_price?: number;       // GOAT lowest ask
    stockx_price?: number;     // StockX lowest ask
    weights?: {
      w1: number;              // eBay weight (0-1)
      w2: number;              // GOAT weight (0-1)
      w3?: number;             // StockX weight (0-1)
    }
  }
}
```

### Tier System

| Tier | Description | Update Frequency | Use Case |
|------|-------------|------------------|----------|
| **1** | High-demand sneakers | 4x daily (6am, 12pm, 6pm, 12am) | Hyped releases, limited editions |
| **2** | Medium-demand | 1x daily (2pm) | Popular general releases |
| **3** | Long-tail catalog | 2x weekly (Mon & Thu 10am) | Archive, GR releases |

---

## Examples

### Example 1: Search for Jordan 1s

**Request:**
```bash
curl -X GET "https://api.sneakersbook.com/api/skus?search=Jordan%201&limit=5" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "total": 45,
  "count": 5,
  "limit": 5,
  "offset": 0,
  "has_more": true,
  "skus": [
    {
      "id": 1,
      "sku_code": "555088-001",
      "style_code": "555088-001",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro High OG",
      "colorway": "Shadow",
      "retail_price": 170.00,
      "tier": 1
    }
  ]
}
```

### Example 2: Get Current Price

**Request:**
```bash
curl -X GET "https://api.sneakersbook.com/api/prices/555088-001" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "style_code": "555088-001",
  "ecmv": 185.50,
  "confidence": "High",
  "last_updated": "2026-02-09T00:45:00.000Z",
  "components": {
    "ebay_price": 180.00,
    "goat_price": 190.00,
    "stockx_price": 187.00,
    "weights": {
      "w1": 0.3,
      "w2": 0.4,
      "w3": 0.3
    }
  }
}
```

### Example 3: Get Trending Sneakers

**Request:**
```bash
curl -X GET "https://api.sneakersbook.com/api/skus/trending/popular?limit=5" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "count": 5,
  "trending": [
    {
      "id": 1,
      "sku_code": "555088-001",
      "style_code": "555088-001",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro High OG",
      "colorway": "Shadow",
      "tier": 1,
      "price_data_points": 247,
      "average_price": 185.50
    }
  ]
}
```

### Example 4: Mobile App - Product Autocomplete

**Request:**
```bash
curl -X GET "https://api.sneakersbook.com/api/skus/catalog?search=dunk&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "count": 10,
  "catalog": [
    {
      "id": 45,
      "sku_code": "DV0833-101",
      "brand": "Nike",
      "model": "Dunk Low",
      "colorway": "Team Green",
      "style_code": "DV0833-101",
      "retail_price": 115.00,
      "tier": 2,
      "display_name": "Nike Dunk Low - Team Green"
    }
  ]
}
```

---

## Notes for Mobile Development

### Best Practices

1. **Token Storage**: Store JWT tokens securely using platform-specific secure storage (Keychain on iOS, EncryptedSharedPreferences on Android)

2. **Caching**: Cache API responses locally to improve performance and reduce API calls
   - SKU catalog: Cache for 24 hours
   - Price data: Cache for 1 hour (varies by tier)
   - Analytics: Cache for 6 hours

3. **Error Handling**: Always handle network errors gracefully
   ```javascript
   try {
     const response = await fetch(url, { headers });
     if (!response.ok) throw new Error(response.statusText);
     const data = await response.json();
   } catch (error) {
     // Show user-friendly error message
   }
   ```

4. **Pagination**: Use `limit` and `offset` for large lists to avoid loading too much data

5. **Search Debouncing**: Debounce search input to avoid excessive API calls (recommended: 300-500ms delay)

6. **Refresh Strategy**:
   - Pull-to-refresh for manual updates
   - Auto-refresh price data based on tier (Tier 1: every 6 hours, Tier 2: daily, Tier 3: weekly)

### Recommended Endpoints for Mobile Apps

- **Home Screen**: `/api/analytics` (overview) + `/api/skus/trending/popular`
- **Search**: `/api/skus/catalog` (autocomplete) → `/api/skus` (full search)
- **Product Details**: `/api/skus/:id` (includes current price)
- **Price History**: `/api/prices/:style_code/history`

---

## Support

For API support, issues, or feature requests:
- GitHub: https://github.com/fernanhick/data_price_collection
- Documentation updates: Check repository for latest changes

**Last Updated:** February 9, 2026
**API Version:** 1.0
**Maintained by:** data_price_collection team
