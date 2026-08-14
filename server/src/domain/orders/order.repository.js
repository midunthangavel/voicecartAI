import { dbAll, dbGet, dbRun } from '../../db.js';
import { recordAuditLog } from '../../services/audit.service.js';

/**
 * Order Repository — Authoritative persistence for orders and line-item snapshots
 */

export async function createOrderWithSnapshots(orderData, items = []) {
  const {
    restaurant_id = 'r_coimbatore_01',
    call_id = null,
    customer_id = null,
    ondc_order_id = null,
    status = 'pending',
    subtotal = 0,
    tax = 0,
    delivery_fee = 0,
    discount = 0,
    total_amount = 0,
    currency = 'INR',
    payment_status = 'pending',
    payment_link = null,
    delivery_address = null,
    landmark = null,
    scheduled_for = null,
  } = orderData;

  // 1. Insert master order record
  const res = await dbRun(
    `INSERT INTO orders (
       restaurant_id, call_id, customer_id, ondc_order_id, status,
       subtotal, tax, delivery_fee, discount, total_amount, currency,
       payment_status, payment_link, delivery_address, landmark, items, scheduled_for
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      restaurant_id,
      call_id,
      customer_id,
      ondc_order_id,
      status,
      subtotal,
      tax,
      delivery_fee,
      discount,
      total_amount,
      currency,
      payment_status,
      payment_link,
      delivery_address,
      landmark,
      JSON.stringify(items),
      scheduled_for,
    ]
  );

  const orderId = res.lastID;

  // 2. Insert line-item snapshots
  for (const item of items) {
    const qty = Math.max(1, item.quantity || 1);
    const unitPrice = item.unit_price_snapshot || item.price || 0;
    const lineTotal = item.line_total || (unitPrice * qty);

    await dbRun(
      `INSERT INTO order_items (
         order_id, catalog_item_id, item_name_snapshot, unit_price_snapshot, quantity, line_total
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        item.catalog_item_id || null,
        item.name || item.item_name_snapshot || 'Item',
        unitPrice,
        qty,
        lineTotal,
      ]
    );
  }

  // 3. Record Immutable Audit Log
  recordAuditLog({
    tenant_id: 't_annapoorna',
    restaurant_id,
    actor_type: 'ai_agent',
    actor_id: 'voicecart_dialogue_engine',
    action: 'CREATE_ORDER',
    resource_type: 'order',
    resource_id: orderId,
    after_state: { orderId, status, total_amount, itemsCount: items.length },
  }).catch(() => {});

  return orderId;
}

export async function getRecentOrders(restaurantId = 'r_coimbatore_01', limit = 50) {
  const orders = await dbAll(
    'SELECT * FROM orders WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT ?',
    [restaurantId, limit]
  );

  const orderIds = orders.map(o => o.id);
  if (orderIds.length === 0) return [];

  // Fetch line items for each order
  const placeholders = orderIds.map(() => '?').join(',');
  const allItems = await dbAll(
    `SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id ASC`,
    orderIds
  );

  const itemsByOrder = new Map();
  for (const item of allItems) {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
    itemsByOrder.get(item.order_id).push({
      catalog_item_id: item.catalog_item_id,
      name: item.item_name_snapshot,
      price: item.unit_price_snapshot,
      quantity: item.quantity,
      line_total: item.line_total,
    });
  }

  return orders.map(o => ({
    ...o,
    items: itemsByOrder.get(o.id) || (typeof o.items === 'string' ? JSON.parse(o.items || '[]') : (o.items || [])),
  }));
}

export async function getOrderWithItems(orderId, restaurantId = 'r_coimbatore_01') {
  const order = await dbGet(
    'SELECT * FROM orders WHERE id = ? AND restaurant_id = ?',
    [orderId, restaurantId]
  );
  if (!order) return null;

  const items = await dbAll(
    'SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC',
    [orderId]
  );

  return {
    ...order,
    items: items.map(i => ({
      catalog_item_id: i.catalog_item_id,
      name: i.item_name_snapshot,
      price: i.unit_price_snapshot,
      quantity: i.quantity,
      line_total: i.line_total,
    })),
  };
}

export async function updateOrderStatus(orderId, status, restaurantId = 'r_coimbatore_01', actor = { type: 'staff', id: 'system' }) {
  const previous = await dbGet('SELECT status FROM orders WHERE id = ?', [orderId]);

  const res = await dbRun(
    'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND restaurant_id = ?',
    [status, orderId, restaurantId]
  );

  // Record State Transition Audit
  recordAuditLog({
    tenant_id: 't_annapoorna',
    restaurant_id: restaurantId,
    actor_type: actor.type || 'staff',
    actor_id: actor.id || 'system',
    action: 'UPDATE_STATUS',
    resource_type: 'order',
    resource_id: orderId,
    before_state: { status: previous?.status || 'unknown' },
    after_state: { status },
  }).catch(() => {});

  return res;
}
