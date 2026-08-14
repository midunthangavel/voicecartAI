import { dispatchQueue } from '../queue/queueManager.js';
import { getDispatchProvider } from '../integrations/dispatch/DispatchProvider.js';
import { updateOrderStatus } from '../domain/orders/order.repository.js';
import { createInitialDispatchState, transitionDispatch, DISPATCH_ACTIONS } from '../domain/dispatch/dispatchStateMachine.js';
import { broadcastToDashboard } from '../websocket/dashboardWsHandler.js';

/**
 * Dispatch Background Worker
 * Handles asynchronous restaurant dispatching via ONDC Beckn protocol or POS integration.
 */

dispatchQueue.process('DISPATCH_ORDER', async (data) => {
  const { orderId, state, callerPhone, restaurantId = 'r_coimbatore_01' } = data;

  console.log(`[Worker:Dispatch] Dispatching Order #${orderId} for ${callerPhone}...`);

  const provider = getDispatchProvider();
  const dispatchResult = await provider.dispatch(state, callerPhone, restaurantId);

  if (dispatchResult.success) {
    const dispatchState = createInitialDispatchState(orderId, dispatchResult.dispatch_mode);
    const transition = transitionDispatch(dispatchState, DISPATCH_ACTIONS.ACCEPT_ORDER, {
      merchant: dispatchResult.merchant,
    });

    await updateOrderStatus(orderId, 'dispatched', restaurantId);

    broadcastToDashboard({
      type: 'order_dispatched',
      orderId,
      dispatchMode: dispatchResult.dispatch_mode,
      ondcOrderId: dispatchResult.order_id,
      merchant: dispatchResult.merchant || 'Sree Annapoorna',
      estimatedTime: dispatchResult.estimated_time || '25-35 mins',
      trackingUrl: dispatchResult.tracking_url,
      dispatchState: transition.state,
    });

    console.log(`[Worker:Dispatch] Successfully dispatched Order #${orderId} via ${dispatchResult.dispatch_mode}`);
    return dispatchResult;
  }

  throw new Error(`Dispatch failed for Order #${orderId}`);
});

console.log('[Workers] Dispatch Worker initialized and listening for jobs.');
