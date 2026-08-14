import { Router } from 'express';
import { getLatencyMetrics, getAuditHistory } from '../controllers/metrics.controller.js';

export const metricsRouter = Router();

metricsRouter.get('/latency', getLatencyMetrics);
metricsRouter.get('/audit-logs', getAuditHistory);
