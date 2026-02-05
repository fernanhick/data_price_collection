# KicksDB Fetching Strategies

This guide explains how to fetch different sneakers each time and avoid duplicates.

## Problem: Same Results Every Time

By default, the API returns the same ~1000 sneakers starting from page 1. Without changing parameters, you'll keep hitting the same products and wasting API requests.

## Solution 1: Auto-Continue (Recommended)

The script now tracks your progress automatically. Use `--continue` to pick up where you left off:

```bash
# First run: Fetches products 0-999
npm run sneaker:kicksdb -- --limit 1000

# Second run: Automatically starts from 1000
npm run sneaker:kicksdb -- --continue --limit 1000

# Third run: Automatically starts from 2000
npm run sneaker:kicksdb -- --continue --limit 1000
```

**How it works:**
- Progress is saved to `.kicksdb-progress` file after each batch
- `--continue` reads this file and resumes from that offset
- Each run fetches the next batch of unique products

## Solution 2: Manual Offset

Manually specify where to start:

```bash
# First batch: Products 0-999
npm run sneaker:kicksdb -- --limit 1000 --offset 0

# Second batch: Products 1000-1999
npm run sneaker:kicksdb -- --limit 1000 --offset 1000

# Third batch: Products 2000-2999
npm run sneaker:kicksdb -- --limit 1000 --offset 2000

# Skip to page 50: Products 5000-5999
npm run sneaker:kicksdb -- --limit 1000 --offset 5000
```

## Solution 3: Filter by Brand

Each brand has its own product set:

```bash
# Nike (different products than default)
npm run sneaker:kicksdb -- --brand Nike --limit 500

# Adidas (different products)
npm run sneaker:kicksdb -- --brand Adidas --limit 500

# Jordan (different products)
npm run sneaker:kicksdb -- --brand Jordan --limit 300

# New Balance
npm run sneaker:kicksdb -- --brand "New Balance" --limit 300

# Yeezy
npm run sneaker:kicksdb -- --brand Yeezy --limit 200
```

**Top brands to try:**
- Nike
- Adidas
- Jordan / Air Jordan
- New Balance
- Asics
- On
- Hoka
- Vans
- Converse
- Puma
- Reebok

## Solution 4: Filter by Price Range

Different price segments have different products:

```bash
# Budget tier: Under $100
npm run sneaker:kicksdb -- --max-price 100 --limit 500

# Entry level: $100-$150
npm run sneaker:kicksdb -- --min-price 100 --max-price 150 --limit 400

# Mid-range: $150-$200
npm run sneaker:kicksdb -- --min-price 150 --max-price 200 --limit 300

# Premium: $200-$300
npm run sneaker:kicksdb -- --min-price 200 --max-price 300 --limit 200

# Luxury: $300+
npm run sneaker:kicksdb -- --min-price 300 --limit 200
```

## Solution 5: Combine Strategies

Mix different approaches for maximum variety:

```bash
# Nike, mid-range, continue from last run
npm run sneaker:kicksdb -- --brand Nike --min-price 150 --max-price 250 --continue --limit 300

# Adidas, budget-friendly, specific offset
npm run sneaker:kicksdb -- --brand Adidas --max-price 150 --offset 500 --limit 200

# Premium Jordan, continue
npm run sneaker:kicksdb -- --brand Jordan --min-price 200 --continue --limit 200
```

## Monthly Fetch Plan

With 1,000 requests/month, here's a sustainable schedule:

### Week 1: Major Brands
```bash
npm run sneaker:kicksdb -- --brand Nike --limit 1000       # 10 requests
npm run sneaker:kicksdb -- --brand Adidas --limit 1000     # 10 requests
npm run sneaker:kicksdb -- --brand Jordan --limit 500      # 5 requests
```

### Week 2: Mid-tier Brands
```bash
npm run sneaker:kicksdb -- --brand "New Balance" --limit 500   # 5 requests
npm run sneaker:kicksdb -- --brand Asics --limit 300           # 3 requests
npm run sneaker:kicksdb -- --brand Puma --limit 200            # 2 requests
```

### Week 3: By Price Range
```bash
npm run sneaker:kicksdb -- --max-price 100 --limit 500         # 5 requests
npm run sneaker:kicksdb -- --min-price 300 --limit 300         # 3 requests
```

### Week 4: Continue General Catalog
```bash
npm run sneaker:kicksdb -- --continue --limit 1000             # 10 requests
npm run sneaker:kicksdb -- --continue --limit 1000             # 10 requests
```

**Total: ~63 requests used, 937 remaining**

## Checking Progress

Check current progress offset:
```bash
cat .kicksdb-progress
```

Reset progress (start from beginning):
```bash
echo "0" > .kicksdb-progress
```

Set to specific offset:
```bash
echo "5000" > .kicksdb-progress
```

## Database Duplicate Handling

Even if you accidentally fetch the same products, the database automatically skips duplicates:

```sql
ON CONFLICT (sku_code) DO NOTHING
```

You'll see in the output:
```
Fetched: 1000
Inserted: 123
Skipped (duplicates): 877
```

High skip rate = you're hitting products you already have.

## Best Practices

1. **Use --continue for general catalog building**
   - Automatically progresses through the entire catalog
   - No duplicate fetches
   - Most efficient use of API requests

2. **Use --brand for targeted collection**
   - When you want specific brand coverage
   - Good for brand-focused catalogs
   - Can run in parallel with different brands

3. **Use --offset for manual control**
   - When you need to jump to specific sections
   - For recovery if script interrupted
   - For parallel fetching (different offsets)

4. **Monitor skip rate**
   - High skips = change strategy
   - Low skips = fetching new products
   - Track in logs: "duplicateRate"

5. **Save API requests**
   - If skip rate > 50%, stop and change strategy
   - Don't re-fetch the same batch multiple times
   - Use filters to target unfetched segments

## Troubleshooting

### "Getting too many duplicates"
**Solution:** Use `--continue` to move to next section, or filter by brand/price

### "Want to restart from beginning"
**Solution:** `echo "0" > .kicksdb-progress`

### "Don't know what offset to use"
**Solution:** Just use `--continue`, it handles it automatically

### "Want fresh products immediately"
**Solution:** Filter by brand you haven't fetched yet

## Examples for Your Scenario

Based on your current 211 sneakers, here's how to quickly grow to 5,000+:

```bash
# Day 1: Major brands (30 requests, 3,000 sneakers)
npm run sneaker:kicksdb -- --brand Nike --limit 1000
npm run sneaker:kicksdb -- --brand Adidas --limit 1000
npm run sneaker:kicksdb -- --brand Jordan --limit 1000

# Day 2: More brands (20 requests, 2,000 sneakers)
npm run sneaker:kicksdb -- --brand "New Balance" --limit 700
npm run sneaker:kicksdb -- --brand Asics --limit 500
npm run sneaker:kicksdb -- --brand Puma --limit 400
npm run sneaker:kicksdb -- --brand Vans --limit 400

# Day 3: General catalog (20 requests, 2,000 sneakers)
npm run sneaker:kicksdb -- --limit 1000
npm run sneaker:kicksdb -- --continue --limit 1000

# Total: 70 requests used, 7,000 sneakers fetched
```

## API Request Tracking

Track your usage:
```bash
# Check total sneakers in database
psql $DATABASE_URL -c "SELECT COUNT(*) FROM skus;"

# Check sneakers from KicksDB (have stockx_id)
psql $DATABASE_URL -c "SELECT COUNT(*) FROM skus WHERE stockx_id IS NOT NULL;"

# Check by brand
psql $DATABASE_URL -c "SELECT brand, COUNT(*) FROM skus GROUP BY brand ORDER BY COUNT(*) DESC LIMIT 10;"
```

Remember: **1,000 requests/month = up to 100,000 sneakers**
