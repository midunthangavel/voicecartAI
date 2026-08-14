import { getLatencyAnalytics } from '../services/latencyTracer.js';
import { getAuditLogs } from '../services/audit.service.js';

/**
 * Controller for Observability, Metrics, and Audit Trails
 */

export async function getLatencyMetrics(req, res) {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const analytics = await getLatencyAnalytics(limit);
    res.json(analytics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getAuditHistory(req, res) {
  try {
    const restaurantId = req.query.restaurant_id || 'r_coimbatore_01';
    const limit = parseInt(req.query.limit, 10) || 50;
    const logs = await getAuditLogs(restaurantId, limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
