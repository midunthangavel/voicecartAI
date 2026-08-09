import { dbGet, dbAll, getCustomerProfile, getSavedAddresses, getLastOrderForPhone, upsertCustomerProfile } from '../db.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI = null;
function getGeminiModel() {
  if (!genAI && process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

async function loadCatalogContext() {
  try {
    const items = await dbAll('SELECT * FROM catalog WHERE available = 1');
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

function buildSystemPrompt(catalogText, callerContext) {
  const { profile, addresses, lastOrder } = callerContext || {};
  let contextBlock = '';

  if (profile) {
    contextBlock += `\nCALLER PROFILE:
- Name: ${profile.name || 'Unknown'}
- Dietary Preference: ${profile.dietary_preference || 'none'}
- Total Past Orders: ${profile.total_orders || 0}
- Preferred Language: ${profile.preferred_language || 'mixed'}\n`;
  }

  if (addresses && addresses.length > 0) {
    contextBlock += `\nSAVED ADDRESSES:\n`;
    for (const addr of addresses) {
      contextBlock += `- ${addr.label}: ${addr.spoken_address}${addr.landmark ? ` (near ${addr.landmark})` : ''}${addr.is_default ? ' [DEFAULT]' : ''}\n`;
    }
  }

  if (lastOrder) {
    const items = JSON.parse(lastOrder.items || '[]');
    const itemList = items.map(i => `${i.quantity}x ${i.name}`).join(', ');
    contextBlock += `\nLAST ORDER: ${itemList} — ₹${lastOrder.total_amount} (${lastOrder.delivery_address || 'No address'})\n`;
  }

  return `You are "VoiceCart AI", a warm, energetic, and highly natural bilingual (Tamil & English) phone assistant taking food orders for a top restaurant in Coimbatore, India.

CRITICAL VOICE & CONVERSATIONAL RULES:
1. SPEAK LIKE A REAL HUMAN PHONE AGENT (1-2 short sentences max).
2. Answer questions naturally (e.g. if asked "Total how much?", state the current cart total and items).
3. Track items, quantities, address, landmark.
4. If customer says "hello" or greets, greet them back warmly and ask what they would like to eat.

${contextBlock}

RESTAURANT MENU:
${catalogText}

EXPECTED OUTPUT FORMAT (Strict JSON only):
{
  "response_text": "response",
  "updated_state": {
    "items": [{"name": "Chicken Biryani", "quantity": 2, "price": 220}],
    "delivery_address": "42 DB Road",
    "landmark": "Senthil Hospital",
    "total": 440,
    "scheduled_for": null,
    "status": "collecting_items" | "confirming" | "confirmed"
  },
  "detected_language": "ta-IN" | "en-IN" | "mixed"
}`;
}

export async function processDialogueTurn(transcript, sessionState, conversationHistory = [], callerPhone = null) {
  const startTime = Date.now();
  const ai = getGeminiModel();
  const callerContext = await loadCallerContext(callerPhone);

  if (ai) {
    try {
      const catalogText = await loadCatalogContext();
      const systemPrompt = buildSystemPrompt(catalogText, callerContext);

      const contents = [];
      const recentHistory = conversationHistory.slice(-10);
      for (const turn of recentHistory) {
        contents.push({
          role: turn.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: turn.text }],
        });
      }

      contents.push({
        role: 'user',
        parts: [{ text: `Current state: ${JSON.stringify(sessionState)}\nCaller said: "${transcript}"` }],
      });

      const modelNames = ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-2.5-flash'];
      let result = null;

      for (const modelName of modelNames) {
        try {
          const m = ai.getGenerativeModel({ model: modelName });
          result = await m.generateContent({
            contents,
            systemInstruction: { parts: [{ text: systemPrompt }] },
          });
          if (result) break;
        } catch (err) {
          // continue fallback loop
        }
      }

      if (result) {
        const rawText = result.response.text();
        const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
          response_text: parsed.response_text,
          updated_state: parsed.updated_state,
          detected_language: parsed.detected_language || 'mixed',
          latency_ms: Date.now() - startTime,
        };
      }
    } catch (err) {
      console.warn('[Dialogue] Gemini API error, falling back to smart dialogue engine:', err.message);
    }
  }

  // Fallback to Smart Humanlike Dialogue Engine
  const res = mockDialogue(transcript, sessionState, callerContext);
  res.latency_ms = Date.now() - startTime;
  return res;
}

export function getInitialState() {
  return {
    items: [],
    delivery_address: null,
    landmark: null,
    total: 0,
    scheduled_for: null,
    group_mode: false,
    status: 'greeting',
  };
}

function mockDialogue(transcript, state, callerContext = {}) {
  const text = (transcript || '').toLowerCase().trim();
  const currentState = JSON.parse(JSON.stringify(state || { items: [], status: 'greeting' }));

  if (!currentState.items) currentState.items = [];
  if (!currentState.status) currentState.status = 'greeting';

  const { profile, addresses, lastOrder } = callerContext;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ── 1. GREETING & HELLO ──
  if ((currentState.status === 'greeting' && !text) || text.match(/^(hello|hi|hey|vanakkam|namaste|good morning|good evening)$/i)) {
    currentState.status = 'collecting_items';

    if (lastOrder && !text) {
      const lastItems = JSON.parse(lastOrder.items || '[]');
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

  // ── 2. PRICE & TOTAL INQUIRIES ("total how much?", "what is the bill?") ──
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

  // ── 3. MENU INQUIRIES ──
  if (text.match(/menu|what do you have|dishes|items|options|specials/i)) {
    return {
      response_text: "We have Chicken Biryani (₹220), Mutton Biryani (₹280), Paneer Butter Masala (₹180), Garlic Naan (₹55), Kothu Parotta (₹150), and Thums Up (₹40)! What would you like?",
      updated_state: currentState,
      detected_language: 'en-IN',
    };
  }

  // ── 4. CONFIRMATION STEP ──
  if (text.match(/^(yes|confirm|ok|sari|sure|correct|yeah|fine|place order|proceed)$/i)) {
    if (currentState.items.length === 0) {
      return {
        response_text: "Please add some food items first! What would you like to order today?",
        updated_state: currentState,
        detected_language: 'en-IN',
      };
    }
    currentState.status = 'confirmed';
    const total = currentState.total || 0;
    return {
      response_text: `Awesome! Your order for ₹${total} is confirmed! Payment link has been sent via SMS. Thank you for ordering with VoiceCart!`,
      updated_state: currentState,
      detected_language: 'mixed',
    };
  }

  if (text.match(/^(no|cancel|stop|wait|clear)$/i)) {
    currentState.items = [];
    currentState.total = 0;
    currentState.status = 'collecting_items';
    return {
      response_text: "No problem, I have cleared your order! What else would you like to get?",
      updated_state: currentState,
      detected_language: 'en-IN',
    };
  }

  // ── 5. MENU ITEM RECOGNITION ──
  let quantity = 1;
  if (text.includes('two') || text.includes('rendu') || text.includes(' 2 ') || text.startsWith('2')) quantity = 2;
  else if (text.includes('three') || text.includes('moonu') || text.includes(' 3 ') || text.startsWith('3')) quantity = 3;
  else if (text.includes('four') || text.includes('naalu') || text.includes(' 4 ') || text.startsWith('4')) quantity = 4;

  const menuCatalog = [
    { keywords: ['chicken biryani', 'chicken biriyani', 'chicken biryani', 'kozhi biryani'], name: 'Chicken Biryani', price: 220, category: 'biryani' },
    { keywords: ['mutton biryani', 'mutton biriyani', 'aatu biryani'], name: 'Mutton Biryani', price: 280, category: 'biryani' },
    { keywords: ['paneer butter masala', 'paneer masala', 'paneer butter', 'paneer'], name: 'Paneer Butter Masala', price: 180, category: 'curry' },
    { keywords: ['garlic naan', 'poondu naan'], name: 'Garlic Naan', price: 55, category: 'bread' },
    { keywords: ['butter naan', 'naan', 'nan'], name: 'Butter Naan', price: 45, category: 'bread' },
    { keywords: ['kothu parotta', 'kothu porotta', 'kothu'], name: 'Kothu Parotta', price: 150, category: 'main' },
    { keywords: ['thums up', 'thumbs up', 'coke', 'pepsi', 'drink'], name: 'Thums Up', price: 40, category: 'beverage' },
    { keywords: ['masala chai', 'tea', 'chai'], name: 'Masala Chai', price: 30, category: 'beverage' },
  ];

  let addedNew = false;
  for (const item of menuCatalog) {
    for (const kw of item.keywords) {
      if (text.includes(kw)) {
        if (item.name === 'Butter Naan' && text.includes('garlic naan')) continue;

        const existing = currentState.items.find(i => i.name === item.name);
        if (existing) {
          existing.quantity += quantity;
        } else {
          currentState.items.push({ name: item.name, price: item.price, category: item.category, quantity });
        }
        addedNew = true;
        break;
      }
    }
  }

  currentState.total = currentState.items.reduce((s, i) => s + i.price * i.quantity, 0);

  // ── 6. ADDRESS EXTRACTION ──
  if (text.includes('deliver') || text.includes('address') || text.includes('street') || text.includes('road') || text.includes('nagar') || text.includes('puram')) {
    currentState.delivery_address = transcript;
    const match = text.match(/(?:near|opposite|behind)\s+([a-zA-Z0-9\s]+)/i);
    if (match) currentState.landmark = match[1].trim();
    
    return {
      response_text: `Got it! Delivery address saved as ${currentState.delivery_address}. Total is ₹${currentState.total}. Shall I confirm your order now?`,
      updated_state: currentState,
      detected_language: 'mixed',
    };
  }

  // ── 7. RESPONSE FORMULATION FOR NEW ADDITIONS ──
  if (addedNew) {
    currentState.status = 'confirming';
    const itemList = currentState.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
    return {
      response_text: `Got it! Added to your order. You now have ${itemList} totaling ₹${currentState.total}. Shall I confirm your order now?`,
      updated_state: currentState,
      detected_language: 'mixed',
    };
  }

  // If items exist but unrecognized query, give friendly answer
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
