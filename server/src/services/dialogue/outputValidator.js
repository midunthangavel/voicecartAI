import { z } from 'zod';
import { matchCatalogItem } from '../../domain/orders/pricingEngine.js';

const llmDecisionSchema = z.object({
  intent: z.enum([
    'greeting',
    'order_item',
    'remove_item',
    'ask_menu',
    'ask_price',
    'provide_address',
    'confirm_order',
    'cancel_order',
    'unknown',
  ]).default('unknown'),
  reply_en: z.string().default('How can I help you today?'),
  reply_ta: z.string().default('நான் உங்களுக்கு எப்படி உதவ முடியும்?'),
  language: z.enum(['en', 'ta', 'mixed']).default('mixed'),
  state: z.string().default('greeting'),
  extracted_items: z.array(
    z.object({
      name: z.string().default('Item'),
      quantity: z.any().optional().default(1),
      unit_price: z.any().optional(),
      for_person: z.string().nullable().optional(),
    })
  ).default([]),
  address: z.string().nullable().optional(),
  landmark: z.string().nullable().optional(),
  payment_method: z.enum(['online', 'cod', 'link', 'none']).optional().default('none'),
  is_order_complete: z.boolean().default(false),
});

/**
 * Validates and sanitizes LLM structured decision output against business rules and menu catalog
 */
export async function validateAndSanitizeLlmOutput(rawOutput, restaurantId = 'r_coimbatore_01') {
  let parsed;

  if (typeof rawOutput === 'string') {
    try {
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      parsed = {};
    }
  } else {
    parsed = rawOutput || {};
  }

  const result = llmDecisionSchema.safeParse(parsed);
  const validated = result.success ? result.data : llmDecisionSchema.parse({});

  // 1. Cross-reference extracted items against active restaurant catalog
  const verifiedItems = [];
  for (const item of validated.extracted_items) {
    const matched = await matchCatalogItem(item.name, restaurantId);
    if (matched) {
      verifiedItems.push({
        catalog_item_id: matched.id,
        name: matched.name,
        name_tamil: matched.name_tamil,
        price: matched.price,
        quantity: Math.min(Math.max(item.quantity || 1, 1), 50),
        for_person: item.for_person || null,
      });
    } else {
      // Keep as recognized raw item if price is plausible, but clamp quantity
      verifiedItems.push({
        name: item.name.substring(0, 100),
        price: item.unit_price && item.unit_price > 0 ? item.unit_price : 100,
        quantity: Math.min(Math.max(item.quantity || 1, 1), 50),
        for_person: item.for_person || null,
      });
    }
  }

  validated.extracted_items = verifiedItems;
  return validated;
}
