import { dispatchQueue } from '../queue/queueManager.js';
import { getDispatchProvider } from '../integrations/dispatch/DispatchProvider.js';
import { updateOrderStatus } from '../domain/orders/order.repository.js';
import { createInitialDispatchState, transitionDispatch, DISPATCH_ACTIONS } from '../domain/dispatch/dispatchStateMachine.js';
import { broadcastToDashboard } from '../websocket/dashboardWsHandler.js';
import { withLock } from '../infra/lockService.js';
import { logger } from '../utils/logger.js';

/**
 * Dispatch Background Worker
 *
 * Handles asynchronous restaurant dispatching via ONDC Beckn protocol or POS integration.
 * Uses distributed locking to prevent duplicate dispatches when multiple workers
 * process the same order event.
 */

async function processOrderDispatch(data) {
  const { orderId, state, callerPhone, tenantId, restaurantId } = data;

  if (!tenantId || !restaurantId) {
    throw new Error('[Worker:Dispatch] Explicit tenantId and restaurantId are required');
  }

  // Distributed lock prevents duplicate dispatch when multiple workers
  // pick up the same order event (e.g., outbox retry after crash)
  return withLock(`dispatch:order:${orderId}`, async () => {
    logger.info(`[Worker:Dispatch] Dispatching Order #${orderId} for ${callerPhone}...`);

    const provider = getDispatchProvider();
    const dispatchResult = await provider.dispatch(state, callerPhone, restaurantId);

    if (dispatchResult.success) {
      const dispatchState = createInitialDispatchState(orderId, dispatchResult.dispatch_mode);
      const transition = transitionDispatch(dispatchState, DISPATCH_ACTIONS.ACCEPT_ORDER, {
        merchant: dispatchResult.merchant,
      });

      await updateOrderStatus(orderId, 'dispatched', { tenantId, restaurantId });

      broadcastToDashboard({
        type: 'order_dispatched',
        tenantId,
        restaurantId,
        orderId,
        dispatchMode: dispatchResult.dispatch_mode,
        ondcOrderId: dispatchResult.order_id,
        merchant: dispatchResult.merchant || 'Sree Annapoorna',
        estimatedTime: dispatchResult.estimated_time || '25-35 mins',
        trackingUrl: dispatchResult.tracking_url,
        dispatchState: transition.state,
      });

      logger.info(`[Worker:Dispatch] Successfully dispatched Order #${orderId} via ${dispatchResult.dispatch_mode}`);
      return dispatchResult;
    }

    throw new Error(`Dispatch failed for Order #${orderId}`);
  }, 30000); // 30s TTL — generous for external API calls
}

dispatchQueue.process('DISPATCH_ORDER', processOrderDispatch);

logger.info('[Workers] Dispatch Worker initialized and listening for jobs.');
