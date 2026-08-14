import { dbAll, dbGet, dbRun } from '../../db.js';

/**
 * Customer Repository — Multi-tenant customer profile and address management
 */

export async function findCustomerByPhone(phone, restaurantId = 'r_coimbatore_01') {
  return dbGet(
    'SELECT * FROM customers WHERE phone = ? AND restaurant_id = ?',
    [phone, restaurantId]
  );
}

export async function upsertCustomer({
  restaurant_id = 'r_coimbatore_01',
  phone,
  name = null,
  dietary_preference = 'none',
  preferred_language = 'mixed',
}) {
  const existing = await findCustomerByPhone(phone, restaurant_id);

  if (existing) {
    if (name || dietary_preference !== 'none') {
      await dbRun(
        `UPDATE customers SET 
           name = COALESCE(?, name),
           dietary_preference = COALESCE(?, dietary_preference),
           preferred_language = COALESCE(?, preferred_language),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [name, dietary_preference, preferred_language, existing.id]
      );
    }
    return findCustomerByPhone(phone, restaurant_id);
  }

  const res = await dbRun(
    `INSERT INTO customers (restaurant_id, phone, name, dietary_preference, preferred_language)
     VALUES (?, ?, ?, ?, ?)`,
    [restaurant_id, phone, name, dietary_preference, preferred_language]
  );

  return {
    id: res.lastID,
    restaurant_id,
    phone,
    name,
    dietary_preference,
    preferred_language,
    total_orders: 0,
  };
}

export async function getCustomerAddresses(customerId, phone = null) {
  if (customerId) {
    const byId = await dbAll(
      'SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC',
      [customerId]
    );
    if (byId && byId.length > 0) return byId;
  }
  if (phone) {
    return dbAll(
      'SELECT * FROM customer_addresses WHERE phone = ? ORDER BY is_default DESC, id DESC',
      [phone]
    );
  }
  return [];
}

export async function addCustomerAddress(customerId, addressData) {
  const {
    label = 'Home',
    spoken_address,
    formatted_address = null,
    landmark = null,
    latitude = null,
    longitude = null,
    is_default = 0,
    phone = null,
  } = addressData;

  // Retrieve customer phone for dual compatibility
  let customerPhone = phone;
  if (!customerPhone && customerId) {
    const cust = await dbGet('SELECT phone FROM customers WHERE id = ?', [customerId]);
    if (cust) customerPhone = cust.phone;
  }

  if (is_default) {
    await dbRun('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ? OR phone = ?', [customerId, customerPhone]);
  }

  const res = await dbRun(
    `INSERT INTO customer_addresses (
       customer_id, phone, label, spoken_address, formatted_address, landmark, latitude, longitude, is_default
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [customerId, customerPhone || 'unknown', label, spoken_address, formatted_address, landmark, latitude, longitude, is_default]
  );

  return res.lastID;
}
