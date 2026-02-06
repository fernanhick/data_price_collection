# Mobile App Catalog Integration

Guide for implementing "Add Sneaker" feature with catalog selection.

---

## API Endpoint

### Get Sneaker Catalog

```
GET /api/skus/catalog?search={query}&limit=100
Authorization: Bearer <JWT_TOKEN>
```

**Parameters:**
- `search` (optional) - Filter by brand, model, colorway, style code, or SKU code
- `limit` (optional) - Max results (default: 100, max: 500)

**Response:**
```json
{
  "count": 342,
  "catalog": [
    {
      "id": 1,
      "sku_code": "nike-jordan-1-retro-bred-2023",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro",
      "colorway": "Bred",
      "style_code": "555088-610",
      "retail_price": 170.00,
      "tier": 1,
      "display_name": "Nike Air Jordan 1 Retro - Bred"
    },
    ...
  ]
}
```

---

## Mobile Implementation

### 1. Create API Hook

```typescript
// hooks/useSneakerCatalog.ts
import { useAuth } from '@convex-dev/react';
import { useState } from 'react';

const API_BASE = 'https://api.yourdomain.com';

export interface CatalogItem {
  id: number;
  sku_code: string;
  brand: string;
  model: string;
  colorway?: string;
  style_code?: string;
  retail_price?: number;
  tier: number;
  display_name: string;
}

export function useSneakerCatalog() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchCatalog = async (query: string = ''): Promise<CatalogItem[]> => {
    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const url = query
        ? `${API_BASE}/api/skus/catalog?search=${encodeURIComponent(query)}&limit=100`
        : `${API_BASE}/api/skus/catalog?limit=100`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.catalog || [];
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch catalog';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { searchCatalog, loading, error };
}
```

### 2. Add Sneaker Selection Screen

```typescript
// screens/AddSneakerScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSneakerCatalog, CatalogItem } from '@/hooks/useSneakerCatalog';

export default function AddSneakerScreen() {
  const { searchCatalog, loading, error } = useSneakerCatalog();
  const [searchQuery, setSearchQuery] = useState('');
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selectedSneaker, setSelectedSneaker] = useState<CatalogItem | null>(null);

  // Initial load - get all sneakers
  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    try {
      const items = await searchCatalog();
      setCatalog(items);
    } catch (err) {
      console.error('Failed to load catalog:', err);
    }
  };

  // Search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        handleSearch(searchQuery);
      } else if (searchQuery.length === 0) {
        loadCatalog();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearch = async (query: string) => {
    try {
      const items = await searchCatalog(query);
      setCatalog(items);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const handleSelectSneaker = (sneaker: CatalogItem) => {
    setSelectedSneaker(sneaker);
    // TODO: Navigate to next screen or add to collection
    console.log('Selected:', sneaker);
  };

  const renderSneaker = ({ item }: { item: CatalogItem }) => (
    <TouchableOpacity
      style={styles.sneakerItem}
      onPress={() => handleSelectSneaker(item)}
    >
      <View style={styles.sneakerInfo}>
        <Text style={styles.sneakerName}>{item.display_name}</Text>
        <Text style={styles.sneakerDetails}>
          {item.style_code && `${item.style_code} • `}
          Tier {item.tier}
          {item.retail_price && ` • $${item.retail_price}`}
        </Text>
      </View>
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search sneakers..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {loading && (
        <ActivityIndicator size="large" color="#000" style={styles.loader} />
      )}

      {error && (
        <Text style={styles.error}>{error}</Text>
      )}

      <FlatList
        data={catalog}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderSneaker}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.emptyText}>
              {searchQuery ? 'No sneakers found' : 'No sneakers in catalog'}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  searchInput: {
    height: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingHorizontal: 16,
    fontSize: 16,
  },
  loader: {
    marginTop: 20,
  },
  error: {
    color: 'red',
    textAlign: 'center',
    padding: 16,
  },
  sneakerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sneakerInfo: {
    flex: 1,
  },
  sneakerName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  sneakerDetails: {
    fontSize: 14,
    color: '#666',
  },
  arrow: {
    fontSize: 24,
    color: '#ccc',
  },
  emptyText: {
    textAlign: 'center',
    padding: 32,
    color: '#999',
    fontSize: 16,
  },
});
```

### 3. Alternative: Autocomplete Component

For a more compact interface with autocomplete:

```typescript
// components/SneakerAutocomplete.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
} from 'react-native';
import { useSneakerCatalog, CatalogItem } from '@/hooks/useSneakerCatalog';

interface Props {
  onSelect: (sneaker: CatalogItem) => void;
  placeholder?: string;
}

export function SneakerAutocomplete({ onSelect, placeholder }: Props) {
  const { searchCatalog, loading } = useSneakerCatalog();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CatalogItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const results = await searchCatalog(query);
        setSuggestions(results.slice(0, 10)); // Limit to 10 suggestions
        setShowSuggestions(true);
      } catch (err) {
        console.error('Search failed:', err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (sneaker: CatalogItem) => {
    setQuery(sneaker.display_name);
    setShowSuggestions(false);
    onSelect(sneaker);
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder={placeholder || 'Search sneakers...'}
        value={query}
        onChangeText={setQuery}
        onFocus={() => query.length >= 2 && setShowSuggestions(true)}
      />

      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.suggestion}
                onPress={() => handleSelect(item)}
              >
                <Text style={styles.suggestionText}>{item.display_name}</Text>
                <Text style={styles.suggestionSubtext}>
                  {item.style_code || item.sku_code}
                </Text>
              </TouchableOpacity>
            )}
            style={styles.suggestionsList}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      )}

      {loading && <Text style={styles.loading}>Searching...</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 1,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    maxHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1000,
  },
  suggestionsList: {
    flexGrow: 0,
  },
  suggestion: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  suggestionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  suggestionSubtext: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  loading: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    paddingLeft: 4,
  },
});
```

### 4. Usage Example

```typescript
// Usage in your add sneaker flow
import { SneakerAutocomplete } from '@/components/SneakerAutocomplete';

function AddToCollectionScreen() {
  const handleSneakerSelect = (sneaker: CatalogItem) => {
    console.log('Adding sneaker to collection:', sneaker);

    // Add to user's collection (Convex mutation)
    // await addToCollection({
    //   sku_id: sneaker.id,
    //   sku_code: sneaker.sku_code,
    //   purchase_price: ...,
    //   purchase_date: ...,
    // });
  };

  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>
        Select Sneaker
      </Text>

      <SneakerAutocomplete
        onSelect={handleSneakerSelect}
        placeholder="Search for a sneaker..."
      />

      {/* Rest of form... */}
    </View>
  );
}
```

---

## Benefits

✅ **Lightweight** - Only returns essential fields (not full SKU details)
✅ **Fast search** - Searches across brand, model, colorway, style code
✅ **Pre-formatted** - `display_name` ready for UI display
✅ **Sorted** - By tier (popular first), then alphabetically
✅ **Flexible** - Use as full catalog list or autocomplete

## Performance Tips

1. **Debounce search input** - Wait 300ms before API call
2. **Limit results** - Default 100 is good for most cases
3. **Cache results** - Store in state to avoid re-fetching
4. **Show loading state** - Users know search is happening

## Next Steps

After user selects a sneaker:
1. Store the `sku_id` or `sku_code` in your collection
2. Optionally fetch full details with `GET /api/skus/:id`
3. Get current price with `GET /api/prices/:sku_code`
4. Save to Convex user collection
