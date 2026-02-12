# Catalog Expansion Guide

Complete strategies for significantly expanding your sneaker catalog from 1,000 to 5,000+ products with historical releases and comprehensive brand coverage.

---

## Overview

Your current catalog: **~1,100 sneakers** (2024-2025 releases)

Goal: Expand to **3,000-5,000+ sneakers** including:
- ✅ Historical releases (2015-2023)
- ✅ Classic/retro colorways
- ✅ General releases (GR models)
- ✅ Complete brand catalogs
- ✅ All collaborations

---

## 3 Discovery Strategies

### Strategy 1: Comprehensive Historical Discovery (RECOMMENDED)

**What it does:**
- Discovers 2,000-3,000+ sneakers in one run
- Includes all eras: 2015-2025
- Covers classic models and colorways
- Best for significant catalog expansion

**Run it:**
```bash
npm run discover:comprehensive
```

**Time:** 30-45 minutes
**New sneakers:** 1,500-2,500
**After run:** Your catalog grows to 3,000-3,500 total

**What it searches:**
- Jordan 1/3/4/5/6/11/12 all eras
- Dunk Low/High/SB all years
- Air Max 1/90/95/97 all versions
- Classic Nike/Adidas/NB models
- Historical collaborations (Union, Sacai, Off-White, Fragment, Travis Scott)
- Vintage models (Air Huarache, Diamond Turf, Trainer)
- Multiple brands (ASICS, Converse, Vans, Puma, Reebok, Salomon)

---

### Strategy 2: Brand-by-Brand Expansion

Discover specific brands completely by adding targeted searches.

**Example: Complete Nike Basketball History**
```bash
# Edit discover-sneakers-comprehensive.ts and add:
'Nike Air Max LeBron',
'Nike KD',
'Nike Zoom LeBron',
'Nike Kyrie',
'Nike PG',
'Nike Giannis',
'Nike Zoom Freak',
'Nike Revolution Running',
'Nike Zoom Pegasus',
'Nike React Infinity',
```

**Example: Complete Adidas History**
```
'Adidas Ultra Boost',
'Adidas Ultraboost 20',
'Adidas Ultraboost 21',
'Adidas Ultraboost 22',
'Adidas NMD R1',
'Adidas NMD XR1',
'Adidas EQT Support',
'Adidas Energy Boost',
'Adidas Boost Running',
'Adidas Climacool',
```

**Cost:** Low effort - just add search queries
**Benefit:** Fills gaps in specific brand catalogs

---

### Strategy 3: Iterative Discovery (Long-term)

Run smaller discoveries weekly to gradually expand.

```bash
# Week 1: Comprehensive
npm run discover:comprehensive

# Week 2: Add missing brands
npm run sneaker:discover-mega

# Week 3: Brand-specific
npm run discover  # standard discovery

# Repeat as needed
```

**Benefit:** Spreads API calls over time
**Works best for:** Continuous catalog updates

---

## Quick Start: Full Expansion

To go from **1,100 → 3,500+ sneakers** in one session:

```bash
# Step 1: Run comprehensive discovery (30-45 min)
npm run discover:comprehensive

# Check progress
psql -U postgres -d sneaker_prices -c "SELECT COUNT(*) FROM skus;"

# Step 2: Run full discovery + prices for new entries (15-30 min)
npm run discovery:full

# Check final stats
psql -U postgres -d sneaker_prices -c "
  SELECT tier, COUNT(*) as count FROM skus GROUP BY tier ORDER BY tier;
"
```

**Total time:** 45-75 minutes
**Expected result:** 3,000-3,500 total sneakers

---

## What Gets Discovered

### By Era

**2024-2025 Releases:**
- Jordan 1/4 2024 2025
- Nike Dunk 2024 2025
- Latest collaborations
- New Yeezy releases

**2020-2023 Releases:**
- Jordan retro releases
- Nike SB Dunk releases
- Yeezy V2/500/700 variants
- Off-White collaborations
- Sacai collabs

**2015-2019 Releases:**
- Classic Jordan retros
- Original Yeezy 350/700
- Vintage Nike Air Max
- Union Jordan 1
- Fragment Collab

**Pre-2015 Classics:**
- Original Air Max 90/95/97
- Classic Air Force 1
- Original Air Jordan 1-6
- Vintage Dunk
- Converse Chuck Taylor
- Vans classics

### By Brand

| Brand | Models Covered | Era Coverage |
|-------|--------|-----|
| Nike | Air Max, Dunk, Air Force 1, Blazer, Cortez | 2010-2025 |
| Jordan | 1-13 (all versions) | 1985-2025 |
| Adidas | Samba, Gazelle, Campus, Forum, Ultra Boost, NMD | 1950-2025 |
| New Balance | 550/990/992/993/2002R/574/997 | 2000-2025 |
| Yeezy | 350/500/700/Foam/Slide | 2015-2025 |
| Asics | Gel-Lyte/Kayano/GT | 1985-2025 |
| Converse | Chuck 70/One Star | 1950-2025 |
| Vans | Old Skool/Sk8-Hi/Era | 1960-2025 |
| Collaborations | Union/Sacai/Off-White/Fragment/Travis | 2015-2025 |

---

## Expected Results

### Current Catalog (Before)
```
Total: 1,125 sneakers
Tier 1: 49
Tier 2: 930
Tier 3: 146
Image coverage: 97%
```

### After Comprehensive Discovery
```
Total: 3,000-3,500 sneakers (2-3x larger)
Tier 1: 150-200 (more premium models)
Tier 2: 2,000-2,500 (broader coverage)
Tier 3: 850-1,000 (complete catalog)
Image coverage: 95%+ (most have images)
```

### Top Brands After Expansion
```
Nike: 600-700
Jordan: 250-300
Adidas: 150-200
New Balance: 100-150
Yeezy: 80-100
ASICS: 80-100
Collaborations: 200-300
Other brands: 500-1000
```

---

## Advanced Customization

### Add Custom Search Queries

Edit `src/scripts/discover-sneakers-comprehensive.ts`:

```typescript
// Add more queries in the comprehensiveSearchQueries array
const comprehensiveSearchQueries = [
  // ... existing queries ...

  // Your custom additions
  'Nike SB Dunk Low Pro Supreme',
  'Jordan 2 Retro',
  'Nike Kobe Bryant',
  'Adidas Crazy Explosive',
  'Li-Ning Way of Wade 9',
  // ... etc
];
```

**Popular additions:**
- Sports performance: `'Nike LeBron', 'Nike KD', 'Nike Zoom Freak'`
- Running: `'Nike Vaporfly', 'Nike Alphafly', 'Adidas Adizero'`
- Basketball: `'Nike Kyrie', 'Nike PG', 'Adidas Harden'`
- Vintage: `'Nike Air Max 2090', 'Nike Air Trainer 1', 'Air Diamond Turf'`

### Filter by Price Range

Modify the script to discover high-value sneakers:

```typescript
// In discoverComprehensive() function, add filter:
if (listing.retailPriceCents && listing.retailPriceCents > 20000) {
  // Only sneakers $200+ retail
  discovered.push(sneaker);
}
```

### Skip Certain Brands

If you want to exclude brands:

```typescript
const excludeBrands = ['UGG', 'Timberland'];

// In the parsing loop:
if (excludeBrands.some(b => sneaker.brand.includes(b))) {
  continue;
}
```

---

## Performance Tips

### Run During Off-Peak Hours
- GOAT API is faster late night (2-4 AM)
- Fewer requests competing = faster discovery
- Less chance of rate limiting

### Batch Multiple Scripts
```bash
# Run 3 discoveries sequentially
npm run discover:comprehensive && npm run sneaker:discover-mega && npm run discovery:full
```

### Monitor Database Size
```bash
# Check current catalog size
psql -U postgres -d sneaker_prices -c "SELECT pg_size_pretty(pg_database_size('sneaker_prices'));"

# Monitor growth
psql -U postgres -d sneaker_prices -c "SELECT COUNT(*) FROM skus;"
```

---

## Troubleshooting

### Discovery Stops Early

**Problem:** Script stops before completing all searches

**Solution:**
```bash
# Run again - it will skip duplicates and continue
npm run discover:comprehensive

# Check logs for specific error
npm run discover:comprehensive 2>&1 | grep -i error | tail -20
```

### Images Not Downloading

**Problem:** Low image coverage after discovery

**Solution:**
```bash
# Re-download missed images
npm run images:backfill-batch --limit 500

# Check which images are missing
psql -U postgres -d sneaker_prices -c "
  SELECT COUNT(*) FROM skus WHERE image_local_path IS NULL;
"
```

### Database Getting Large

**Problem:** Database size growing too much

**Solution:**
```bash
# Keep only essential data
DELETE FROM prices WHERE sku_id NOT IN (SELECT id FROM skus);
DELETE FROM price_history WHERE sku_id NOT IN (SELECT id FROM skus);

# Run maintenance
VACUUM ANALYZE;
```

---

## Cost Analysis

### API Call Estimates

| Script | Queries | Results | Unique |
|--------|---------|---------|---------|
| `discover` | 20 | 600 | 100-150 |
| `discover-mega` | 85 | 2,500 | 500-1,000 |
| `discover:comprehensive` | 150+ | 4,500+ | 1,500-2,500 |
| All three combined | 255+ | 7,600+ | 2,000-3,500 |

### Time Estimates

| Script | Duration |
|--------|----------|
| `discover` | 3-5 min |
| `discover-mega` | 15-20 min |
| `discover:comprehensive` | 30-45 min |
| `discovery:full` | 45-60 min |

**Total for full expansion:** ~2-3 hours

---

## Maintenance Strategy

### Weekly Updates
```bash
# Add new latest releases
npm run sneaker:discover

# Automatically update prices via scheduler
# (no manual action needed)
```

### Monthly Deep Dives
```bash
# Every 30 days, add more historical data
npm run discover:comprehensive
```

### Quarterly Reviews
```bash
# Check coverage by brand
psql -U postgres -d sneaker_prices -c "
  SELECT brand, COUNT(*) FROM skus
  GROUP BY brand ORDER BY COUNT(*) DESC;
"

# Identify gaps
# Add custom searches for underrepresented brands
```

---

## Success Metrics

✅ **After expansion, your catalog should have:**

- **3,000-3,500+** sneakers (3x current size)
- **95%+ image coverage** (most have local images)
- **All major brands** represented
- **Multiple eras** from 2010-2025
- **Price data** for all Tier 1 & 2
- **Auto-updating** via scheduler

### API Ready to Serve

```bash
# Search by brand
curl -H "Authorization: Bearer JWT" \
  'http://localhost:3000/api/skus?brand=Nike&limit=100'

# Search by era (via model)
curl -H "Authorization: Bearer JWT" \
  'http://localhost:3000/api/skus?search=jordan%201&limit=50'

# Get catalog
curl -H "Authorization: Bearer JWT" \
  'http://localhost:3000/api/skus/catalog?limit=500'
```

---

## Next Steps

1. **Run comprehensive discovery** (now):
   ```bash
   npm run discover:comprehensive
   ```

2. **Monitor progress** (while running):
   ```bash
   tail -f /tmp/discovery.log
   ```

3. **Check results** (after completion):
   ```bash
   psql -U postgres -d sneaker_prices -c \
     "SELECT COUNT(*) as total, COUNT(CASE WHEN image_local_path IS NOT NULL THEN 1 END) as with_images FROM skus;"
   ```

4. **Schedule weekly updates**:
   ```bash
   # Add to crontab
   0 3 * * 0 cd /home/gorhick/data_price_collection && npm run sneaker:discover
   ```

---

## Questions?

Check the existing discovery scripts:
- `src/scripts/discover-sneakers.ts` - Quick discovery
- `src/scripts/discover-sneakers-mega.ts` - Comprehensive (2024-2025)
- `src/scripts/discover-sneakers-comprehensive.ts` - Historical (all years)
