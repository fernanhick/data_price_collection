# Code Naming Standards - Proper Use of SKU vs Style Code

**CRITICAL**: Ensure consistent terminology and proper global style code references for accurate pricing across all systems.

---

## 🎯 Core Principle

**Every sneaker has TWO identifiers, and pricing accuracy depends on using the correct one:**

```
GLOBAL IDENTIFIER (use for pricing accuracy):
├─ style_code (or brand_style_code)
│  ├─ Nike: 555088-610
│  ├─ Adidas: FU9007
│  └─ Used globally by brands and retail systems
│
INTERNAL IDENTIFIER (use for our system):
├─ sku_code
│  ├─ nike-air-jordan-1-retro-bred-2023
│  └─ Used only in our system, API endpoints
```

---

## 📝 Naming Convention Rules

### RULE 1: Database Field Names

```sql
-- ALWAYS use these exact field names in database:

CREATE TABLE skus (
  id SERIAL PRIMARY KEY,

  -- Our internal identifier
  sku_code VARCHAR(100) UNIQUE NOT NULL,

  -- GLOBAL identifier (primary for pricing accuracy)
  style_code VARCHAR(50),  -- ← ALWAYS use "style_code" not "brand_code"

  -- Product details
  brand VARCHAR(100),
  model VARCHAR(100),
  colorway VARCHAR(255),

  -- External platform references
  stockx_style_code VARCHAR(100),
  goat_style_code VARCHAR(100),  -- Some platforms use their own variants

  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Pricing table should reference style_code
CREATE TABLE prices (
  id SERIAL PRIMARY KEY,
  sku_id INTEGER REFERENCES skus(id),
  style_code VARCHAR(50), -- ← For audit trail
  source VARCHAR(50), -- 'ebay', 'goat', 'stockx'
  price DECIMAL(10,2),
  timestamp TIMESTAMP
);
```

---

## 💻 Backend Code Standards

### TypeScript/Node.js File Structure

```typescript
// File: src/types/Sneaker.ts
// ALWAYS define types with both identifiers

export interface Sneaker {
  id: number;

  // INTERNAL identifier (our system)
  sku_code: string;  // "nike-air-jordan-1-retro-bred-2023"

  // GLOBAL identifier (for pricing accuracy)
  style_code: string;  // "555088-610"

  // Product metadata
  brand: string;
  model: string;
  colorway: string;

  // External references
  stockx_id?: string;
  goat_id?: string;

  tier: 1 | 2 | 3;
  created_at: Date;
}

export interface PriceData {
  sku_code: string;  // ← Use internal ID for logging
  style_code: string;  // ← CRITICAL for accuracy
  source: 'ebay' | 'goat' | 'stockx';
  price: number;
  timestamp: Date;
}
```

### Repository/Database Layer

```typescript
// File: src/repositories/SneakerRepository.ts

class SneakerRepository {

  // Query by INTERNAL identifier (our system)
  async getBySkuCode(sku_code: string): Promise<Sneaker> {
    return db.query(
      'SELECT * FROM skus WHERE sku_code = $1',
      [sku_code]
    );
  }

  // Query by GLOBAL identifier (for accuracy validation)
  async getByStyleCode(style_code: string): Promise<Sneaker[]> {
    // Returns all variants of this style code
    // (e.g., different sizes, colors are same style code)
    return db.query(
      'SELECT * FROM skus WHERE style_code = $1',
      [style_code]
    );
  }

  // Create sneaker with BOTH identifiers
  async create(data: {
    sku_code: string;        // "nike-jordan-1-bred-2023"
    style_code: string;      // "555088-610" ← REQUIRED for accuracy
    brand: string;
    model: string;
    colorway: string;
  }): Promise<Sneaker> {
    if (!data.style_code) {
      throw new Error(
        `CRITICAL: style_code required for accurate pricing. ` +
        `SKU: ${data.sku_code}`
      );
    }

    return db.query(
      `INSERT INTO skus (
        sku_code, style_code, brand, model, colorway
      ) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        data.sku_code,
        data.style_code,
        data.brand,
        data.model,
        data.colorway
      ]
    );
  }
}
```

### Service Layer (Price Scraping)

```typescript
// File: src/services/PriceScraper.ts

class PriceScraper {

  async scrapePrice(sneaker: Sneaker): Promise<void> {

    // RULE: Always use style_code for cross-platform accuracy
    const style_code = sneaker.style_code;
    const sku_code = sneaker.sku_code;

    if (!style_code) {
      console.warn(
        `WARNING: No style_code for ${sku_code}. ` +
        `Pricing accuracy may be affected.`
      );
    }

    // Example: Search eBay using style code
    const ebayPrices = await this.searchEbay({
      brand: sneaker.brand,
      model: sneaker.model,
      colorway: sneaker.colorway,
      style_code: style_code,  // ← Use for accurate matching
    });

    // Store prices with reference to style_code
    for (const price of ebayPrices) {
      await db.query(
        `INSERT INTO prices (
          sku_id, style_code, source, price, timestamp
        ) VALUES ($1, $2, $3, $4, $5)`,
        [sneaker.id, style_code, 'ebay', price, new Date()]
      );
    }
  }

  private async searchEbay(params: {
    brand: string;
    model: string;
    colorway: string;
    style_code: string;  // ← CRITICAL: Use this for accuracy
  }): Promise<number[]> {

    // Search eBay using style code for accuracy
    // "Nike Air Jordan 1 Retro Bred 555088-610"
    const query = `${params.brand} ${params.model} ${params.colorway} ${params.style_code}`;

    const listings = await ebayAPI.search(query);
    return listings.map(l => l.price);
  }
}
```

### API Layer

```typescript
// File: src/routes/prices.ts

// IMPORTANT: API uses sku_code in URLs, but style_code for accuracy

router.get('/api/prices/:sku_code', async (req, res) => {
  const { sku_code } = req.params;

  // Lookup by internal sku_code
  const sneaker = await SneakerRepository.getBySkuCode(sku_code);

  if (!sneaker) {
    return res.status(404).json({ error: 'Sneaker not found' });
  }

  // Fetch prices using BOTH identifiers for accuracy
  const prices = await db.query(
    `SELECT price, source, timestamp
     FROM prices
     WHERE style_code = $1  -- ← Use global style_code for accuracy
     ORDER BY timestamp DESC
     LIMIT 10`,
    [sneaker.style_code]
  );

  return res.json({
    sku_code: sneaker.sku_code,        // ← Return internal ID
    style_code: sneaker.style_code,    // ← Return global ID for reference
    brand: sneaker.brand,
    model: sneaker.model,
    colorway: sneaker.colorway,
    prices: prices,
    metadata: {
      note: 'Pricing aggregated using global style_code for accuracy'
    }
  });
});

// Health check endpoint
router.get('/api/health/pricing-accuracy', async (req, res) => {
  const skusWithoutStyleCode = await db.query(
    'SELECT sku_code FROM skus WHERE style_code IS NULL'
  );

  return res.json({
    total_skus: await db.query('SELECT COUNT(*) FROM skus'),
    skus_with_style_code: await db.query(
      'SELECT COUNT(*) FROM skus WHERE style_code IS NOT NULL'
    ),
    skus_without_style_code: skusWithoutStyleCode.length,
    warning: skusWithoutStyleCode.length > 0
      ? `${skusWithoutStyleCode.length} SKUs missing style_code - pricing accuracy may be affected`
      : 'All SKUs have style codes - pricing is accurate ✅'
  });
});
```

---

## 📱 Mobile App Integration

```javascript
// File: src/api/prices.ts (Mobile App)

const API_BASE = 'https://api.yourdomain.com';

// Query by sku_code (internal)
async function getPriceBySkuCode(sku_code) {
  // URL uses internal sku_code
  const response = await fetch(
    `${API_BASE}/api/prices/${sku_code}`,
    {
      headers: { 'X-API-Key': API_KEY }
    }
  );

  const data = await response.json();

  // Response includes both identifiers
  console.log('Internal ID (sku_code):', data.sku_code);
  console.log('Global ID (style_code):', data.style_code);
  console.log('Price:', data.ecmv);

  return data;
}

// Display to user
async function displayPrice(sku_code) {
  const price = await getPriceBySkuCode(sku_code);

  // Show to user
  console.log(
    `${price.brand} ${price.model} ${price.colorway}`,
    `(Style: ${price.style_code})`,  // Show for reference
    `- $${price.ecmv}`
  );
}
```

---

## 🗂️ File Organization

```
src/
├── types/
│   └── Sneaker.ts          # Define both sku_code and style_code
│
├── repositories/
│   ├── SneakerRepository.ts # Query by both identifiers
│   └── PriceRepository.ts   # Store prices with style_code
│
├── services/
│   ├── PriceScraper.ts      # Use style_code for accuracy
│   ├── CatalogBuilder.ts    # Create with BOTH identifiers
│   └── PriceCalculator.ts   # Calculate using style_code
│
├── routes/
│   ├── prices.ts            # API endpoints (use sku_code in URLs)
│   ├── skus.ts              # SKU search
│   └── health.ts            # Include pricing accuracy check
│
└── utils/
    └── styleCodeValidator.ts # Validate style codes
```

---

## ⚠️ CRITICAL: Validation Rules

```typescript
// File: src/utils/styleCodeValidator.ts

export class StyleCodeValidator {

  // RULE 1: Every sneaker MUST have a style_code
  static validateSneaker(sneaker: any): boolean {
    if (!sneaker.style_code) {
      console.error(
        `🚨 PRICING ACCURACY ISSUE: ` +
        `${sneaker.sku_code} missing global style_code`
      );
      return false;
    }
    return true;
  }

  // RULE 2: Style codes must match expected format
  static validateStyleCodeFormat(style_code: string): boolean {
    // Nike: 6 digits + dash + 3 digits (e.g., 555088-610)
    if (style_code.match(/^\d{6}-\d{3}$/)) return true;

    // Adidas: 6 alphanumeric (e.g., GW7086)
    if (style_code.match(/^[A-Z0-9]{6}$/)) return true;

    // Generic fallback (alphanumeric + dashes)
    if (style_code.match(/^[A-Z0-9\-]+$/)) return true;

    console.warn(`⚠️ Unusual style_code format: ${style_code}`);
    return false;
  }

  // RULE 3: Never mix style codes (accuracy check)
  static validatePriceAccuracy(
    sneaker: Sneaker,
    priceRecord: PriceData
  ): boolean {
    if (sneaker.style_code !== priceRecord.style_code) {
      console.error(
        `🚨 CRITICAL: Style code mismatch! ` +
        `Expected ${sneaker.style_code}, ` +
        `got ${priceRecord.style_code}`
      );
      return false;
    }
    return true;
  }
}
```

---

## 📊 Logging Standards

```typescript
// File: src/utils/logger.ts

export class PricingLogger {

  static logSneakerCreation(sneaker: Sneaker): void {
    console.log(
      `✅ Created: ${sneaker.sku_code} ` +
      `(global style: ${sneaker.style_code})`
    );
  }

  static logPriceFetch(sneaker: Sneaker, price: number): void {
    console.log(
      `📊 Price: ${sneaker.sku_code} ` +
      `[${sneaker.style_code}] ` +
      `= $${price}`
    );
  }

  static logPricingAccuracyWarning(sku_code: string): void {
    console.warn(
      `⚠️ ACCURACY WARNING: ${sku_code} missing global style_code. ` +
      `Pricing may be inaccurate across platforms.`
    );
  }
}
```

---

## 🔄 Naming Throughout Codebase

### Database & Queries
```sql
-- ✅ CORRECT
SELECT * FROM skus WHERE style_code = $1;
INSERT INTO prices (style_code, price) VALUES ($1, $2);

-- ❌ WRONG
SELECT * FROM skus WHERE brand_code = $1;  -- Use style_code instead
SELECT * FROM skus WHERE global_code = $1; -- Use style_code instead
```

### TypeScript/JavaScript
```typescript
// ✅ CORRECT
const sneaker = {
  sku_code: 'nike-jordan-1-bred-2023',
  style_code: '555088-610',  // ← Always use this term
  brand: 'Nike'
};

// ❌ WRONG
const sneaker = {
  sku_code: 'nike-jordan-1-bred-2023',
  brand_code: '555088-610',  // ← Wrong term
  global_code: '555088-610', // ← Wrong term
  code: '555088-610'         // ← Too vague
};
```

### API Responses
```json
{
  "sku_code": "nike-jordan-1-retro-bred-2023",
  "style_code": "555088-610",
  "ecmv": 152.30,
  "sources": {
    "ebay": 155,
    "goat": 148,
    "stockx": 152
  },
  "_meta": {
    "pricing_uses_style_code": true,
    "accuracy": "high"
  }
}
```

### Comments in Code
```typescript
// ❌ BAD
// Get the code
const code = sneaker.style_code;

// ✅ GOOD
// Get the global style code (e.g., Nike: 555088-610)
// This ensures accurate pricing across all platforms
const styleCode = sneaker.style_code;
```

---

## 🚀 Implementation Checklist

- [ ] All database queries use `style_code` (not `brand_code` or `global_code`)
- [ ] TypeScript interfaces define both `sku_code` and `style_code`
- [ ] All Sneaker creation requires `style_code` (throw error if missing)
- [ ] All price lookups use `style_code` for accuracy
- [ ] API responses include both identifiers
- [ ] Logging always mentions `style_code` for debugging
- [ ] Health check endpoint warns about missing `style_code`
- [ ] Documentation uses consistent terminology
- [ ] Code comments explain why `style_code` matters
- [ ] Team is trained on the difference

---

## 📚 Summary

**Always use these terms consistently:**

| Term | Use Case | Example |
|------|----------|---------|
| `sku_code` | Internal ID, URLs, user display | `nike-jordan-1-bred-2023` |
| `style_code` | Global accuracy, pricing, cross-platform | `555088-610` |

**Rule**: Every sneaker MUST have both, and pricing accuracy depends on using `style_code` globally.

---

**This ensures accurate pricing across different platforms and prevents mixing up different colorways or variants! ✅**
