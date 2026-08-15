import { dbAll, dbGet, dbRun } from '../../db.js';

/**
 * Catalog Repository — Manages categories, items, and variants with strict multi-tenant scoping
 */

export async function getCategoriesByRestaurant(options = {}) {
  const tenantId = typeof options === 'object' ? (options.tenantId || 't_annapoorna') : 't_annapoorna';
  const restaurantId = typeof options === 'string' ? options : (options.restaurantId || 'r_coimbatore_01');

  return dbAll(
    'SELECT * FROM catalog_categories WHERE tenant_id = ? AND restaurant_id = ? AND active = 1 ORDER BY sort_order ASC',
    [tenantId, restaurantId]
  );
}

export async function getActiveCatalogItems(options = {}) {
  const tenantId = typeof options === 'object' ? (options.tenantId || 't_annapoorna') : 't_annapoorna';
  const restaurantId = typeof options === 'string' ? options : (options.restaurantId || 'r_coimbatore_01');

  const rows = await dbAll(
    `SELECT i.*, c.name as category_name, c.name_tamil as category_name_tamil 
     FROM catalog_items i 
     LEFT JOIN catalog_categories c ON i.category_id = c.id 
     WHERE i.tenant_id = ? AND i.restaurant_id = ? AND i.available = 1 
     ORDER BY c.sort_order ASC, i.name ASC`,
    [tenantId, restaurantId]
  );

  return rows.map(r => ({
    ...r,
    stt_hints: typeof r.stt_hints === 'string' ? JSON.parse(r.stt_hints || '[]') : (r.stt_hints || []),
    is_special: !!r.is_special,
    available: !!r.available,
  }));
}

export async function getCatalogItemById(itemId, options = {}) {
  const tenantId = typeof options === 'object' ? (options.tenantId || 't_annapoorna') : 't_annapoorna';
  const restaurantId = typeof options === 'string' ? options : (options.restaurantId || 'r_coimbatore_01');

  const row = await dbGet(
    'SELECT * FROM catalog_items WHERE id = ? AND tenant_id = ? AND restaurant_id = ?',
    [itemId, tenantId, restaurantId]
  );
  if (!row) return null;
  return {
    ...row,
    stt_hints: typeof row.stt_hints === 'string' ? JSON.parse(row.stt_hints || '[]') : (row.stt_hints || []),
    is_special: !!row.is_special,
    available: !!row.available,
  };
}

export async function createCatalogItem({
  tenant_id = 't_annapoorna',
  restaurant_id = 'r_coimbatore_01',
  category_id,
  sku = null,
  name,
  name_tamil = '',
  description = '',
  price,
  available = 1,
  is_special = 0,
  dietary_tags = 'none',
  stt_hints = [],
}) {
  const res = await dbRun(
    `INSERT INTO catalog_items (
       tenant_id, restaurant_id, category_id, sku, name, name_tamil, description, 
       price, available, is_special, dietary_tags, stt_hints
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenant_id,
      restaurant_id,
      category_id,
      sku,
      name,
      name_tamil,
      description,
      price,
      available,
      is_special ? 1 : 0,
      dietary_tags,
      JSON.stringify(stt_hints || []),
    ]
  );
  return res.lastID;
}
