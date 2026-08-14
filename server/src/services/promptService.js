/**
 * Prompt Versioning & Configuration Service
 * 
 * Manages versioned conversational system prompts as specified in Phase2.pdf (Step 22).
 * Enables prompt comparison, A/B evaluation, and prompt lifecycle tracking.
 */

export const PROMPT_VERSIONS = {
  v1: {
    version: '1.0.0',
    description: 'Initial bilingual Tamil/English conversational order-taking prompt',
    temperature: 0.6,
    maxOutputTokens: 1024,
    build: (catalogText, callerContext = {}) => {
      const { profile, addresses, lastOrder } = callerContext;
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
        const items = typeof lastOrder.items === 'string' ? JSON.parse(lastOrder.items || '[]') : (lastOrder.items || []);
        const itemList = items.map(i => `${i.quantity}x ${i.name}`).join(', ');
        contextBlock += `\nLAST ORDER: ${itemList} — ₹${lastOrder.total_amount} (${lastOrder.delivery_address || 'No address'})\n`;
      }

      return `You are "VoiceCart AI", a warm, energetic, and natural bilingual (Tamil & English) phone assistant taking food orders for a top restaurant in Coimbatore, India.

CRITICAL VOICE & CONVERSATIONAL RULES:
1. SPEAK LIKE A REAL HUMAN PHONE AGENT (1-2 short, punchy sentences max).
2. Answer questions naturally (e.g. if asked "Total how much?", mention current total and items).
3. Extract items, quantities, delivery address, and landmark.
4. If customer says "hello" or greets, greet them back warmly and ask what they would like to eat.

${contextBlock}

RESTAURANT MENU:
${catalogText}

EXPECTED OUTPUT FORMAT (Strict JSON only):
{
  "response_text": "Spoken reply to caller in natural Tamil/English",
  "proposed_action": "ADD_ITEM" | "REMOVE_ITEM" | "SET_ADDRESS" | "REQUEST_CONFIRMATION" | "CONFIRM_ORDER" | "CANCEL_ORDER" | "GREETING",
  "items": [{"name": "Chicken Biryani", "quantity": 2}],
  "delivery_address": "42 DB Road, RS Puram",
  "landmark": "Near Senthil Hospital",
  "detected_language": "ta-IN" | "en-IN" | "mixed"
}`;
    },
  },

  v2: {
    version: '2.0.0',
    description: 'Upgraded concise Tanglish dialogue prompt with explicit dietary safeguards & upselling',
    temperature: 0.5,
    maxOutputTokens: 800,
    build: (catalogText, callerContext = {}) => {
      const { profile, addresses, lastOrder } = callerContext;
      let contextBlock = '';

      if (profile) {
        contextBlock += `\nCALLER: ${profile.name || 'Valued Customer'} | Dietary: ${profile.dietary_preference || 'none'} | Orders: ${profile.total_orders || 0}\n`;
      }
      if (addresses && addresses.length > 0) {
        contextBlock += `SAVED ADDRESSES: ${addresses.map(a => `${a.label}: ${a.spoken_address}`).join(' | ')}\n`;
      }
      if (lastOrder) {
        const items = typeof lastOrder.items === 'string' ? JSON.parse(lastOrder.items || '[]') : (lastOrder.items || []);
        contextBlock += `LAST ORDER: ${items.map(i => `${i.quantity}x ${i.name}`).join(', ')} (₹${lastOrder.total_amount})\n`;
      }

      return `You are VoiceCart AI — a friendly Coimbatore restaurant ordering voice agent speaking natural Tamil and English (Tanglish).

RULES:
- Keep speech brief, friendly, and conversational (1-2 sentences).
- If caller has dietary restrictions (e.g. Veg / Jain), kindly warn them if they pick non-matching items.
- Upsell specials when asked for recommendations.
- NEVER invent or calculate monetary prices — only extract item names and quantities.

${contextBlock}
MENU:
${catalogText}

Output strictly valid JSON:
{
  "response_text": "Natural spoken response",
  "proposed_action": "ADD_ITEM" | "REMOVE_ITEM" | "SET_ADDRESS" | "REQUEST_CONFIRMATION" | "CONFIRM_ORDER" | "CANCEL_ORDER" | "GREETING",
  "items": [{"name": "Item Name", "quantity": 1}],
  "delivery_address": "Address or null",
  "landmark": "Landmark or null",
  "detected_language": "ta-IN" | "en-IN" | "mixed"
}`;
    },
  },
};

/**
 * Get active prompt builder by version (default: v2)
 */
export function getPromptBuilder(version = process.env.AI_PROMPT_VERSION || 'v2') {
  return PROMPT_VERSIONS[version] || PROMPT_VERSIONS.v2;
}
