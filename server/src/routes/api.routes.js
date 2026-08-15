import { Router } from 'express';
import { getStats, getRecentCalls, getCallById, getCallAudio } from '../controllers/call.controller.js';
import { getOrders, getOrderById, updateOrderStatus, flagOrderDispute, resolveOrderDispute } from '../controllers/order.controller.js';
import { getCatalog, getCategories, addCatalogItem, getMerchants } from '../controllers/catalog.controller.js';
import { getEngineStatus } from '../controllers/engine.controller.js';
import { getAllQueueStats } from '../queue/queueManager.js';
import { authRouter } from './auth.routes.js';
import { metricsRouter } from './metrics.routes.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole, ROLES } from '../middleware/rbac.middleware.js';
import { validateBody, validateQuery } from '../middleware/validation.middleware.js';
import { updateOrderStatusSchema, flagDisputeSchema, resolveDisputeSchema } from '../schemas/order.schema.js';
import { addCatalogItemSchema } from '../schemas/catalog.schema.js';
import { paginationSchema } from '../schemas/common.schema.js';
import { sessions } from '../websocket/wsServer.js';

export const apiRouter = Router();

// ── 1. Explicitly Public Routes ──
apiRouter.use('/auth', authRouter);
apiRouter.get('/catalog', getCatalog);
apiRouter.get('/categories', getCategories);
apiRouter.get('/merchants', getMerchants);

// ── 2. Mandatory Protected Routes Boundary ──
const protectedApi = Router();
protectedApi.use(authMiddleware({ required: true }));

// Observability & Telemetry (Manager & Admin only)
protectedApi.use('/metrics', requireRole(ROLES.RESTAURANT_MANAGER, ROLES.ADMIN), metricsRouter);
protectedApi.get('/audit-logs', requireRole(ROLES.RESTAURANT_MANAGER, ROLES.ADMIN), (req, res, next) => metricsRouter.handle(req, res, next));
protectedApi.get('/queues', requireRole(ROLES.RESTAURANT_MANAGER, ROLES.ADMIN), (req, res) => res.json(getAllQueueStats()));

// Operational Dashboard Stats & Active Sessions
protectedApi.get('/stats', getStats);
protectedApi.get('/engine-status', getEngineStatus);
import { listActiveSessions } from '../infra/sessionStore.js';

protectedApi.get('/sessions', requireRole(ROLES.STAFF, ROLES.RESTAURANT_MANAGER, ROLES.ADMIN), async (req, res, next) => {
  try {
    const reqTenantId = req.auth?.tenantId;
    const reqRestaurantId = req.auth?.restaurantId;
    const activeMap = new Map();

    // 1. Get cluster-wide active sessions from distributed Redis store
    const clusterSessions = await listActiveSessions(reqTenantId, req.auth?.role === 'ADMIN' ? null : reqRestaurantId);
    for (const s of clusterSessions) {
      activeMap.set(s.id, {
        id: s.id,
        caller_phone: s.callerPhone || 'Browser',
        source: s.source,
        state: s.state,
        tenantId: s.tenantId,
        restaurantId: s.restaurantId,
        startedAt: s.createdAt,
      });
    }

    // 2. Augment with local real-time audio sessions
    for (const [id, session] of sessions) {
      if (session.tenantId && reqTenantId && session.tenantId !== reqTenantId) continue;
      if (req.auth?.role !== 'ADMIN' && session.restaurantId && reqRestaurantId && session.restaurantId !== reqRestaurantId) continue;

      activeMap.set(id, {
        id,
        caller_phone: session.callerPhone || 'Browser',
        source: session.source,
        state: session.state,
        transcript: session.conversationHistory,
        startedAt: session.startedAt,
        latencies: session.latencies,
        tenantId: session.tenantId,
        restaurantId: session.restaurantId,
      });
    }

    res.json(Array.from(activeMap.values()));
  } catch (err) {
    next(err);
  }
});

// Calls & Recordings (Staff, Managers, Admin)
protectedApi.get('/calls', requireRole(ROLES.STAFF, ROLES.RESTAURANT_MANAGER, ROLES.ADMIN), validateQuery(paginationSchema), getRecentCalls);
protectedApi.get('/calls/:id', requireRole(ROLES.STAFF, ROLES.RESTAURANT_MANAGER, ROLES.ADMIN), getCallById);
protectedApi.get('/calls/:id/audio', requireRole(ROLES.STAFF, ROLES.RESTAURANT_MANAGER, ROLES.ADMIN), getCallAudio);

// Orders & KDS (Kitchen, Staff, Managers, Admin)
protectedApi.get('/orders', requireRole(ROLES.KITCHEN, ROLES.STAFF, ROLES.RESTAURANT_MANAGER, ROLES.ADMIN), validateQuery(paginationSchema), getOrders);
protectedApi.get('/orders/:id', requireRole(ROLES.KITCHEN, ROLES.STAFF, ROLES.RESTAURANT_MANAGER, ROLES.ADMIN), getOrderById);
protectedApi.patch(
  '/orders/:id',
  requireRole(ROLES.KITCHEN, ROLES.STAFF, ROLES.RESTAURANT_MANAGER, ROLES.ADMIN),
  validateBody(updateOrderStatusSchema),
  updateOrderStatus
);
protectedApi.post(
  '/orders/:id/dispute',
  requireRole(ROLES.STAFF, ROLES.RESTAURANT_MANAGER, ROLES.ADMIN),
  validateBody(flagDisputeSchema),
  flagOrderDispute
);
protectedApi.post(
  '/orders/:id/resolve-dispute',
  requireRole(ROLES.RESTAURANT_MANAGER, ROLES.ADMIN),
  validateBody(resolveDisputeSchema),
  resolveOrderDispute
);

// Catalog Modifications (Managers & Admin only)
protectedApi.post(
  '/catalog',
  requireRole(ROLES.RESTAURANT_MANAGER, ROLES.ADMIN),
  validateBody(addCatalogItemSchema),
  addCatalogItem
);

apiRouter.use(protectedApi);
