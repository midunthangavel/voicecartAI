import { z } from 'zod';

export const addCatalogItemSchema = z.object({
  name: z.string().trim().min(2, 'Item name must be at least 2 characters').max(100),
  name_tamil: z.string().trim().max(100).optional().default(''),
  category_id: z.coerce.number().int().min(1, 'Valid category ID required'),
  price: z.coerce.number().min(0, 'Price cannot be negative').max(100000),
  available: z.coerce.number().int().min(0).max(1).optional().default(1),
  is_special: z.coerce.number().int().min(0).max(1).optional().default(0),
  dietary_tags: z.enum(['veg', 'non-veg', 'none']).optional().default('none'),
  stt_hints: z.union([
    z.array(z.string().trim().max(50)),
    z.string().transform(str => str.split(',').map(s => s.trim()).filter(Boolean)),
  ]).optional().default([]),
}).strict();
