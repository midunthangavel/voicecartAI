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
    const items = await dbAll('SELECT * FROM catalog WHERE is_available = 1');
    return items
      .map(i => `- ${i.name} (${i.name_tamil || ''}): ₹${i.price} [Category: ${i.category}] [Dietary: ${i.dietary_tag || 'none'}] ${i.is_today_special ? '⭐ TODAY SPECIAL' : ''}`)
      .join('\n');
  } catch (err) {
    console.error('[Dialogue] Error loading catalog context:', err);
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
2. Track items, quantities, address, landmark. Suggest drink if Biryani added.
3. Returning caller fast path.
4. Address & landmark collection.

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

      const modelNames = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
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
          console.warn(`[Dialogue] Model ${modelName} failed:`, err.message);
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
      console.warn('[Dialogue] Gemini API error, falling back to heuristic parser:', err.message);
    }
  }

  // Fallback to Heuristic Parser
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

  // ── 1. GREETING ──
  if (currentState.status === 'greeting' && !text) {
    currentState.status = 'collecting_items';

    if (lastOrder) {
      const lastItems = JSON.parse(lastOrder.items || '[]');
      const lastItemList = lastItems.map(i => `${i.quantity}x ${i.name}`).join(', ');
      const addrHint = addresses?.[0]?.landmark ? ` to ${addresses[0].spoken_address} near ${addresses[0].landmark}` : '';
      return {
        response_text: `Vanakkam! Welcome back! Last time you ordered ${lastItemList}${addrHint}. Want the same order, or something different today?`,
        updated_state: currentState,
        detected_language: 'mixed',
      };
    }

    return {
      response_text: pick([
        "Vanakkam! Welcome to VoiceCart. What delicious food can I get for you today?",
        "Hello there! Welcome to VoiceCart. What would you like to order today?",
        "Vanakkam! VoiceCart here. Tell me what you'd like to eat today!",
      ]),
      updated_state: currentState,
      detected_language: 'mixed',
    };
  }

  // ── 2. CONFIRMATION STEP ──
  if (currentState.status === 'confirming') {
    if (text.match(/yes|confirm|ok|sari|sure|correct|yeah|yeah confirm|fine|proceed/i)) {
      currentState.status = 'confirmed';
      const total = currentState.total || 0;
      return {
        response_text: pick([
          `Awesome! Your order for ₹${total} is confirmed. Sending your payment link via SMS right now. Valga valamudan!`,
          `Sari boss! Order confirmed for ₹${total}. Look out for the Razorpay link on your phone. Thank you!`,
          `Super! Order locked in for ₹${total}. You'll get an SMS with the payment link momentarily. Enjoy your meal!`,
        ]),
        updated_state: currentState,
        detected_language: 'mixed',
      };
    } else if (text.match(/no|cancel|venda|stop|wait|change|modify/i)) {
      currentState.status = 'collecting_items';
      return {
        response_text: "No problem at all! What would you like to add or change in your order?",
        updated_state: currentState,
        detected_language: 'en-IN',
      };
    }
  }

  // ── 3. REPEAT LAST ORDER ──
  if (text.match(/repeat|same as last|usual|mara padiyum|last order|again same/i) && lastOrder) {
    const lastItems = JSON.parse(lastOrder.items || '[]');
    currentState.items = lastItems;
    currentState.total = lastOrder.total_amount;
    if (addresses?.[0]) {
      currentState.delivery_address = addresses[0].spoken_address;
      currentState.landmark = addresses[0].landmark;
    }
    currentState.status = 'confirming';

    const itemList = lastItems.map(i => `${i.quantity}x ${i.name}`).join(', ');
    return {
      response_text: `Got it! Repeating your last order: ${itemList} for ₹${currentState.total}. ${currentState.delivery_address ? `Delivering to ${currentState.delivery_address}.` : ''} Shall I confirm?`,
      updated_state: currentState,
      detected_language: 'mixed',
    };
  }

  // ── 4. MENU ITEM RECOGNITION (Run first to capture dishes) ──
  let quantity = 1;
  if (text.includes('two') || text.includes('rendu') || text.includes(' 2 ') || text.startsWith('2') || text.includes('couple')) quantity = 2;
  else if (text.includes('three') || text.includes('moonu') || text.includes(' 3 ') || text.startsWith('3')) quantity = 3;
  else if (text.includes('four') || text.includes('naalu') || text.includes(' 4 ') || text.startsWith('4')) quantity = 4;

  let person = null;
  if (currentState.group_mode) {
    const personMatch = text.match(/(\w+)\s+wants|for\s+(\w+)/i);
    if (personMatch) person = personMatch[1] || personMatch[2];
  }

  const menuCatalog = [
    { keywords: ['chicken biryani', 'chicken biriyani', 'kozhi biryani'], name: 'Chicken Biryani', price: 220, category: 'biryani', dietary: 'non-veg' },
    { keywords: ['mutton biryani', 'mutton biriyani', 'aatu biryani'], name: 'Mutton Biryani', price: 280, category: 'biryani', dietary: 'non-veg' },
    { keywords: ['paneer butter masala', 'paneer masala', 'paneer butter'], name: 'Paneer Butter Masala', price: 180, category: 'curry', dietary: 'veg' },
    { keywords: ['garlic naan', 'poondu naan'], name: 'Garlic Naan', price: 55, category: 'bread', dietary: 'veg' },
    { keywords: ['butter naan', 'naan', 'nan', 'rotis'], name: 'Butter Naan', price: 45, category: 'bread', dietary: 'veg' },
    { keywords: ['kothu parotta', 'kothu porotta', 'kothu'], name: 'Kothu Parotta', price: 150, category: 'main', dietary: 'non-veg' },
    { keywords: ['thums up', 'thumbs up', 'coke', 'pepsi', 'cold drink', 'soda'], name: 'Thums Up', price: 40, category: 'beverage', dietary: 'veg' },
    { keywords: ['masala chai', 'tea', 'chai'], name: 'Masala Chai', price: 30, category: 'beverage', dietary: 'veg' },
  ];

  let addedItems = [];
  for (const item of menuCatalog) {
    for (const kw of item.keywords) {
      if (text.includes(kw)) {
        if (item.name === 'Butter Naan' && text.includes('garlic naan')) continue;

        const existing = currentState.items.find(i => i.name === item.name && (i.person || null) === person);
        if (existing) {
          existing.quantity += quantity;
        } else {
          const newItem = { name: item.name, price: item.price, category: item.category, quantity };
          if (person) newItem.person = person;
          currentState.items.push(newItem);
        }
        addedItems.push(`${quantity}x ${item.name}`);
        break;
      }
    }
  }

  currentState.total = currentState.items.reduce((s, i) => s + i.price * i.quantity, 0);

  // ── 5. ADDRESS & LANDMARK EXTRACTION ──
  if (text.includes('deliver') || text.includes('address') || text.includes('street') || text.includes('road') || text.includes('nagar') || text.includes('puram')) {
    currentState.delivery_address = transcript;
    const hasLandmark = text.match(/near|opposite|next to|behind|front of/i);
    if (hasLandmark) {
      const match = text.match(/(?:near|opposite|next to|behind|front of)\s+([a-zA-Z0-9\s]+)/i);
      if (match) currentState.landmark = match[1].trim();
    }
  }

  // ── 6. RESPONSE FORMULATION ──
  if (currentState.items.length > 0) {
    currentState.status = 'confirming';
    const itemList = currentState.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
    return {
      response_text: `Super! Got ${itemList} totaling ₹${currentState.total}.${currentState.delivery_address ? ` Delivering to ${currentState.delivery_address}.` : ''} Shall I confirm your order now?`,
      updated_state: currentState,
      detected_language: 'mixed',
    };
  }

  return {
    response_text: "I didn't catch a dish name. We have Chicken Biryani (₹220), Mutton Biryani (₹280), Paneer Masala (₹180), Naan, and Thums Up! What can I get for you?",
    updated_state: currentState,
    detected_language: 'en-IN',
  };
}
