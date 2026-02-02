# RFC-004: Data Pipeline
Status: Accepted

## Pipeline
Scheduler → Fetchers → Normalizers → Storage → Public API

## Key Controls
- Global rate limiting
- SKU tiering
- Diff-based writes

## Failure Handling
- Backoff on 429/403
- Circuit breakers per source
