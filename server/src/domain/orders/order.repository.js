import { dbAll, dbGet, dbRun, transaction } from '../../db.js';
import { recordAuditLog } from '../../services/audit.service.js';
import { enqueueOutboxEvent } from '../../services/outbox.service.js';
import { AppError } from '../../utils/AppError.js';

/**
 * Order Repository — Authoritative persistence for orders and line-item snapshots
 * Enforces strict multi-tenant scoping, optimistic concurrency control, soft deletes, and transactional outbox events.
 */

export async function createOrderWithSnapshots(orderData, items = []) {
  const {
    tenant_id = 't_annapoorna',
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
    customer_phone = null,
  } = orderData;

  return transaction(async () => {
    // 1. Insert master order record
    const res = await dbRun(
      `INSERT INTO orders (
         tenant_id, restaurant_id, call_id, customer_id, ondc_order_id, status,
         subtotal, tax, delivery_fee, discount, total_amount, currency,
         payment_status, payment_link, delivery_address, landmark, items, scheduled_for, version
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        tenant_id,
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

    // 3. Record Immutable Audit Log within transaction
    await recordAuditLog({
      tenant_id,
      restaurant_id,
      actor_type: 'ai_agent',
      actor_id: 'voicecart_dialogue_engine',
      action: 'CREATE_ORDER',
      resource_type: 'order',
      resource_id: orderId,
      after_state: { orderId, status, total_amount, itemsCount: items.length },
    });

    // 4. Write Transactional Outbox Event (Guaranteed delivery to WhatsApp/KDS/ONDC)
    await enqueueOutboxEvent({
      tenant_id,
      restaurant_id,
      event_type: 'ORDER_CONFIRMED',
      aggregate_type: 'order',
      aggregate_id: orderId,
      payload: {
        orderId,
        phone: customer_phone,
        items,
        total: total_amount,
        address: delivery_address,
        landmark,
      },
    });

    return orderId;
  });
}

export async function getRecentOrders(options = {}) {
  let tenantId = 't_annapoorna';
  let restaurantId = 'r_coimbatore_01';
  let limit = 50;

  if (typeof options === 'string') {
    restaurantId = options;
    limit = arguments[1] || 50;
  } else {
    tenantId = options.tenantId || 't_annapoorna';
    restaurantId = options.restaurantId || 'r_coimbatore_01';
    limit = Math.min(Math.max(parseInt(options.limit, 10) || 50, 1), 100);
  }

  const orders = await dbAll(
    `SELECT * FROM orders 
     WHERE tenant_id = ? AND restaurant_id = ? AND (deleted_at IS NULL)
     ORDER BY created_at DESC LIMIT ?`,
    [tenantId, restaurantId, limit]
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

export async function getOrderWithItems(orderId, options = {}) {
  const tenantId = typeof options === 'object' ? (options.tenantId || 't_annapoorna') : 't_annapoorna';
  const restaurantId = typeof options === 'string' ? options : (options.restaurantId || 'r_coimbatore_01');

  const order = await dbGet(
    `SELECT * FROM orders 
     WHERE id = ? AND tenant_id = ? AND restaurant_id = ? AND (deleted_at IS NULL)`,
    [orderId, tenantId, restaurantId]
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

export async function updateOrderStatus(orderId, newStatus, options = {}, actor = { type: 'staff', id: 'system' }) {
  const tenantId = typeof options === 'object' ? (options.tenantId || 't_annapoorna') : 't_annapoorna';
  const restaurantId = typeof options === 'string' ? options : (options.restaurantId || 'r_coimbatore_01');
  const expectedVersion = typeof options === 'object' ? options.expectedVersion : null;

  const previous = await dbGet(
    `SELECT * FROM orders WHERE id = ? AND tenant_id = ? AND restaurant_id = ? AND (deleted_at IS NULL)`,
    [orderId, tenantId, restaurantId]
  );

  if (!previous) {
    throw new AppError(404, 'ORDER_NOT_FOUND', `Order #${orderId} not found for this restaurant`);
  }

  return transaction(async () => {
    let query = 'UPDATE orders SET status = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ? AND restaurant_id = ?';
    let params = [newStatus, orderId, tenantId, restaurantId];

    // Optimistic Concurrency Control
    if (expectedVersion !== undefined && expectedVersion !== null) {
      query += ' AND version = ?';
      params.push(expectedVersion);
    }

    const res = await dbRun(query, params);

    if (res.changes === 0 && expectedVersion !== null) {
      throw new AppError(409, 'OPTIMISTIC_LOCK_CONFLICT', `Conflict: Order #${orderId} was updated by another user. Please refresh.`);
    }

    // Record State Transition Audit within transaction
    await recordAuditLog({
      tenant_id: tenantId,
      restaurant_id: restaurantId,
      actor_type: actor.type || 'staff',
      actor_id: actor.id || 'system',
      action: 'UPDATE_STATUS',
      resource_type: 'order',
      resource_id: orderId,
      before_state: { status: previous.status, version: previous.version },
      after_state: { status: newStatus, version: (previous.version || 1) + 1 },
    });

    // Write Outbox Event for status change
    await enqueueOutboxEvent({
      tenant_id: tenantId,
      restaurant_id: restaurantId,
      event_type: 'ORDER_STATUS_CHANGED',
      aggregate_type: 'order',
      aggregate_id: orderId,
      payload: {
        orderId,
        status: newStatus,
      },
    });

    return { ...res, version: (previous.version || 1) + 1 };
  });
}

export async function softDeleteOrder(orderId, options = {}, deletedBy = 'admin') {
  const tenantId = typeof options === 'object' ? (options.tenantId || 't_annapoorna') : 't_annapoorna';
  const restaurantId = typeof options === 'string' ? options : (options.restaurantId || 'r_coimbatore_01');

  return transaction(async () => {
    const res = await dbRun(
      `UPDATE orders 
       SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND tenant_id = ? AND restaurant_id = ? AND deleted_at IS NULL`,
      [deletedBy, orderId, tenantId, restaurantId]
    );

    if (res.changes === 0) {
      throw new AppError(404, 'ORDER_NOT_FOUND', `Order #${orderId} not found or already deleted`);
    }

    await recordAuditLog({
      tenant_id: tenantId,
      restaurant_id: restaurantId,
      actor_type: 'staff',
      actor_id: deletedBy,
      action: 'SOFT_DELETE',
      resource_type: 'order',
      resource_id: orderId,
    });

    return res;
  });
}
