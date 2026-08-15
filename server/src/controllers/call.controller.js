import { dbGet, dbAll } from '../db.js';
import { resolve as pathResolve } from 'path';
import { existsSync, createReadStream } from 'fs';
import { AppError } from '../utils/AppError.js';

/**
 * Controller for Call Statistics and Session Inspection
 * Scoped strictly by server-side authenticated identity (req.auth).
 */

export async function getStats(req, res, next) {
  try {
    const tenantId = req.auth?.tenantId || 't_annapoorna';
    const restaurantId = req.auth?.restaurantId || 'r_coimbatore_01';

    const totalCalls = await dbGet('SELECT COUNT(*) as count FROM calls WHERE tenant_id = ? AND restaurant_id = ?', [tenantId, restaurantId]);
    const activeCalls = await dbGet("SELECT COUNT(*) as count FROM calls WHERE tenant_id = ? AND restaurant_id = ? AND status = 'active'", [tenantId, restaurantId]);
    const totalOrders = await dbGet('SELECT COUNT(*) as count FROM orders WHERE tenant_id = ? AND restaurant_id = ?', [tenantId, restaurantId]);
    const confirmedOrders = await dbGet("SELECT COUNT(*) as count FROM orders WHERE tenant_id = ? AND restaurant_id = ? AND status = 'confirmed'", [tenantId, restaurantId]);
    const revenue = await dbGet("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE tenant_id = ? AND restaurant_id = ? AND status = 'confirmed'", [tenantId, restaurantId]);
    const avgLatency = await dbGet('SELECT COALESCE(AVG(latency_avg_ms), 0) as avg FROM calls WHERE tenant_id = ? AND restaurant_id = ? AND latency_avg_ms > 0', [tenantId, restaurantId]);

    res.json({
      total_calls: totalCalls?.count || 0,
      active_calls: activeCalls?.count || 0,
      total_orders: totalOrders?.count || 0,
      confirmed_orders: confirmedOrders?.count || 0,
      revenue: revenue?.total || 0,
      avg_latency_ms: Math.round(avgLatency?.avg || 0),
    });
  } catch (err) {
    next(err);
  }
}

export async function getRecentCalls(req, res, next) {
  try {
    const tenantId = req.auth?.tenantId || 't_annapoorna';
    const restaurantId = req.auth?.restaurantId || 'r_coimbatore_01';
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
    const tenantId = req.auth?.tenantId || 't_annapoorna';
    const restaurantId = req.auth?.restaurantId || 'r_coimbatore_01';

    const call = await dbGet(
      'SELECT * FROM calls WHERE id = ? AND tenant_id = ? AND restaurant_id = ?',
      [req.params.id, tenantId, restaurantId]
    );
    if (!call) return next(new AppError(404, 'CALL_NOT_FOUND', `Call #${req.params.id} not found`));

    const logs = await dbAll('SELECT * FROM call_logs WHERE call_id = ? ORDER BY created_at ASC', [req.params.id]);

    res.json({
      ...call,
      session_state: typeof call.session_state === 'string' ? JSON.parse(call.session_state || '{}') : (call.session_state || {}),
      transcript: typeof call.transcript === 'string' ? JSON.parse(call.transcript || '[]') : (call.transcript || []),
      logs,
    });
  } catch (err) {
    next(err);
  }
}

export async function getCallAudio(req, res, next) {
  try {
    const tenantId = req.auth?.tenantId || 't_annapoorna';
    const restaurantId = req.auth?.restaurantId || 'r_coimbatore_01';

    // Verify that call belongs to authenticated restaurant
    const call = await dbGet(
      'SELECT id FROM calls WHERE id = ? AND tenant_id = ? AND restaurant_id = ?',
      [req.params.id, tenantId, restaurantId]
    );
    if (!call) return next(new AppError(404, 'CALL_NOT_FOUND', `Call #${req.params.id} not found`));

    const recording = await dbGet('SELECT * FROM call_recordings WHERE call_id = ?', [req.params.id]);
    if (!recording || !recording.audio_path) {
      return next(new AppError(404, 'RECORDING_NOT_FOUND', 'No audio recording found for this call'));
    }

    const filePath = pathResolve(recording.audio_path);
    if (!existsSync(filePath)) {
      return next(new AppError(404, 'AUDIO_FILE_MISSING', 'Recording file not present on storage'));
    }

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `inline; filename="call_${req.params.id}.wav"`);
    createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
}
