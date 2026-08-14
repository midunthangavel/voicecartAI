/**
 * Authoritative Dispatch & Kitchen Fulfillment State Machine
 * 
 * Implements Step 39 of Phase2.pdf:
 * Separate dispatch/kitchen lifecycle from order lifecycle.
 * "Do not overload orders.status with every operational status."
 */

export const DISPATCH_STATES = {
  DISPATCH_PENDING: 'dispatch_pending',
  DISPATCH_ACCEPTED: 'dispatch_accepted',
  PREPARING: 'preparing',
  READY: 'ready',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

export const DISPATCH_ACTIONS = {
  ACCEPT_ORDER: 'ACCEPT_ORDER',
  START_PREPARING: 'START_PREPARING',
  MARK_READY: 'MARK_READY',
  ASSIGN_RIDER: 'ASSIGN_RIDER',
  MARK_DELIVERED: 'MARK_DELIVERED',
  DISPATCH_FAIL: 'DISPATCH_FAIL',
  CANCEL_DISPATCH: 'CANCEL_DISPATCH',
};

export function createInitialDispatchState(orderId, mode = 'direct') {
  return {
    order_id: orderId,
    status: DISPATCH_STATES.DISPATCH_PENDING,
    dispatch_mode: mode, // 'ondc' | 'direct' | 'petpooja' | 'urbanpiper'
    rider_name: null,
    rider_phone: null,
    tracking_url: null,
    estimated_delivery_mins: 30,
    history: [
      {
        status: DISPATCH_STATES.DISPATCH_PENDING,
        timestamp: new Date().toISOString(),
        action: 'INIT',
      },
    ],
  };
}

export function canTransitionDispatch(state, action) {
  const current = state?.status || DISPATCH_STATES.DISPATCH_PENDING;

  if (action === DISPATCH_ACTIONS.CANCEL_DISPATCH) {
    return ![DISPATCH_STATES.DELIVERED, DISPATCH_STATES.CANCELLED].includes(current);
  }

  switch (current) {
    case DISPATCH_STATES.DISPATCH_PENDING:
      return [DISPATCH_ACTIONS.ACCEPT_ORDER, DISPATCH_ACTIONS.DISPATCH_FAIL].includes(action);

    case DISPATCH_STATES.DISPATCH_ACCEPTED:
      return [DISPATCH_ACTIONS.START_PREPARING, DISPATCH_ACTIONS.ASSIGN_RIDER, DISPATCH_ACTIONS.DISPATCH_FAIL].includes(action);

    case DISPATCH_STATES.PREPARING:
      return [DISPATCH_ACTIONS.MARK_READY, DISPATCH_ACTIONS.ASSIGN_RIDER, DISPATCH_ACTIONS.DISPATCH_FAIL].includes(action);

    case DISPATCH_STATES.READY:
      return [DISPATCH_ACTIONS.ASSIGN_RIDER, DISPATCH_ACTIONS.MARK_DELIVERED, DISPATCH_ACTIONS.DISPATCH_FAIL].includes(action);

    case DISPATCH_STATES.OUT_FOR_DELIVERY:
      return [DISPATCH_ACTIONS.MARK_DELIVERED, DISPATCH_ACTIONS.DISPATCH_FAIL].includes(action);

    case DISPATCH_STATES.DELIVERED:
    case DISPATCH_STATES.CANCELLED:
    case DISPATCH_STATES.FAILED:
      return false;

    default:
      return false;
  }
}

export function transitionDispatch(state, action, payload = {}) {
  const currentState = JSON.parse(JSON.stringify(state || createInitialDispatchState(payload.orderId)));

  if (!canTransitionDispatch(currentState, action)) {
    return {
      success: false,
      state: currentState,
      error: `Illegal dispatch transition: Cannot perform '${action}' while dispatch is '${currentState.status}'`,
    };
  }

  let nextStatus = currentState.status;
  const now = new Date().toISOString();

  switch (action) {
    case DISPATCH_ACTIONS.ACCEPT_ORDER:
      nextStatus = DISPATCH_STATES.DISPATCH_ACCEPTED;
      if (payload.merchant) currentState.merchant = payload.merchant;
      break;

    case DISPATCH_ACTIONS.START_PREPARING:
      nextStatus = DISPATCH_STATES.PREPARING;
      break;

    case DISPATCH_ACTIONS.MARK_READY:
      nextStatus = DISPATCH_STATES.READY;
      break;

    case DISPATCH_ACTIONS.ASSIGN_RIDER:
      nextStatus = DISPATCH_STATES.OUT_FOR_DELIVERY;
      if (payload.rider_name) currentState.rider_name = payload.rider_name;
      if (payload.rider_phone) currentState.rider_phone = payload.rider_phone;
      if (payload.tracking_url) currentState.tracking_url = payload.tracking_url;
      break;

    case DISPATCH_ACTIONS.MARK_DELIVERED:
      nextStatus = DISPATCH_STATES.DELIVERED;
      break;

    case DISPATCH_ACTIONS.DISPATCH_FAIL:
      nextStatus = DISPATCH_STATES.FAILED;
      if (payload.reason) currentState.failure_reason = payload.reason;
      break;

    case DISPATCH_ACTIONS.CANCEL_DISPATCH:
      nextStatus = DISPATCH_STATES.CANCELLED;
      break;

    default:
      break;
  }

  currentState.status = nextStatus;
  currentState.history.push({
    status: nextStatus,
    action,
    timestamp: now,
    payloadSummary: Object.keys(payload).length > 0 ? JSON.stringify(payload) : undefined,
  });

  return {
    success: true,
    state: currentState,
  };
}
