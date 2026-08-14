import { getRecentOrders, getOrderWithItems, updateOrderStatus as repoUpdateOrderStatus } from '../domain/orders/order.repository.js';
import { dbRun } from '../db.js';

/**
 * Controller for Orders Management
 */
export async function getOrders(req, res) {
  try {
    const restaurantId = req.query.restaurant_id || 'r_coimbatore_01';
    const limit = parseInt(req.query.limit, 10) || 50;
    const orders = await getRecentOrders(restaurantId, limit);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getOrderById(req, res) {
  try {
    const restaurantId = req.query.restaurant_id || 'r_coimbatore_01';
    const order = await getOrderWithItems(req.params.id, restaurantId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateOrderStatus(req, res) {
  try {
    const { status } = req.body;
    const restaurantId = req.query.restaurant_id || 'r_coimbatore_01';
    await repoUpdateOrderStatus(req.params.id, status, restaurantId);
    res.json({ success: true, id: req.params.id, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function flagOrderDispute(req, res) {
  try {
    const { reason } = req.body;
    const restaurantId = req.query.restaurant_id || 'r_coimbatore_01';
    await dbRun(
      `UPDATE orders SET dispute_status = 'pending_review', dispute_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND restaurant_id = ?`,
      [reason || 'Customer reported dispute', req.params.id, restaurantId]
    );
    res.json({ success: true, id: req.params.id, dispute_status: 'pending_review' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function resolveOrderDispute(req, res) {
  try {
    const { resolution, notes } = req.body; // resolution: 'refund' | 'reject'
    const status = resolution === 'refund' ? 'refunded' : 'rejected';
    const restaurantId = req.query.restaurant_id || 'r_coimbatore_01';
    const resolvedBy = req.user?.id || 'admin';

    await dbRun(
      `UPDATE orders SET dispute_status = ?, dispute_resolved_by = ?, dispute_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND restaurant_id = ?`,
      [status, resolvedBy, notes || '', req.params.id, restaurantId]
    );
    res.json({ success: true, id: req.params.id, dispute_status: status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
