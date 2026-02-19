import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { verifySecret } from '../middleware/verifySecret.js';
import { query as dbQuery } from '../db/index.js';
import { GoatScraper } from '../services/scrapers/goat.js';
import { StockxScraper } from '../services/scrapers/stockx.js';

const router = Router();

const goatScraper = new GoatScraper();
const stockxScraper = new StockxScraper();

const SubmissionBodySchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  colorway: z.string().min(1),
  styleCode: z.string().min(1),
  imageUrl: z.string().url().optional().nullable(),
  submissionId: z.string().min(1),
});

/**
 * POST /api/catalog/submissions
 *
 * Validates a sneaker submission from Convex.
 * Response:
 *   { approved: true }                                          — found on marketplace, added to skus
 *   { approved: false, reason: string }                         — definitive reject (duplicate, bad data)
 *   { approved: false, reason: string, needsManualReview: true } — unverified, needs admin
 */
router.post('/submissions', verifySecret, async (req: Request, res: Response) => {
  const parseResult = SubmissionBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      approved: false,
      reason: `Invalid request body: ${parseResult.error.message}`,
    });
    return;
  }

  const { brand, model, colorway, styleCode, imageUrl, submissionId } = parseResult.data;

  console.log(`[CatalogReview] Processing submission ${submissionId} — ${brand} ${model} ${styleCode}`);

  try {
    // 1. Duplicate check
    const existingResult = await dbQuery(
      'SELECT id FROM skus WHERE style_code = $1 LIMIT 1',
      [styleCode],
    );
    if (existingResult.rows.length > 0) {
      console.log(`[CatalogReview] Duplicate: ${styleCode} already in skus`);
      res.json({ approved: false, reason: 'Style code already in catalog' });
      return;
    }

    // 2. Try marketplace lookups
    let goatData = await goatScraper.getPriceForSku(styleCode).catch((err) => {
      console.warn(`[CatalogReview] GOAT lookup failed for ${styleCode}:`, err);
      return null;
    });

    let stockxData = null;
    if (!goatData) {
      stockxData = await stockxScraper.getPriceForSku(styleCode).catch((err) => {
        console.warn(`[CatalogReview] StockX lookup failed for ${styleCode}:`, err);
        return null;
      });
    }

    // 3. If found on at least one marketplace — approve and insert
    if (goatData || stockxData) {
      const marketData = goatData ?? stockxData;
      const skuCode = styleCode.toUpperCase().replace(/\s+/g, '-');

      await dbQuery(
        `INSERT INTO skus (sku_code, style_code, brand, model, colorway, tier, retail_price, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (style_code) DO NOTHING`,
        [
          skuCode,
          styleCode,
          brand,
          model,
          colorway,
          'TIER_3',
          (marketData as any)?.retailPriceCents
            ? Math.round((marketData as any).retailPriceCents / 100)
            : null,
          imageUrl ?? (marketData as any)?.imageUrl ?? null,
        ],
      );

      console.log(`[CatalogReview] Approved: ${styleCode} found on ${goatData ? 'GOAT' : 'StockX'}`);
      res.json({ approved: true });
      return;
    }

    // 4. Not found on any marketplace — needs manual review
    console.log(`[CatalogReview] Unverified: ${styleCode} not found on GOAT or StockX`);
    res.json({
      approved: false,
      reason: 'Not found on resale marketplaces — needs manual review',
      needsManualReview: true,
    });
  } catch (err) {
    console.error('[CatalogReview] Unexpected error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
