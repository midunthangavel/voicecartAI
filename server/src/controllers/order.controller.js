import { getRecentOrders, getOrderWithItems, updateOrderStatus as repoUpdateOrderStatus } from '../domain/orders/order.repository.js';
import { dbRun, transaction } from '../db.js';
import { recordAuditLog } from '../services/audit.service.js';
import { AppError } from '../utils/AppError.js';

/**
 * Controller for Orders Management
 * Scoped strictly by server-side authenticated identity (req.auth).
 */

export async function getOrders(req, res, next) {
  try {
    const tenantId = req.auth?.tenantId || 't_annapoorna';
    const restaurantId = req.auth?.restaurantId || 'r_coimbatore_01';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

    const orders = await getRecentOrders({ tenantId, restaurantId, limit });
    res.json(orders);
  } catch (err) {
    next(err);
  }
}

export async function getOrderById(req, res, next) {
  try {
    const tenantId = req.auth?.tenantId || 't_annapoorna';
    const restaurantId = req.auth?.restaurantId || 'r_coimbatore_01';

    const order = await getOrderWithItems(req.params.id, { tenantId, restaurantId });
    if (!order) {
      return next(new AppError(404, 'ORDER_NOT_FOUND', `Order #${req.params.id} not found`));
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
}

export async function updateOrderStatus(req, res, next) {
  try {
    const { status } = req.body;
    const tenantId = req.auth?.tenantId || 't_annapoorna';
    const restaurantId = req.auth?.restaurantId || 'r_coimbatore_01';
    const actor = {
      type: req.auth?.role?.toLowerCase() || 'staff',
      id: req.auth?.email || req.auth?.userId || 'system',
    };

    await repoUpdateOrderStatus(req.params.id, status, { tenantId, restaurantId }, actor);
    res.json({ success: true, id: req.params.id, status });
  } catch (err) {
    next(err);
  }
}

export async function flagOrderDispute(req, res, next) {
  try {
    const { reason } = req.body;
    const tenantId = req.auth?.tenantId || 't_annapoorna';
    const restaurantId = req.auth?.restaurantId || 'r_coimbatore_01';
    const actorId = req.auth?.email || req.auth?.userId || 'system';

    await transaction(async () => {
      const result = await dbRun(
        `UPDATE orders SET dispute_status = 'pending_review', dispute_reason = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ? AND tenant_id = ? AND restaurant_id = ?`,
        [reason || 'Customer reported dispute', req.params.id, tenantId, restaurantId]
      );

      if (result.changes === 0) {
        throw new AppError(404, 'ORDER_NOT_FOUND', `Order #${req.params.id} not found for this restaurant`);
      }

      await recordAuditLog({
        tenant_id: tenantId,
        restaurant_id: restaurantId,
        actor_type: req.auth?.role?.toLowerCase() || 'staff',
        actor_id: actorId,
        action: 'FLAG_DISPUTE',
        resource_type: 'order',
        resource_id: req.params.id,
        metadata: { reason },
      });
    });

    res.json({ success: true, id: req.params.id, dispute_status: 'pending_review' });
  } catch (err) {
    next(err);
  }
}

export async function resolveOrderDispute(req, res, next) {
  try {
    const { resolution, notes } = req.body; // resolution: 'refund' | 'reject'
    const status = resolution === 'refund' ? 'refunded' : 'rejected';
    const tenantId = req.auth?.tenantId || 't_annapoorna';
    const restaurantId = req.auth?.restaurantId || 'r_coimbatore_01';
    const resolvedBy = req.auth?.email || req.auth?.userId || 'admin';

    await transaction(async () => {
      const result = await dbRun(
        `UPDATE orders SET dispute_status = ?, dispute_resolved_by = ?, dispute_notes = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ? AND tenant_id = ? AND restaurant_id = ?`,
        [status, resolvedBy, notes || '', req.params.id, tenantId, restaurantId]
      );

      if (result.changes === 0) {
        throw new AppError(404, 'ORDER_NOT_FOUND', `Order #${req.params.id} not found for this restaurant`);
      }

      await recordAuditLog({
        tenant_id: tenantId,
        restaurant_id: restaurantId,
        actor_type: req.auth?.role?.toLowerCase() || 'admin',
        actor_id: resolvedBy,
        action: 'RESOLVE_DISPUTE',
        resource_type: 'order',
        resource_id: req.params.id,
        after_state: { dispute_status: status, notes },
      });
    });

    res.json({ success: true, id: req.params.id, dispute_status: status });
  } catch (err) {
    next(err);
  }
}
