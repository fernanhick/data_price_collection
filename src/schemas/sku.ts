import { z } from 'zod';

/**
 * Zod schema for creating a new SKU
 */
export const CreateSKUSchema = z.object({
  sku_code: z.string().min(1).max(100).optional(),  // Now optional
  style_code: z.string().min(1, 'Style code is required').max(50),  // Required
  brand: z.string().min(1, 'Brand is required').max(100),
  model: z.string().min(1, 'Model is required').max(100),
  colorway: z.string().max(255).optional(),
  release_date: z.string().date().optional().nullable(),
  retail_price: z.number().positive('Retail price must be positive').optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  tier: z.number().int().min(1).max(3, 'Tier must be 1, 2, or 3').default(2),
  stockx_id: z.string().max(100).optional().nullable(),
  goat_id: z.string().max(100).optional().nullable(),
  ebay_query: z.string().max(255).optional().nullable(),
  image_url: z.string().url().max(500).optional().nullable(),
  image_local_path: z.string().max(255).optional().nullable(),
});

/**
 * Zod schema for updating an existing SKU
 * All fields are optional for partial updates
 */
export const UpdateSKUSchema = z.object({
  sku_code: z.string().min(1).max(100).optional(),
  style_code: z.string().min(1).max(50).optional(),
  brand: z.string().min(1).max(100).optional(),
  model: z.string().min(1).max(100).optional(),
  colorway: z.string().max(255).optional().nullable(),
  release_date: z.string().date().optional().nullable(),
  retail_price: z.number().positive().optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  tier: z.number().int().min(1).max(3).optional(),
  stockx_id: z.string().max(100).optional().nullable(),
  goat_id: z.string().max(100).optional().nullable(),
  ebay_query: z.string().max(255).optional().nullable(),
  image_url: z.string().url().max(500).optional().nullable(),
  image_local_path: z.string().max(255).optional().nullable(),
});

/**
 * Zod schema for selecting a candidate from lookup results
 */
export const SelectCandidateSchema = z.object({
  source: z.enum(['goat', 'kicksdb', 'stockx', 'ebay']),
  style_code: z.string().min(1).max(50),
  brand: z.string().min(1).max(100),
  name: z.string().min(1).max(500),
  colorway: z.string().max(255).default(''),
  lowest_price_cents: z.number().int().min(0).default(0),
  retail_price_cents: z.number().int().nullable().default(null),
  source_image_url: z.string().max(1000).nullable().default(null),
  goat_id: z.string().max(100).nullable().default(null),
  stockx_id: z.string().max(100).nullable().default(null),
});

export type CreateSKUInput = z.infer<typeof CreateSKUSchema>;
export type UpdateSKUInput = z.infer<typeof UpdateSKUSchema>;
export type SelectCandidateInput = z.infer<typeof SelectCandidateSchema>;
