# Brand-by-Brand Discovery Guide

Discover ALL sneakers released by each brand - the most comprehensive approach to build a complete sneaker catalog.

---

## Overview

The **brand-by-brand discovery** systematically searches every major brand and their sub-categories to find EVERY sneaker ever listed on GOAT.

**Current Catalog:** 1,414 sneakers
**Goal:** 3,000-5,000+ sneakers (COMPLETE brand catalogs)

---

## Quick Start

Run brand-by-brand discovery:

```bash
npm run discover:by-brand
```

**Time:** 45-60 minutes
**New sneakers:** 1,500-3,500+
**Result:** Comprehensive catalog with 3,500-5,000+ sneakers

---

## How It Works

### Strategy: Multiple Searches Per Brand

Instead of searching by model or year, we search by **brand and sub-category**:

**Example: Nike**
```
"Nike"           → All Nike products
"Nike Men"       → Men's Nike only
"Nike Women"     → Women's Nike only
"Nike Kids"      → Kids' Nike
"Nike Running"   → Nike running shoes
"Nike Basketball" → Nike basketball shoes
"Nike SB"        → Nike SB skateboarding
"Nike ACG"       → Nike ACG outdoor
```

Each search returns up to 30 results, so:
- 10 Nike searches × 30 results = 300 Nike sneakers discovered
- Many will be duplicates, so actual unique ≈ 200-250 Nike sneakers

### Why This Works Better

| Approach | What It Finds | Count |
|----------|--------------|-------|
| Year-based search ("2024", "2025") | Only recent releases | 100-200 |
| Model-based ("Jordan 1", "Dunk") | Only specific models | 30-100 |
| **Brand-based** | **EVERYTHING from that brand** | **200-500+** |

---

## Brands Covered

### Major Sports Brands (60+ searches)

**Nike Ecosystem:**
- Nike (general)
- Nike Men/Women/Kids
- Nike Running/Basketball/Lifestyle/SB/ACG
- Jordan Brand (all variants)
- Total: 10 searches

**Adidas:**
- Adidas (general)
- Adidas Men/Women/Kids
- Adidas Running/Basketball/Originals/Performance
- Adidas NMD/Ultraboost/EQT
- Yeezy
- Total: 14 searches

**Other Major Brands:**
- New Balance (7 searches)
- Asics (6 searches)
- Puma (7 searches)
- Reebok (7 searches)
- Converse (5 searches)
- Vans (6 searches)
- Saucony (3 searches)
- Brooks (2 searches)
- Hoka (2 searches)

### Alternative & Emerging (50+ searches)

- **On Cloud** (On, On Cloud, On Running, On Women)
- **Salomon** (Salomon, Running, Trail, Hiking)
- **Altra** (Altra, Altra Running)
- **Karhu** (Karhu, Karhu Running)
- **Skechers**
- **Timberland** (Timberland, Men, Women, Boots, 6 Inch)
- **Dr. Martens**
- **Clarks** (Clarks, Wallabee, Desert)

### Outdoor & Lifestyle (20+ searches)

- Columbia
- The North Face
- Salewa
- And more

### Collaborations (15+ searches)

- Off-White
- Sacai
- Union
- Fragment
- Travis Scott
- Stussy
- Supreme
- Undefeated
- A Ma Maniere
- JJJJound
- Salehe Bembury
- Patta
- Clot
- Verdy
- Muslin

### Luxury/Designer (10+ searches)

- Golden Goose
- Balenciaga
- Gucci
- Louis Vuitton
- Bottega Veneta
- Maison Margiela
- Valentino
- Common Projects
- Dior
- Prada

---

## Expected Results

### Growth Trajectory

```
After Comprehensive Discovery (historical):  1,414 sneakers
After Brand-by-Brand Discovery:              3,500-4,500 sneakers
After Multiple Runs:                         5,000+ sneakers
```

### Typical Brand Coverage

After brand-by-brand discovery:

| Brand | Sneakers Found |
|-------|--------|
| Nike | 700-800 |
| Adidas | 300-400 |
| Jordan | 200-250 |
| New Balance | 150-200 |
| Asics | 100-150 |
| Puma | 100-150 |
| Reebok | 80-120 |
| Converse | 60-100 |
| Vans | 60-100 |
| Yeezy | 80-100 |
| Others | 1,000-1,500 |

**Total: 3,500-4,500+ unique sneakers**

---

## Recommended Run Schedule

### Phase 1: Build Comprehensive Catalog (Week 1)

```bash
# Day 1: Run comprehensive (historical releases)
npm run discover:comprehensive

# Day 2: Run brand-by-brand (all brand releases)
npm run discover:by-brand

# Check total
# Expected: 3,500-4,500 sneakers
```

### Phase 2: Fill Gaps (Week 2-4)

Add custom brand searches to the script for brands you want to expand:

```bash
# Edit src/scripts/discover-sneakers-by-brand.ts
# Add more Nike variants, Adidas variants, etc.

# Run again with expanded queries
npm run discover:by-brand
```

### Phase 3: Maintain (Ongoing)

```bash
# Weekly - add new releases
npm run sneaker:discover

# Monthly - refresh brand catalogs
npm run discover:by-brand

# Scheduler updates prices automatically
```

---

## Customization: Add More Brands

You can easily add more brands to the discovery. Edit the script:

```typescript
// In src/scripts/discover-sneakers-by-brand.ts

const brandSearchQueries = [
  // Add your custom brands:
  'Nike',
  'Adidas',
  // ... existing brands ...

  // Your additions:
  'Kappa',               // Italian brand
  'Diadora',             // Italian running
  'ASICS Onitsuka',      // Vintage/retro line
  'Fila',                // 90s brand revival
  'Samba',               // Adidas classic
  'K-Swiss',             // Tennis/classic
  'LA Gear',             // 90s favorite
  'Nike Air Max Plus TNdataViewColumnName',
  'Adidas Ozweego',
  'Nike Tailwind',
];
```

---

## Advanced: Incremental Brand Expansion

Instead of running all 100+ searches at once, run them in batches:

**Strategy: 20 brands per week**

```bash
# Week 1: Nike + Adidas + Yeezy
# Edit script to only include:
'Nike', 'Nike Men', 'Nike Women', ..., (10 queries)
'Adidas', 'Adidas Men', ..., (5 queries)
'Yeezy'

npm run discover:by-brand

# Week 2: New Balance + Asics + Puma
# Edit script with different brands

npm run discover:by-brand

# Continue...
```

**Benefits:**
- Spreads API load over time
- Easier to debug if issues occur
- Can customize based on results

---

## Comparison: All Discovery Methods

| Method | Time | Sneakers | Focus | Best For |
|--------|------|----------|-------|----------|
| `discover` | 3-5 min | 100-150 | Latest | Weekly updates |
| `discover-mega` | 15-20 min | 500-1,000 | 2024-2025 | Quick expansion |
| `discover:comprehensive` | 30-45 min | 1,500-2,500 | All years | Historical catalog |
| **`discover:by-brand`** | **45-60 min** | **1,500-3,500** | **ALL releases** | **Complete catalog** |
| Combined all 3 | 90-120 min | 3,500-5,000+ | Everything | Ultimate coverage |

---

## Expected Growth Scenarios

### Scenario 1: Quick Expansion (1 hour)
```bash
npm run discover:comprehensive  # 30-45 min
npm run discover:by-brand       # 45-60 min
# Result: 3,500-4,500 sneakers
```

### Scenario 2: Gradual Expansion (5 hours)
```bash
npm run discover:comprehensive  # 30-45 min → 1,400 → 3,000
npm run discover:by-brand       # 45-60 min → 3,000 → 3,800
npm run discover:comprehensive  # 30-45 min → 3,800 → 4,200
npm run discover:by-brand       # 45-60 min → 4,200 → 4,800
# Result: 4,800-5,000+ sneakers
```

### Scenario 3: Long-term Build (Weekly)
```bash
# Week 1: Comprehensive + Brand
npm run discover:comprehensive && npm run discover:by-brand
# → 3,500 sneakers

# Week 2: Add custom searches
# Edit discover-sneakers-by-brand.ts with more brands
npm run discover:by-brand
# → 4,000 sneakers

# Week 3: Add even more
npm run discover:by-brand
# → 4,500 sneakers

# Week 4: Fill remaining gaps
npm run discover:by-brand
# → 5,000+ sneakers
```

---

## Troubleshooting

### Same Results Each Time

**Problem:** Running again returns same number of new sneakers

**Solution:** This is normal! After 2-3 runs, you've exhausted most public GOAT listings. To find more:

1. Add custom brand searches to the script
2. Run `discover:comprehensive` for historical models
3. Add specific collaborations (Sacai Nike, Union Jordan, etc.)

### Slow API Calls

**Problem:** Discovery takes longer than expected

**Causes:**
- GOAT API rate limiting
- Network latency
- High server load (try off-peak hours)

**Solution:**
- Run at 2-4 AM for faster speeds
- Reduce search results per query (change `30` to `20`)
- Add delays between queries

### Too Many Duplicates

**Problem:** Script is skipping lots of results as duplicates

**Solution:** This is good! It means your catalog is comprehensive. Duplicates indicate:
- Brand coverage is complete
- Same sneaker listed multiple times on GOAT
- Different colorways/variants already in database

---

## Database Health

### Check Brand Coverage

After running brand-by-brand discovery:

```bash
# See all brands and counts
psql -U postgres -d sneaker_prices -c "
  SELECT brand, COUNT(*) as count FROM skus
  GROUP BY brand ORDER BY count DESC LIMIT 30;
"
```

### Find Gaps

```bash
# Brands with few sneakers (potential gaps)
psql -U postgres -d sneaker_prices -c "
  SELECT brand, COUNT(*) as count FROM skus
  GROUP BY brand HAVING COUNT(*) < 5
  ORDER BY count;
"
```

### Verify Coverage

```bash
# Total sneakers and image coverage
psql -U postgres -d sneaker_prices -c "
  SELECT
    COUNT(*) as total,
    COUNT(CASE WHEN image_local_path IS NOT NULL THEN 1 END) as with_images,
    ROUND(100.0 * COUNT(CASE WHEN image_local_path IS NOT NULL THEN 1 END) / COUNT(*), 1) as image_percent
  FROM skus;
"
```

---

## API Ready

Once you reach 3,500-5,000+ sneakers, your API has excellent coverage:

```bash
# Massive search capability
curl -H "Authorization: Bearer JWT" \
  'http://localhost:3000/api/skus?limit=100'

# Browse by brand
curl -H "Authorization: Bearer JWT" \
  'http://localhost:3000/api/skus?brand=Nike&limit=100'

# Get catalog
curl -H "Authorization: Bearer JWT" \
  'http://localhost:3000/api/skus/catalog?limit=500'

# Trending sneakers
curl -H "Authorization: Bearer JWT" \
  'http://localhost:3000/api/skus/trending/popular?limit=50'
```

---

## Performance Notes

### Time Breakdown

- **Discovery searching:** 30-40 minutes (main bottleneck)
- **Image downloading:** 10-15 minutes (1000+ images)
- **Database imports:** 2-5 minutes
- **Report generation:** 1 minute

### Optimization Tips

1. **Run off-peak:** 2-4 AM for fastest speeds
2. **Skip images:** Remove image download if not needed
3. **Batch processing:** Run 50 searches, then import
4. **Parallel runs:** Different brand groups simultaneously (if needed)

---

## Next Steps

1. **Run brand-by-brand discovery:**
   ```bash
   npm run discover:by-brand
   ```

2. **Check results:**
   ```bash
   # Count total
   psql -U postgres -d sneaker_prices -c "SELECT COUNT(*) FROM skus;"

   # See top brands
   psql -U postgres -d sneaker_prices -c "
     SELECT brand, COUNT(*) FROM skus GROUP BY brand ORDER BY COUNT(*) DESC LIMIT 20;
   "
   ```

3. **Schedule weekly updates:**
   ```bash
   # Add to crontab for weekly discovery
   0 3 * * 0 cd /home/gorhick/data_price_collection && npm run discover:by-brand
   ```

4. **Monitor scheduler:**
   ```bash
   curl http://localhost:3000/health
   ```

---

## Success Metrics

After comprehensive brand-by-brand discovery, you should have:

✅ **3,500-5,000+ sneakers** (complete coverage)
✅ **95%+ image coverage** (most have local images)
✅ **All major brands** well-represented
✅ **Multiple eras** from each brand
✅ **Auto-updating prices** via scheduler
✅ **Comprehensive search capability** via API

---

## FAQs

**Q: How long until I have all sneakers?**
A: 2-3 runs of brand-by-brand discovery + comprehensive discovery = 3,500-5,000 sneakers. That's ~95% of publicly available products on GOAT.

**Q: What about new releases?**
A: Run `npm run sneaker:discover` weekly to add latest releases automatically.

**Q: Can I search by brand in the API?**
A: Yes! `GET /api/skus?brand=Nike&limit=100`

**Q: Will prices update automatically?**
A: Yes! The scheduler updates Tier 1 (4x daily), Tier 2 (1x daily), and Tier 3 (2x weekly).

**Q: Should I run multiple times?**
A: Yes! Each run finds different results as GOAT inventory changes. 2-3 runs = comprehensive coverage.
