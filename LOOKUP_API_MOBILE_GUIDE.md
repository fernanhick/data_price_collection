# `/api/skus/lookup` — Mobile Integration Guide

## Overview

The `/lookup` endpoint searches multiple sources (GOAT, KicksDB, StockX, eBay) for a sneaker by its official style code (the code printed on the box label). It returns a ranked list of results so your app can present options when the code maps to multiple shoes.

---

## Request

```
GET /api/skus/lookup?style_code=<style_code>
Authorization: Bearer <jwt_token>
```

**Parameters**

| Field        | Type   | Required | Example      |
|--------------|--------|----------|--------------|
| `style_code` | string | Yes      | `DZ5485-401` |

---

## Response Shape

### Success — shoe(s) found

```json
{
  "discovered": true,
  "results": [
    {
      "match_type": "exact",
      "source": "goat",
      "id": 123,
      "sku_code": "DZ5485-401-10",
      "style_code": "DZ5485-401",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro High OG",
      "colorway": "Royal Reimagined",
      "retail_price": 180,
      "tier": 2,
      "image_url": "https://your-bucket.s3.amazonaws.com/images/dz5485-401.jpg",
      "image_thumbnail_url": "https://your-bucket.s3.amazonaws.com/thumbs/dz5485-401.jpg",
      "display_name": "Nike Air Jordan 1 Retro High OG Royal Reimagined"
    }
  ]
}
```

### Success — already in database

```json
{
  "discovered": false,
  "results": [
    {
      "match_type": "exact",
      "source": "database",
      "id": 42,
      ...
    }
  ]
}
```

### Not found

```http
HTTP 404
{ "error": "No results found for style code: FAKE9999" }
```

---

## Response Fields

| Field                  | Type             | Description |
|------------------------|------------------|-------------|
| `discovered`           | `boolean`        | `true` = freshly found and saved; `false` = already in DB |
| `results`              | `array`          | Ordered list of matches (exact first, then partial) |
| `match_type`           | `"exact" \| "partial"` | `exact` = style code confirmed; `partial` = best guess |
| `source`               | `string`         | Where the result came from: `goat`, `kicksdb`, `stockx`, `ebay`, `database` |
| `id`                   | `number \| null` | DB row ID; `null` means the shoe was found but **not saved** (no price history available) |
| `sku_code`             | `string`         | Full SKU including size, if known |
| `style_code`           | `string`         | Normalized style code |
| `brand`                | `string`         | e.g. `"Nike"`, `"Adidas"` |
| `model`                | `string`         | Model/name of the shoe |
| `colorway`             | `string`         | Colorway name |
| `retail_price`         | `number \| null` | Retail price in USD; null if unknown |
| `tier`                 | `number`         | Price tier (1–5); lower = more premium |
| `image_url`            | `string \| null` | S3 image URL; `null` if image download failed |
| `image_thumbnail_url`  | `string \| null` | S3 thumbnail URL; `null` if image unavailable |
| `display_name`         | `string`         | Formatted name for display in lists |

---

## How to Handle Key Fields

### `match_type`

| Value     | Meaning | Recommended UX |
|-----------|---------|----------------|
| `"exact"` | Style code confirmed — high confidence | Show result normally |
| `"partial"` | Best guess from title/search — low confidence | Show a "Best guess" or "Unconfirmed match" badge |

Only show partial results when no exact match exists. If the user scanned a barcode and gets a partial result, ask them to confirm the shoe is correct before tracking prices.

### `id: null`

An `id` of `null` means the shoe was discovered but **not saved** to the database (typically because a different colorway with the same style code was saved first, due to the UNIQUE constraint). These results:
- Have **no price history**
- Cannot be tracked or added to a collection
- Should be shown as "display only" entries

**Recommended UI**: Grey out the "Add to Collection" button, or show a tooltip: "Price history not available for this variant."

### `image_url: null`

The image download from the source failed. Always have a placeholder ready.

### Multiple results

When `results` has more than one entry, the style code maps to multiple colorways or shoes. Present a scrollable list so the user can pick the right one.

---

## TypeScript / React Native

```typescript
// types/lookup.ts

export type MatchType = 'exact' | 'partial';
export type LookupSource = 'goat' | 'kicksdb' | 'stockx' | 'ebay' | 'database';

export interface LookupResult {
  match_type: MatchType;
  source: LookupSource;
  id: number | null;
  sku_code: string;
  style_code: string;
  brand: string;
  model: string;
  colorway: string;
  retail_price: number | null;
  tier: number;
  image_url: string | null;
  image_thumbnail_url: string | null;
  display_name: string;
}

export interface LookupResponse {
  discovered: boolean;
  results: LookupResult[];
}
```

```typescript
// api/lookup.ts

async function lookupByStyleCode(styleCode: string, token: string): Promise<LookupResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/skus/lookup?style_code=${encodeURIComponent(styleCode)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (res.status === 404) throw new Error('Shoe not found');
  if (!res.ok) throw new Error(`Lookup failed: ${res.status}`);

  return res.json() as Promise<LookupResponse>;
}
```

```tsx
// components/LookupResultsList.tsx (React Native example)

import React from 'react';
import { FlatList, View, Text, Image, TouchableOpacity } from 'react-native';
import { LookupResult } from '../types/lookup';

const PLACEHOLDER = require('../assets/shoe-placeholder.png');

interface Props {
  results: LookupResult[];
  onSelect: (result: LookupResult) => void;
}

export function LookupResultsList({ results, onSelect }: Props) {
  return (
    <FlatList
      data={results}
      keyExtractor={(item, i) => `${item.style_code}-${i}`}
      renderItem={({ item }) => (
        <TouchableOpacity
          onPress={() => onSelect(item)}
          disabled={item.id === null}   // can't track unsaved shoes
          style={{ opacity: item.id === null ? 0.5 : 1 }}
        >
          <Image
            source={item.image_thumbnail_url ? { uri: item.image_thumbnail_url } : PLACEHOLDER}
            style={{ width: 80, height: 80 }}
          />
          <Text>{item.display_name}</Text>
          {item.match_type === 'partial' && (
            <Text style={{ color: 'orange' }}>Best guess — please confirm</Text>
          )}
          {item.id === null && (
            <Text style={{ color: 'gray' }}>Price history unavailable</Text>
          )}
          {item.retail_price && <Text>Retail: ${item.retail_price}</Text>}
        </TouchableOpacity>
      )}
    />
  );
}
```

---

## Swift / SwiftUI

```swift
// Models/LookupModels.swift

enum MatchType: String, Decodable {
    case exact
    case partial
}

enum LookupSource: String, Decodable {
    case goat, kicksdb, stockx, ebay, database
}

struct LookupResult: Decodable, Identifiable {
    // Use sku_code as the Identifiable id since DB id can be nil
    var id: String { sku_code }

    let match_type: MatchType
    let source: LookupSource
    let db_id: Int?           // maps to JSON "id"
    let sku_code: String
    let style_code: String
    let brand: String
    let model: String
    let colorway: String
    let retail_price: Double?
    let tier: Int
    let image_url: URL?
    let image_thumbnail_url: URL?
    let display_name: String

    enum CodingKeys: String, CodingKey {
        case match_type, source, sku_code, style_code
        case brand, model, colorway, retail_price, tier
        case image_url, image_thumbnail_url, display_name
        case db_id = "id"
    }
}

struct LookupResponse: Decodable {
    let discovered: Bool
    let results: [LookupResult]
}
```

```swift
// Services/LookupService.swift

func lookup(styleCode: String, token: String) async throws -> LookupResponse {
    var components = URLComponents(string: "\(apiBase)/api/skus/lookup")!
    components.queryItems = [URLQueryItem(name: "style_code", value: styleCode)]

    var request = URLRequest(url: components.url!)
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

    let (data, response) = try await URLSession.shared.data(for: request)

    if let http = response as? HTTPURLResponse, http.statusCode == 404 {
        throw LookupError.notFound
    }

    return try JSONDecoder().decode(LookupResponse.self, from: data)
}
```

```swift
// Views/LookupResultsView.swift

struct LookupResultsView: View {
    let results: [LookupResult]
    var onSelect: (LookupResult) -> Void

    var body: some View {
        List(results) { result in
            Button(action: { onSelect(result) }) {
                HStack {
                    AsyncImage(url: result.image_thumbnail_url) { img in
                        img.resizable().scaledToFit()
                    } placeholder: {
                        Image(systemName: "shoe")
                    }
                    .frame(width: 80, height: 80)

                    VStack(alignment: .leading) {
                        Text(result.display_name).font(.headline)

                        if result.match_type == .partial {
                            Label("Best guess — please confirm", systemImage: "questionmark.circle")
                                .foregroundColor(.orange)
                                .font(.caption)
                        }

                        if result.db_id == nil {
                            Text("Price history unavailable")
                                .foregroundColor(.secondary)
                                .font(.caption)
                        }

                        if let price = result.retail_price {
                            Text("Retail: $\(Int(price))").font(.caption)
                        }
                    }
                }
            }
            .disabled(result.db_id == nil)
        }
    }
}
```

---

## Recommended UX Flow

```
User scans barcode / types style code
          │
          ▼
  Show loading spinner
  "Searching across GOAT, KicksDB, StockX..."
          │
          ▼
  ┌─────────────────────────────────────────────────┐
  │  Results list (all items in `results` array)   │
  │                                                  │
  │  [exact]  Air Jordan 1 Royal Reimagined  ✓      │
  │  [partial] Jordan 1 High (best guess)    ⚠      │
  │  [exact, id:null] AJ1 OG variant  (greyed out)  │
  └─────────────────────────────────────────────────┘
          │
          User taps a result
          │
          ▼
  ┌─────────────────────────┐
  │  Shoe Detail Screen     │
  │  Price history chart    │  (only if id != null)
  │  Add to collection btn  │  (disabled if id null)
  └─────────────────────────┘
```

**Edge cases**

| Scenario | UI behaviour |
|----------|-------------|
| Single exact result | Skip the list — navigate directly to shoe detail |
| Multiple exact results | Show list with colorway distinguisher |
| Only partial results | Show list with ⚠ "Best guess" banner at top |
| `image_url: null` | Show placeholder image asset |
| `id: null` | Disable "Add to Collection", hide price history tab |
| HTTP 404 | "No shoe found for this code. Try scanning again or search by name." |
| Network error | "Could not reach server. Check your connection." |

---

## Latency Notes

- **Normal**: ~2–3 s (GOAT + KicksDB run in parallel)
- **StockX fallback triggered**: +15–45 s (Puppeteer browser)
- **eBay fallback triggered**: +1–2 s (lightweight HTML parse)

Consider showing a progress message after 3 s: "Still searching, trying additional sources…"
