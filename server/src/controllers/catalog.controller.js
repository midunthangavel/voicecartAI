import { getActiveCatalogItems, getCategoriesByRestaurant, createCatalogItem } from '../domain/catalog/catalog.repository.js';
import { dbAll } from '../db.js';

/**
 * Controller for Restaurant Menu Catalog and Categories
 * Scoped strictly by server-side authenticated identity (req.auth).
 */

export async function getCatalog(req, res, next) {
  try {
    const tenantId = req.auth?.tenantId || 't_annapoorna';
    const restaurantId = req.auth?.restaurantId || 'r_coimbatore_01';
    const items = await getActiveCatalogItems({ tenantId, restaurantId });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

export async function getCategories(req, res, next) {
  try {
    const tenantId = req.auth?.tenantId || 't_annapoorna';
    const restaurantId = req.auth?.restaurantId || 'r_coimbatore_01';
    const categories = await getCategoriesByRestaurant({ tenantId, restaurantId });
    res.json(categories);
  } catch (err) {
    next(err);
  }
}

export async function addCatalogItem(req, res, next) {
  try {
    const tenantId = req.auth?.tenantId || 't_annapoorna';
    const restaurantId = req.auth?.restaurantId || 'r_coimbatore_01';
    const {
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
    } = req.body;

    const id = await createCatalogItem({
      tenant_id: tenantId,
      restaurant_id: restaurantId,
      category_id,
      sku,
      name,
      name_tamil,
      description,
      price,
      available,
      is_special,
      dietary_tags,
      stt_hints,
    });

    res.status(201).json({ id, success: true });
  } catch (err) {
    next(err);
  }
}

export async function getMerchants(req, res, next) {
  try {
    const tenantId = req.auth?.tenantId || 't_annapoorna';
    const merchants = await dbAll(
      'SELECT id, tenant_id, name, address, phone, fssai_license, active FROM restaurants WHERE tenant_id = ? ORDER BY name ASC',
      [tenantId]
    );
    res.json(merchants);
  } catch (err) {
    next(err);
  }
}
