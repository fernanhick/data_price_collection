# Migration Complete: brand_style_code as Primary Identifier

## What Was Changed

This migration makes `brand_style_code` the primary identifier for sneakers instead of `sku_code`.

### Database Changes
- **Created**: `scripts/migrations/001-brand-style-code-primary.sql`
  - Makes `brand_style_code` UNIQUE NOT NULL
  - Makes `sku_code` optional (nullable, no unique constraint)
  - Adds indexes for both fields
  - Updates `price_history.style_code` consistency

### Code Changes

#### 1. Schema & Types
- `src/db/schema.ts`: Updated table definition
- `src/types/index.ts`: Made `brand_style_code` required in SKU interface
- `src/schemas/sku.ts`: Made `brand_style_code` required, `sku_code` optional

#### 2. API Routes
- `src/routes/prices.ts`: Changed URL from `/:sku_code` to `/:style_code`
- `src/routes/skus.ts`: All responses now include `style_code` field consistently
- `src/routes/admin.ts`:
  - Checks uniqueness by `brand_style_code`
  - Auto-generates `sku_code` from `brand_style_code` if not provided

#### 3. Import Scripts
Updated `ON CONFLICT` clauses to use `brand_style_code`:
- `src/scripts/seed.ts`
- `src/scripts/bulk-import-sneakers.ts`
- `src/scripts/discover-sneakers.ts`
- `src/scripts/discover-sneakers-safe.ts`
- `src/scripts/discover-sneakers-mega.ts`
- `src/scripts/bulk-fetch-kicksdb.ts`

#### 4. Frontend
- `public/admin/index.html`: Reordered form fields, emphasized style_code
- `public/admin/app.js`:
  - Auto-fills `sku_code` from `brand_style_code` if empty
  - Displays `style_code` in table

#### 5. Services
- `src/services/pricing/ecmvCalculator.ts`: Updated logging to use `brand_style_code`

## How to Apply the Migration

### Step 1: Run the Database Migration

```bash
psql -U gorhick -d sneaker_prices -f scripts/migrations/001-brand-style-code-primary.sql
```

Expected output:
- Count of NULL `brand_style_code` values (should be 0)
- Success messages for constraints and indexes
- Verification query showing constraints

### Step 2: Rebuild the Application

```bash
npm run build
```

### Step 3: Restart the Server

```bash
pm2 restart sneaker-api
# or if running in development:
npm run dev
```

## Verification

### 1. Check Database Constraints

```sql
\d skus
```

Should show:
- `brand_style_code` with UNIQUE NOT NULL constraint
- `sku_code` without UNIQUE constraint (nullable)

### 2. Test API Endpoints

```bash
# Get JWT token first (if not in dev mode)
export TOKEN="your-jwt-token"

# Test new style_code parameter
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3002/api/prices/555088-063

# Should return JSON with style_code field
```

### 3. Test Admin Dashboard

1. Open http://localhost:3002/admin
2. Create a new sneaker with only `brand_style_code` (leave SKU Code empty)
3. Verify `sku_code` auto-fills from `brand_style_code`
4. Verify table displays style_code

### 4. Test Import Scripts

```bash
# Should not create duplicates on re-run
npm run seed
```

## Breaking Changes

⚠️ **API URL Change**: `/api/prices/:sku_code` → `/api/prices/:style_code`

**Migration Path for API Clients**:
- Old: `GET /api/prices/554724-063`
- New: `GET /api/prices/554724-063` (same value, different parameter name)

The actual values stay the same for existing records, but the parameter name changed.

## Rollback Plan

If you need to rollback:

```sql
-- Rollback database changes
ALTER TABLE skus ALTER COLUMN brand_style_code DROP NOT NULL;
ALTER TABLE skus DROP CONSTRAINT IF EXISTS skus_brand_style_code_unique;
ALTER TABLE skus ADD CONSTRAINT skus_sku_code_key UNIQUE (sku_code);
ALTER TABLE skus ALTER COLUMN sku_code SET NOT NULL;
DROP INDEX IF EXISTS idx_skus_brand_style_code;
DROP INDEX IF EXISTS idx_price_history_style_code;
```

Then revert code:
```bash
git revert HEAD
npm run build
pm2 restart sneaker-api
```

## Success Criteria

✅ Database `brand_style_code` is UNIQUE NOT NULL with index
✅ Database `sku_code` is optional (nullable, no unique constraint)
✅ API routes use `:style_code` parameter
✅ All API responses include `style_code` field consistently
✅ Admin dashboard uses brand_style_code as primary field
✅ Import scripts use `ON CONFLICT (brand_style_code)`
✅ Logging uses `brand_style_code` consistently

## Files Modified

**Database:**
- `scripts/migrations/001-brand-style-code-primary.sql` (NEW)
- `src/db/schema.ts`

**Types & Schemas:**
- `src/types/index.ts`
- `src/schemas/sku.ts`

**API Routes:**
- `src/routes/prices.ts`
- `src/routes/skus.ts`
- `src/routes/admin.ts`

**Import Scripts:**
- `src/scripts/seed.ts`
- `src/scripts/bulk-import-sneakers.ts`
- `src/scripts/discover-sneakers.ts`
- `src/scripts/discover-sneakers-safe.ts`
- `src/scripts/discover-sneakers-mega.ts`
- `src/scripts/bulk-fetch-kicksdb.ts`

**Frontend:**
- `public/admin/index.html`
- `public/admin/app.js`

**Services:**
- `src/services/pricing/ecmvCalculator.ts`

## Next Steps

After applying the migration:

1. Monitor logs for any errors related to style_code/sku_code
2. Update any external API clients to use the new parameter names
3. Consider deprecating `sku_code` field entirely in a future version
4. Update API documentation to reflect the new parameter names
