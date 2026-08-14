import { getActiveCatalogItems, getCategoriesByRestaurant, createCatalogItem } from '../domain/catalog/catalog.repository.js';
import { dbAll } from '../db.js';

/**
 * Controller for Restaurant Menu Catalog and Merchant Management
 */
export async function getCatalog(req, res) {
  try {
    const restaurantId = req.query.restaurant_id || 'r_coimbatore_01';
    const items = await getActiveCatalogItems(restaurantId);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getCategories(req, res) {
  try {
    const restaurantId = req.query.restaurant_id || 'r_coimbatore_01';
    const categories = await getCategoriesByRestaurant(restaurantId);
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function addCatalogItem(req, res) {
  try {
    const {
      restaurant_id = 'r_coimbatore_01',
      category_id = 1,
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
      restaurant_id,
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

    res.json({ id, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getMerchants(req, res) {
  try {
    const merchants = await dbAll('SELECT * FROM restaurants ORDER BY name');
    res.json(merchants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
