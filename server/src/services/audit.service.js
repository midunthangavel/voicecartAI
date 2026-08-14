import { dbRun, dbAll } from '../db.js';
import { logger } from '../utils/logger.js';

/**
 * State Transition Audit Trail Service
 * 
 * Provides an immutable compliance and auditing log for order state changes,
 * menu pricing updates, and automated AI actions.
 */

export async function recordAuditLog({
  tenant_id = 't_annapoorna',
  restaurant_id = 'r_coimbatore_01',
  actor_type = 'system', // 'ai_agent' | 'staff' | 'kitchen' | 'system' | 'customer'
  actor_id = 'voicecart_agent',
  action, // 'CREATE_ORDER' | 'UPDATE_STATUS' | 'UPDATE_PRICE' | 'DISPATCH_ORDER'
  resource_type, // 'order' | 'catalog_item' | 'customer' | 'call'
  resource_id,
  before_state = null,
  after_state = null,
  metadata = {},
}) {
  try {
    const res = await dbRun(
      `INSERT INTO audit_logs (
         tenant_id, restaurant_id, actor_type, actor_id, action,
         resource_type, resource_id, before_state, after_state, metadata
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenant_id,
        restaurant_id,
        actor_type,
        actor_id,
        action,
        resource_type,
        String(resource_id),
        before_state ? JSON.stringify(before_state) : null,
        after_state ? JSON.stringify(after_state) : null,
        JSON.stringify(metadata || {}),
      ]
    );

    logger.info(`[Audit] ${action} on ${resource_type} #${resource_id} by ${actor_type} (${actor_id})`);
    return res.lastID;
  } catch (err) {
    logger.error('[Audit] Failed to record audit log:', err);
    return null;
  }
}

export async function getAuditLogs(restaurantId = 'r_coimbatore_01', limit = 50) {
  const rows = await dbAll(
    'SELECT * FROM audit_logs WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT ?',
    [restaurantId, limit]
  );

  return rows.map(r => ({
    ...r,
    before_state: r.before_state ? JSON.parse(r.before_state) : null,
    after_state: r.after_state ? JSON.parse(r.after_state) : null,
    metadata: r.metadata ? JSON.parse(r.metadata) : {},
  }));
}
