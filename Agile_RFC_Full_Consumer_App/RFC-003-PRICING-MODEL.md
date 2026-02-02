# RFC-003: Pricing Model
Status: Accepted

## Output Definition
Estimated Current Market Value (ECMV)

## Conceptual Formula
ECMV = w1*eBay + w2*GOAT + w3*StockX (optional)

Weights depend on:
- Liquidity
- Freshness
- Volatility

## Smoothing
- Rolling 24–72h median
- Spike suppression

## Confidence Score
Displayed to users as:
- High / Medium / Low
