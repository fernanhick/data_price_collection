import { Router, Request, Response } from 'express';
import { query as dbQuery } from '../db/index.js';
import logger from '../utils/logger.js';
import { SKU } from '../types/index.js';
import { GoatScraper } from '../services/scrapers/goat.js';
import { StockxScraper } from '../services/scrapers/stockx.js';
import { KicksDBScraper } from '../services/scrapers/kicksdb.js';
import ebayScraper from '../services/scrapers/ebay.js';
import imageProcessor from '../services/imageProcessor.js';
import priceFetcher from '../services/pricing/priceFetcher.js';
import notifier from '../services/notifier.js';
import { SelectCandidateSchema } from '../schemas/sku.js';
import { cleanImageUrl } from '../utils/imageUrl.js';

const goatScraper = new GoatScraper();
const stockxScraper = new StockxScraper();
const kicksdbScraper = new KicksDBScraper();

const router = Router();
export const lookupRouter = Router();

// ── Shared helpers ──────────────────────────────────────────────────────

const normalize = (s: string) => s.replace(/[-\s]/g, '').toLowerCase();

const parseName = (name: string, brand: string) => {
  const colorwayMatch = name.match(/['"]([^'"]+)['"]/);
  const colorway = colorwayMatch ? colorwayMatch[1] : '';
  let clean = name.replace(/['"][^'"]+['"]/, '').trim();
  if (brand) clean = clean.replace(new RegExp(brand, 'i'), '').trim();
  return { model: clean.trim() || name, colorway };
};

const calcTier = (lowestCents: number, retailCents: number | null): number => {
  if (retailCents && lowestCents) {
    const premium = lowestCents / retailCents - 1;
    if (premium > 0.5) return 1;
    if (premium > 0.15) return 2;
  }
  return 3;
};

const formatDbRow = (sku: SKU) => ({
  match_type: 'exact' as const,
  source: 'database' as const,
  id: sku.id,
  sku_code: sku.sku_code,
  style_code: sku.style_code,
  brand: sku.brand,
  model: sku.model,
  colorway: sku.colorway || '',
  retail_price: sku.retail_price ?? null,
  tier: sku.tier,
  image_url: (sku as any).image_local_path || null,
  image_thumbnail_url: (sku as any).image_local_path
    ? (sku as any).image_local_path.replace('/sneakers/', '/sneakers/thumbs/')
    : null,
  source_image_url: cleanImageUrl(sku.image_url) || null,
  display_name: `${sku.brand} ${sku.model}${sku.colorway ? ' - ' + sku.colorway : ''}`,
});

interface Candidate {
  source: 'goat' | 'kicksdb' | 'stockx' | 'ebay';
  matchType: 'exact' | 'partial';
  actualStyleCode: string;
  name: string;
  brand: string;
  colorway: string;
  lowestPriceCents: number;
  retailPriceCents: number | null;
  imageUrl: string;
  goatId: string | null;
  stockxId: string | null;
}

const isValidCandidate = (c: Candidate): boolean => {
  if (!c.actualStyleCode) return false;
  // Reject UUIDs and long slugs
  if (c.actualStyleCode.includes('-') && c.actualStyleCode.length > 20) return false;
  if (!c.imageUrl) return false;
  if (!c.brand || c.brand === 'Unknown') return false;
  if (!c.name) return false;
  return true;
};

/**
 * GET /api/skus
 * List or search sneakers in catalog
 *
 * Query parameters:
 * - search: Search by name/brand/model/colorway
 * - brand: Filter by brand
 * - tier: Filter by tier (1, 2, or 3)
 * - limit: Results per page (default: 20, max: 100)
 * - offset: Pagination offset (default: 0)
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, brand, tier, limit = '20', offset = '0' } = req.query;
    const userId = (req as any).user?.userId;

    // Validate pagination
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    if (isNaN(limitNum) || limitNum < 1) {
      res.status(400).json({ error: 'limit must be a number >= 1' });
      return;
    }

    if (isNaN(offsetNum) || offsetNum < 0) {
      res.status(400).json({ error: 'offset must be a number >= 0' });
      return;
    }

    logger.info(
      { search, brand, tier, limit: limitNum, offset: offsetNum, userId },
      'Searching SKUs',
    );

    // Build query
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    // Search filter
    if (search && typeof search === 'string' && search.length > 0) {
      const searchTerm = `%${search}%`;
      whereClause += ` AND (
        sku_code ILIKE $${paramCount} OR
        brand ILIKE $${paramCount + 1} OR
        model ILIKE $${paramCount + 2} OR
        colorway ILIKE $${paramCount + 3}
      )`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      paramCount += 4;
    }

    // Brand filter
    if (brand && typeof brand === 'string' && brand.length > 0) {
      whereClause += ` AND brand = $${paramCount}`;
      params.push(brand);
      paramCount++;
    }

    // Tier filter
    if (tier && typeof tier === 'string' && ['1', '2', '3'].includes(tier)) {
      whereClause += ` AND tier = $${paramCount}`;
      params.push(parseInt(tier, 10));
      paramCount++;
    }

    // Get total count
    const countResult = await dbQuery<{ count: number }>(
      `SELECT COUNT(*) as count FROM skus ${whereClause}`,
      params,
    );
    const total = parseInt((countResult.rows[0] as any).count, 10);

    // Get paginated results
    const skuResult = await dbQuery<SKU>(
      `SELECT id, sku_code, style_code, brand, model, colorway, retail_price, tier, image_url, image_local_path, created_at
       FROM skus ${whereClause}
       ORDER BY tier ASC, model ASC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limitNum, offsetNum],
    );

    // Log usage
    try {
      await dbQuery(
        `INSERT INTO api_usage (user_id, endpoint, method, status_code, timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, '/api/skus', 'GET', 200, new Date()],
      );
    } catch (error) {
      logger.debug({ error }, 'Failed to log API usage');
    }

    const hasMore = offsetNum + limitNum < total;

    res.json({
      total,
      count: skuResult.rows.length,
      limit: limitNum,
      offset: offsetNum,
      has_more: hasMore,
      skus: skuResult.rows.map((sku) => ({
        id: sku.id,
        sku_code: sku.sku_code,
        style_code: sku.style_code,
        brand: sku.brand,
        model: sku.model,
        colorway: sku.colorway,
        retail_price: sku.retail_price,
        tier: sku.tier,
        // Prefer the optimized S3 image; fall back to the source URL only if it's
        // a real photo (never a placeholder, which renders as a white box).
        image_url: sku.image_local_path || cleanImageUrl(sku.image_url) || null,
        image_thumbnail_url: sku.image_local_path
          ? sku.image_local_path.replace('/sneakers/', '/sneakers/thumbs/')
          : null,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to search SKUs');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/skus/catalog
 * Get lightweight catalog for sneaker selection in mobile app
 * Returns all sneakers with minimal fields for autocomplete/selection
 *
 * IMPORTANT: This route must be before /:id to avoid path collision
 */
router.get('/catalog', async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, limit = '100', offset = '0' } = req.query;
    const userId = (req as any).user?.userId;

    const limitNum = Math.min(parseInt(limit as string, 10) || 100, 500);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    logger.info({ search, limit: limitNum, userId }, 'Fetching catalog');

    let whereClause = '';
    const params: any[] = [];

    // Optional search filter
    if (search && typeof search === 'string' && search.length > 0) {
      const searchTerm = `%${search}%`;
      whereClause = `WHERE (
        sku_code ILIKE $1 OR
        brand ILIKE $2 OR
        model ILIKE $3 OR
        colorway ILIKE $4 OR
        style_code ILIKE $5
      )`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Get total count
    const countResult = await dbQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM skus ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get catalog with minimal fields
    const result = await dbQuery<SKU>(
      `SELECT id, sku_code, style_code, brand, model, colorway, retail_price, tier, image_url, image_local_path
       FROM skus ${whereClause}
       ORDER BY tier ASC, brand ASC, model ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offsetNum],
    );

    // Log usage
    try {
      await dbQuery(
        `INSERT INTO api_usage (user_id, endpoint, method, status_code, timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, '/api/skus/catalog', 'GET', 200, new Date()],
      );
    } catch (error) {
      logger.debug({ error }, 'Failed to log API usage');
    }

    res.json({
      total,
      count: result.rows.length,
      limit: limitNum,
      offset: offsetNum,
      has_more: offsetNum + limitNum < total,
      catalog: result.rows.map((sku) => ({
        id: sku.id,
        sku_code: sku.sku_code,
        brand: sku.brand,
        model: sku.model,
        colorway: sku.colorway,
        style_code: sku.style_code,
        retail_price: sku.retail_price,
        tier: sku.tier,
        // Prefer the optimized S3 image; fall back to the source URL only if it's
        // a real photo (never a placeholder, which renders as a white box).
        image_url: sku.image_local_path || cleanImageUrl(sku.image_url) || null,
        image_thumbnail_url: sku.image_local_path
          ? sku.image_local_path.replace('/sneakers/', '/sneakers/thumbs/')
          : null,
        display_name: `${sku.brand} ${sku.model}${sku.colorway ? ' - ' + sku.colorway : ''}`,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch catalog');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/skus/lookup?style_code=CW2288-111
 * Discover sneakers by style code from multiple sources.
 * Saves all valid candidates to DB for catalog growth.
 * User must POST /select to trigger image download + price fetch.
 */
lookupRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { style_code } = req.query;

    if (!style_code || typeof style_code !== 'string' || style_code.trim().length === 0) {
      res.status(400).json({ error: 'style_code query parameter is required' });
      return;
    }

    const styleCode = style_code.trim().toUpperCase().replace(/\s+/g, '-');

    logger.info({ styleCode }, 'SKU lookup requested');

    // ── Step 1: Check DB for existing matches ───────────────────────────────
    const existing = await dbQuery<SKU>(
      `SELECT id, sku_code, style_code, brand, model, colorway, retail_price, tier,
              image_url, image_local_path
       FROM skus WHERE style_code = $1`,
      [styleCode],
    );
    const dbResults = existing.rows.map(formatDbRow);

    // ── Step 2: GOAT discovery ──────────────────────────────────────────────
    logger.info({ styleCode }, 'Running GOAT discovery');

    const goatListings = await goatScraper.searchForDiscovery(styleCode, 10).catch((err) => {
      logger.warn({ err, styleCode }, 'GOAT lookup failed');
      return [];
    });

    // ── Step 3: Classify + deduplicate candidates ───────────────────────────
    const seen = new Set<string>();
    const candidates: Candidate[] = [];

    const addCandidate = (c: Candidate) => {
      const key = normalize(c.brand + c.name);
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(c);
    };

    for (const l of goatListings) {
      addCandidate({
        source: 'goat',
        matchType: normalize(l.sku) === normalize(styleCode) ? 'exact' : 'partial',
        actualStyleCode: l.sku || styleCode,
        name: l.name,
        brand: l.brand || 'Unknown',
        colorway: l.colorway || '',
        lowestPriceCents: l.lowestPriceCents,
        retailPriceCents: l.retailPriceCents,
        imageUrl: l.imageUrl,
        goatId: l.sku || null,
        stockxId: null,
      });
    }

    const exactCandidates = candidates.filter((c) => c.matchType === 'exact');

    // ── Step 4: StockX fallback if no exact matches ─────────────────────────
    if (exactCandidates.length === 0 && dbResults.length === 0) {
      logger.info({ styleCode }, 'No exact matches — trying StockX Puppeteer');
      const sxListing = await stockxScraper.getPriceForSku(styleCode).catch((err) => {
        logger.warn({ err, styleCode }, 'StockX fallback failed');
        return null;
      });

      if (sxListing) {
        addCandidate({
          source: 'stockx',
          matchType: 'partial',
          actualStyleCode: sxListing.sku || styleCode,
          name: sxListing.name,
          brand: sxListing.brand || 'Unknown',
          colorway: sxListing.colorway || '',
          lowestPriceCents: Math.round(sxListing.lowestAsk * 100),
          retailPriceCents: sxListing.retailPrice ? Math.round(sxListing.retailPrice * 100) : null,
          imageUrl: sxListing.imageUrl || '',
          goatId: null,
          stockxId: sxListing.urlKey || null,
        });
      }
    }

    // ── Step 4b: KicksDB fallback if GOAT + StockX both empty ───────────────
    if (candidates.length === 0 && dbResults.length === 0) {
      logger.info({ styleCode }, 'No results from GOAT/StockX — trying KicksDB');
      const kdbListings = await kicksdbScraper.searchByStyleCode(styleCode, 10).catch((err) => {
        logger.warn({ err, styleCode }, 'KicksDB lookup failed');
        return [];
      });

      for (const l of kdbListings) {
        addCandidate({
          source: 'kicksdb',
          matchType: normalize(l.styleId) === normalize(styleCode) ? 'exact' : 'partial',
          actualStyleCode: l.styleId || styleCode,
          name: l.name,
          brand: l.brand || 'Unknown',
          colorway: l.colorway || '',
          lowestPriceCents: 0,
          retailPriceCents: l.retailPrice ? Math.round(l.retailPrice * 100) : null,
          imageUrl: l.imageUrl || '',
          goatId: null,
          stockxId: l.urlKey || null,
        });
      }
    }

    // ── Step 5: eBay fallback if still nothing ──────────────────────────────
    if (candidates.length === 0 && dbResults.length === 0) {
      logger.info({ styleCode }, 'All scrapers empty — trying eBay catalog fallback');
      const ebayResult = await ebayScraper.searchCatalogByStyleCode(styleCode).catch(() => null);

      if (ebayResult) {
        addCandidate({
          source: 'ebay',
          matchType: 'partial',
          actualStyleCode: styleCode,
          name: ebayResult.name,
          brand: ebayResult.brand,
          colorway: ebayResult.colorway,
          lowestPriceCents: 0,
          retailPriceCents: null,
          imageUrl: '',
          goatId: null,
          stockxId: null,
        });
      }
    }

    if (candidates.length === 0 && dbResults.length === 0) {
      notifier.lookupNotFound(styleCode).catch(() => {});
      res.status(404).json({ error: 'Sneaker not found on GOAT, KicksDB, StockX, or eBay' });
      return;
    }

    // ── Step 6: Save all valid candidates to DB (catalog growth) ────────────
    const savedIds = new Map<Candidate, number>();
    const newlyInserted = new Map<Candidate, number>(); // only net-new rows

    for (const c of candidates) {
      if (!isValidCandidate(c)) continue;

      const { model, colorway } = parseName(c.name, c.brand);
      const retailPrice = c.retailPriceCents ? c.retailPriceCents / 100 : null;
      const tier = calcTier(c.lowestPriceCents, c.retailPriceCents);

      try {
        const insertResult = await dbQuery<{ id: number }>(
          `INSERT INTO skus (sku_code, style_code, brand, model, colorway, retail_price, tier, image_url, goat_id, stockx_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (style_code) DO NOTHING
           RETURNING id`,
          [c.actualStyleCode, c.actualStyleCode, c.brand, model, colorway, retailPrice,
           tier, c.imageUrl || null, c.goatId, c.stockxId],
        );

        if (insertResult.rows.length > 0) {
          savedIds.set(c, insertResult.rows[0].id);
          newlyInserted.set(c, insertResult.rows[0].id);
          const { model: m, colorway: cv } = parseName(c.name, c.brand);
          notifier.newSneakerAdded({
            name: `${c.brand} ${m}${cv ? ' ' + cv : ''}`,
            styleCode: c.actualStyleCode,
            source: c.source,
            tier: calcTier(c.lowestPriceCents, c.retailPriceCents),
            retailPriceCents: c.retailPriceCents,
            lowestPriceCents: c.lowestPriceCents,
          }).catch(() => {});
        } else {
          const requery = await dbQuery<{ id: number }>(
            `SELECT id FROM skus WHERE style_code = $1`, [c.actualStyleCode],
          );
          if (requery.rows.length > 0) savedIds.set(c, requery.rows[0].id);
        }
      } catch (err) {
        logger.debug({ err, styleCode: c.actualStyleCode }, 'Failed to save candidate to catalog');
      }
    }

    logger.info({ styleCode, saved: savedIds.size, total: candidates.length }, 'Candidates saved to catalog');

    // ── Step 7: Download images to S3 for all saved candidates (parallel) ──
    const s3Urls = new Map<Candidate, string>();

    const imageDownloads = [...savedIds.entries()]
      .filter(([c]) => c.imageUrl)
      .map(async ([c, skuId]) => {
        try {
          // Check if image already downloaded
          const existing = await dbQuery<{ image_local_path: string | null }>(
            `SELECT image_local_path FROM skus WHERE id = $1`, [skuId],
          );
          if (existing.rows[0]?.image_local_path) {
            s3Urls.set(c, existing.rows[0].image_local_path);
            return;
          }

          const imgResult = await imageProcessor.downloadAndOptimize(c.imageUrl, c.actualStyleCode);
          if (imgResult) {
            s3Urls.set(c, imgResult.fullPath);
            await dbQuery(
              `UPDATE skus SET image_local_path = $1, image_file_size = $2, image_downloaded_at = NOW() WHERE id = $3`,
              [imgResult.fullPath, imgResult.fileSize, skuId],
            );
          }
        } catch (imgErr) {
          logger.warn({ imgErr, styleCode: c.actualStyleCode }, 'Image download failed for candidate');
        }
      });

    await Promise.allSettled(imageDownloads);
    logger.info({ styleCode, imagesDownloaded: s3Urls.size }, 'Image downloads complete');

    // ── Step 7b: Background price fetch for newly inserted SKUs ───────────
    for (const [c, skuId] of newlyInserted) {
      const { model, colorway } = parseName(c.name, c.brand);
      const retailPrice = c.retailPriceCents ? c.retailPriceCents / 100 : null;
      const tier = calcTier(c.lowestPriceCents, c.retailPriceCents);
      const newSku = {
        id: skuId,
        sku_code: c.actualStyleCode,
        style_code: c.actualStyleCode,
        brand: c.brand,
        model,
        colorway,
        tier,
        retail_price: retailPrice ?? undefined,
        goat_id: c.goatId ?? undefined,
        stockx_id: c.stockxId ?? undefined,
      } as SKU;
      const { model: nm, colorway: ncv } = parseName(c.name, c.brand);
      priceFetcher
        .fetchAllPricesForSku(newSku)
        .then((r: any) => {
          logger.info(
            { styleCode: c.actualStyleCode, ebay: r.ebay?.success, goat: r.goat?.success, stockx: r.stockx?.success },
            'Background price fetch complete for new SKU',
          );
          notifier.priceFetchResult({
            name: `${c.brand} ${nm}${ncv ? ' ' + ncv : ''}`,
            styleCode: c.actualStyleCode,
            goat: r.goat ?? { success: false },
            stockx: r.stockx ?? { success: false },
            ebay: r.ebay ?? { success: false },
          }).catch(() => {});
        })
        .catch((err: any) => logger.warn({ err, styleCode: c.actualStyleCode }, 'Background price fetch failed for new SKU'));
    }

    // ── Step 8: Build results array ────────────────────────────────────────
    const discoveredResults = candidates.map((c) => {
      const { model, colorway } = parseName(c.name, c.brand);
      const retailPrice = c.retailPriceCents ? c.retailPriceCents / 100 : null;
      const tier = calcTier(c.lowestPriceCents, c.retailPriceCents);
      const s3Url = s3Urls.get(c) || null;
      return {
        match_type: c.matchType,
        source: c.source,
        id: savedIds.get(c) ?? null,
        sku_code: c.actualStyleCode,
        style_code: c.actualStyleCode,
        brand: c.brand,
        model,
        name: c.name,
        colorway,
        retail_price: retailPrice,
        lowest_price_cents: c.lowestPriceCents,
        retail_price_cents: c.retailPriceCents,
        tier,
        image_url: s3Url,
        image_thumbnail_url: s3Url ? s3Url.replace('/sneakers/', '/sneakers/thumbs/') : null,
        source_image_url: cleanImageUrl(c.imageUrl) || null,
        goat_id: c.goatId,
        stockx_id: c.stockxId,
        display_name: `${c.brand} ${model}${colorway ? ' - ' + colorway : ''}`,
      };
    });

    // Merge DB results first, then discovered candidates
    const results = [...dbResults, ...discoveredResults];

    res.json({ discovered: discoveredResults.length > 0, results });
  } catch (error) {
    logger.error({ error }, 'Failed to lookup SKU');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/skus/lookup/select
 * Save the user's selected candidate: download image to S3, kick off price fetch.
 */
lookupRouter.post('/select', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = SelectCandidateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request body', details: parseResult.error.errors });
      return;
    }

    const data = parseResult.data;
    const styleCode = data.style_code.trim().toUpperCase().replace(/\s+/g, '-');

    logger.info({ styleCode, source: data.source }, 'User selected candidate from lookup');

    // Check if already fully processed (has image)
    const existing = await dbQuery<SKU>(
      `SELECT id, sku_code, style_code, brand, model, colorway, retail_price, tier,
              image_url, image_local_path
       FROM skus WHERE style_code = $1`,
      [styleCode],
    );

    if (existing.rows.length > 0 && (existing.rows[0] as any).image_local_path) {
      res.json({ already_existed: true, sku: formatDbRow(existing.rows[0]) });
      return;
    }

    // Insert if not yet in DB (might have been saved by lookup without image)
    const { model, colorway } = parseName(data.name, data.brand);
    const retailPrice = data.retail_price_cents ? data.retail_price_cents / 100 : null;
    const tier = calcTier(data.lowest_price_cents, data.retail_price_cents);

    let skuId: number;
    if (existing.rows.length > 0) {
      skuId = existing.rows[0].id;
    } else {
      const insertResult = await dbQuery<{ id: number }>(
        `INSERT INTO skus (sku_code, style_code, brand, model, colorway, retail_price, tier, image_url, goat_id, stockx_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (style_code) DO NOTHING
         RETURNING id`,
        [styleCode, styleCode, data.brand, model, colorway, retailPrice,
         tier, data.source_image_url || null, data.goat_id, data.stockx_id],
      );

      if (insertResult.rows.length > 0) {
        skuId = insertResult.rows[0].id;
      } else {
        const requery = await dbQuery<{ id: number }>(`SELECT id FROM skus WHERE style_code = $1`, [styleCode]);
        skuId = requery.rows[0].id;
      }
    }

    // Download image to S3
    let s3ImageUrl: string | null = null;
    if (data.source_image_url) {
      try {
        const imgResult = await imageProcessor.downloadAndOptimize(data.source_image_url, styleCode);
        if (imgResult) {
          s3ImageUrl = imgResult.fullPath;
          await dbQuery(
            `UPDATE skus SET image_local_path = $1, image_file_size = $2, image_downloaded_at = NOW() WHERE id = $3`,
            [s3ImageUrl, imgResult.fileSize, skuId],
          );
        }
      } catch (imgErr) {
        logger.warn({ imgErr, styleCode }, 'Image download failed during select');
      }
    }

    const sku = {
      id: skuId,
      sku_code: styleCode,
      style_code: styleCode,
      brand: data.brand,
      model,
      colorway,
      retail_price: retailPrice,
      tier,
      image_url: s3ImageUrl,
      image_thumbnail_url: s3ImageUrl ? s3ImageUrl.replace('/sneakers/', '/sneakers/thumbs/') : null,
      display_name: `${data.brand} ${model}${colorway ? ' - ' + colorway : ''}`,
    };

    res.status(201).json({ already_existed: false, sku });

    // Background price fetch
    const savedSku = {
      id: skuId, sku_code: styleCode, style_code: styleCode,
      brand: data.brand, model, colorway, tier,
      retail_price: retailPrice ?? undefined,
      goat_id: data.goat_id ?? undefined,
      stockx_id: data.stockx_id ?? undefined,
    } as SKU;

    priceFetcher
      .fetchAllPricesForSku(savedSku)
      .then((r: any) => logger.info(
        { styleCode, ebay: r.ebay?.success, goat: r.goat?.success, stockx: r.stockx?.success },
        'Background price fetch complete after select',
      ))
      .catch((err: any) => logger.warn({ err, styleCode }, 'Background price fetch failed after select'));
  } catch (error) {
    logger.error({ error }, 'Failed to save selected candidate');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/skus/trending/popular
 * Get most popular sneakers (most price data points)
 *
 * IMPORTANT: This route must be before /:id to avoid path collision
 */
router.get('/trending/popular', async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = '10' } = req.query;
    const userId = (req as any).user?.userId;

    const limitNum = Math.min(parseInt(limit as string, 10) || 10, 50);

    logger.info({ limit: limitNum, userId }, 'Fetching popular sneakers');

    // Get SKUs with most price data
    const result = await dbQuery(
      `SELECT s.id, s.sku_code, s.style_code, s.brand, s.model, s.colorway, s.tier,
              COUNT(p.id) as price_count,
              AVG(p.price) as avg_price
       FROM skus s
       LEFT JOIN prices p ON s.id = p.sku_id
       GROUP BY s.id, s.sku_code, s.style_code, s.brand, s.model, s.colorway, s.tier
       ORDER BY price_count DESC, s.tier ASC
       LIMIT $1`,
      [limitNum],
    );

    // Log usage
    try {
      await dbQuery(
        `INSERT INTO api_usage (user_id, endpoint, method, status_code, timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, '/api/skus/trending/popular', 'GET', 200, new Date()],
      );
    } catch (error) {
      logger.debug({ error }, 'Failed to log API usage');
    }

    res.json({
      count: result.rows.length,
      trending: result.rows.map((row: any) => ({
        id: row.id,
        sku_code: row.sku_code,
        style_code: row.style_code,
        brand: row.brand,
        model: row.model,
        colorway: row.colorway,
        tier: row.tier,
        price_data_points: row.price_count,
        average_price: row.avg_price ? parseFloat(row.avg_price) : null,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch popular sneakers');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/skus/:id
 * Get details for a single SKU
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    // Validate input
    const skuId = parseInt(typeof id === 'string' ? id : id[0], 10);
    if (isNaN(skuId) || skuId < 1) {
      res.status(400).json({ error: 'Invalid SKU ID' });
      return;
    }

    logger.info({ skuId, userId }, 'Fetching SKU details');

    // Get SKU
    const skuResult = await dbQuery<SKU>(`SELECT * FROM skus WHERE id = $1`, [skuId]);

    if (skuResult.rows.length === 0) {
      res.status(404).json({ error: 'SKU not found' });
      return;
    }

    const sku = skuResult.rows[0];

    // Get latest price data
    const priceResult = await dbQuery(
      `SELECT ecmv, confidence, timestamp FROM price_history
       WHERE sku_id = $1 ORDER BY timestamp DESC LIMIT 1`,
      [skuId],
    );

    // Get raw price count (for data quality indicator)
    const priceCountResult = await dbQuery(
      `SELECT COUNT(*) as count FROM prices WHERE sku_id = $1`,
      [skuId],
    );
    const priceCount = parseInt((priceCountResult.rows[0] as any).count, 10);

    // Log usage
    try {
      await dbQuery(
        `INSERT INTO api_usage (user_id, endpoint, method, status_code, timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, `/api/skus/${skuId}`, 'GET', 200, new Date()],
      );
    } catch (error) {
      logger.debug({ error }, 'Failed to log API usage');
    }

    res.json({
      id: sku.id,
      sku_code: sku.sku_code,
      style_code: sku.style_code,  // Changed from style_code for consistency
      brand: sku.brand,
      model: sku.model,
      colorway: sku.colorway,
      release_date: sku.release_date,
      retail_price: sku.retail_price,
      category: sku.category,
      tier: sku.tier,
      stockx_id: sku.stockx_id,
      goat_id: sku.goat_id,
      created_at: sku.created_at,
      updated_at: sku.updated_at,
      current_price:
        priceResult.rows.length > 0
          ? {
              ecmv: priceResult.rows[0].ecmv,
              confidence: priceResult.rows[0].confidence,
              last_updated: priceResult.rows[0].timestamp,
            }
          : null,
      data_quality: {
        price_points: priceCount,
        data_available: priceCount > 0,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch SKU details');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
