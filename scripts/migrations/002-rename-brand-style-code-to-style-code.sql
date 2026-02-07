-- Migration: Rename brand_style_code to style_code
-- Date: 2026-02-07
-- Description: Rename brand_style_code column to style_code for consistency across API and database

-- Step 1: Rename the column in skus table
ALTER TABLE skus
RENAME COLUMN brand_style_code TO style_code;

-- Step 2: Update constraint name for clarity
ALTER TABLE skus
RENAME CONSTRAINT skus_brand_style_code_unique TO skus_style_code_unique;

-- Step 3: Recreate index with new name
DROP INDEX IF EXISTS idx_skus_brand_style_code;
CREATE INDEX idx_skus_style_code ON skus(style_code);

-- Step 4: Update any references in price_history table if needed
-- The style_code column in price_history already uses the correct name

-- Verify migration
SELECT
  'style_code migration' as check_type,
  COUNT(*) as total_skus,
  COUNT(DISTINCT style_code) as unique_style_codes,
  COUNT(*) FILTER (WHERE style_code IS NULL) as null_values
FROM skus;
