import { getRecentOrders, getOrderWithItems, updateOrderStatus as repoUpdateOrderStatus } from '../domain/orders/order.repository.js';
import { dbRun, transaction } from '../db.js';
import { recordAuditLog } from '../services/audit.service.js';
import { AppError } from '../utils/AppError.js';

/**
 * Controller for Orders Management
 * Scoped strictly by server-side authenticated identity (req.auth).
 */

function getAuthContext(req) {
  const tenantId = req.auth?.tenantId;
  const restaurantId = req.auth?.restaurantId;

  if (!tenantId || !restaurantId) {
    throw new AppError(401, 'AUTH_CONTEXT_MISSING', 'Authenticated tenant and restaurant context is required');
  }

  return { tenantId, restaurantId };
}

export async function getOrders(req, res, next) {
  try {
    const { tenantId, restaurantId } = getAuthContext(req);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

    const orders = await getRecentOrders({ tenantId, restaurantId, limit });
    res.json(orders);
  } catch (err) {
    next(err);
  }
}

export async function getOrderById(req, res, next) {
  try {
    const { tenantId, restaurantId } = getAuthContext(req);

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
    const { status, expectedVersion } = req.body;
    const { tenantId, restaurantId } = getAuthContext(req);

    const actor = {
      type: req.auth?.role?.toLowerCase() || 'staff',
      id: req.auth?.email || req.auth?.userId || 'system',
    };

    const result = await repoUpdateOrderStatus(req.params.id, status, { tenantId, restaurantId, expectedVersion }, actor);
    res.json({ success: true, id: req.params.id, status, version: result.version });
  } catch (err) {
    next(err);
  }
}

export async function flagOrderDispute(req, res, next) {
  try {
    const { reason, notes } = req.body;
    const { tenantId, restaurantId } = getAuthContext(req);

    const result = await transaction(async () => {
      const resDb = await dbRun(
        `UPDATE orders 
         SET dispute_status = 'flagged', dispute_reason = ?, dispute_notes = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ? AND tenant_id = ? AND restaurant_id = ?`,
        [reason, notes || null, req.params.id, tenantId, restaurantId]
      );

      if (resDb.changes === 0) {
        throw new AppError(404, 'ORDER_NOT_FOUND', `Order #${req.params.id} not found`);
      }

      await recordAuditLog({
        tenant_id: tenantId,
        restaurant_id: restaurantId,
        actor_type: 'staff',
        actor_id: req.auth?.email || 'staff',
        action: 'FLAG_DISPUTE',
        resource_type: 'order',
        resource_id: req.params.id,
        after_state: { dispute_status: 'flagged', reason, notes },
      });

      return resDb;
    });

    res.json({ success: true, id: req.params.id, dispute_status: 'flagged' });
  } catch (err) {
    next(err);
  }
}

export async function resolveOrderDispute(req, res, next) {
  try {
    const { resolutionNotes, action } = req.body;
    const { tenantId, restaurantId } = getAuthContext(req);

    await transaction(async () => {
      const resDb = await dbRun(
        `UPDATE orders 
         SET dispute_status = 'resolved', dispute_resolved_by = ?, dispute_notes = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ? AND tenant_id = ? AND restaurant_id = ?`,
        [req.auth?.email || 'manager', resolutionNotes, req.params.id, tenantId, restaurantId]
      );

      if (resDb.changes === 0) {
        throw new AppError(404, 'ORDER_NOT_FOUND', `Order #${req.params.id} not found`);
      }

      await recordAuditLog({
        tenant_id: tenantId,
        restaurant_id: restaurantId,
        actor_type: 'manager',
        actor_id: req.auth?.email || 'manager',
        action: 'RESOLVE_DISPUTE',
        resource_type: 'order',
        resource_id: req.params.id,
        after_state: { dispute_status: 'resolved', action, resolutionNotes },
      });
    });

    res.json({ success: true, id: req.params.id, dispute_status: 'resolved', action });
  } catch (err) {
    next(err);
  }
}
