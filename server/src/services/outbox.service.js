import { dbRun, dbAll, dbGet } from '../db.js';
import { logger } from '../utils/logger.js';

/**
 * Transactional Outbox Service
 * 
 * Provides guaranteed eventual delivery of asynchronous side-effects (WhatsApp,
 * ONDC webhooks, KDS push) by committing event records in the same DB transaction as domain mutations.
 */

export async function enqueueOutboxEvent({
  tenant_id = 't_annapoorna',
  restaurant_id = 'r_coimbatore_01',
  event_type,
  aggregate_type = 'order',
  aggregate_id,
  payload = {},
}) {
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);

  const res = await dbRun(
    `INSERT INTO outbox_events (
       tenant_id, restaurant_id, event_type, aggregate_type, aggregate_id, payload
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [tenant_id, restaurant_id, event_type, aggregate_type, String(aggregate_id), payloadStr]
  );

  return res.lastID;
}

export async function fetchPendingOutboxEvents(limit = 20) {
  const rows = await dbAll(
    `SELECT * FROM outbox_events 
     WHERE status IN ('pending', 'processing') 
       AND scheduled_at <= CURRENT_TIMESTAMP 
     ORDER BY id ASC LIMIT ?`,
    [limit]
  );

  return rows.map(r => ({
    ...r,
    payload: typeof r.payload === 'string' ? JSON.parse(r.payload || '{}') : (r.payload || {}),
  }));
}

export async function markOutboxEventCompleted(id) {
  return dbRun(
    `UPDATE outbox_events 
     SET status = 'completed', processed_at = CURRENT_TIMESTAMP 
     WHERE id = ?`,
    [id]
  );
}

export async function markOutboxEventFailed(id, errorMsg) {
  const event = await dbGet('SELECT retry_count, max_retries FROM outbox_events WHERE id = ?', [id]);
  if (!event) return;

  const nextRetry = (event.retry_count || 0) + 1;
  const isDead = nextRetry >= (event.max_retries || 5);
  const status = isDead ? 'failed' : 'pending';

  // Exponential backoff: 5s, 20s, 60s, 300s
  const backoffSec = Math.min(5 * Math.pow(2, nextRetry), 300);

  return dbRun(
    `UPDATE outbox_events 
     SET status = ?, 
         retry_count = ?, 
         last_error = ?,
         scheduled_at = datetime('now', '+' || ? || ' seconds')
     WHERE id = ?`,
    [status, nextRetry, String(errorMsg).substring(0, 500), backoffSec, id]
  );
}
