# Image Implementation Guide

Complete guide for retrieving and displaying product images from the Sneaker Price Collection API in your frontend application.

---

## Table of Contents

1. [API Image Endpoints](#api-image-endpoints)
2. [Image Response Format](#image-response-format)
3. [Frontend Implementation](#frontend-implementation)
4. [Best Practices](#best-practices)
5. [Troubleshooting](#troubleshooting)

---

## API Image Endpoints

### Getting Images via SKU Endpoints

The API returns image URLs automatically when you fetch sneaker data. No separate image endpoint needed.

#### 1. **Search/List Sneakers**
```
GET /api/skus?search=jordan&brand=nike&limit=20
```

Returns multiple sneakers with images.

#### 2. **Get Catalog (Lightweight)**
```
GET /api/skus/catalog?search=jordan
```

Optimized for mobile apps and autocomplete.

#### 3. **Get Single Sneaker Details**
```
GET /api/skus/{id}
```

Details for one specific sneaker.

#### 4. **Get Popular/Trending**
```
GET /api/skus/trending/popular?limit=10
```

Most popular sneakers with most price data.

---

## Image Response Format

### API Response Structure

When you fetch SKU data, each sneaker includes image fields:

```json
{
  "id": 123,
  "sku_code": "555088-001",
  "style_code": "AJ1-BLK",
  "brand": "Nike",
  "model": "Air Jordan 1 Retro",
  "colorway": "Black",
  "retail_price": 170,
  "tier": 1,
  "image_url": "/images/sneakers/555088-001.webp",
  "image_thumbnail_url": "/images/sneakers/thumbs/555088-001.webp"
}
```

### Image URL Structure

**Full-Size Image:**
```
/images/sneakers/{filename}.webp
```

**Thumbnail Image:**
```
/images/sneakers/thumbs/{filename}.webp
```

### Image Specifications

| Property | Value |
|----------|-------|
| **Format** | WebP (modern, lightweight) |
| **Full Size** | 600x600 pixels, 80% quality |
| **Thumbnail** | 200x200 pixels, 75% quality |
| **Average Size** | ~15-20 KB (full), ~5-8 KB (thumb) |
| **Total Coverage** | 1,082 of 1,116 sneakers (97%) |

### Image URL Fallback Logic

The API uses this logic for returning image URLs:

```
if (image_local_path exists) {
  use: /images/sneakers/{filename}.webp  // Local optimized version
} else {
  use: image_url  // Original external URL or null
}
```

This means:
- **Preferred:** Local cached images (fast, optimized)
- **Fallback:** External URLs from retailers (if not cached yet)
- **Missing:** `null` (image being processed or unavailable)

---

## Frontend Implementation

### React Example

#### Display Single Sneaker with Image

```jsx
import { useState, useEffect } from 'react';

export function SneakerCard({ skuId }) {
  const [sneaker, setSneaker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSneaker = async () => {
      try {
        const response = await fetch(
          `${process.env.REACT_APP_API_URL}/api/skus/${skuId}`,
          {
            headers: {
              'Authorization': `Bearer ${sessionStorage.getItem('jwt_token')}`
            }
          }
        );

        if (!response.ok) throw new Error('Failed to fetch sneaker');

        const data = await response.json();
        setSneaker(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSneaker();
  }, [skuId]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!sneaker) return null;

  return (
    <div className="sneaker-card">
      <img
        src={`${process.env.REACT_APP_API_URL}${sneaker.image_url}`}
        alt={`${sneaker.brand} ${sneaker.model}`}
        className="sneaker-image"
      />
      <h3>{sneaker.brand} {sneaker.model}</h3>
      <p>{sneaker.colorway}</p>
      <p className="price">${sneaker.current_price?.ecmv || 'N/A'}</p>
    </div>
  );
}
```

#### Display Search Results with Thumbnails

```jsx
export function SneakerGrid({ searchQuery }) {
  const [sneakers, setSneakers] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (query) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/skus/catalog?search=${encodeURIComponent(query)}`,
        {
          headers: {
            'Authorization': `Bearer ${sessionStorage.getItem('jwt_token')}`
          }
        }
      );

      const data = await response.json();
      setSneakers(data.catalog);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchQuery) {
      handleSearch(searchQuery);
    }
  }, [searchQuery]);

  return (
    <div className="sneaker-grid">
      {sneakers.map(sneaker => (
        <div key={sneaker.id} className="grid-item">
          {/* Use thumbnail for faster loading */}
          <img
            src={`${process.env.REACT_APP_API_URL}${sneaker.image_thumbnail_url || sneaker.image_url}`}
            alt={sneaker.display_name}
            className="thumbnail"
            loading="lazy"
          />
          <h4>{sneaker.display_name}</h4>
          <p>${sneaker.retail_price}</p>
        </div>
      ))}
    </div>
  );
}
```

#### Image with Fallback and Loading States

```jsx
export function SmartImage({ imageUrl, thumbnailUrl, alt }) {
  const [src, setSrc] = useState(thumbnailUrl || imageUrl);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const API_URL = process.env.REACT_APP_API_URL;

  const handleImageLoad = () => {
    setLoading(false);
  };

  const handleError = () => {
    setError(true);
    // Fallback to placeholder image
    setSrc('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext x="50%" y="50%" text-anchor="middle" dy=".3em" fill="gray"%3EImage Not Available%3C/text%3E%3C/svg%3E');
    setLoading(false);
  };

  return (
    <div className="smart-image-container">
      {loading && <div className="skeleton-loader" />}
      <img
        src={`${API_URL}${src}`}
        alt={alt}
        onLoad={handleImageLoad}
        onError={handleError}
        style={{ display: loading ? 'none' : 'block' }}
      />
      {error && <p className="error-text">Failed to load image</p>}
    </div>
  );
}
```

### Vue.js Example

```vue
<template>
  <div class="sneaker-card">
    <!-- Thumbnail on hover shows full image -->
    <div class="image-container">
      <img
        :src="`${apiUrl}${sneaker.image_thumbnail_url}`"
        :alt="sneaker.brand"
        class="thumbnail"
        @mouseenter="showFullImage = true"
        @mouseleave="showFullImage = false"
      />
      <img
        v-if="showFullImage"
        :src="`${apiUrl}${sneaker.image_url}`"
        :alt="sneaker.brand"
        class="full-image"
      />
    </div>
    <h3>{{ sneaker.brand }} {{ sneaker.model }}</h3>
    <p>{{ sneaker.colorway }}</p>
  </div>
</template>

<script>
export default {
  props: {
    skuId: Number
  },
  data() {
    return {
      sneaker: null,
      showFullImage: false,
      apiUrl: process.env.VUE_APP_API_URL
    };
  },
  mounted() {
    this.fetchSneaker();
  },
  methods: {
    async fetchSneaker() {
      try {
        const response = await fetch(
          `${this.apiUrl}/api/skus/${this.skuId}`,
          {
            headers: {
              'Authorization': `Bearer ${sessionStorage.getItem('jwt_token')}`
            }
          }
        );
        this.sneaker = await response.json();
      } catch (error) {
        console.error('Failed to fetch sneaker:', error);
      }
    }
  }
};
</script>

<style scoped>
.image-container {
  position: relative;
  width: 200px;
  height: 200px;
}

.thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.full-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
}
</style>
```

### HTML/Vanilla JavaScript

```html
<div id="sneaker-card">
  <img id="sneaker-image" src="" alt="Sneaker" class="lazy-load" />
  <h3 id="sneaker-name"></h3>
  <p id="sneaker-colorway"></p>
</div>

<script>
const API_URL = 'https://api.sneakersbook.com';
const JWT_TOKEN = sessionStorage.getItem('jwt_token');

async function loadSneaker(skuId) {
  const response = await fetch(`${API_URL}/api/skus/${skuId}`, {
    headers: {
      'Authorization': `Bearer ${JWT_TOKEN}`
    }
  });

  const sneaker = await response.json();

  // Set image with fallback
  const imageUrl = sneaker.image_url || 'placeholder.png';
  document.getElementById('sneaker-image').src = `${API_URL}${imageUrl}`;
  document.getElementById('sneaker-image').alt =
    `${sneaker.brand} ${sneaker.model}`;

  document.getElementById('sneaker-name').textContent =
    `${sneaker.brand} ${sneaker.model}`;
  document.getElementById('sneaker-colorway').textContent =
    sneaker.colorway || 'N/A';
}

// Load sneaker on page load
loadSneaker(123);
</script>

<style>
.lazy-load {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
}

.lazy-load[src] {
  animation: none;
  background: none;
}

@keyframes loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
```

---

## Best Practices

### 1. **Use Thumbnails for Lists**

When displaying multiple sneakers (grid, list), use `image_thumbnail_url`:

```jsx
// ✅ GOOD - Light, fast thumbnails for lists
<img src={`${API_URL}${sneaker.image_thumbnail_url}`} />

// ❌ AVOID - Heavy full images for lists
<img src={`${API_URL}${sneaker.image_url}`} />
```

### 2. **Implement Lazy Loading**

Load images only when they come into view:

```jsx
// React with Intersection Observer
<img
  src={`${API_URL}${sneaker.image_url}`}
  loading="lazy"
  alt="..."
/>
```

### 3. **Handle Missing Images**

Some sneakers may not have cached images yet:

```jsx
function getImageUrl(sneaker) {
  if (sneaker.image_url) {
    return `${API_URL}${sneaker.image_url}`;
  }
  // Fallback to placeholder
  return '/placeholder-sneaker.png';
}
```

### 4. **Cache API Responses**

Avoid refetching the same data:

```jsx
// Use React Query or SWR
import { useQuery } from '@tanstack/react-query';

const { data: sneaker } = useQuery(
  ['sneaker', skuId],
  () => fetch(`${API_URL}/api/skus/${skuId}`).then(r => r.json()),
  { staleTime: 1000 * 60 * 5 } // 5 minute cache
);
```

### 5. **Responsive Images**

Adjust image sizes based on device:

```jsx
function SneakerImage({ sneaker, size = 'medium' }) {
  const sizes = {
    small: sneaker.image_thumbnail_url,    // 200x200
    medium: sneaker.image_url,              // 600x600
    large: sneaker.image_url                // Use full for lightbox
  };

  return (
    <img
      src={`${API_URL}${sizes[size]}`}
      alt={`${sneaker.brand} ${sneaker.model}`}
      style={{ maxWidth: '100%', height: 'auto' }}
    />
  );
}
```

### 6. **Environment Configuration**

Store API URL in environment variables:

```javascript
// .env
REACT_APP_API_URL=https://api.sneakersbook.com
REACT_APP_API_URL=http://localhost:3000  (for development)

// Usage
const API_URL = process.env.REACT_APP_API_URL;
```

### 7. **Error Handling**

Handle network and image errors gracefully:

```jsx
const [imageError, setImageError] = useState(false);

return (
  <img
    src={imageError ? '/placeholder.png' : `${API_URL}${imageUrl}`}
    onError={() => setImageError(true)}
    alt="Sneaker"
  />
);
```

### 8. **WebP Support**

All images are WebP format (modern browsers). For older browser support:

```html
<picture>
  <source srcset="image.webp" type="image/webp">
  <img src="image.jpg" alt="Sneaker">
</picture>
```

---

## Troubleshooting

### Images Not Loading

**Problem:** Images show broken image icon

**Solutions:**
1. Check API URL is correct in environment variables
2. Verify JWT token is valid (not expired)
3. Check browser console for CORS errors
4. Try accessing image URL directly in browser: `https://api.sneakersbook.com/images/sneakers/555088-001.webp`

### Image URL is `null`

**Problem:** `image_url` and `image_thumbnail_url` are both `null`

**Solution:** Image is still being processed or doesn't exist. This typically happens:
- When a sneaker is newly added to the database
- Before the image processor has downloaded and optimized the image
- For sneakers that don't have product images available

Wait a few moments and retry, or the background job will process it automatically.

### Slow Image Loading

**Problem:** Images load slowly

**Solutions:**
1. Use thumbnails instead of full images for lists
2. Enable lazy loading with `loading="lazy"`
3. Implement HTTP caching in your frontend
4. Use a CDN to cache images (future improvement)

### CORS Errors

**Problem:** Browser blocks image requests with CORS error

**Solution:** API is configured with CORS enabled. Check:
1. API server is running with CORS middleware
2. Your frontend origin is in CORS_ORIGIN environment variable
3. Try from different domain or local development

### Wrong Image Displayed

**Problem:** Wrong sneaker image shows up

**Solutions:**
1. Check `style_code` or `sku_code` matches the image filename
2. Verify image file exists: `ls ~/images/sneakers/{filename}.webp`
3. Check database `image_local_path` matches actual filename

---

## API Response Examples

### Full SKU Search Response

```bash
curl -H "Authorization: Bearer YOUR_JWT" \
  'https://api.sneakersbook.com/api/skus?search=jordan&limit=2'
```

```json
{
  "total": 127,
  "count": 2,
  "limit": 2,
  "offset": 0,
  "has_more": true,
  "skus": [
    {
      "id": 123,
      "sku_code": "555088-001",
      "style_code": "AJ1-BLK",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro High",
      "colorway": "Black",
      "retail_price": 170,
      "tier": 1,
      "image_url": "/images/sneakers/555088-001.webp",
      "image_thumbnail_url": "/images/sneakers/thumbs/555088-001.webp"
    },
    {
      "id": 124,
      "sku_code": "555089-001",
      "style_code": "AJ1-BLU",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro High",
      "colorway": "Royal Blue",
      "retail_price": 170,
      "image_url": "/images/sneakers/555089-001.webp",
      "image_thumbnail_url": "/images/sneakers/thumbs/555089-001.webp"
    }
  ]
}
```

### Catalog Response (Lightweight)

```json
{
  "count": 50,
  "catalog": [
    {
      "id": 1,
      "sku_code": "555088-001",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro High",
      "colorway": "Black",
      "style_code": "AJ1-BLK",
      "retail_price": 170,
      "tier": 1,
      "image_url": "/images/sneakers/555088-001.webp",
      "image_thumbnail_url": "/images/sneakers/thumbs/555088-001.webp",
      "display_name": "Nike Air Jordan 1 Retro High - Black"
    }
  ]
}
```

---

## Image Statistics

- **Total Sneakers:** 1,116
- **With Images:** 1,082 (97%)
- **Total Image Size:** ~32 MB
- **Average Per Sneaker:** ~15 KB (full) + ~5 KB (thumb)
- **Format:** WebP (modern, lightweight)
- **Update Frequency:** Continuous (new images as discovered)

---

## Summary

| Task | Endpoint | Response Fields |
|------|----------|-----------------|
| **List sneakers** | `GET /api/skus` | `image_url`, `image_thumbnail_url` |
| **Search** | `GET /api/skus?search=...` | `image_url`, `image_thumbnail_url` |
| **Catalog (lite)** | `GET /api/skus/catalog` | `image_url`, `image_thumbnail_url` |
| **Single sneaker** | `GET /api/skus/{id}` | (No images, but has other data) |
| **Popular** | `GET /api/skus/trending/popular` | (No images, but has price data) |

For image display: Use `/api/skus` or `/api/skus/catalog` endpoints to get image URLs along with product data.
