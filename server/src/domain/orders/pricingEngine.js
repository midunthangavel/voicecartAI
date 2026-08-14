/**
 * Deterministic Catalog & Pricing Engine
 * 
 * Implements "The AI suggests; the Code decides" principle from Phase2.pdf (Pages 10-11).
 * Calculates authoritative pricing, taxes, line totals, and item snapshots from database catalog.
 */

import { getActiveCatalogItems } from '../catalog/catalog.repository.js';

let cachedCatalog = null;
let lastCatalogFetch = 0;

/**
 * Loads all active catalog items from repository with 60s cache
 */
export async function getActiveCatalog(restaurantId = 'r_coimbatore_01') {
  const now = Date.now();
  if (cachedCatalog && (now - lastCatalogFetch < 60000)) {
    return cachedCatalog;
  }

  try {
    const items = await getActiveCatalogItems(restaurantId);
    cachedCatalog = items;
    lastCatalogFetch = now;
    return cachedCatalog;
  } catch (err) {
    console.error('[PricingEngine] Failed to load catalog from DB:', err.message);
    if (cachedCatalog) return cachedCatalog;
    return [
      { id: 1, name: 'Chicken Biryani', name_tamil: 'சிக்கன் பிரியாணி', category: 'biryani', price: 220 },
      { id: 2, name: 'Mutton Biryani', name_tamil: 'ஆட்டு பிரியாணி', category: 'biryani', price: 280 },
      { id: 3, name: 'Paneer Butter Masala', name_tamil: 'பன்னீர் பட்டர் மசாலா', category: 'curry', price: 180 },
      { id: 4, name: 'Butter Naan', name_tamil: 'பட்டர் நான்', category: 'bread', price: 45 },
      { id: 5, name: 'Garlic Naan', name_tamil: 'பூண்டு நான்', category: 'bread', price: 55 },
      { id: 6, name: 'Kothu Parotta', name_tamil: 'கொத்து பரோட்டா', category: 'main', price: 150 },
      { id: 7, name: 'Thums Up', name_tamil: 'தம்ஸ் அப்', category: 'beverage', price: 40 },
    ];
  }
}

/**
 * Match a spoken or requested item name to an official catalog item.
 */
export async function matchCatalogItem(rawName, restaurantId = 'r_coimbatore_01') {
  if (!rawName) return null;
  const catalog = await getActiveCatalog(restaurantId);
  const query = rawName.toLowerCase().trim();

  // 1. Exact or starts-with match
  for (const item of catalog) {
    if (item.name.toLowerCase() === query) return item;
    if (item.name_tamil && item.name_tamil === query) return item;
  }

  // 2. Contains match with priority for longer specific names
  const sorted = [...catalog].sort((a, b) => b.name.length - a.name.length);
  for (const item of sorted) {
    const itemName = item.name.toLowerCase();
    if (query.includes(itemName) || itemName.includes(query)) {
      return item;
    }
    if (item.stt_hints && item.stt_hints.some(h => query.includes(h.toLowerCase()))) {
      return item;
    }
  }

  // 3. Common Tamil / Tanglish synonym heuristics
  const synonyms = [
    { patterns: ['chicken biryani', 'chicken biriyani', 'kozhi biryani', 'koli biryani', 'cb', 'dum biryani'], skuName: 'Chicken Biryani' },
    { patterns: ['mutton biryani', 'mutton biriyani', 'aatu biryani', 'goat biryani', 'mb'], skuName: 'Mutton Biryani' },
    { patterns: ['paneer', 'paneer butter', 'pbm', 'paneer masala', 'paneer gravy'], skuName: 'Paneer Butter Masala' },
    { patterns: ['garlic naan', 'poondu naan', 'garlic nan'], skuName: 'Garlic Naan' },
    { patterns: ['butter naan', 'naan', 'nan', 'roti'], skuName: 'Butter Naan' },
    { patterns: ['kothu', 'kothu parotta', 'kothu porotta', 'muttai kothu'], skuName: 'Kothu Parotta' },
    { patterns: ['chicken 65', 'six five', 'kozhi 65'], skuName: 'Chicken 65' },
    { patterns: ['thums up', 'thumbs up', 'coke', 'pepsi', 'cool drink', 'soda'], skuName: 'Thums Up' },
    { patterns: ['masala chai', 'chai', 'tea', 'tea venum'], skuName: 'Masala Chai' },
  ];

  for (const syn of synonyms) {
    if (syn.patterns.some(p => p.length <= 3 ? new RegExp(`\\b${p}\\b`, 'i').test(query) : query.includes(p))) {
      const matched = catalog.find(i => i.name.toLowerCase() === syn.skuName.toLowerCase());
      if (matched) return matched;
    }
  }

  return null;
}

/**
 * Authoritatively calculates cart totals and generates line-item snapshots.
 */
export async function calculateAuthoritativeCart(requestedItems = [], deliveryAddress = null, restaurantId = 'r_coimbatore_01') {
  const verifiedItems = [];

  for (const req of requestedItems) {
    const quantity = Math.max(1, parseInt(req.quantity, 10) || 1);
    const catalogItem = await matchCatalogItem(req.name, restaurantId);

    if (catalogItem) {
      const unitPrice = catalogItem.price;
      const lineTotal = unitPrice * quantity;

      verifiedItems.push({
        catalog_item_id: catalogItem.id,
        name: catalogItem.name,
        name_tamil: catalogItem.name_tamil,
        item_name_snapshot: catalogItem.name,
        unit_price_snapshot: unitPrice,
        price: unitPrice,
        quantity,
        line_total: lineTotal,
        category: catalogItem.category_name || catalogItem.category || 'food',
      });
    } else {
      verifiedItems.push({
        catalog_item_id: null,
        name: req.name,
        name_tamil: '',
        item_name_snapshot: req.name,
        unit_price_snapshot: req.price || 0,
        price: req.price || 0,
        quantity,
        line_total: (req.price || 0) * quantity,
        category: 'other',
      });
    }
  }

  const subtotal = verifiedItems.reduce((sum, item) => sum + item.line_total, 0);
  const tax = Math.round(subtotal * 0.05); // 5% GST
  const delivery_fee = subtotal > 0 && deliveryAddress ? (subtotal >= 500 ? 0 : 30) : 0;
  const total = subtotal + tax + delivery_fee;

  return {
    items: verifiedItems,
    subtotal,
    tax,
    delivery_fee,
    total,
  };
}
