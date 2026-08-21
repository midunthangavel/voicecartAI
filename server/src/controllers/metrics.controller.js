import { getLatencyAnalytics } from '../services/latencyTracer.js';
import { getAuditLogs } from '../services/audit.service.js';

/**
 * Controller for Observability, Metrics, and Audit Trails
 * Scoped strictly by server-side authenticated identity (req.tenant).
 */

export async function getLatencyMetrics(req, res, next) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
    const analytics = await getLatencyAnalytics(limit);
    res.json(analytics);
  } catch (err) {
    next(err);
  }
}

export async function getAuditHistory(req, res, next) {
  try {
    const { restaurantId } = req.tenant;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const logs = await getAuditLogs(restaurantId, limit);
    res.json(logs);
  } catch (err) {
    next(err);
  }
}
