-- Migration: Add image storage columns to skus table
-- Date: 2026-02-10
-- Description: Add support for storing external image URLs and local cached images for sneaker catalog

-- Step 1: Add image storage columns to skus table
ALTER TABLE skus
ADD COLUMN image_url VARCHAR(500),           -- Original GOAT CDN URL (backup reference)
ADD COLUMN image_local_path VARCHAR(255),    -- Local filesystem path
ADD COLUMN image_downloaded_at TIMESTAMP,    -- Track when image was cached
ADD COLUMN image_file_size INTEGER;          -- File size in bytes

-- Step 2: Create index for queries filtering by image availability
CREATE INDEX IF NOT EXISTS idx_skus_has_image ON skus((image_local_path IS NOT NULL));

-- Step 3: Create index for image_url lookups
CREATE INDEX IF NOT EXISTS idx_skus_image_url ON skus(image_url);

-- Step 4: Add comments for documentation
COMMENT ON COLUMN skus.image_url IS 'External URL from GOAT/StockX (reference only)';
COMMENT ON COLUMN skus.image_local_path IS 'Local path to optimized image file';
COMMENT ON COLUMN skus.image_downloaded_at IS 'Timestamp when image was downloaded';
COMMENT ON COLUMN skus.image_file_size IS 'File size in bytes';

-- Verify migration
SELECT
  'image columns added' as check_type,
  COUNT(*) as total_skus,
  COUNT(image_url) FILTER (WHERE image_url IS NOT NULL) as skus_with_url,
  COUNT(image_local_path) FILTER (WHERE image_local_path IS NOT NULL) as skus_with_local_path
FROM skus;
