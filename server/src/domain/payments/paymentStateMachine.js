/**
 * Authoritative Payment State Machine
 * 
 * Implements Step 38 of Phase2.pdf:
 * Separate payment lifecycle from order lifecycle.
 * "Never assume: payment link created = payment completed."
 */

export const PAYMENT_STATES = {
  PAYMENT_NOT_REQUIRED: 'payment_not_required', // E.g., Cash on Delivery (COD)
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_LINK_CREATED: 'payment_link_created',
  PAYMENT_PROCESSING: 'payment_processing',
  PAYMENT_CONFIRMED: 'payment_confirmed',
  PAYMENT_FAILED: 'payment_failed',
  PAYMENT_EXPIRED: 'payment_expired',
  REFUNDED: 'refunded',
};

export const PAYMENT_ACTIONS = {
  SET_COD: 'SET_COD',
  CREATE_LINK: 'CREATE_LINK',
  PAYMENT_INITIATED: 'PAYMENT_INITIATED',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  PAYMENT_FAIL: 'PAYMENT_FAIL',
  PAYMENT_EXPIRE: 'PAYMENT_EXPIRE',
  PROCESS_REFUND: 'PROCESS_REFUND',
};

export function createInitialPaymentState(orderId, amount, method = 'online') {
  return {
    order_id: orderId,
    status: method === 'cod' ? PAYMENT_STATES.PAYMENT_NOT_REQUIRED : PAYMENT_STATES.PAYMENT_PENDING,
    method, // 'online' | 'cod' | 'upi'
    amount,
    currency: 'INR',
    payment_link: null,
    provider_payment_id: null,
    provider_link_id: null,
    history: [
      {
        status: method === 'cod' ? PAYMENT_STATES.PAYMENT_NOT_REQUIRED : PAYMENT_STATES.PAYMENT_PENDING,
        timestamp: new Date().toISOString(),
        action: 'INIT',
      },
    ],
  };
}

export function canTransitionPayment(state, action) {
  const current = state?.status || PAYMENT_STATES.PAYMENT_PENDING;

  switch (current) {
    case PAYMENT_STATES.PAYMENT_NOT_REQUIRED:
      return [PAYMENT_ACTIONS.CREATE_LINK].includes(action);

    case PAYMENT_STATES.PAYMENT_PENDING:
      return [PAYMENT_ACTIONS.SET_COD, PAYMENT_ACTIONS.CREATE_LINK, PAYMENT_ACTIONS.PAYMENT_INITIATED].includes(action);

    case PAYMENT_STATES.PAYMENT_LINK_CREATED:
      return [
        PAYMENT_ACTIONS.PAYMENT_INITIATED,
        PAYMENT_ACTIONS.PAYMENT_SUCCESS,
        PAYMENT_ACTIONS.PAYMENT_FAIL,
        PAYMENT_ACTIONS.PAYMENT_EXPIRE,
      ].includes(action);

    case PAYMENT_STATES.PAYMENT_PROCESSING:
      return [PAYMENT_ACTIONS.PAYMENT_SUCCESS, PAYMENT_ACTIONS.PAYMENT_FAIL].includes(action);

    case PAYMENT_STATES.PAYMENT_CONFIRMED:
      return [PAYMENT_ACTIONS.PROCESS_REFUND].includes(action);

    case PAYMENT_STATES.PAYMENT_FAILED:
    case PAYMENT_STATES.PAYMENT_EXPIRED:
      return [PAYMENT_ACTIONS.CREATE_LINK, PAYMENT_ACTIONS.SET_COD].includes(action);

    case PAYMENT_STATES.REFUNDED:
      return false;

    default:
      return false;
  }
}

export function transitionPayment(state, action, payload = {}) {
  const currentState = JSON.parse(JSON.stringify(state || createInitialPaymentState(payload.orderId, payload.amount)));

  if (!canTransitionPayment(currentState, action)) {
    return {
      success: false,
      state: currentState,
      error: `Illegal payment transition: Cannot perform '${action}' while payment is '${currentState.status}'`,
    };
  }

  let nextStatus = currentState.status;
  const now = new Date().toISOString();

  switch (action) {
    case PAYMENT_ACTIONS.SET_COD:
      nextStatus = PAYMENT_STATES.PAYMENT_NOT_REQUIRED;
      currentState.method = 'cod';
      break;

    case PAYMENT_ACTIONS.CREATE_LINK:
      nextStatus = PAYMENT_STATES.PAYMENT_LINK_CREATED;
      if (payload.payment_link) currentState.payment_link = payload.payment_link;
      if (payload.provider_link_id) currentState.provider_link_id = payload.provider_link_id;
      break;

    case PAYMENT_ACTIONS.PAYMENT_INITIATED:
      nextStatus = PAYMENT_STATES.PAYMENT_PROCESSING;
      break;

    case PAYMENT_ACTIONS.PAYMENT_SUCCESS:
      nextStatus = PAYMENT_STATES.PAYMENT_CONFIRMED;
      if (payload.provider_payment_id) currentState.provider_payment_id = payload.provider_payment_id;
      break;

    case PAYMENT_ACTIONS.PAYMENT_FAIL:
      nextStatus = PAYMENT_STATES.PAYMENT_FAILED;
      break;

    case PAYMENT_ACTIONS.PAYMENT_EXPIRE:
      nextStatus = PAYMENT_STATES.PAYMENT_EXPIRED;
      break;

    case PAYMENT_ACTIONS.PROCESS_REFUND:
      nextStatus = PAYMENT_STATES.REFUNDED;
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
