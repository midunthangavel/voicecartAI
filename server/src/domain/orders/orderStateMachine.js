/**
 * Authoritative Order State Machine
 * 
 * Governs the complete lifecycle of a food order as specified in Phase2.pdf (Pages 9-11).
 * "The AI should suggest; the Code should decide."
 */

export const ORDER_STATES = {
  NEW: 'new',
  COLLECTING_ITEMS: 'collecting_items',
  COLLECTING_ADDRESS: 'collecting_address',
  VALIDATING: 'validating',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  CONFIRMED: 'confirmed',
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_CONFIRMED: 'payment_confirmed',
  DISPATCH_PENDING: 'dispatch_pending',
  DISPATCHED: 'dispatched',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NEEDS_HUMAN: 'needs_human',
};

export const ORDER_ACTIONS = {
  START_ORDER: 'START_ORDER',
  ADD_ITEM: 'ADD_ITEM',
  REMOVE_ITEM: 'REMOVE_ITEM',
  CLEAR_ITEMS: 'CLEAR_ITEMS',
  SET_ADDRESS: 'SET_ADDRESS',
  SET_LANDMARK: 'SET_LANDMARK',
  REQUEST_CONFIRMATION: 'REQUEST_CONFIRMATION',
  CONFIRM_ORDER: 'CONFIRM_ORDER',
  CANCEL_ORDER: 'CANCEL_ORDER',
  TRIGGER_PAYMENT: 'TRIGGER_PAYMENT',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  DISPATCH_ORDER: 'DISPATCH_ORDER',
  COMPLETE_ORDER: 'COMPLETE_ORDER',
  REQUEST_HUMAN: 'REQUEST_HUMAN',
  FLAG_DISPUTE: 'FLAG_DISPUTE',
  RESOLVE_DISPUTE: 'RESOLVE_DISPUTE',
};

/**
 * Creates a clean, empty order state container.
 */
export function createInitialOrderState(callerPhone = null) {
  return {
    status: ORDER_STATES.NEW,
    items: [],
    subtotal: 0,
    tax: 0,
    delivery_fee: 0,
    total: 0,
    delivery_address: null,
    landmark: null,
    caller_phone: callerPhone,
    scheduled_for: null,
    group_mode: false,
    dietary_preference: null,
    payment_status: 'none', // 'none' | 'pending' | 'paid' | 'cod'
    dispute_status: 'none', // 'none' | 'pending_review' | 'refunded' | 'rejected'
    dispute_reason: null,
    dispute_resolution_notes: null,
    history: [
      { status: ORDER_STATES.NEW, timestamp: new Date().toISOString(), reason: 'Initial order session created' }
    ],
  };
}

/**
 * Validates whether an action can legally transition from the current state.
 */
export function canTransition(state, action) {
  const current = state?.status || ORDER_STATES.NEW;

  // Global actions allowed from almost anywhere prior to completion
  if (action === ORDER_ACTIONS.CANCEL_ORDER) {
    return ![ORDER_STATES.COMPLETED, ORDER_STATES.CANCELLED].includes(current);
  }

  if (action === ORDER_ACTIONS.REQUEST_HUMAN) {
    return true;
  }

  switch (current) {
    case ORDER_STATES.NEW:
      return [ORDER_ACTIONS.START_ORDER, ORDER_ACTIONS.ADD_ITEM, ORDER_ACTIONS.SET_ADDRESS].includes(action);

    case ORDER_STATES.COLLECTING_ITEMS:
      return [
        ORDER_ACTIONS.ADD_ITEM,
        ORDER_ACTIONS.REMOVE_ITEM,
        ORDER_ACTIONS.CLEAR_ITEMS,
        ORDER_ACTIONS.SET_ADDRESS,
        ORDER_ACTIONS.REQUEST_CONFIRMATION,
      ].includes(action);

    case ORDER_STATES.COLLECTING_ADDRESS:
      return [
        ORDER_ACTIONS.SET_ADDRESS,
        ORDER_ACTIONS.SET_LANDMARK,
        ORDER_ACTIONS.ADD_ITEM,
        ORDER_ACTIONS.REMOVE_ITEM,
        ORDER_ACTIONS.REQUEST_CONFIRMATION,
      ].includes(action);

    case ORDER_STATES.VALIDATING:
      return [ORDER_ACTIONS.REQUEST_CONFIRMATION, ORDER_ACTIONS.COLLECTING_ADDRESS, ORDER_ACTIONS.COLLECTING_ITEMS].includes(action);

    case ORDER_STATES.AWAITING_CONFIRMATION:
      return [
        ORDER_ACTIONS.CONFIRM_ORDER,
        ORDER_ACTIONS.ADD_ITEM,
        ORDER_ACTIONS.REMOVE_ITEM,
        ORDER_ACTIONS.SET_ADDRESS,
        ORDER_ACTIONS.SET_LANDMARK,
      ].includes(action);

    case ORDER_STATES.CONFIRMED:
      return [
        ORDER_ACTIONS.TRIGGER_PAYMENT,
        ORDER_ACTIONS.PAYMENT_SUCCESS,
        ORDER_ACTIONS.DISPATCH_ORDER,
      ].includes(action);

    case ORDER_STATES.PAYMENT_PENDING:
      return [ORDER_ACTIONS.PAYMENT_SUCCESS, ORDER_ACTIONS.DISPATCH_ORDER].includes(action);

    case ORDER_STATES.PAYMENT_CONFIRMED:
      return [ORDER_ACTIONS.DISPATCH_ORDER].includes(action);

    case ORDER_STATES.DISPATCH_PENDING:
      return [ORDER_ACTIONS.DISPATCH_ORDER].includes(action);

    case ORDER_STATES.DISPATCHED:
      return [ORDER_ACTIONS.COMPLETE_ORDER, ORDER_ACTIONS.FLAG_DISPUTE].includes(action);

    case ORDER_STATES.COMPLETED:
      return [ORDER_ACTIONS.FLAG_DISPUTE, ORDER_ACTIONS.RESOLVE_DISPUTE].includes(action);

    case ORDER_STATES.CANCELLED:
    case ORDER_STATES.NEEDS_HUMAN:
      return [ORDER_ACTIONS.FLAG_DISPUTE, ORDER_ACTIONS.RESOLVE_DISPUTE].includes(action);

    default:
      return false;
  }
}

/**
 * Transitions an order state based on an authoritative action.
 * Returns { success: boolean, state: Object, error?: string }
 */
export function transitionOrder(state, action, payload = {}) {
  const currentState = JSON.parse(JSON.stringify(state || createInitialOrderState()));

  if (!canTransition(currentState, action)) {
    return {
      success: false,
      state: currentState,
      error: `Illegal state transition: Cannot perform '${action}' while order is in '${currentState.status}'`,
    };
  }

  let nextStatus = currentState.status;
  const now = new Date().toISOString();

  switch (action) {
    case ORDER_ACTIONS.START_ORDER:
      nextStatus = ORDER_STATES.COLLECTING_ITEMS;
      break;

    case ORDER_ACTIONS.ADD_ITEM: {
      nextStatus = ORDER_STATES.COLLECTING_ITEMS;
      // Payload should contain structured item: { name, price, quantity, category, etc. }
      if (payload.item) {
        const existing = currentState.items.find(i => i.name.toLowerCase() === payload.item.name.toLowerCase());
        const qty = payload.item.quantity || 1;
        if (existing) {
          existing.quantity += qty;
          if (payload.item.price) existing.price = payload.item.price;
        } else {
          currentState.items.push({
            name: payload.item.name,
            price: payload.item.price || 0,
            quantity: qty,
            category: payload.item.category || 'food',
          });
        }
      }
      // If we have items and also have address, we can be ready for confirmation
      if (currentState.delivery_address && currentState.items.length > 0) {
        nextStatus = ORDER_STATES.AWAITING_CONFIRMATION;
      }
      break;
    }

    case ORDER_ACTIONS.REMOVE_ITEM: {
      if (payload.item_name) {
        const target = payload.item_name.toLowerCase();
        currentState.items = currentState.items.filter(i => !i.name.toLowerCase().includes(target));
      }
      if (currentState.items.length === 0) {
        nextStatus = ORDER_STATES.COLLECTING_ITEMS;
      }
      break;
    }

    case ORDER_ACTIONS.CLEAR_ITEMS:
      currentState.items = [];
      currentState.subtotal = 0;
      currentState.total = 0;
      nextStatus = ORDER_STATES.COLLECTING_ITEMS;
      break;

    case ORDER_ACTIONS.SET_ADDRESS:
      if (payload.address) {
        currentState.delivery_address = payload.address;
        if (payload.landmark) currentState.landmark = payload.landmark;
        nextStatus = currentState.items.length > 0 ? ORDER_STATES.AWAITING_CONFIRMATION : ORDER_STATES.COLLECTING_ITEMS;
      }
      break;

    case ORDER_ACTIONS.SET_LANDMARK:
      if (payload.landmark) {
        currentState.landmark = payload.landmark;
      }
      break;

    case ORDER_ACTIONS.REQUEST_CONFIRMATION:
      if (currentState.items.length === 0) {
        return {
          success: false,
          state: currentState,
          error: 'Cannot request confirmation: Cart is empty',
        };
      }
      if (!currentState.delivery_address) {
        nextStatus = ORDER_STATES.COLLECTING_ADDRESS;
      } else {
        nextStatus = ORDER_STATES.AWAITING_CONFIRMATION;
      }
      break;

    case ORDER_ACTIONS.CONFIRM_ORDER:
      if (currentState.items.length === 0) {
        return {
          success: false,
          state: currentState,
          error: 'Cannot confirm order: Cart is empty',
        };
      }
      if (!currentState.delivery_address) {
        return {
          success: false,
          state: currentState,
          error: 'Cannot confirm order: Delivery address is missing',
        };
      }
      nextStatus = ORDER_STATES.CONFIRMED;
      break;

    case ORDER_ACTIONS.CANCEL_ORDER:
      currentState.items = [];
      currentState.subtotal = 0;
      currentState.total = 0;
      nextStatus = ORDER_STATES.CANCELLED;
      break;

    case ORDER_ACTIONS.TRIGGER_PAYMENT:
      nextStatus = ORDER_STATES.PAYMENT_PENDING;
      currentState.payment_status = 'pending';
      break;

    case ORDER_ACTIONS.PAYMENT_SUCCESS:
      nextStatus = ORDER_STATES.PAYMENT_CONFIRMED;
      currentState.payment_status = 'paid';
      break;

    case ORDER_ACTIONS.DISPATCH_ORDER:
      nextStatus = ORDER_STATES.DISPATCHED;
      break;

    case ORDER_ACTIONS.COMPLETE_ORDER:
      nextStatus = ORDER_STATES.COMPLETED;
      break;

    case ORDER_ACTIONS.REQUEST_HUMAN:
      nextStatus = ORDER_STATES.NEEDS_HUMAN;
      break;

    case ORDER_ACTIONS.FLAG_DISPUTE:
      currentState.dispute_status = 'pending_review';
      if (payload.reason) currentState.dispute_reason = payload.reason;
      break;

    case ORDER_ACTIONS.RESOLVE_DISPUTE:
      currentState.dispute_status = payload.resolution === 'refund' ? 'refunded' : 'rejected';
      if (payload.notes) currentState.dispute_resolution_notes = payload.notes;
      break;

    default:
      break;
  }

  // Recalculate totals
  currentState.subtotal = currentState.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  currentState.delivery_fee = currentState.subtotal > 0 && currentState.delivery_address ? 30 : 0;
  currentState.tax = Math.round(currentState.subtotal * 0.05); // 5% GST
  currentState.total = currentState.subtotal + currentState.tax + currentState.delivery_fee;

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
