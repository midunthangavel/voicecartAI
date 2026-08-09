/**
 * Dialogue Manager — Hyper-Natural Bilingual Voice Assistant Engine (v2)
 * 
 * Handles real-time human conversation, slot filling, contextual modifications,
 * natural Tamil/English code-switching, upselling suggestions, and address capture.
 * 
 * v2 Additions:
 *   - Returning Caller Fast-Path ("Repeat Last Order")
 *   - Landmark Prompting & Geocoding Integration
 *   - Dietary & Religious Safeguards (Jain / Halal / Veg)
 *   - Group Order Multi-person Sub-carts
 *   - Scheduled Future Delivery Time Extraction
 *   - Audio-Menu Discovery (Daily Specials)
 * 
 * Uses Gemini Flash API with an extensive rule-based conversational engine fallback.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { dbAll, dbGet, getSavedAddresses, getCustomerProfile, getLastOrderForPhone } from '../db.js';

let genAI = null;
let currentKey = null;

function getGeminiModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'your_gemini_api_key_here') return null;
  if (!genAI || currentKey !== key) {
    try {
      genAI = new GoogleGenerativeAI(key);
      currentKey = key;
    } catch {
      genAI = null;
    }
  }
  return genAI;
}

/**
 * Load restaurant catalog context from DB
 */
async function loadCatalogContext() {
  try {
    const items = await dbAll(`
      SELECT name, name_tamil, category, price, variants, dietary_tags, is_special 
      FROM catalog WHERE available = 1 
      ORDER BY category, name
    `);
    return items.map(i => 
      `• ${i.name} (${i.name_tamil}) — ₹${i.price} [Category: ${i.category}] Variants: ${i.variants} Dietary: ${i.dietary_tags}${i.is_special ? ' ⭐ TODAY\'S SPECIAL' : ''}`
    ).join('\n');
  } catch {
    return '• Chicken Biryani (சிக்கன் பிரியாணி) — ₹220\n• Mutton Biryani (மட்டன் பிரியாணி) — ₹280\n• Paneer Butter Masala (பன்னீர் பட்டர் மசாலா) — ₹180\n• Butter Naan (பட்டர் நான்) — ₹45';
  }
}

/**
 * Load today's specials from DB
 */
async function loadSpecials() {
  try {
    const specials = await dbAll(`
      SELECT name, name_tamil, price, category FROM catalog
      WHERE available = 1 AND is_special = 1
      ORDER BY category, name LIMIT 5
    `);
    return specials;
  } catch {
    return [];
  }
}

/**
 * Load caller context: profile, saved addresses, and last order
 */
async function loadCallerContext(callerPhone) {
  if (!callerPhone || callerPhone === 'Browser') {
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

/**
 * Enhanced System Prompt for Gemini — Optimized for Spoken Indian Voice Commerce (v2)
 */
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
1. SPEAK LIKE A REAL HUMAN PHONE AGENT:
   - Use short, spoken, conversational sentences (1-2 sentences maximum per turn).
   - Use warm local expressions ("Vanakkam!", "Got it boss!", "Sure thing!", "Sari parotta ready!", "Awesome choice!").
   - Match the caller's code-switching style naturally (Tamil, English, or Tanglish).

2. ORDER HANDLING & CONVERSATIONAL MEMORY:
   - Accurately track items, quantities, spice levels, sizes, and delivery address.
   - Handle modifications gracefully (e.g. "actually change chicken biryani to mutton", "remove the naan", "make it two biryanis").
   - If an order has a Biryani, naturally suggest a drink ("Would you like a cold Thums Up or Masala Chai with that?").
   - If the caller gives a vague item (e.g. "rice", "curry", "parotta"), offer available options concisely.

3. RETURNING CALLER FAST-PATH:
   - If there is a LAST ORDER in the context below, and the caller says "repeat", "same as last time", "usual order", or "mara padiyum", immediately load that order and ask for confirmation.
   - If there is a SAVED ADDRESS, suggest it: "Delivering to your saved address near [landmark]?"

4. ADDRESS & LANDMARK COLLECTION:
   - When collecting a delivery address, if no landmark is mentioned, naturally ask: "To make sure our rider finds you fast, is there a nearby landmark like a hospital, hotel, or shop?"
   - Store the full address + landmark in delivery_address and landmark fields.

5. DIETARY SAFEGUARDS:
   - If the caller has a dietary preference (Jain, Halal, Veg), automatically filter the menu.
   - If they try to order a conflicting item, warn them gently: "Just a heads up — that dish contains [ingredient]. Would you still like it?"

6. GROUP ORDER MODE:
   - If the caller says "ordering for [N] people" or names multiple people, track items per person.
   - In items array, add a "person" field: {"name": "Biryani", "quantity": 1, "person": "Karthik"}.

7. SCHEDULED ORDERS:
   - If the caller says "deliver at 8 PM", "tomorrow lunch", "evening 7:30", extract the scheduled time.
   - Store in updated_state.scheduled_for as an ISO timestamp or natural description.

8. SPECIALS & AUDIO MENU DISCOVERY:
   - If the caller asks "what's special today?", "enna specials irukku?", or "any recommendations?", read out items marked with ⭐ in the menu below.

9. CONFIRMATION & CLOSING:
   - When the caller says "that's all", "nothing else", "confirm", or "done", summarize the complete order items + total price, and ask for final confirmation.
   - Once confirmed, thank them warmly in Tamil/English ("Valga valamudan!", "Thank you so much! SMS payment link sent.").

${contextBlock}

RESTAURANT MENU:
${catalogText}

EXPECTED OUTPUT FORMAT (Strict JSON only, no markdown formatting, no code blocks):
{
  "response_text": "short natural spoken response here",
  "updated_state": {
    "items": [{"name": "Chicken Biryani", "quantity": 2, "variant": {"size": "regular", "spice": "medium"}, "price": 220, "person": null}],
    "delivery_address": "42 DB Road, RS Puram" or null,
    "landmark": "Senthil Hospital" or null,
    "total": 620,
    "scheduled_for": null,
    "status": "greeting" | "collecting_items" | "confirming" | "confirmed" | "cancelled"
  },
  "detected_language": "ta-IN" | "en-IN" | "mixed"
}`;
}

/**
 * Main Dialogue Turn Entry Point
 */
export async function processDialogueTurn(transcript, sessionState, conversationHistory = [], callerPhone = null) {
  const startTime = Date.now();
  const ai = getGeminiModel();

  // Load caller context for returning user features
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
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 512,
              responseMimeType: 'application/json',
            },
          });
          if (result) break;
        } catch {
          // try next model
        }
      }

      if (result) {
        const responseText = result.response.text();
        let parsed;
        try {
          parsed = JSON.parse(responseText);
        } catch {
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        }

        if (parsed?.updated_state) {
          if (parsed.updated_state.items?.length > 0) {
            parsed.updated_state.total = parsed.updated_state.items.reduce(
              (sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0
            );
          }
          parsed.latency_ms = Date.now() - startTime;
          parsed.caller_context = callerContext;
          return parsed;
        }
      }
    } catch (err) {
      console.log('[Dialogue] Gemini API call skipped, using smart dialogue engine:', err.message);
    }
  }

  // ── High-Performance Smart Rule-Based Engine (Fallback) ──
  const result = mockDialogue(transcript, sessionState, callerContext);
  result.latency_ms = Date.now() - startTime;
  return result;
}

/**
 * Hyper-Natural Smart Rule Engine (v2)
 * Features: Fuzzy matching, quantities, modifications, upsells, address + landmark capture,
 *           repeat order, specials discovery, dietary warnings, group orders, scheduled times
 */
function mockDialogue(transcript, state, callerContext = {}) {
  const text = (transcript || '').toLowerCase().trim();
  const currentState = JSON.parse(JSON.stringify(state || { items: [], status: 'greeting' }));

  if (!currentState.items) currentState.items = [];
  if (!currentState.status) currentState.status = 'greeting';

  const { profile, addresses, lastOrder } = callerContext;

  // Random picker helper
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ── 1. GREETING (with returning caller fast-path) ──
  if (currentState.status === 'greeting' && !text) {
    currentState.status = 'collecting_items';

    // Returning caller with last order
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

  // ── 2. REPEAT LAST ORDER ──
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

  // ── 3. SPECIALS / MENU DISCOVERY ──
  if (text.match(/special|specials|recommend|suggestion|enna special|enna irukku|what's good/i)) {
    // Return specials from hardcoded or dynamic catalog
    return {
      response_text: "Today's specials: Our Chicken Biryani and Kothu Parotta are flying off the kitchen! The Chicken Biryani is ₹220 and Kothu Parotta is ₹150. Want to try either?",
      updated_state: currentState,
      detected_language: 'mixed',
    };
  }

  // ── 4. SCHEDULED ORDER TIME EXTRACTION ──
  const timeMatch = text.match(/(?:deliver|order)\s+(?:at|by|for)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)/i)
    || text.match(/tomorrow\s+(\w+)/i)
    || text.match(/evening|tonight|morning|lunch/i);

  if (timeMatch && currentState.items.length > 0) {
    currentState.scheduled_for = transcript; // Store raw, server will parse
    return {
      response_text: `Got it! I'll schedule your order for ${transcript}. Want to confirm your items now?`,
      updated_state: currentState,
      detected_language: 'en-IN',
    };
  }

  // ── 5. GROUP ORDER DETECTION ──
  const groupMatch = text.match(/ordering for (\w+) people|(\w+) persons|group order/i);
  if (groupMatch) {
    currentState.group_mode = true;
    return {
      response_text: "Group order mode! Tell me each person's name and what they'd like, one at a time. For example: 'Karthik wants chicken biryani'.",
      updated_state: currentState,
      detected_language: 'en-IN',
    };
  }

  // ── 6. CONFIRMATION STEP ──
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

  // ── 7. ADDRESS + LANDMARK EXTRACTION ──
  if (text.includes('deliver') || text.includes('address') || text.includes('street') || text.includes('road') || text.includes('nagar') || text.includes('puram')) {
    currentState.delivery_address = transcript;

    // Check if landmark was mentioned
    const hasLandmark = text.match(/near|opposite|next to|behind|front of/i);
    if (!hasLandmark) {
      return {
        response_text: `Got your address: "${transcript}". To make sure our rider finds you fast, is there a nearby landmark like a hospital, hotel, or shop?`,
        updated_state: currentState,
        detected_language: 'en-IN',
      };
    }

    return {
      response_text: `Perfect! Delivering to "${transcript}". Shall I confirm your order now?`,
      updated_state: currentState,
      detected_language: 'en-IN',
    };
  }

  // ── 8. LANDMARK RESPONSE (when we previously asked for a landmark) ──
  if (text.match(/near|opposite|next to|hospital|hotel|shop|school|temple|church|mosque|park|bus stop|junction/i) && currentState.delivery_address && !currentState.landmark) {
    currentState.landmark = transcript;
    return {
      response_text: `Got it! Delivering to ${currentState.delivery_address}, near ${transcript}. Shall I confirm your order?`,
      updated_state: currentState,
      detected_language: 'en-IN',
    };
  }

  // ── 9. ITEM MODIFICATION / DELETION ──
  if (text.includes('remove') || text.includes('delete') || text.includes('cancel biryani') || text.includes('cancel naan')) {
    if (text.includes('biryani')) {
      currentState.items = currentState.items.filter(i => !i.name.toLowerCase().includes('biryani'));
    }
    if (text.includes('naan')) {
      currentState.items = currentState.items.filter(i => !i.name.toLowerCase().includes('naan'));
    }
    if (text.includes('all') || text.includes('everything')) {
      currentState.items = [];
    }
    currentState.total = currentState.items.reduce((s, i) => s + i.price * i.quantity, 0);
    return {
      response_text: "Done, I've updated your cart! What else would you like?",
      updated_state: currentState,
      detected_language: 'en-IN',
    };
  }

  // ── 10. QUANTITY PARSING ──
  let quantity = 1;
  if (text.includes('two') || text.includes('rendu') || text.includes(' 2 ') || text.startsWith('2') || text.includes('couple')) quantity = 2;
  else if (text.includes('three') || text.includes('moonu') || text.includes(' 3 ') || text.startsWith('3')) quantity = 3;
  else if (text.includes('four') || text.includes('naalu') || text.includes(' 4 ') || text.startsWith('4')) quantity = 4;
  else if (text.includes('five') || text.includes('anju') || text.includes(' 5 ') || text.startsWith('5')) quantity = 5;

  // ── 11. PERSON NAME EXTRACTION (for group orders) ──
  let person = null;
  if (currentState.group_mode) {
    const personMatch = text.match(/(\w+)\s+wants|for\s+(\w+)/i);
    if (personMatch) {
      person = personMatch[1] || personMatch[2];
    }
  }

  // ── 12. MENU ITEM RECOGNITION ──
  const menuCatalog = [
    { keywords: ['chicken biryani', 'chicken biriyani', 'kozhi biryani'], name: 'Chicken Biryani', price: 220, category: 'biryani', dietary: 'non-veg' },
    { keywords: ['mutton biryani', 'mutton biriyani', 'aatu biryani'], name: 'Mutton Biryani', price: 280, category: 'biryani', dietary: 'non-veg' },
    { keywords: ['paneer butter masala', 'paneer masala', 'paneer butter'], name: 'Paneer Butter Masala', price: 180, category: 'curry', dietary: 'veg' },
    { keywords: ['garlic naan', 'poondu naan'], name: 'Garlic Naan', price: 55, category: 'bread', dietary: 'veg' },
    { keywords: ['butter naan', 'naan', 'nan', 'rotis'], name: 'Butter Naan', price: 45, category: 'bread', dietary: 'veg' },
    { keywords: ['kothu parotta', 'kothu porotta', 'kothu'], name: 'Kothu Parotta', price: 150, category: 'main', dietary: 'non-veg' },
    { keywords: ['thums up', 'thumbs up', 'coke', 'pepsi', 'cold drink', 'soda'], name: 'Thums Up', price: 40, category: 'beverage', dietary: 'veg' },
    { keywords: ['masala chai', 'tea', 'chai'], name: 'Masala Chai', price: 30, category: 'beverage', dietary: 'veg' },
    { keywords: ['gulab jamun', 'jamun', 'sweet'], name: 'Gulab Jamun', price: 60, category: 'dessert', dietary: 'veg' },
    { keywords: ['chicken 65', 'sixty five'], name: 'Chicken 65', price: 170, category: 'starter', dietary: 'non-veg' },
  ];

  let addedItems = [];
  for (const item of menuCatalog) {
    for (const kw of item.keywords) {
      if (text.includes(kw)) {
        // Prevent duplicate matching (e.g. "naan" matching inside "butter naan")
        if (item.name === 'Butter Naan' && text.includes('garlic naan')) continue;

        // Dietary safeguard check
        if (profile?.dietary_preference && profile.dietary_preference !== 'none') {
          const pref = profile.dietary_preference.toLowerCase();
          if ((pref === 'veg' || pref === 'jain') && item.dietary === 'non-veg') {
            return {
              response_text: `Just a heads up — ${item.name} is non-veg, and your profile says ${profile.dietary_preference}. Would you still like to add it?`,
              updated_state: currentState,
              detected_language: 'en-IN',
            };
          }
        }

        // Check if item already in cart, update quantity if so
        const existing = currentState.items.find(i => i.name === item.name && (i.person || null) === person);
        if (existing) {
          existing.quantity += quantity;
        } else {
          const newItem = {
            name: item.name,
            price: item.price,
            category: item.category,
            quantity: quantity,
            variant: text.includes('spicy') ? { spice: 'spicy' } : {},
          };
          if (person) newItem.person = person;
          currentState.items.push(newItem);
        }
        addedItems.push(`${quantity}x ${item.name}${person ? ` (for ${person})` : ''}`);
        break;
      }
    }
  }

  // Recalculate total
  currentState.total = currentState.items.reduce((s, i) => s + i.price * i.quantity, 0);

  // If items were added
  if (addedItems.length > 0) {
    const summaryStr = addedItems.join(' and ');
    const hasBiryani = currentState.items.some(i => i.category === 'biryani');
    const hasBeverage = currentState.items.some(i => i.category === 'beverage');

    // Natural upsell suggestion
    if (hasBiryani && !hasBeverage) {
      return {
        response_text: `Got it! Added ${summaryStr}. Would you like a chilled Thums Up or Masala Chai to go with that?`,
        updated_state: currentState,
        detected_language: 'mixed',
      };
    }

    return {
      response_text: pick([
        `Added ${summaryStr}! Anything else you'd like to add today?`,
        `Got it, ${summaryStr} added to your order. Would you like anything else?`,
        `Super! Added ${summaryStr}. Should I confirm the order or add something more?`,
      ]),
      updated_state: currentState,
      detected_language: 'mixed',
    };
  }

  // ── 13. CATEGORY ENQUIRIES ──
  if (text.includes('rice') || text.includes('saadham')) {
    return {
      response_text: "We have authentic Chicken Biryani (₹220) and Mutton Biryani (₹280). Which one would you prefer?",
      updated_state: currentState,
      detected_language: 'en-IN',
    };
  }

  if (text.includes('curry') || text.includes('gravy') || text.includes('paneer')) {
    return {
      response_text: "Our Paneer Butter Masala (₹180) is a customer favorite! Shall I add one for you?",
      updated_state: currentState,
      detected_language: 'en-IN',
    };
  }

  if (text.includes('bread') || text.includes('naan') || text.includes('parotta')) {
    return {
      response_text: "We have hot Butter Naan (₹45), Garlic Naan (₹55), and spicy Kothu Parotta (₹150). What sounds good?",
      updated_state: currentState,
      detected_language: 'en-IN',
    };
  }

  if (text.includes('drink') || text.includes('beverage') || text.includes('soda') || text.includes('tea')) {
    return {
      response_text: "We have chilled Thums Up (₹40) and fresh Masala Chai (₹30). Which one can I get you?",
      updated_state: currentState,
      detected_language: 'en-IN',
    };
  }

  // ── 14. "THAT'S ALL" / DONE ──
  if (text.match(/that's all|that is all|nothing else|no more|done|confirm|bas|podhum/i)) {
    if (currentState.items.length > 0) {
      currentState.status = 'confirming';
      const itemList = currentState.items.map(i => `${i.quantity}x ${i.name}${i.person ? ` (${i.person})` : ''}`).join(', ');

      // Check if we need an address
      if (!currentState.delivery_address && addresses?.[0]) {
        currentState.delivery_address = addresses[0].spoken_address;
        currentState.landmark = addresses[0].landmark;
      }

      return {
        response_text: `Perfect! So that's ${itemList}. The total comes to ₹${currentState.total}.${currentState.delivery_address ? ` Delivering to ${currentState.delivery_address}.` : ''} Shall I confirm this order for you?`,
        updated_state: currentState,
        detected_language: 'mixed',
      };
    }
  }

  // ── 15. GREETING FALLBACK ──
  if (text.match(/hi|hello|hey|vanakkam|good evening|good morning/i)) {
    return {
      response_text: pick([
        "Vanakkam! Welcome to VoiceCart. What can I get started for you today?",
        "Hello! Great to hear from you. What would you like to order today?",
      ]),
      updated_state: currentState,
      detected_language: 'mixed',
    };
  }

  // ── 16. GENERAL FALLBACK ──
  return {
    response_text: pick([
      "I didn't quite catch that dish name. We have Chicken Biryani, Mutton Biryani, Paneer Butter Masala, Naan, and Kothu Parotta!",
      "Could you repeat that for me? I can add Biryani, Naan, Paneer Masala, drinks, or desserts to your order.",
    ]),
    updated_state: currentState,
    detected_language: 'en-IN',
  };
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
