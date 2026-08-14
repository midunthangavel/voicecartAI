import { dbGet, dbAll } from '../db.js';
import { resolve as pathResolve } from 'path';
import { existsSync, createReadStream } from 'fs';

/**
 * Controller for Call Statistics and Session Inspection
 */
export async function getStats(req, res) {
  try {
    const totalCalls = await dbGet('SELECT COUNT(*) as count FROM calls');
    const activeCalls = await dbGet("SELECT COUNT(*) as count FROM calls WHERE status = 'active'");
    const totalOrders = await dbGet('SELECT COUNT(*) as count FROM orders');
    const confirmedOrders = await dbGet("SELECT COUNT(*) as count FROM orders WHERE status = 'confirmed'");
    const revenue = await dbGet("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE status = 'confirmed'");
    const avgLatency = await dbGet('SELECT COALESCE(AVG(latency_avg_ms), 0) as avg FROM calls WHERE latency_avg_ms > 0');

    res.json({
      total_calls: totalCalls?.count || 0,
      active_calls: activeCalls?.count || 0,
      total_orders: totalOrders?.count || 0,
      confirmed_orders: confirmedOrders?.count || 0,
      revenue: revenue?.total || 0,
      avg_latency_ms: Math.round(avgLatency?.avg || 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getRecentCalls(req, res) {
  try {
    const calls = await dbAll('SELECT * FROM calls ORDER BY started_at DESC LIMIT 50');
    res.json(calls.map(c => ({
      ...c,
      session_state: typeof c.session_state === 'string' ? JSON.parse(c.session_state || '{}') : (c.session_state || {}),
      transcript: typeof c.transcript === 'string' ? JSON.parse(c.transcript || '[]') : (c.transcript || []),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getCallById(req, res) {
  try {
    const call = await dbGet('SELECT * FROM calls WHERE id = ?', [req.params.id]);
    if (!call) return res.status(404).json({ error: 'Call not found' });
    const logs = await dbAll('SELECT * FROM call_logs WHERE call_id = ? ORDER BY created_at ASC', [req.params.id]);
    res.json({
      ...call,
      session_state: typeof call.session_state === 'string' ? JSON.parse(call.session_state || '{}') : (call.session_state || {}),
      transcript: typeof call.transcript === 'string' ? JSON.parse(call.transcript || '[]') : (call.transcript || []),
      logs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getCallAudio(req, res) {
  try {
    const recording = await dbGet('SELECT * FROM call_recordings WHERE call_id = ?', [req.params.id]);
    if (!recording || !recording.audio_path) {
      return res.status(404).json({ error: 'No recording found for this call' });
    }
    const filePath = pathResolve(recording.audio_path);
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Recording file not found' });
    }
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `inline; filename="call_${req.params.id}.wav"`);
    createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
