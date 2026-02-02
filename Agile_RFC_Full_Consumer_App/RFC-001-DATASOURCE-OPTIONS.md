# RFC-001: Data Source Options (Full Enumeration)
Status: Accepted

This RFC documents **all evaluated data source options**, including rejected and restricted paths.

---

## Option A – Direct StockX HTML Scraping
Status: ❌ Rejected

- React-rendered pages
- Heavy Cloudflare protection
- Extremely high ban probability
- High legal exposure for consumer apps

---

## Option B – StockX Private API Replication
Status: ⚠️ Restricted

- Undocumented GraphQL APIs
- Technically feasible
- Violates StockX ToS

Allowed only for:
- Internal prototyping
- Sparse calibration (top SKUs, ≤1×/day)

---

## Option C – Hybrid API + Browser Automation
Status: ⚠️ Restricted

- API scraping with browser-based cookie refresh
- More resilient than Option B
- Still ToS-violating

Not allowed as a core production dependency.

---

## Option D – Licensed Data Providers
Status: ❌ Unavailable (Constraint)

Would otherwise be the preferred solution.

---

## Option E – User-Contributed / Crowd-Sourced Data
Status: ⚠️ Supplemental

- User-submitted prices
- Screenshots or links

Cannot be primary due to bias and sparsity.

---

## Option F – Reduced-Coverage Monitoring
Status: ⚠️ Mitigation Strategy

- Tiered SKUs
- Partial freshness guarantees

Used only to reduce operational risk.

---

## Option G – Aggregated Public Market Signals
Status: ✅ Accepted

- Multi-source
- Derived pricing
- Legally defensible

This is the chosen production strategy.
