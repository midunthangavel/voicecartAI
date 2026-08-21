import { dbGet, dbAll } from '../db.js';
import { resolve as pathResolve } from 'path';
import { existsSync, createReadStream } from 'fs';
import { AppError } from '../utils/AppError.js';

/**
 * Controller for Call Statistics and Session Inspection
 * Scoped strictly by server-side authenticated identity (req.tenant) — Fail closed.
 */

export async function getStats(req, res, next) {
  try {
    const { tenantId, restaurantId } = req.tenant;

    // Single consolidated query: replaces 6 sequential round-trips with 1.
    // SQLite evaluates boolean expressions as 1/0, so SUM(CASE WHEN...) counts matching rows.
    const stats = await dbGet(
      `SELECT
         (SELECT COUNT(*) FROM calls WHERE tenant_id = ? AND restaurant_id = ?) AS total_calls,
         (SELECT COUNT(*) FROM calls WHERE tenant_id = ? AND restaurant_id = ? AND status = 'active') AS active_calls,
         (SELECT COUNT(*) FROM orders WHERE tenant_id = ? AND restaurant_id = ?) AS total_orders,
         (SELECT COUNT(*) FROM orders WHERE tenant_id = ? AND restaurant_id = ? AND status = 'confirmed') AS confirmed_orders,
         (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE tenant_id = ? AND restaurant_id = ? AND status = 'confirmed') AS revenue,
         (SELECT COALESCE(AVG(latency_avg_ms), 0) FROM calls WHERE tenant_id = ? AND restaurant_id = ? AND latency_avg_ms > 0) AS avg_latency`,
      [tenantId, restaurantId, tenantId, restaurantId, tenantId, restaurantId,
       tenantId, restaurantId, tenantId, restaurantId, tenantId, restaurantId]
    );

    res.json({
      total_calls: stats?.total_calls || 0,
      active_calls: stats?.active_calls || 0,
      total_orders: stats?.total_orders || 0,
      confirmed_orders: stats?.confirmed_orders || 0,
      revenue: stats?.revenue || 0,
      avg_latency_ms: Math.round(stats?.avg_latency || 0),
    });
  } catch (err) {
    next(err);
  }
}

export async function getRecentCalls(req, res, next) {
  try {
    const { tenantId, restaurantId } = req.tenant;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

    const calls = await dbAll(
      `SELECT id, tenant_id, restaurant_id, call_sid, caller_phone, source, status, duration_seconds, latency_avg_ms, started_at, ended_at 
       FROM calls 
       WHERE tenant_id = ? AND restaurant_id = ? 
       ORDER BY started_at DESC LIMIT ?`,
      [tenantId, restaurantId, limit]
    );

    res.json(calls);
  } catch (err) {
    next(err);
  }
}

export async function getCallById(req, res, next) {
  try {
    const { tenantId, restaurantId } = req.tenant;

    const call = await dbGet(
      'SELECT * FROM calls WHERE id = ? AND tenant_id = ? AND restaurant_id = ?',
      [req.params.id, tenantId, restaurantId]
    );
    if (!call) throw new AppError(404, 'CALL_NOT_FOUND', 'Call not found');

    const logs = await dbAll(
      'SELECT * FROM call_logs WHERE call_id = ? ORDER BY timestamp ASC',
      [req.params.id]
    );

    res.json({
      ...call,
      session_state: typeof call.session_state === 'string' ? JSON.parse(call.session_state || '{}') : call.session_state,
      transcript: typeof call.transcript === 'string' ? JSON.parse(call.transcript || '[]') : call.transcript,
      logs,
    });
  } catch (err) {
    next(err);
  }
}

export async function getCallAudio(req, res, next) {
  try {
    const { tenantId, restaurantId } = req.tenant;

    const call = await dbGet(
      'SELECT * FROM calls WHERE id = ? AND tenant_id = ? AND restaurant_id = ?',
      [req.params.id, tenantId, restaurantId]
    );
    if (!call) throw new AppError(404, 'CALL_NOT_FOUND', 'Call not found');

    const storagePath = call.recording_url || `./recordings/call_${call.id}.wav`;
    const fullPath = pathResolve(storagePath);

    if (!existsSync(fullPath)) {
      throw new AppError(404, 'AUDIO_NOT_FOUND', 'Audio recording not found for this call');
    }

    res.setHeader('Content-Type', 'audio/wav');
    createReadStream(fullPath).pipe(res);
  } catch (err) {
    next(err);
  }
}
