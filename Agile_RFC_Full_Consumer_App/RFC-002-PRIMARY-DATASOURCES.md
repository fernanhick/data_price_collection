# RFC-002: Primary Data Sources
Status: Accepted

## Source 1 – eBay Sold Listings
Role: Primary signal

- Reflects real transactions
- High liquidity
- Publicly accessible

Usage:
- Median sold price
- 1–2 pulls/day per SKU

---

## Source 2 – GOAT Public Product Pages
Role: Secondary signal

- Lowest ask
- Availability pressure

---

## Source 3 – StockX (Sparse Calibration)
Role: Optional calibration

Rules:
- Top SKUs only
- ≤1×/day
- Never exposed as official pricing
