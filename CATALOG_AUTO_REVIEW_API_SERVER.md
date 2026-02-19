# Catalog Auto-Review: API Server Implementation Guide

This document describes the changes needed in the `data_price_collection` Express/TypeScript server to support the automated catalog submission review feature.

---

## Overview

When a user in the mobile app adds a genuinely new sneaker (not in the catalog, not a custom/altered pair), Convex calls this endpoint to validate and auto-approve or auto-reject the submission.

**Endpoint:** `POST /api/catalog/submissions`
**Auth:** Bearer token (`CATALOG_API_SECRET` env var — same value set in Convex)
**Caller:** Convex `processSubmission` internal action (server-to-server, no user JWT)

---

## Environment Variables

Add to your `.env` / deployment config:

```
CATALOG_API_SECRET=<shared-secret>
```

Generate a secret:
```bash
openssl rand -hex 32
```

This must match the `CATALOG_API_SECRET` value set in Convex:
```bash
npx convex env set CATALOG_API_SECRET <same-secret>
```

---

## Files to Create / Modify

### 1. `src/middleware/verifySecret.ts` — **New file**

Simple Bearer token check. Separate from JWT auth — this is server-to-server only.

```typescript
import { Request, Response, NextFunction } from "express";

export function verifySecret(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  const expected = process.env.CATALOG_API_SECRET;

  if (!expected) {
    console.error("[CatalogAuth] CATALOG_API_SECRET not set on server");
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  if (token !== expected) {
    res.status(403).json({ error: "Invalid secret" });
    return;
  }

  next();
}
```

---

### 2. `src/routes/catalog.ts` — **New file**

```typescript
import { Router, Request, Response } from "express";
import { z } from "zod";
import { verifySecret } from "../middleware/verifySecret";
import { db } from "../db"; // your PostgreSQL/Knex/Prisma client — adjust import
// Import your existing scrapers — adjust paths to match your project
import { fetchGoatPrice } from "../services/scrapers/goat";
import { fetchStockXPrice } from "../services/scrapers/stockx";

const router = Router();

const SubmissionBodySchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  colorway: z.string().min(1),
  styleCode: z.string().min(1),
  imageUrl: z.string().url().optional().nullable(),
  submissionId: z.string().min(1), // Convex ID — for logging/tracing only
});

/**
 * POST /api/catalog/submissions
 *
 * Validates a sneaker submission from Convex.
 * Response:
 *   { approved: true }                                         — found on marketplace, added to skus
 *   { approved: false, reason: string }                        — definitive reject (duplicate, bad data)
 *   { approved: false, reason: string, needsManualReview: true } — unverified, not fake, needs admin
 */
router.post("/submissions", verifySecret, async (req: Request, res: Response) => {
  // 1. Validate body
  const parseResult = SubmissionBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      approved: false,
      reason: `Invalid request body: ${parseResult.error.message}`,
    });
  }

  const { brand, model, colorway, styleCode, imageUrl, submissionId } =
    parseResult.data;

  console.log(
    `[CatalogReview] Processing submission ${submissionId} — ${brand} ${model} ${styleCode}`
  );

  try {
    // 2. Duplicate check — style code already in your skus table
    const existing = await db("skus").where({ style_code: styleCode }).first();
    if (existing) {
      console.log(`[CatalogReview] Duplicate: ${styleCode} already in skus`);
      return res.json({
        approved: false,
        reason: "Style code already in catalog",
      });
    }

    // 3. Try marketplace lookups using existing scrapers
    let goatData: any = null;
    let stockxData: any = null;

    try {
      goatData = await fetchGoatPrice(styleCode);
    } catch (err) {
      console.warn(`[CatalogReview] GOAT lookup failed for ${styleCode}:`, err);
    }

    if (!goatData) {
      try {
        stockxData = await fetchStockXPrice(styleCode);
      } catch (err) {
        console.warn(
          `[CatalogReview] StockX lookup failed for ${styleCode}:`,
          err
        );
      }
    }

    // 4. If found on at least one marketplace — approve and insert into skus
    if (goatData || stockxData) {
      const marketData = goatData ?? stockxData;

      await db("skus").insert({
        style_code: styleCode,
        brand,
        model,
        colorway,
        tier: "TIER_3", // New, unverified — start at lowest tier
        image_url: imageUrl ?? marketData?.imageUrl ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Trigger price fetch for the new SKU in background (don't await)
      // Adjust this call to match how your priceFetcher works
      schedulePriceFetch(styleCode).catch((err) =>
        console.warn(`[CatalogReview] Price fetch schedule failed:`, err)
      );

      console.log(
        `[CatalogReview] Approved: ${styleCode} found on ${goatData ? "GOAT" : "StockX"}`
      );
      return res.json({ approved: true });
    }

    // 5. Not found on any marketplace — unverified, not auto-rejected
    // Could be a new release, regional, or very limited — needs manual review
    console.log(
      `[CatalogReview] Unverified: ${styleCode} not found on GOAT or StockX`
    );
    return res.json({
      approved: false,
      reason: "Not found on resale marketplaces — needs manual review",
      needsManualReview: true,
    });
  } catch (err) {
    console.error("[CatalogReview] Unexpected error:", err);
    // Return 500 so Convex leaves submission as "pending" for manual admin review
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

// ── Helper: schedule a price fetch for the new SKU ───────────────────────────
// Adjust to match how your priceFetcher.ts is triggered.
// Examples depending on your architecture:
//
//   Option A — direct call (if priceFetcher is a local function):
//     import { fetchPriceForSku } from "../services/pricing/priceFetcher";
//     async function schedulePriceFetch(styleCode: string) {
//       await fetchPriceForSku(styleCode);
//     }
//
//   Option B — job queue (Bull/BullMQ):
//     import { priceQueue } from "../queues/priceQueue";
//     async function schedulePriceFetch(styleCode: string) {
//       await priceQueue.add("fetchPrice", { styleCode }, { delay: 5000 });
//     }
//
//   Option C — just log it (manual trigger later):
async function schedulePriceFetch(styleCode: string): Promise<void> {
  console.log(
    `[CatalogReview] TODO: trigger price fetch for new SKU ${styleCode}`
  );
  // Replace with your actual implementation
}
```

---

### 3. `src/index.ts` (or `src/app.ts`) — **Register the router**

Find where your existing routes are registered and add:

```typescript
import catalogRouter from "./routes/catalog";

// Add alongside your other API routes:
app.use("/api/catalog", catalogRouter);
```

---

## Request / Response Contract

### Request
```
POST /api/catalog/submissions
Authorization: Bearer <CATALOG_API_SECRET>
Content-Type: application/json

{
  "brand": "Nike",
  "model": "Air Force 1 Low",
  "colorway": "Dragon Ball Z Custom",
  "styleCode": "CW2288-111",
  "imageUrl": "https://...",       // optional
  "submissionId": "jx7abc123..."   // Convex ID, for logging only
}
```

### Response — Approved
```json
{ "approved": true }
```
Convex will insert into `sneakerCatalog` and set submission status to `"approved"`.

### Response — Rejected (definitive)
```json
{ "approved": false, "reason": "Style code already in catalog" }
```
Convex sets status to `"rejected"` with the reason as `reviewNotes`.

### Response — Unverified (needs manual review)
```json
{
  "approved": false,
  "reason": "Not found on resale marketplaces — needs manual review",
  "needsManualReview": true
}
```
Convex leaves status as `"pending"`. Admin can manually approve/reject from the admin dashboard.

### Response — Server error (5xx)
Convex catches the error and leaves status as `"pending"`. No crash on either side.

---

## Fallback Behavior

| Scenario | API Response | Convex Result |
|---|---|---|
| Style code already in `skus` | `approved: false` | Auto-rejected |
| Found on GOAT or StockX | `approved: true` | Auto-approved → added to `sneakerCatalog` |
| Not found on either marketplace | `approved: false, needsManualReview: true` | Stays `pending` → admin reviews |
| API down / timeout (15s) | N/A (exception caught) | Stays `pending` → admin reviews |
| Invalid secret | `403 Forbidden` | Stays `pending` → admin reviews |
| Bad request body | `400 Bad Request` | Stays `pending` → admin reviews |

---

## Testing the Endpoint

```bash
# Replace <secret> with your CATALOG_API_SECRET value
curl -X POST http://localhost:3000/api/catalog/submissions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <secret>" \
  -d '{
    "brand": "Nike",
    "model": "Dunk Low",
    "colorway": "Panda",
    "styleCode": "DD1391-100",
    "submissionId": "test-123"
  }'
# Expected: { "approved": false, "reason": "Style code already in catalog" }
# (if DD1391-100 is already in your skus table)

curl -X POST http://localhost:3000/api/catalog/submissions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <secret>" \
  -d '{
    "brand": "Nike",
    "model": "Air Max Totally New",
    "colorway": "Some Color",
    "styleCode": "FAKE-9999",
    "submissionId": "test-456"
  }'
# Expected: { "approved": false, "reason": "...", "needsManualReview": true }
# (style code not found on GOAT or StockX)
```

---

## Notes on Scraper Integration

The route reuses your existing scrapers (`goat.ts`, `stockx.ts`) — no new scraping logic needed. The only assumption is that `fetchGoatPrice(styleCode)` and `fetchStockXPrice(styleCode)` return a truthy value if the shoe is found, or `null`/throw if not found.

If your scrapers have different signatures, adjust the calls in `catalog.ts` accordingly.
