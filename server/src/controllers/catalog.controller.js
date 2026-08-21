import { getActiveCatalogItems, getCategoriesByRestaurant, createCatalogItem } from '../domain/catalog/catalog.repository.js';
import { dbAll } from '../db.js';
import { AppError } from '../utils/AppError.js';

/**
 * Controller for Restaurant Menu Catalog and Categories
 * Scoped strictly by server-side authenticated identity or explicit query parameters (Zero Fallback).
 */

function resolveTenantContext(req) {
  const tenantId = req.auth?.tenantId || req.query?.tenant_id || req.headers['x-tenant-id'];
  const restaurantId = req.auth?.restaurantId || req.query?.restaurant_id || req.headers['x-restaurant-id'];

  if (!tenantId || !restaurantId) {
    throw new AppError(400, 'TENANT_REQUIRED', 'tenant_id and restaurant_id query parameters or auth context are required');
  }

  return { tenantId, restaurantId };
}

export async function getCatalog(req, res, next) {
  try {
    const { tenantId, restaurantId } = resolveTenantContext(req);
    const items = await getActiveCatalogItems({ tenantId, restaurantId });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

export async function getCategories(req, res, next) {
  try {
    const { tenantId, restaurantId } = resolveTenantContext(req);
    const categories = await getCategoriesByRestaurant({ tenantId, restaurantId });
    res.json(categories);
  } catch (err) {
    next(err);
  }
}

export async function addCatalogItem(req, res, next) {
  try {
    const { tenantId, restaurantId } = req.tenant;

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

    res.status(201).json({ success: true, id, name, price });
  } catch (err) {
    next(err);
  }
}

export async function getMerchants(req, res, next) {
  try {
    const tenantId = req.auth?.tenantId || req.query?.tenant_id || req.headers['x-tenant-id'];
    if (!tenantId) {
      throw new AppError(400, 'TENANT_REQUIRED', 'tenant_id query parameter or auth context is required');
    }
    const rows = await dbAll('SELECT * FROM restaurants WHERE tenant_id = ? AND status = "active"', [tenantId]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}
