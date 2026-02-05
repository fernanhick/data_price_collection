# KicksDB Integration Guide

This guide explains how to use the KicksDB API integration to bulk fetch sneakers into your catalog.

## What is KicksDB?

[KicksDB](https://kicks.dev/) is a modern sneaker database API that aggregates data from StockX, GOAT, and other marketplaces. It provides structured product data, pricing, and metadata for the entire secondary sneaker market.

## Free Tier Limits

- **1,000 requests per month** (Standard API)
- **~175,000 products** available (StockX data)
- **~800,000 variants** (sizes)

## Setup

### 1. Get Your API Key

1. Sign up at [app.kicks.dev](https://app.kicks.dev)
2. Get your API key from the dashboard
3. Copy your API key

### 2. Configure Environment

Edit `.env` file and add your API key:

```bash
KICKSDB_API_KEY=your-actual-api-key-here
KICKSDB_API_BASE=https://api.kicks.dev
```

## Usage

### Basic Bulk Fetch

Fetch 100 sneakers (default):

```bash
npm run sneaker:kicksdb
```

### Fetch Specific Number

Fetch 500 sneakers:

```bash
npm run sneaker:kicksdb -- --limit 500
```

### Filter by Brand

Fetch 200 Nike sneakers:

```bash
npm run sneaker:kicksdb -- --brand Nike --limit 200
```

### Filter by Price Range

Fetch sneakers priced between $100-$200:

```bash
npm run sneaker:kicksdb -- --min-price 100 --max-price 200 --limit 300
```

### Pagination

Start from offset 1000:

```bash
npm run sneaker:kicksdb -- --offset 1000 --limit 500
```

### Custom Rate Limiting

Increase delay between requests to 2 seconds (2000ms):

```bash
npm run sneaker:kicksdb -- --delay 2000 --limit 200
```

## Advanced Examples

### Large Bulk Import

Fetch 900 sneakers (stay under monthly limit):

```bash
npm run sneaker:kicksdb -- --limit 900 --delay 1500
```

### Brand-Specific Import

```bash
# Nike only
npm run sneaker:kicksdb -- --brand Nike --limit 300

# Adidas only
npm run sneaker:kicksdb -- --brand Adidas --limit 300

# Air Jordan only
npm run sneaker:kicksdb -- --brand "Air Jordan" --limit 200
```

### Premium Sneakers Only

Fetch high-end sneakers ($300+):

```bash
npm run sneaker:kicksdb -- --min-price 300 --limit 200
```

### Budget Sneakers

Fetch affordable options (under $150):

```bash
npm run sneaker:kicksdb -- --max-price 150 --limit 400
```

## Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--limit` | Maximum number of sneakers to fetch | 100 |
| `--offset` | Starting offset for pagination | 0 |
| `--brand` | Filter by brand name | None |
| `--min-price` | Filter by minimum retail price | None |
| `--max-price` | Filter by maximum retail price | None |
| `--delay` | Delay between requests (ms) | 1000 |
| `--help` | Show help message | - |

## How It Works

### 1. Fetch Products

The script calls the KicksDB API with your filters and pagination settings.

### 2. Map to Schema

Products are automatically mapped to your database schema:
- `sku_code`: Product ID/style code
- `brand`: Brand name
- `model`: Product name/model
- `colorway`: Color description
- `retail_price`: Original retail price
- `tier`: Set to tier 2 by default for bulk imports

### 3. Duplicate Handling

- Uses `ON CONFLICT (sku_code) DO NOTHING`
- Automatically skips duplicates
- Reports how many were added vs skipped

### 4. Rate Limiting

- Default 1-second delay between requests
- Prevents hitting API rate limits
- Configurable with `--delay` option

## Monitoring Progress

The script provides real-time progress updates:

```
[INFO]: Fetching from KicksDB API
[INFO]: Fetched products from KicksDB (count: 100)
[INFO]: Added new sneaker (sku: DZ5485-410, brand: Nike, model: Dunk Low)
[INFO]: Batch completed (fetched: 100, inserted: 87, skipped: 13, progress: 100/500)
[INFO]: Waiting before next request... (delayMs: 1000)
```

Final summary:
```
✅ Success!
   Fetched: 500
   Inserted: 423
   Skipped (duplicates): 77
```

## API Response Structure

**Note:** The exact API response structure may vary. The script handles common patterns:

- `{ products: [...] }` - Products in `products` field
- `{ data: [...] }` - Products in `data` field
- `[...]` - Direct array of products

If you encounter issues, you may need to adjust the `fetchFromKicksDB` function to match the actual API response format.

## Tips & Best Practices

### 1. Stay Within Limits

- Free tier: 1,000 requests/month
- Each request fetches up to 100 products
- Maximum ~100,000 products per month on free tier

### 2. Rate Limiting Strategy

- Use default 1-second delay for normal imports
- Increase to 1.5-2 seconds for large bulk imports
- This prevents rate limiting and reduces API load

### 3. Incremental Imports

Instead of fetching everything at once:

```bash
# Week 1: Nike
npm run sneaker:kicksdb -- --brand Nike --limit 300

# Week 2: Adidas
npm run sneaker:kicksdb -- --brand Adidas --limit 300

# Week 3: Jordan
npm run sneaker:kicksdb -- --brand "Air Jordan" --limit 200
```

### 4. Duplicate Management

- The script automatically skips duplicates
- Check the "skipped" count in the summary
- High skip rate means you have good coverage already

### 5. Price-Based Segmentation

```bash
# Budget tier ($0-$150)
npm run sneaker:kicksdb -- --max-price 150 --limit 400

# Mid-range ($150-$300)
npm run sneaker:kicksdb -- --min-price 150 --max-price 300 --limit 300

# Premium ($300+)
npm run sneaker:kicksdb -- --min-price 300 --limit 200
```

## Troubleshooting

### "KICKSDB_API_KEY not configured"

**Solution:** Add your API key to `.env`:
```bash
KICKSDB_API_KEY=your-actual-key
```

### "KicksDB API error (401)"

**Solution:** Invalid API key. Check your key at [app.kicks.dev](https://app.kicks.dev)

### "KicksDB API error (429)"

**Solution:** Rate limit exceeded. Increase `--delay` or wait for rate limit reset.

### "Unexpected API response format"

**Solution:** The API response structure may have changed. Check the logs to see the actual response format, then adjust the `fetchFromKicksDB` function in `src/scripts/bulk-fetch-kicksdb.ts`.

### No Products Returned

**Possible causes:**
- Filters too restrictive (try removing filters)
- Offset too high (you've reached the end)
- API endpoint changed (check [docs.kicks.dev](https://docs.kicks.dev))

## API Documentation

For detailed API documentation, visit:
- Main site: https://kicks.dev/
- Documentation: https://docs.kicks.dev/
- API Reference: https://api.kicks.dev/docs

## Support

If you encounter issues:
1. Check the [KicksDB FAQ](https://kicks.dev/faq)
2. Review the [API documentation](https://docs.kicks.dev/)
3. Check server logs for detailed error messages

## Sources

- [KicksDB - The Modern Sneaker Database API](https://kicks.dev/)
- [KicksDB Documentation](https://docs.kicks.dev/)
- [KicksDB Pricing](https://docs.kicks.dev/documentation-v3/pricing)
