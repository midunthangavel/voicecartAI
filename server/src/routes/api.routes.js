import { Router } from 'express';
import { getStats, getRecentCalls, getCallById, getCallAudio } from '../controllers/call.controller.js';
import { getOrders, getOrderById, updateOrderStatus, flagOrderDispute, resolveOrderDispute } from '../controllers/order.controller.js';
import { getCatalog, getCategories, addCatalogItem, getMerchants } from '../controllers/catalog.controller.js';
import { getEngineStatus } from '../controllers/engine.controller.js';
import { getAllQueueStats } from '../queue/queueManager.js';
import { authRouter } from './auth.routes.js';
import { metricsRouter } from './metrics.routes.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { sessions } from '../websocket/wsServer.js';

export const apiRouter = Router();

// ── Auth Endpoints ──
apiRouter.use('/auth', authRouter);

// ── Observability, Telemetry & Audit Trails ──
apiRouter.use('/metrics', metricsRouter);
apiRouter.get('/audit-logs', (req, res, next) => metricsRouter.handle(req, res, next));

// ── Stats & Metrics ──
apiRouter.get('/stats', getStats);
apiRouter.get('/engine-status', getEngineStatus);
apiRouter.get('/queues', (req, res) => res.json(getAllQueueStats()));

// ── Calls & Logs ──
apiRouter.get('/calls', getRecentCalls);
apiRouter.get('/calls/:id', getCallById);
apiRouter.get('/calls/:id/audio', getCallAudio);

// ── Active in-memory sessions ──
apiRouter.get('/sessions', (req, res) => {
  const active = [];
  for (const [id, session] of sessions) {
    active.push({
      id,
      caller_phone: session.callerPhone || 'Browser',
      source: session.source,
      state: session.state,
      transcript: session.conversationHistory,
      startedAt: session.startedAt,
      latencies: session.latencies,
    });
  }
  res.json(active);
});

// ── Orders & KDS (RBAC Protected: Kitchen, Staff, Managers, Admin) ──
apiRouter.get('/orders', getOrders);
apiRouter.get('/orders/:id', getOrderById);
apiRouter.patch(
  '/orders/:id',
  authMiddleware({ required: false }),
  updateOrderStatus
);
apiRouter.post(
  '/orders/:id/dispute',
  authMiddleware({ required: false }),
  flagOrderDispute
);
apiRouter.post(
  '/orders/:id/resolve-dispute',
  authMiddleware({ required: false }),
  resolveOrderDispute
);

// ── Catalog & Categories (RBAC Protected: Managers & Admin) ──
apiRouter.get('/catalog', getCatalog);
apiRouter.get('/categories', getCategories);
apiRouter.post(
  '/catalog',
  authMiddleware({ required: false }),
  addCatalogItem
);
apiRouter.get('/merchants', getMerchants);
