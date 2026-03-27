import logger from '../../utils/logger.js';

const API_KEY = process.env.KICKSDB_API_KEY;
const API_BASE = process.env.KICKSDB_API_BASE || 'https://api.kicks.dev';

export interface KicksDBSearchResult {
  styleId: string;
  name: string;
  brand: string;
  colorway: string;
  retailPrice: number | null;
  urlKey: string; // slug/uuid — used as stockx_id for future price fetches
  imageUrl: string;
}

export class KicksDBScraper {
  async searchByStyleCode(styleCode: string, maxResults = 5): Promise<KicksDBSearchResult[]> {
    if (!API_KEY) {
      throw new Error('KICKSDB_API_KEY not configured');
    }

    const params = new URLSearchParams({
      query: styleCode,
      limit: maxResults.toString(),
    });

    const url = `${API_BASE}/v3/stockx/products?${params}`;
    logger.info({ styleCode, url }, 'Searching KicksDB by style code');

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`KicksDB API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as any;
    const products = data.data || data.products || data;

    if (!Array.isArray(products)) {
      return [];
    }

    return products.map((p: any) => {
      const imageUrl = p.image || p.thumbnail || p.media?.imageUrl || '';
      logger.info({ styleCode, sku: p.sku || p.styleId, imageUrl: imageUrl || '(empty)', hasImage: !!p.image, hasThumbnail: !!p.thumbnail }, 'KicksDB product image data');
      return {
        styleId: p.styleId || p.sku || p.slug || p.id || '',
        name: p.primary_title || p.title || p.name || '',
        brand: p.brand || '',
        colorway: p.secondary_title || p.colorway || '',
        retailPrice: p.retailPrice || null,
        urlKey: p.slug || p.uuid || p.id || '',
        imageUrl,
      };
    });
  }
}
