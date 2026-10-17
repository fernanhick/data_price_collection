import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { verifySecret } from '../middleware/verifySecret.js';
import { query as dbQuery } from '../db/index.js';
import priceFetcher from '../services/pricing/priceFetcher.js';
import imageProcessor from '../services/imageProcessor.js';
import { CatalogEntry, verifySubmission } from '../services/catalog/submissionVerifier.js';
import { SKU } from '../types/index.js';

const router = Router();

const SubmissionBodySchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  colorway: z.string().min(1),
  styleCode: z.string().min(1),
  imageUrl: z.string().url().optional().nullable(),
  submissionId: z.string().min(1),
  // Re-check number (0 = first check).
  attempt: z.number().int().min(0).optional(),
  // The caller can file the sneaker under a corrected style code.
  supportsCorrection: z.boolean().optional(),
  // Decide only: nothing is written (AI review evidence, re-review runs).
  dryRun: z.boolean().optional(),
  // Already approved by the AI review (/verify-submissions), which researched
  // it on the web: file it as given, no verification.
  reviewedApproval: z.boolean().optional(),
  retailPrice: z.number().positive().optional().nullable(),
});

/**
 * Insert a new SKU (no-op when any spelling of the code exists), then its image
 * and first prices in the background.
 */
async function fileInCatalog(entry: CatalogEntry, imageUrl: string | null): Promise<void> {
  const inserted = await dbQuery<{ id: number }>(
    `INSERT INTO skus (sku_code, style_code, brand, model, colorway, tier, retail_price, image_url)
     VALUES ($1, $1, $2, $3, $4, 3, $5, $6)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [entry.style_code, entry.brand, entry.model, entry.colorway, entry.retail_price, entry.image_url ?? imageUrl],
  );
  const id = inserted.rows[0]?.id;
  if (!id) return;

  const image = entry.image_url ?? imageUrl;
  if (image) {
    imageProcessor
      .downloadAndOptimize(image, id.toString())
      .then(async (img) => {
        if (img) {
          await dbQuery(
            `UPDATE skus SET image_local_path = $1, image_file_size = $2, image_downloaded_at = NOW() WHERE id = $3`,
            [img.fullPath, img.fileSize, id],
          );
        }
      })
      .catch((err) => console.warn(`[CatalogReview] Image download failed for ${entry.style_code}:`, err));
  }
  priceFetcher
    .fetchInitialPrices({
      id,
      sku_code: entry.style_code,
      style_code: entry.style_code,
      brand: entry.brand,
      model: entry.model,
      colorway: entry.colorway,
      tier: 3,
      retail_price: entry.retail_price ?? undefined,
    } as SKU)
    .catch((err) => console.warn(`[CatalogReview] Price fetch failed for ${entry.style_code}:`, err));
}

/**
 * POST /api/catalog/submissions
 *
 * Automatic verification of a sneaker a user added that the catalog didn't
 * have (see services/catalog/submissionVerifier.ts). Response:
 *   { approved: true,  decision: 'approved',   reason, styleCode, correctedFrom?, verifiedBy, catalogEntry }
 *   { approved: false, decision: 'rejected',   reason }                       definitive
 *   { approved: false, decision: 'unverified', reason, needsManualReview: true, evidence }
 * `reason` is shown to the user. `needsManualReview` keeps older Convex
 * builds leaving unverified submissions pending.
 *
 * With `reviewedApproval` (the AI review approved it) the sneaker is filed as
 * given and priced: { approved: true, decision: 'approved', verifiedBy: 'ai' }.
 */
router.post('/submissions', verifySecret, async (req: Request, res: Response) => {
  const parsed = SubmissionBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ approved: false, reason: `Invalid request body: ${parsed.error.message}` });
    return;
  }
  const { brand, model, colorway, styleCode, imageUrl, submissionId, attempt, supportsCorrection, dryRun, reviewedApproval, retailPrice } =
    parsed.data;

  try {
    if (reviewedApproval) {
      const entry: CatalogEntry = { style_code: styleCode, brand, model, colorway, retail_price: retailPrice ?? null, image_url: null };
      console.log(`[CatalogReview] ${submissionId} ${styleCode}: filed from AI review`);
      res.json({ approved: true, decision: 'approved', styleCode, verifiedBy: 'ai', catalogEntry: entry });
      if (!dryRun) await fileInCatalog(entry, imageUrl ?? null);
      return;
    }

    const v = await verifySubmission({ brand, model, colorway, styleCode, attempt, supportsCorrection });
    console.log(
      `[CatalogReview] ${submissionId} ${styleCode}: ${v.decision}${v.correctedFrom ? ` as ${v.styleCode}` : ''} (${v.verifiedBy ?? v.reason})`,
    );

    if (v.decision !== 'approved') {
      res.json({
        approved: false,
        decision: v.decision,
        reason: v.reason,
        styleCode: v.styleCode,
        evidence: v.evidence,
        ...(v.decision === 'unverified' ? { needsManualReview: true } : {}),
      });
      return;
    }

    const entry = v.catalogEntry!;
    res.json({
      approved: true,
      decision: 'approved',
      reason: v.reason,
      styleCode: v.styleCode,
      ...(v.correctedFrom ? { correctedFrom: v.correctedFrom } : {}),
      verifiedBy: v.verifiedBy,
      catalogEntry: entry,
      evidence: v.evidence,
    });
    if (dryRun || v.alreadyInCatalog) return;

    // New to the catalog: insert with the marketplace's data.
    await fileInCatalog(entry, imageUrl ?? null);
  } catch (err) {
    console.error('[CatalogReview] Unexpected error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
