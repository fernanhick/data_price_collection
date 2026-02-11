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
  - [Images](#image-endpoints)
  - [Prices](#price-endpoints)
  - [Analytics](#analytics-endpoints)
  - [Admin (Protected)](#admin-endpoints)
- [Data Models](#data-models)
- [Examples](#examples)
- [Image Implementation Guide](#image-implementation-guide)

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
             http://[::1]:3000                (IPv6 localhost)
             http://192.168.1.73:3000         (Local IPv4)
             http://[2a0e:1d47:8685:5500::3d]:3000  (Public IPv6)
```

All endpoints are prefixed with `/api` unless otherwise noted.

### Network Configuration

**Dual-Stack Support (IPv4 + IPv6):**
- API server listens on all interfaces via IPv6 wildcard address (`::`)
- Supports both IPv4 and IPv6 clients simultaneously
- IPv4 clients connect via IPv4-mapped IPv6 addresses (transparent to client)
- Optimal for modern networks and CGNAT bypass scenarios

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
      "tier": 1,
      "image_url": "/images/sneakers/555088-001.webp",
      "image_thumbnail_url": "/images/sneakers/thumbs/555088-001.webp"
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
      "image_url": "/images/sneakers/555088-001.webp",
      "image_thumbnail_url": "/images/sneakers/thumbs/555088-001.webp",
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

### Image Endpoints

#### Image Serving (Static Files)

Product images are served automatically as static files. All images are included in SKU API responses via `image_url` and `image_thumbnail_url` fields.

**Image URL Structure:**
```
/images/sneakers/{filename}.webp           # Full-size image (600x600)
/images/sneakers/thumbs/{filename}.webp    # Thumbnail (200x200)
```

**Image Specifications:**
| Property | Value |
|----------|-------|
| Format | WebP (modern, optimized format) |
| Full Size | 600x600 pixels, 80% quality, ~15-20 KB |
| Thumbnail | 200x200 pixels, 75% quality, ~5-8 KB |
| Coverage | 1,082 of 1,116 sneakers (97%) |

**Usage in Frontend:**

Simply use the `image_url` and `image_thumbnail_url` from SKU responses:

```javascript
// From /api/skus or /api/skus/catalog responses:
const thumbnailSrc = `https://api.sneakersbook.com${sneaker.image_thumbnail_url}`;
const fullImageSrc = `https://api.sneakersbook.com${sneaker.image_url}`;
```

**Examples:**

Full-size image:
```
https://api.sneakersbook.com/images/sneakers/555088-001.webp
```

Thumbnail image:
```
https://api.sneakersbook.com/images/sneakers/thumbs/555088-001.webp
```

**Notes:**
- Images are optimized and cached locally on the server
- All API responses for SKUs automatically include image URLs
- If `image_url` is `null`, the image is being processed or unavailable
- Thumbnails should be used for lists and grids for better performance
- Full images are ideal for product detail pages
- Use lazy loading in frontend for better performance

**Implementation Tips:**
1. Always use `image_thumbnail_url` for lists/grids
2. Implement lazy loading with `loading="lazy"` attribute
3. Add error handling for broken images with fallback placeholders
4. Cache images locally in your app when possible
5. Use responsive image sizing for different device types

**See Also:** [IMAGE-IMPLEMENTATION-GUIDE.md](./IMAGE-IMPLEMENTATION-GUIDE.md) for comprehensive frontend examples (React, Vue, vanilla JS)

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

Get historical price data for a specific sneaker with flexible time ranges.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `style_code` | string | Yes | Product style code (e.g., "555088-001") |

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `days` | integer | No | 30 | Number of days of history (max: 365) |
| `limit` | integer | No | 100 | Max data points returned (max: 1000) |

**Common Time Ranges:**
- **30 days** (1 month): `days=30` - Default, ideal for recent trends
- **60 days** (2 months): `days=60` - Good for medium-term analysis
- **90 days** (3 months): `days=90` - Quarter view, seasonal trends
- **180 days** (6 months): `days=180` - Half-year analysis
- **365 days** (1 year): `days=365` - Full year historical data

**Response:**
```json
{
  "style_code": "555088-001",
  "days_requested": 30,
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
    },
    {
      "ecmv": 181.50,
      "confidence": "High",
      "timestamp": "2026-02-07T00:00:00.000Z",
      "components": {
        "ebay_price": 177.00,
        "goat_price": 186.00,
        "stockx_price": 183.00
      }
    }
  ],
  "summary": {
    "current_price": 185.50,
    "min_price": 175.00,
    "max_price": 192.00,
    "avg_price": 184.25,
    "price_change": {
      "amount": 10.50,
      "percentage": 6.0
    },
    "data_points": 30,
    "date_range": {
      "start": "2026-01-10T00:00:00.000Z",
      "end": "2026-02-09T00:00:00.000Z"
    }
  }
}
```

**Example Requests:**

**30-Day History (Default):**
```bash
GET /api/prices/555088-001/history
# or explicitly
GET /api/prices/555088-001/history?days=30
```

**60-Day History:**
```bash
GET /api/prices/555088-001/history?days=60
```

**90-Day History with Limited Data Points:**
```bash
GET /api/prices/555088-001/history?days=90&limit=50
```

**1-Year Full History:**
```bash
GET /api/prices/555088-001/history?days=365&limit=365
```

**Processing Guide for Mobile Apps:**

**1. Requesting Different Time Ranges:**
```javascript
// Define your time range presets
const TIME_RANGES = {
  WEEK: 7,
  MONTH: 30,
  TWO_MONTHS: 60,
  QUARTER: 90,
  HALF_YEAR: 180,
  YEAR: 365
};

// Function to fetch price history
async function fetchPriceHistory(styleCode, days = TIME_RANGES.MONTH) {
  const url = `${API_BASE}/api/prices/${styleCode}/history?days=${days}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch history: ${response.statusText}`);
  }

  return await response.json();
}

// Usage examples
const monthlyData = await fetchPriceHistory('555088-001', TIME_RANGES.MONTH);
const quarterlyData = await fetchPriceHistory('555088-001', TIME_RANGES.QUARTER);
const yearlyData = await fetchPriceHistory('555088-001', TIME_RANGES.YEAR);
```

**2. Processing History Data for Charts:**
```javascript
// Transform API data for chart libraries (Chart.js, Victory, etc.)
function processHistoryForChart(historyData) {
  const { history, summary } = historyData;

  // Sort by date (oldest to newest) for proper chart display
  const sortedHistory = [...history].sort((a, b) =>
    new Date(a.timestamp) - new Date(b.timestamp)
  );

  // Extract data for chart
  const chartData = {
    labels: sortedHistory.map(item => {
      const date = new Date(item.timestamp);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }),
    datasets: [
      {
        label: 'Market Price',
        data: sortedHistory.map(item => item.ecmv),
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4
      }
    ]
  };

  return {
    chartData,
    summary: {
      current: summary.current_price,
      min: summary.min_price,
      max: summary.max_price,
      average: summary.avg_price,
      change: summary.price_change
    }
  };
}

// Usage
const data = await fetchPriceHistory('555088-001', 30);
const chartReady = processHistoryForChart(data);
```

**3. Calculating Price Trends:**
```javascript
function analyzePriceTrend(historyData) {
  const { history, summary } = historyData;

  if (history.length < 2) {
    return { trend: 'insufficient_data' };
  }

  // Sort by date
  const sorted = [...history].sort((a, b) =>
    new Date(a.timestamp) - new Date(b.timestamp)
  );

  const oldest = sorted[0].ecmv;
  const newest = sorted[sorted.length - 1].ecmv;
  const change = newest - oldest;
  const percentChange = (change / oldest) * 100;

  return {
    trend: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable',
    change: change.toFixed(2),
    percentChange: percentChange.toFixed(2),
    direction: change > 0 ? '↑' : change < 0 ? '↓' : '→',
    volatility: calculateVolatility(sorted),
    summary: {
      start_price: oldest,
      end_price: newest,
      highest: summary.max_price,
      lowest: summary.min_price
    }
  };
}

function calculateVolatility(sortedHistory) {
  const prices = sortedHistory.map(h => h.ecmv);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((sum, price) =>
    sum + Math.pow(price - avg, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);

  // Volatility as percentage of average price
  const volatility = (stdDev / avg) * 100;

  return {
    value: volatility.toFixed(2),
    level: volatility < 5 ? 'low' : volatility < 15 ? 'medium' : 'high'
  };
}
```

**4. Display Price Change Indicators:**
```javascript
function getPriceChangeIndicator(change, percentChange) {
  const isPositive = change > 0;
  const isSignificant = Math.abs(percentChange) > 5;

  return {
    color: isPositive ? '#10B981' : '#EF4444', // Green or Red
    icon: isPositive ? '📈' : '📉',
    label: isPositive ? 'Up' : 'Down',
    displayText: `${isPositive ? '+' : ''}$${Math.abs(change).toFixed(2)} (${isPositive ? '+' : ''}${percentChange.toFixed(1)}%)`,
    significance: isSignificant ? 'significant' : 'minor'
  };
}

// Usage in UI
const trend = analyzePriceTrend(historyData);
const indicator = getPriceChangeIndicator(trend.change, trend.percentChange);

// Display: "📈 Up +$10.50 (+6.0%)" in green
console.log(`${indicator.icon} ${indicator.label} ${indicator.displayText}`);
```

**5. Multi-Period Comparison:**
```javascript
// Fetch and compare multiple time periods
async function compareTimePeriods(styleCode) {
  const [month, quarter, year] = await Promise.all([
    fetchPriceHistory(styleCode, 30),
    fetchPriceHistory(styleCode, 90),
    fetchPriceHistory(styleCode, 365)
  ]);

  return {
    '30_days': analyzePriceTrend(month),
    '90_days': analyzePriceTrend(quarter),
    '365_days': analyzePriceTrend(year)
  };
}

// Usage
const comparison = await compareTimePeriods('555088-001');
console.log('30-day trend:', comparison['30_days'].trend);
console.log('90-day trend:', comparison['90_days'].trend);
console.log('Yearly trend:', comparison['365_days'].trend);
```

**React Native Example:**
```jsx
import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

const PriceHistoryChart = ({ styleCode, days = 30 }) => {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState(null);
  const [trend, setTrend] = useState(null);

  useEffect(() => {
    loadPriceHistory();
  }, [styleCode, days]);

  const loadPriceHistory = async () => {
    try {
      setLoading(true);
      const data = await fetchPriceHistory(styleCode, days);
      const processed = processHistoryForChart(data);
      const trendAnalysis = analyzePriceTrend(data);

      setChartData(processed.chartData);
      setTrend(trendAnalysis);
    } catch (error) {
      console.error('Failed to load price history:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <ActivityIndicator size="large" color="#3B82F6" />;
  }

  const indicator = getPriceChangeIndicator(trend.change, trend.percentChange);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{days}-Day Price History</Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Current</Text>
          <Text style={styles.statValue}>${trend.summary.end_price}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Change</Text>
          <Text style={[styles.statValue, { color: indicator.color }]}>
            {indicator.displayText}
          </Text>
        </View>
      </View>

      <LineChart
        data={chartData}
        width={350}
        height={220}
        chartConfig={{
          backgroundColor: '#ffffff',
          backgroundGradientFrom: '#ffffff',
          backgroundGradientTo: '#ffffff',
          decimalPlaces: 2,
          color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
        }}
        bezier
        style={styles.chart}
      />

      <View style={styles.summaryRow}>
        <Text>High: ${trend.summary.highest}</Text>
        <Text>Low: ${trend.summary.lowest}</Text>
        <Text>Avg: ${trend.summary.average}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  stat: { flex: 1 },
  statLabel: { fontSize: 12, color: '#666' },
  statValue: { fontSize: 16, fontWeight: 'bold', marginTop: 4 },
  chart: { marginVertical: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around' }
});

export default PriceHistoryChart;
```

**Error Responses:**
- `400`: Invalid style_code or days parameter
- `404`: Style code not found
- `404`: No price history available for this SKU

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
      "tier": 1,
      "image_url": "/images/sneakers/555088-001.webp",
      "image_thumbnail_url": "/images/sneakers/thumbs/555088-001.webp"
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
      "image_url": "/images/sneakers/DV0833-101.webp",
      "image_thumbnail_url": "/images/sneakers/thumbs/DV0833-101.webp",
      "display_name": "Nike Dunk Low - Team Green"
    }
  ]
}
```

### Example 5: Price History - 30, 60, 90 Day Analysis

#### 30-Day Price History (Recent Trends)

**Request:**
```bash
curl -X GET "https://api.sneakersbook.com/api/prices/555088-001/history?days=30" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "style_code": "555088-001",
  "days_requested": 30,
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
    // ... 28 more data points
  ],
  "summary": {
    "current_price": 185.50,
    "min_price": 175.00,
    "max_price": 192.00,
    "avg_price": 184.25,
    "price_change": {
      "amount": 10.50,
      "percentage": 6.0
    },
    "data_points": 30,
    "date_range": {
      "start": "2026-01-10T00:00:00.000Z",
      "end": "2026-02-09T00:00:00.000Z"
    }
  }
}
```

**Use Case:** Display recent price movements, identify short-term trends

---

#### 60-Day Price History (Medium-Term Analysis)

**Request:**
```bash
curl -X GET "https://api.sneakersbook.com/api/prices/555088-001/history?days=60&limit=60" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "style_code": "555088-001",
  "days_requested": 60,
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
    }
    // ... 59 more data points covering 2 months
  ],
  "summary": {
    "current_price": 185.50,
    "min_price": 165.00,
    "max_price": 195.00,
    "avg_price": 180.75,
    "price_change": {
      "amount": 15.50,
      "percentage": 9.1
    },
    "data_points": 60,
    "date_range": {
      "start": "2025-12-11T00:00:00.000Z",
      "end": "2026-02-09T00:00:00.000Z"
    }
  }
}
```

**Use Case:** Identify medium-term trends, compare pre/post release impact

---

#### 90-Day Price History (Quarterly Analysis)

**Request:**
```bash
curl -X GET "https://api.sneakersbook.com/api/prices/555088-001/history?days=90&limit=90" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "style_code": "555088-001",
  "days_requested": 90,
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
    }
    // ... 89 more data points covering 3 months
  ],
  "summary": {
    "current_price": 185.50,
    "min_price": 158.00,
    "max_price": 198.00,
    "avg_price": 178.50,
    "price_change": {
      "amount": 20.50,
      "percentage": 12.4
    },
    "data_points": 90,
    "date_range": {
      "start": "2025-11-11T00:00:00.000Z",
      "end": "2026-02-09T00:00:00.000Z"
    }
  }
}
```

**Use Case:** Seasonal trend analysis, quarterly investment tracking

---

### Example 6: Complete Mobile Implementation - Price History Screen

**TypeScript/React Native Implementation:**

```typescript
// types.ts
interface PriceHistoryData {
  style_code: string;
  days_requested: number;
  history: Array<{
    ecmv: number;
    confidence: string;
    timestamp: string;
    components: {
      ebay_price?: number;
      goat_price?: number;
      stockx_price?: number;
    };
  }>;
  summary: {
    current_price: number;
    min_price: number;
    max_price: number;
    avg_price: number;
    price_change: {
      amount: number;
      percentage: number;
    };
    data_points: number;
    date_range: {
      start: string;
      end: string;
    };
  };
}

// api.ts
const API_BASE = 'https://api.sneakersbook.com';

export const PriceHistoryAPI = {
  // Fetch price history with specified days
  async getHistory(
    styleCode: string,
    days: number = 30,
    authToken: string
  ): Promise<PriceHistoryData> {
    const url = `${API_BASE}/api/prices/${styleCode}/history?days=${days}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch price history');
    }

    return await response.json();
  },

  // Fetch multiple time ranges for comparison
  async getMultiPeriodHistory(
    styleCode: string,
    authToken: string
  ): Promise<{
    month: PriceHistoryData;
    twoMonths: PriceHistoryData;
    quarter: PriceHistoryData;
  }> {
    const [month, twoMonths, quarter] = await Promise.all([
      this.getHistory(styleCode, 30, authToken),
      this.getHistory(styleCode, 60, authToken),
      this.getHistory(styleCode, 90, authToken)
    ]);

    return { month, twoMonths, quarter };
  }
};

// PriceHistoryScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';

type TimeRange = 30 | 60 | 90;

const PriceHistoryScreen = ({ styleCode }: { styleCode: string }) => {
  const [selectedRange, setSelectedRange] = useState<TimeRange>(30);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PriceHistoryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPriceHistory();
  }, [styleCode, selectedRange]);

  const loadPriceHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      const authToken = await getAuthToken(); // Your auth method
      const historyData = await PriceHistoryAPI.getHistory(
        styleCode,
        selectedRange,
        authToken
      );

      setData(historyData);
    } catch (err) {
      setError(err.message);
      console.error('Failed to load price history:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatChartData = () => {
    if (!data) return null;

    // Sort by date (oldest to newest)
    const sorted = [...data.history].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Sample data points for chart (max 10 labels for readability)
    const step = Math.ceil(sorted.length / 10);
    const sampled = sorted.filter((_, i) => i % step === 0);

    return {
      labels: sampled.map(item =>
        new Date(item.timestamp).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        })
      ),
      datasets: [{
        data: sampled.map(item => item.ecmv)
      }]
    };
  };

  const getPriceChangeColor = () => {
    if (!data) return '#666';
    return data.summary.price_change.amount >= 0 ? '#10B981' : '#EF4444';
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading price history...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity onPress={loadPriceHistory} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data) return null;

  const chartData = formatChartData();
  const changeColor = getPriceChangeColor();

  return (
    <ScrollView style={styles.container}>
      {/* Time Range Selector */}
      <View style={styles.rangeSelector}>
        {[30, 60, 90].map((days) => (
          <TouchableOpacity
            key={days}
            onPress={() => setSelectedRange(days as TimeRange)}
            style={[
              styles.rangeButton,
              selectedRange === days && styles.rangeButtonActive
            ]}
          >
            <Text
              style={[
                styles.rangeButtonText,
                selectedRange === days && styles.rangeButtonTextActive
              ]}
            >
              {days}D
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Price Summary Cards */}
      <View style={styles.summaryCards}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Current Price</Text>
          <Text style={styles.cardValue}>
            ${data.summary.current_price.toFixed(2)}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Change</Text>
          <Text style={[styles.cardValue, { color: changeColor }]}>
            {data.summary.price_change.amount >= 0 ? '+' : ''}
            ${data.summary.price_change.amount.toFixed(2)}
          </Text>
          <Text style={[styles.cardSubtext, { color: changeColor }]}>
            ({data.summary.price_change.percentage.toFixed(1)}%)
          </Text>
        </View>
      </View>

      {/* Price Chart */}
      {chartData && (
        <LineChart
          data={chartData}
          width={350}
          height={220}
          chartConfig={{
            backgroundColor: '#ffffff',
            backgroundGradientFrom: '#ffffff',
            backgroundGradientTo: '#ffffff',
            decimalPlaces: 2,
            color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
            style: {
              borderRadius: 16
            },
            propsForDots: {
              r: '4',
              strokeWidth: '2',
              stroke: '#3B82F6'
            }
          }}
          bezier
          style={styles.chart}
        />
      )}

      {/* Statistics */}
      <View style={styles.statsContainer}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Highest</Text>
          <Text style={styles.statValue}>
            ${data.summary.max_price.toFixed(2)}
          </Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Lowest</Text>
          <Text style={styles.statValue}>
            ${data.summary.min_price.toFixed(2)}
          </Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Average</Text>
          <Text style={styles.statValue}>
            ${data.summary.avg_price.toFixed(2)}
          </Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Data Points</Text>
          <Text style={styles.statValue}>
            {data.summary.data_points}
          </Text>
        </View>
      </View>

      {/* Date Range */}
      <Text style={styles.dateRange}>
        {new Date(data.summary.date_range.start).toLocaleDateString()} -{' '}
        {new Date(data.summary.date_range.end).toLocaleDateString()}
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    padding: 16
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666'
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 16
  },
  retryButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  rangeSelector: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8
  },
  rangeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8
  },
  rangeButtonActive: {
    backgroundColor: '#3B82F6'
  },
  rangeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666'
  },
  rangeButtonTextActive: {
    color: '#fff'
  },
  summaryCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 4
  },
  cardLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4
  },
  cardValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111'
  },
  cardSubtext: {
    fontSize: 14,
    marginTop: 4
  },
  chart: {
    marginVertical: 16,
    borderRadius: 16
  },
  statsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6'
  },
  statLabel: {
    fontSize: 14,
    color: '#666'
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111'
  },
  dateRange: {
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    marginTop: 16,
    marginBottom: 24
  }
});

export default PriceHistoryScreen;

// Helper function (implement based on your auth setup)
async function getAuthToken(): Promise<string> {
  // Your authentication token retrieval logic
  return 'your-jwt-token-here';
}
```

**Key Features:**
- ✅ Toggle between 30/60/90 day views
- ✅ Interactive price chart with smooth animations
- ✅ Price change indicators (green/red)
- ✅ High/Low/Average statistics
- ✅ Error handling and retry logic
- ✅ Loading states
- ✅ Responsive layout

---

## Image Implementation Guide

Complete guides for implementing product images in your frontend application:

**📖 See: [IMAGE-IMPLEMENTATION-GUIDE.md](./IMAGE-IMPLEMENTATION-GUIDE.md)**

This document includes:
- ✅ How to obtain images from the API
- ✅ Frontend implementation examples (React, Vue, vanilla JavaScript)
- ✅ Best practices for image loading and caching
- ✅ Lazy loading and performance optimization
- ✅ Error handling and fallback strategies
- ✅ Mobile app recommendations
- ✅ Responsive image sizing

**Quick Start:**
```javascript
// Get sneaker with image
const sneaker = await fetch('/api/skus/catalog?search=jordan')
  .then(r => r.json());

// Use thumbnail for lists
<img src={`https://api.sneakersbook.com${sneaker.image_thumbnail_url}`} />

// Use full image for details
<img src={`https://api.sneakersbook.com${sneaker.image_url}`} />
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

## Recent Updates

### February 11, 2026

**Network Configuration:**
- ✅ API now supports dual-stack IPv4+IPv6 networking
- ✅ Single listening socket accepts both IPv4 and IPv6 connections
- ✅ Server binds to `::` (IPv6 wildcard) for universal accessibility
- ✅ Optimal for CGNAT bypass and mobile app connectivity

**Image Serving:**
- ✅ 1,082 product images now available via `/images/` endpoint
- ✅ Automatic `image_url` and `image_thumbnail_url` in all SKU responses
- ✅ WebP format optimized for web (15-20 KB full, 5-8 KB thumbnail)
- ✅ Comprehensive IMAGE-IMPLEMENTATION-GUIDE.md for frontend development

**Documentation:**
- ✅ Updated API_DOCUMENTATION.md with image endpoints and examples
- ✅ New IMAGE-IMPLEMENTATION-GUIDE.md with React, Vue, and vanilla JS examples
- ✅ Added network configuration details for IPv6 dual-stack support

---

## Support

For API support, issues, or feature requests:
- GitHub: https://github.com/fernanhick/data_price_collection
- Documentation: Check repository for latest guides and examples
- Image Implementation: See [IMAGE-IMPLEMENTATION-GUIDE.md](./IMAGE-IMPLEMENTATION-GUIDE.md)

**Last Updated:** February 11, 2026
**API Version:** 1.0 (Dual-Stack + Image Support)
**Maintained by:** data_price_collection team
