-- Migration: Make brand_style_code the primary identifier
-- Date: 2026-02-07
-- Description: Change brand_style_code to UNIQUE NOT NULL and make sku_code optional

-- Step 1: Verify no NULL brand_style_code values
-- This should return 0 rows, all records should have values
SELECT COUNT(*) as null_brand_style_codes FROM skus WHERE brand_style_code IS NULL;

-- Step 2: Make brand_style_code the primary identifier
ALTER TABLE skus
ALTER COLUMN brand_style_code SET NOT NULL;

ALTER TABLE skus
ADD CONSTRAINT skus_brand_style_code_unique UNIQUE (brand_style_code);

CREATE INDEX IF NOT EXISTS idx_skus_brand_style_code
ON skus(brand_style_code);

-- Step 3: Make sku_code optional (remove UNIQUE constraint)
ALTER TABLE skus
DROP CONSTRAINT IF EXISTS skus_sku_code_key;

ALTER TABLE skus
ALTER COLUMN sku_code DROP NOT NULL;

-- Keep the index for backward compatibility queries
CREATE INDEX IF NOT EXISTS idx_skus_sku_code
ON skus(sku_code);

-- Step 4: Update price_history.style_code consistency
-- Ensure all price_history records have style_code populated
UPDATE price_history ph
SET style_code = s.brand_style_code
FROM skus s
WHERE ph.sku_id = s.id AND ph.style_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_price_history_style_code
ON price_history(style_code);

-- Verify migration
SELECT
  'brand_style_code constraints' as check_type,
  COUNT(*) as total_skus,
  COUNT(DISTINCT brand_style_code) as unique_style_codes,
  COUNT(*) FILTER (WHERE brand_style_code IS NULL) as null_values
FROM skus;
