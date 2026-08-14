import { dbGet, dbAll, getCustomerProfile, getSavedAddresses, getLastOrderForPhone, upsertCustomerProfile } from '../db.js';
import { callLlm } from './llmProviderAdapter.js';
import { createInitialOrderState, transitionOrder, ORDER_ACTIONS, ORDER_STATES } from '../domain/orders/orderStateMachine.js';
import { calculateAuthoritativeCart, getActiveCatalog, matchCatalogItem } from '../domain/orders/pricingEngine.js';
import { getPromptBuilder } from './promptService.js';

async function loadCatalogContext() {
  try {
    const items = await getActiveCatalog();
    return items
      .map(i => `- ${i.name} (${i.name_tamil || ''}): ₹${i.price} [Category: ${i.category}] [Dietary: ${i.dietary_tags || 'none'}] ${i.is_special ? '⭐ TODAY SPECIAL' : ''}`)
      .join('\n');
  } catch (err) {
    console.error('[Dialogue] Error loading catalog context:', err.message);
    return '- Chicken Biryani (சிக்கன் பிரியாணி): ₹220\n- Mutton Biryani (ஆட்டு பிரியாணி): ₹280\n- Paneer Butter Masala: ₹180\n- Butter Naan: ₹45\n- Thums Up: ₹40';
  }
}

async function loadCallerContext(callerPhone) {
  if (!callerPhone || callerPhone === 'Browser' || callerPhone === 'unknown') {
    return { profile: null, addresses: [], lastOrder: null };
  }
  try {
    const [profile, addresses, lastOrder] = await Promise.all([
      getCustomerProfile(callerPhone),
      getSavedAddresses(callerPhone),
      getLastOrderForPhone(callerPhone),
    ]);
    return { profile, addresses, lastOrder };
  } catch (err) {
    console.log('[Dialogue] Caller context load error:', err.message);
    return { profile: null, addresses: [], lastOrder: null };
  }
}

export async function processDialogueTurn(transcript, sessionState, conversationHistory = [], callerPhone = null) {
  const startTime = Date.now();
  const callerContext = await loadCallerContext(callerPhone);
  const state = sessionState || createInitialOrderState(callerPhone);

  try {
    const catalogText = await loadCatalogContext();
    const promptEngine = getPromptBuilder();
    const systemPrompt = promptEngine.build(catalogText, callerContext);

    const messages = [];
    const recentHistory = conversationHistory.slice(-10);
    for (const turn of recentHistory) {
      messages.push({
        role: turn.role === 'assistant' ? 'assistant' : 'user',
        content: turn.text,
      });
    }

    messages.push({
      role: 'user',
      content: `Current state: ${JSON.stringify({ status: state.status, items: state.items, address: state.delivery_address, total: state.total })}\nCaller said: "${transcript}"`,
    });

    const llmResult = await callLlm(systemPrompt, messages);

    if (llmResult) {
      const authoritativeState = await reconcileLlmOutputWithStateMachine(llmResult, state);

      return {
        response_text: llmResult.response_text,
        updated_state: authoritativeState,
        detected_language: llmResult.detected_language || 'mixed',
        provider: llmResult.provider,
        model: llmResult.model,
        latency_ms: llmResult.latency_ms,
      };
    }
  } catch (err) {
    console.warn('[Dialogue] LLM adapter error, falling back to smart rule engine:', err.message);
  }

  // Fallback to Smart Humanlike Dialogue Engine
  const res = await mockDialogue(transcript, state, callerContext);
  res.latency_ms = Date.now() - startTime;
  res.provider = 'RuleEngine';
  res.model = 'built-in';
  return res;
}

export function getInitialState(callerPhone = null) {
  return createInitialOrderState(callerPhone);
}

/**
 * Reconciles LLM extraction proposals with the authoritative pricing and state machine.
 */
async function reconcileLlmOutputWithStateMachine(llmResult, currentState) {
  let workingState = JSON.parse(JSON.stringify(currentState));

  const proposedItems = llmResult.items || llmResult.updated_state?.items || [];
  const proposedAddress = llmResult.delivery_address || llmResult.updated_state?.delivery_address;
  const proposedLandmark = llmResult.landmark || llmResult.updated_state?.landmark;

  // 1. Set address if proposed
  if (proposedAddress) {
    const t = transitionOrder(workingState, ORDER_ACTIONS.SET_ADDRESS, { address: proposedAddress, landmark: proposedLandmark });
    if (t.success) workingState = t.state;
  }

  // 2. Authoritative pricing calculation
  if (proposedItems.length > 0) {
    const verifiedCart = await calculateAuthoritativeCart(proposedItems, workingState.delivery_address);
    workingState.items = verifiedCart.items;
    workingState.subtotal = verifiedCart.subtotal;
    workingState.tax = verifiedCart.tax;
    workingState.delivery_fee = verifiedCart.delivery_fee;
    workingState.total = verifiedCart.total;

    if (workingState.status === ORDER_STATES.NEW) {
      workingState.status = ORDER_STATES.COLLECTING_ITEMS;
    }
  }

  // 3. State transition intent validation
  const action = llmResult.proposed_action || (llmResult.updated_state?.status === 'confirmed' ? ORDER_ACTIONS.CONFIRM_ORDER : null);
  if (action === ORDER_ACTIONS.CONFIRM_ORDER && workingState.items.length > 0 && workingState.delivery_address) {
    const t = transitionOrder(workingState, ORDER_ACTIONS.CONFIRM_ORDER);
    if (t.success) workingState = t.state;
  } else if (workingState.items.length > 0 && !workingState.delivery_address) {
    workingState.status = ORDER_STATES.COLLECTING_ADDRESS;
  } else if (workingState.items.length > 0 && workingState.delivery_address && workingState.status !== ORDER_STATES.CONFIRMED) {
    workingState.status = ORDER_STATES.AWAITING_CONFIRMATION;
  }

  return workingState;
}

/**
 * Rule-based fallback engine (Deterministic & fast)
 */
async function mockDialogue(transcript, state, callerContext = {}) {
  const text = (transcript || '').toLowerCase().trim();
  let currentState = JSON.parse(JSON.stringify(state || createInitialOrderState()));

  const { profile, addresses, lastOrder } = callerContext;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // 1. GREETING & HELLO
  if ((currentState.status === ORDER_STATES.NEW && !text) || text.match(/^(hello|hi|hey|vanakkam|namaste|good morning|good evening)$/i)) {
    const t = transitionOrder(currentState, ORDER_ACTIONS.START_ORDER);
    if (t.success) currentState = t.state;

    if (lastOrder && !text) {
      const lastItems = typeof lastOrder.items === 'string' ? JSON.parse(lastOrder.items || '[]') : (lastOrder.items || []);
      const lastItemList = lastItems.map(i => `${i.quantity}x ${i.name}`).join(', ');
      return {
        response_text: `Vanakkam! Welcome back to VoiceCart! Last time you had ${lastItemList}. Would you like the same order today?`,
        updated_state: currentState,
        detected_language: 'mixed',
      };
    }

    return {
      response_text: pick([
        "Vanakkam! Welcome to VoiceCart AI. What would you like to order today?",
        "Hello! I am your AI ordering assistant. What delicious food can I get for you?",
        "Vanakkam! Tell me what you'd like to order today!",
      ]),
      updated_state: currentState,
      detected_language: 'mixed',
    };
  }

  // 2. PRICE & TOTAL INQUIRIES
  if (text.match(/total|bill|how much|cost|price|rupees|amount/i)) {
    if (currentState.items.length === 0) {
      return {
        response_text: "Your cart is currently empty! Our biryanis start at ₹220. What would you like to order?",
        updated_state: currentState,
        detected_language: 'en-IN',
      };
    }
    const itemList = currentState.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
    return {
      response_text: `Your total bill is ₹${currentState.total} for ${itemList}.${currentState.delivery_address ? ` Delivery to ${currentState.delivery_address}.` : ''} Shall I place the order now?`,
      updated_state: currentState,
      detected_language: 'mixed',
    };
  }

  // 3. MENU INQUIRIES
  if (text.match(/menu|what do you have|dishes|items|options|specials/i)) {
    return {
      response_text: "We have Chicken Biryani (₹220), Mutton Biryani (₹280), Paneer Butter Masala (₹180), Garlic Naan (₹55), Kothu Parotta (₹150), and Thums Up (₹40)! What would you like?",
      updated_state: currentState,
      detected_language: 'en-IN',
    };
  }

  // 4. CONFIRMATION STEP
  if (text.match(/\b(yes|confirm|confirmed|ok|sari|sure|correct|yeah|fine|place order|proceed)\b/i) && !text.includes('not') && !text.includes("don't")) {
    if (currentState.items.length === 0) {
      return {
        response_text: "Please add some food items first! What would you like to order today?",
        updated_state: currentState,
        detected_language: 'en-IN',
      };
    }
    if (!currentState.delivery_address) {
      currentState.status = ORDER_STATES.COLLECTING_ADDRESS;
      return {
        response_text: "Where would you like this order delivered? Please tell me your address or nearby landmark.",
        updated_state: currentState,
        detected_language: 'mixed',
      };
    }

    const t = transitionOrder(currentState, ORDER_ACTIONS.CONFIRM_ORDER);
    if (t.success) currentState = t.state;

    return {
      response_text: `Awesome! Your order for ₹${currentState.total} is confirmed! Payment link has been sent via SMS. Thank you for ordering with VoiceCart!`,
      updated_state: currentState,
      detected_language: 'mixed',
    };
  }

  // 5. CANCELLATION STEP
  if (text.match(/\b(no|cancel|stop|wait|clear|reset)\b/i)) {
    const t = transitionOrder(currentState, ORDER_ACTIONS.CANCEL_ORDER);
    if (t.success) currentState = t.state;

    return {
      response_text: "No problem, I have cleared your order! What else would you like to get?",
      updated_state: currentState,
      detected_language: 'en-IN',
    };
  }

  // 6. ADDRESS & LANDMARK RECOGNITION
  if (text.includes('deliver') || text.includes('address') || text.includes('street') || text.includes('road') || text.includes('nagar') || text.includes('puram') || text.includes('hospital') || text.includes('colony')) {
    let landmark = null;
    const match = text.match(/(?:near|opposite|behind|beside)\s+([a-zA-Z0-9\s]+)/i);
    if (match) landmark = match[1].trim();

    const t = transitionOrder(currentState, ORDER_ACTIONS.SET_ADDRESS, { address: transcript, landmark });
    if (t.success) currentState = t.state;

    return {
      response_text: `Got it! Delivery address saved as ${currentState.delivery_address}. Total is ₹${currentState.total}. Shall I confirm your order now?`,
      updated_state: currentState,
      detected_language: 'mixed',
    };
  }

  // 7. MENU ITEM RECOGNITION (VIA DETERMINISTIC PRICING ENGINE)
  let quantity = 1;
  if (text.includes('two') || text.includes('rendu') || text.includes(' 2 ') || text.startsWith('2')) quantity = 2;
  else if (text.includes('three') || text.includes('moonu') || text.includes(' 3 ') || text.startsWith('3')) quantity = 3;
  else if (text.includes('four') || text.includes('naalu') || text.includes(' 4 ') || text.startsWith('4')) quantity = 4;

  const matchedItem = await matchCatalogItem(text);
  if (matchedItem) {
    const t = transitionOrder(currentState, ORDER_ACTIONS.ADD_ITEM, {
      item: {
        name: matchedItem.name,
        price: matchedItem.price,
        quantity,
        category: matchedItem.category,
      },
    });
    if (t.success) currentState = t.state;

    // Re-verify cart authoritatively
    const verified = await calculateAuthoritativeCart(currentState.items, currentState.delivery_address);
    currentState.items = verified.items;
    currentState.subtotal = verified.subtotal;
    currentState.tax = verified.tax;
    currentState.delivery_fee = verified.delivery_fee;
    currentState.total = verified.total;

    const itemList = currentState.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
    return {
      response_text: `Got it! Added ${quantity}x ${matchedItem.name}. You now have ${itemList} totaling ₹${currentState.total}.${!currentState.delivery_address ? ' Where shall I deliver this?' : ' Shall I confirm your order now?'}`,
      updated_state: currentState,
      detected_language: 'mixed',
    };
  }

  // If cart already has items
  if (currentState.items.length > 0) {
    const itemList = currentState.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
    return {
      response_text: `You currently have ${itemList} totaling ₹${currentState.total}. Would you like to confirm, add more items, or set a delivery address?`,
      updated_state: currentState,
      detected_language: 'en-IN',
    };
  }

  return {
    response_text: "I didn't catch a dish name. We have Chicken Biryani (₹220), Mutton Biryani (₹280), Paneer Masala (₹180), Naan, and Thums Up! What can I get for you?",
    updated_state: currentState,
    detected_language: 'en-IN',
  };
}
