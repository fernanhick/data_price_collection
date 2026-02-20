import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { verifySecret } from '../middleware/verifySecret.js';
import { query as dbQuery } from '../db/index.js';
import { GoatScraper } from '../services/scrapers/goat.js';
import { StockxScraper } from '../services/scrapers/stockx.js';
import { PriceFetcher } from '../services/pricing/priceFetcher.js';
import imageProcessor from '../services/imageProcessor.js';
import { SKU } from '../types/index.js';

const router = Router();

const goatScraper = new GoatScraper();
const stockxScraper = new StockxScraper();
const priceFetcher = new PriceFetcher();

// ── Marketplace abstraction ───────────────────────────────────────────────────
// Adding a new platform: implement lookup below and add to PLATFORMS array.

interface MarketplaceResult {
  platform: string;
  brand: string;
  colorway: string;
  productName: string; // full product name (e.g. "Nike Dunk Low Retro White Black Panda")
  retailPrice: number | null; // in dollars
  imageUrl: string | null;
}

async function lookupGoat(styleCode: string): Promise<MarketplaceResult | null> {
  const listing = await goatScraper.getPriceForSku(styleCode).catch((err) => {
    console.warn(`[CatalogReview] GOAT lookup error for ${styleCode}:`, err);
    return null;
  });
  if (!listing) return null;
  return {
    platform: 'GOAT',
    brand: listing.brand,
    colorway: listing.colorway,
    productName: listing.name,
    retailPrice: listing.retailPriceCents ? Math.round(listing.retailPriceCents / 100) : null,
    imageUrl: listing.imageUrl || null,
  };
}

async function lookupStockX(styleCode: string): Promise<MarketplaceResult | null> {
  const listing = await stockxScraper.getPriceForSku(styleCode).catch((err) => {
    console.warn(`[CatalogReview] StockX lookup error for ${styleCode}:`, err);
    return null;
  });
  if (!listing) return null;
  return {
    platform: 'StockX',
    brand: listing.brand,
    colorway: listing.colorway,
    productName: listing.name,
    retailPrice: listing.retailPrice,
    imageUrl: listing.imageUrl || null,
  };
}

// Ordered list of platforms to try — first match wins
const PLATFORMS = [lookupGoat, lookupStockX];

async function lookupMarketplaces(styleCode: string): Promise<MarketplaceResult | null> {
  for (const lookup of PLATFORMS) {
    const result = await lookup(styleCode);
    if (result) return result;
  }
  return null;
}

// ── Validation helpers ────────────────────────────────────────────────────────

const STOP_WORDS = new Set(['and', 'the', 'with', 'for', 'low', 'mid', 'high', 'og', 'retro']);

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

function meaningfulWords(s: string): string[] {
  return normalize(s)
    .split(/[\s\/\-,]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Validate submitted details against marketplace data.
 * Returns null if valid, or a mismatch descriptor.
 */
function validateAgainstMarketplace(
  submitted: { brand: string; model: string; colorway: string },
  market: MarketplaceResult,
): { hardReject: boolean; reason: string; detail: string } | null {
  // 1. Brand — hard reject (unambiguous)
  if (normalize(submitted.brand) !== normalize(market.brand)) {
    return {
      hardReject: true,
      reason: 'Brand mismatch',
      detail: `Submitted "${submitted.brand}", ${market.platform} has "${market.brand}"`,
    };
  }

  // 2. Model — submitted words must appear in marketplace product name
  const modelWords = meaningfulWords(submitted.model);
  const productNameLower = normalize(market.productName);
  const modelMatched = modelWords.length > 0 && modelWords.every((w) => productNameLower.includes(w));

  if (!modelMatched) {
    return {
      hardReject: false,
      reason: 'Model mismatch',
      detail: `Submitted model "${submitted.model}" not found in ${market.platform} product name "${market.productName}"`,
    };
  }

  // 3. Colorway — at least one meaningful word must overlap
  const submittedWords = meaningfulWords(submitted.colorway);
  const marketWords = meaningfulWords(market.colorway);
  const overlap = submittedWords.filter((w) => marketWords.includes(w));

  if (submittedWords.length > 0 && overlap.length === 0) {
    return {
      hardReject: false,
      reason: 'Colorway mismatch',
      detail: `Submitted "${submitted.colorway}", ${market.platform} has "${market.colorway}" — no matching words`,
    };
  }

  return null;
}

// ── Route ─────────────────────────────────────────────────────────────────────

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
 *   { approved: true }
 *   { approved: false, reason, detail }                        — hard reject
 *   { approved: false, reason, detail, needsManualReview: true } — needs admin
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

  // Canonical: uppercase, spaces→hyphens ("DV3054 001" or "dv3054-001" → "DV3054-001")
  const canonicalStyleCode = styleCode.trim().toUpperCase().replace(/\s+/g, '-');
  // Stripped: no spaces/hyphens — used for marketplace lookup and DB duplicate check
  const strippedStyleCode = styleCode.replace(/[-\s]/g, '');

  console.log(`[CatalogReview] Processing submission ${submissionId} — ${brand} ${model} ${canonicalStyleCode}`);

  try {
    // 1. Duplicate check — normalize both sides so "DV3054-001" and "DV3054 001" match
    const existingResult = await dbQuery(
      `SELECT id FROM skus WHERE REPLACE(REPLACE(style_code, '-', ''), ' ', '') = $1 LIMIT 1`,
      [strippedStyleCode],
    );
    if (existingResult.rows.length > 0) {
      console.log(`[CatalogReview] Duplicate: ${canonicalStyleCode} already in skus`);
      res.json({
        approved: false,
        reason: 'Style code already in catalog',
        detail: `${canonicalStyleCode} already exists in the database`,
      });
      return;
    }

    // 2. Marketplace lookup (GOAT → StockX → future platforms)
    const marketResult = await lookupMarketplaces(strippedStyleCode);

    if (!marketResult) {
      console.log(`[CatalogReview] Unverified: ${canonicalStyleCode} not found on any marketplace`);
      res.json({
        approved: false,
        reason: 'Not found on resale marketplaces',
        detail: `${canonicalStyleCode} was not found on any marketplace — may be a new release or regional`,
        needsManualReview: true,
      });
      return;
    }

    // 3. Validate submitted details against marketplace data
    const mismatch = validateAgainstMarketplace({ brand, model, colorway }, marketResult);
    if (mismatch) {
      console.log(`[CatalogReview] Mismatch for ${canonicalStyleCode}: ${mismatch.reason} — ${mismatch.detail}`);
      res.json({
        approved: false,
        reason: mismatch.reason,
        detail: mismatch.detail,
        ...(mismatch.hardReject ? {} : { needsManualReview: true }),
      });
      return;
    }

    // 4. Passed — insert using marketplace's authoritative data
    // brand/colorway/retail_price/image_url come from the marketplace
    // model comes from user's submission (validated to exist in marketplace product name)
    const resolvedImageUrl = marketResult.imageUrl ?? imageUrl ?? null;

    const insertResult = await dbQuery<{ id: number }>(
      `INSERT INTO skus (sku_code, style_code, brand, model, colorway, tier, retail_price, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (style_code) DO NOTHING
       RETURNING id`,
      [
        canonicalStyleCode,
        canonicalStyleCode,
        marketResult.brand,
        model,
        marketResult.colorway,
        3,
        marketResult.retailPrice,
        resolvedImageUrl,
      ],
    );

    const newSkuId = insertResult.rows[0]?.id;

    console.log(`[CatalogReview] Approved: ${canonicalStyleCode} verified on ${marketResult.platform}`);
    res.json({ approved: true });

    // 5. Background: download image + fetch prices (after response is sent)
    if (newSkuId) {
      const newSku: SKU = {
        id: newSkuId,
        sku_code: canonicalStyleCode,
        style_code: canonicalStyleCode,
        brand: marketResult.brand,
        model,
        colorway: marketResult.colorway,
        tier: 3,
        retail_price: marketResult.retailPrice ?? undefined,
        image_url: resolvedImageUrl ?? undefined,
      } as SKU;

      if (resolvedImageUrl) {
        imageProcessor
          .downloadAndOptimize(resolvedImageUrl, newSkuId.toString())
          .then(async (imageResult) => {
            if (imageResult) {
              await dbQuery(
                `UPDATE skus SET image_local_path = $1, image_file_size = $2, image_downloaded_at = NOW() WHERE id = $3`,
                [imageResult.fullPath, imageResult.fileSize, newSkuId],
              );
              console.log(`[CatalogReview] Image downloaded for ${canonicalStyleCode}: ${imageResult.fullPath}`);
            }
          })
          .catch((err) => console.warn(`[CatalogReview] Image download failed for ${canonicalStyleCode}:`, err));
      }

      priceFetcher
        .fetchFastPricesForSku(newSku)
        .then((results) => {
          console.log(
            `[CatalogReview] Prices fetched for ${canonicalStyleCode} — eBay: ${results.ebay.success}, GOAT: ${results.goat.success}`,
          );
        })
        .catch((err) => console.warn(`[CatalogReview] Price fetch failed for ${canonicalStyleCode}:`, err));
    }
  } catch (err) {
    console.error('[CatalogReview] Unexpected error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
