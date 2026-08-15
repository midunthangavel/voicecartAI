import { dbRun, dbAll, dbGet, transaction } from '../db.js';
import { logger } from '../utils/logger.js';

/**
 * Transactional Outbox Service with Atomic Event Claiming and Stale-Recovery
 */

export async function enqueueOutboxEvent({
  tenant_id,
  restaurant_id,
  event_type,
  aggregate_type = 'order',
  aggregate_id,
  payload = {},
}) {
  if (!tenant_id || !restaurant_id) {
    throw new Error('[Outbox] Cannot enqueue event without explicit tenant_id and restaurant_id');
  }

  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);

  const res = await dbRun(
    `INSERT INTO outbox_events (
       tenant_id, restaurant_id, event_type, aggregate_type, aggregate_id, payload, status
     ) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [tenant_id, restaurant_id, event_type, aggregate_type, String(aggregate_id), payloadStr]
  );

  return res.lastID;
}

/**
 * Recover stale processing events (crashed workers) older than 5 minutes
 */
export async function recoverStaleOutboxEvents() {
  try {
    const res = await dbRun(
      `UPDATE outbox_events 
       SET status = 'pending', locked_by = NULL 
       WHERE status = 'processing' 
         AND locked_at < datetime('now', '-5 minutes')`
    );
    if (res.changes > 0) {
      logger.warn(`[Outbox] Recovered ${res.changes} stale processing events back to pending state.`);
    }
  } catch (err) {
    logger.error('[Outbox] Error recovering stale events:', err.message);
  }
}

/**
 * Atomically claim pending outbox events for a worker instance
 */
export async function claimNextOutboxEvents(limit = 10, workerId = 'worker_node_1') {
  await recoverStaleOutboxEvents();

  return transaction(async () => {
    // 1. Select pending event IDs
    const pending = await dbAll(
      `SELECT id FROM outbox_events 
       WHERE status = 'pending' 
         AND scheduled_at <= CURRENT_TIMESTAMP 
       ORDER BY id ASC LIMIT ?`,
      [limit]
    );

    if (pending.length === 0) return [];

    const ids = pending.map(p => p.id);
    const placeholders = ids.map(() => '?').join(',');

    // 2. Atomically mark as processing with lock
    await dbRun(
      `UPDATE outbox_events 
       SET status = 'processing', 
           locked_at = CURRENT_TIMESTAMP, 
           locked_by = ? 
       WHERE id IN (${placeholders}) AND status = 'pending'`,
      [workerId, ...ids]
    );

    // 3. Return claimed records
    const claimed = await dbAll(
      `SELECT * FROM outbox_events WHERE id IN (${placeholders})`,
      ids
    );

    return claimed.map(r => ({
      ...r,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload || '{}') : (r.payload || {}),
    }));
  });
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
     SET status = 'completed', processed_at = CURRENT_TIMESTAMP, locked_by = NULL 
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
         locked_by = NULL,
         scheduled_at = datetime('now', '+' || ? || ' seconds')
     WHERE id = ?`,
    [status, nextRetry, String(errorMsg).substring(0, 500), backoffSec, id]
  );
}
