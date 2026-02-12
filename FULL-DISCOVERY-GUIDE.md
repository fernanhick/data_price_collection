# Full Discovery + Price Update Guide

Complete one-command operation to discover new sneakers and fetch initial market prices.

---

## Overview

The `full-discovery-with-prices` script automates the complete catalog building process:

1. **🔍 Phase 1: Mega Discovery** (15-20 minutes)
   - Searches 130+ product queries via GOAT
   - Discovers 500-1000+ unique sneakers
   - Automatically categorizes by tier (based on price premium)

2. **🖼️ Phase 2: Image Import** (10-15 minutes)
   - Downloads product images from GOAT
   - Optimizes to WebP format (600x600 & 200x200)
   - Updates database with local image paths

3. **💰 Phase 3: Price Fetching** (15-25 minutes)
   - Fetches current prices from eBay, GOAT, StockX
   - Calculates ECMV (Estimated Current Market Value)
   - Stores price history for trending analysis

4. **📊 Phase 4: Report** (1 minute)
   - Catalog statistics by tier and brand
   - Image coverage metrics
   - Price data quality summary

**Total Time:** 45-60 minutes
**API Calls:** ~700+
**Images Downloaded:** 500-1000+

---

## Quick Start

### Run the complete discovery:

```bash
npm run discovery:full
```

That's it! The script will:
- Discover new sneakers
- Download and optimize images
- Fetch initial prices
- Print final report with statistics

---

## What Gets Created

### Database Changes
- ✅ New SKU records (500-1000+)
- ✅ Local image paths
- ✅ Image metadata (size, download date)
- ✅ Initial price history records
- ✅ ECMV calculations

### File System
- ✅ Full-size images: `~/images/sneakers/*.webp` (600x600)
- ✅ Thumbnails: `~/images/sneakers/thumbs/*.webp` (200x200)
- Total storage: ~32 MB

---

## Output Example

```
═════════════════════════════════════════════════════════════════
🚀 PHASE 1: MEGA SNEAKER DISCOVERY
═════════════════════════════════════════════════════════════════
📊 Queries: 130
🎯 Target: 500-1000+ sneakers

[1/130] 🔍 "Jordan 1 High OG 2024"
  ✓ Found 30 results
  ➕ 28 new unique (Total unique: 28)

[2/130] 🔍 "Jordan 1 High OG 2025"
  ✓ Found 30 results
  ➕ 25 new unique (Total unique: 53)

...

[10/130] - Progress: 10/130 | ⏱️  8.5m | ETA: 102.3m | 🎯 287 unique

...

✅ DISCOVERY PHASE COMPLETE
─────────────────────────────────────────────────────────────────
⏱️  Time: 18.3m | 🔍 Queries: 130 | 📦 Results: 3,900 | ✨ Unique: 1,082

═════════════════════════════════════════════════════════════════
📥 PHASE 2: IMPORTING SNEAKERS & IMAGES
═════════════════════════════════════════════════════════════════
📊 Importing 1,082 sneakers...

  📦 Imported 50/1,082...
  📦 Imported 100/1,082...
...
  📦 Imported 1,050/1,082...

✅ IMPORT COMPLETE
  Imported: 1,082 | Skipped: 0 | Total in DB: 1,082

═════════════════════════════════════════════════════════════════
💰 PHASE 3: FETCHING INITIAL MARKET PRICES
═════════════════════════════════════════════════════════════════
📊 Fetching prices for 1,082 sneakers...

  ✓ 10/1,082 | 9 success | ⏱️  8.5m
  ✓ 20/1,082 | 18 success | ⏱️  16.2m
...

✅ PRICE FETCH COMPLETE
  Success: 1,067 | Failed: 15

═════════════════════════════════════════════════════════════════
📊 FINAL CATALOG REPORT
═════════════════════════════════════════════════════════════════
⏱️  Total time: 52.8 minutes
🎯 Total sneakers in catalog: 1,082
✨ New sneakers added: 1,082

Catalog by tier:
  Tier 1: 156 sneakers
  Tier 2: 423 sneakers
  Tier 3: 485 sneakers

Top 15 brands:
  Nike: 487
  Adidas: 234
  New Balance: 145
  Jordan: 98
  Yeezy: 87
  ...

Image coverage:
  With images: 1,082/1,082 (100%)
  Without images: 0

Price data:
  Sneakers with price data: 1,067

═════════════════════════════════════════════════════════════════
✅ FULL DISCOVERY + PRICE UPDATE COMPLETE!
═════════════════════════════════════════════════════════════════

Next steps:
  1. Scheduler will automatically update prices based on tier
  2. Tier 1: Every 6 hours
  3. Tier 2: Once daily (2pm)
  4. Tier 3: 2x weekly (Mon/Thu 10am)
```

---

## Monitoring Progress

The script outputs progress at key points:

- **Every search query**: Shows results found and running total
- **Every 10 searches**: Shows overall progress, elapsed time, ETA
- **Every 50 imports**: Shows import count
- **Every 10 price fetches**: Shows success/failed count

Monitor in real-time:
```bash
# Watch the logs while running
npm run discovery:full 2>&1 | tee discovery-$(date +%Y%m%d-%H%M%S).log
```

---

## What to Do After

### 1. Verify in Database

Check the new sneakers:
```bash
# Count total sneakers
psql -U postgres -d sneaker_prices -c "SELECT COUNT(*) FROM skus;"

# See breakdown by tier
psql -U postgres -d sneaker_prices -c "
  SELECT tier, COUNT(*) as count FROM skus GROUP BY tier ORDER BY tier;
"

# See top brands
psql -U postgres -d sneaker_prices -c "
  SELECT brand, COUNT(*) as count FROM skus
  GROUP BY brand ORDER BY count DESC LIMIT 10;
"

# Check image coverage
psql -U postgres -d sneaker_prices -c "
  SELECT
    COUNT(*) as total,
    COUNT(CASE WHEN image_local_path IS NOT NULL THEN 1 END) as with_images
  FROM skus;
"
```

### 2. Test the API

```bash
# Search for sneakers
curl -H "Authorization: Bearer YOUR_JWT" \
  'http://localhost:3000/api/skus?search=jordan&limit=5'

# Get catalog
curl -H "Authorization: Bearer YOUR_JWT" \
  'http://localhost:3000/api/skus/catalog?search=dunk&limit=10'

# Check a single sneaker
curl -H "Authorization: Bearer YOUR_JWT" \
  'http://localhost:3000/api/skus/1'

# Get price data
curl -H "Authorization: Bearer YOUR_JWT" \
  'http://localhost:3000/api/prices/555088-001'
```

### 3. Monitor Automatic Price Updates

The scheduler automatically updates prices:

**Check scheduler status:**
```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "scheduler": {
    "tier1": { "active": true, "schedule": "0 6,12,18,0 * * *" },
    "tier2": { "active": true, "schedule": "0 14 * * *" },
    "tier3": { "active": true, "schedule": "0 10 * * 1,4" }
  }
}
```

---

## Troubleshooting

### Script Stops or Hangs

**Problem:** Script appears stuck on a search query

**Solution:**
- GOAT API sometimes times out - the script has retry logic
- Check your internet connection
- You can safely stop and re-run - it won't duplicate entries
- Already imported sneakers are skipped automatically

```bash
# Stop the script
Ctrl+C

# Resume from where it left off
npm run discovery:full
```

### Network Errors During Image Download

**Problem:** Some images fail to download

**Solution:**
- This is normal - not all GOAT products have images
- Failed images are skipped gracefully
- The script continues with remaining images
- Goal is ~95% image coverage

### StockX Price Fetching Timeouts

**Problem:** Prices from StockX fail to fetch

**Solution:**
- StockX has Cloudflare protection and rate limiting
- The script retries with delays
- eBay and GOAT prices still fetch successfully
- Can continue with just eBay + GOAT data

### Database Errors

**Problem:** PostgreSQL connection errors

**Solution:**
- Verify PostgreSQL is running: `sudo systemctl status postgresql`
- Check database exists: `psql -U postgres -l | grep sneaker_prices`
- Check .env file has correct credentials
- Verify network access to database

---

## Comparison: All Discovery Scripts

| Script | Duration | Sneakers | Use Case |
|--------|----------|----------|----------|
| `discover` | 10-15m | 100-200 | Quick incremental update |
| `discover-safe` | 10-15m | 50-100 | Very conservative discovery |
| `discover-mega` | 15-20m | 500-1000 | One-time catalog build |
| **`discovery:full`** | **45-60m** | **500-1000** | **Complete setup with prices** |

---

## Scheduling Full Discovery

Run periodically (e.g., weekly) to add new sneakers:

```bash
# Add to crontab to run weekly on Sundays at 2 AM
2 2 * * 0 cd /home/gorhick/data_price_collection && npm run discovery:full >> /var/log/discovery-full.log 2>&1
```

Or use systemd timer:

Create `/etc/systemd/system/discovery-full.service`:
```ini
[Unit]
Description=Full Sneaker Discovery with Prices
After=network.target

[Service]
Type=oneshot
User=gorhick
WorkingDirectory=/home/gorhick/data_price_collection
ExecStart=/usr/bin/npm run discovery:full
StandardOutput=journal
StandardError=journal
```

Create `/etc/systemd/system/discovery-full.timer`:
```ini
[Unit]
Description=Run Full Sneaker Discovery Weekly

[Timer]
OnCalendar=weekly
OnCalendar=Sun *-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable:
```bash
sudo systemctl daemon-reload
sudo systemctl enable discovery-full.timer
sudo systemctl start discovery-full.timer
```

---

## Performance Notes

### Bottlenecks

1. **Image Download** (slowest)
   - ~1 second per image to download and optimize
   - 1000 images = ~17 minutes

2. **Price Fetching** (second slowest)
   - ~2 seconds per SKU (rate limited)
   - 1000 SKUs = ~33 minutes

3. **Discovery** (fastest)
   - ~2-4 seconds between searches
   - 130 queries = ~10 minutes

### Optimization Tips

If you need to speed up:

1. **Skip this script** after initial catalog build
   - Scheduler maintains prices automatically
   - Add new sneakers via regular `discover` command

2. **Run price fetch separately** from discovery
   - Discovery: `npm run sneaker:discover-mega`
   - Prices: `npm run prices:fetch --limit 100`

3. **Batch operations**
   - The full script is optimized for single run
   - Don't run concurrently with price update scheduler

---

## Success Metrics

After successful completion, you should have:

✅ **Catalog:**
- 500-1000+ sneakers
- 80%+ Tier 1/2 (frequently updated)
- Top brands well represented

✅ **Images:**
- 95%+ coverage
- All WebP optimized
- Thumbnails available

✅ **Prices:**
- 95%+ of sneakers have initial prices
- ECMV calculated for all
- Price history started

✅ **Scheduler:**
- Tier 1: Updates 4x daily
- Tier 2: Updates 1x daily
- Tier 3: Updates 2x weekly

---

## API Ready

Once complete, your API is ready for production:

```bash
# Start the API
npm run start

# Or development with auto-reload
npm run dev

# Check health
curl http://localhost:3000/health
```

All endpoints are now fully populated with:
- ✅ 500-1000+ sneakers
- ✅ Product images
- ✅ Current market prices
- ✅ Price history
- ✅ Analytics data

---

## Support

For issues or questions:
- Check logs: `npm run discovery:full 2>&1 | tail -100`
- Database status: `npm run db:seed`
- API status: `curl http://localhost:3000/health`
