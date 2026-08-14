/**
 * LLM Provider Adapter — Universal Multi-Provider LLM Router
 * 
 * Supports:
 *   - Groq (Llama 3.3 70B — ultra-fast, <150ms TTFT)
 *   - Gemini (Google AI Studio — reliable fallback)
 *   - OpenRouter (Qwen 2.5 72B — universal fallback)
 * 
 * Auto-fallback cascade: Primary → Gemini → OpenRouter → null (caller handles rule engine)
 * All providers return the same format: { response_text, updated_state, detected_language }
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// ── Provider Configuration ──

const PROVIDERS = {
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    envKey: 'GROQ_API_KEY',
    format: 'openai',
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'qwen/qwen-2.5-72b-instruct:free',
    envKey: 'OPENROUTER_API_KEY',
    format: 'openai',
    extraHeaders: {
      'HTTP-Referer': 'https://voicecart.ai',
      'X-Title': 'VoiceCart AI',
    },
  },
  gemini: {
    name: 'Gemini',
    models: ['gemini-2.0-flash', 'gemini-1.5-flash-latest'],
    envKey: 'GEMINI_API_KEY',
    format: 'gemini',
  },
};

// ── Fallback Cascade Order ──

function getFallbackChain() {
  const primary = process.env.AI_LLM_PROVIDER || 'gemini';
  const allProviders = ['groq', 'gemini', 'openrouter'];
  // Put primary first, then the rest in order
  const chain = [primary, ...allProviders.filter(p => p !== primary)];
  // Filter to only providers with API keys configured
  return chain.filter(p => {
    const config = PROVIDERS[p];
    return config && process.env[config.envKey];
  });
}

// ── OpenAI-Compatible API Call (Groq, OpenRouter) ──

async function callOpenAiCompatible(provider, systemPrompt, messages) {
  const config = PROVIDERS[provider];
  const apiKey = process.env[config.envKey];
  if (!apiKey) throw new Error(`${config.name} API key not configured`);

  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    temperature: 0.7,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    ...(config.extraHeaders || {}),
  };

  const startTime = Date.now();

  const response = await fetch(config.baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000), // 15s timeout
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'No body');
    throw new Error(`${config.name} API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const latency = Date.now() - startTime;
  const content = data.choices?.[0]?.message?.content;

  if (!content) throw new Error(`${config.name} returned empty content`);

  console.log(`[LLM] ${config.name} responded in ${latency}ms (model: ${data.model || config.model})`);

  return { content, latency, provider: config.name, model: data.model || config.model };
}

// ── Gemini SDK Call ──

let geminiInstance = null;

async function callGemini(systemPrompt, messages) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key not configured');

  if (!geminiInstance) {
    geminiInstance = new GoogleGenerativeAI(apiKey);
  }

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const startTime = Date.now();
  let result = null;

  for (const modelName of PROVIDERS.gemini.models) {
    try {
      const model = geminiInstance.getGenerativeModel({ model: modelName });
      result = await model.generateContent({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
      });
      if (result) {
        const latency = Date.now() - startTime;
        const content = result.response.text();
        console.log(`[LLM] Gemini responded in ${latency}ms (model: ${modelName})`);
        return { content, latency, provider: 'Gemini', model: modelName };
      }
    } catch (err) {
      console.warn(`[LLM] Gemini model ${modelName} failed:`, err.message);
      // Try next model
    }
  }

  throw new Error('All Gemini models failed');
}

// ── Parse & Validate LLM Response JSON (Step 21 & Step 8) ──

const ALLOWED_ACTIONS = new Set([
  'ADD_ITEM', 'REMOVE_ITEM', 'CLEAR_ITEMS', 'SET_ADDRESS',
  'SET_LANDMARK', 'REQUEST_CONFIRMATION', 'CONFIRM_ORDER',
  'CANCEL_ORDER', 'GREETING', 'REQUEST_HUMAN'
]);

function parseLlmResponse(content) {
  // 1. Strip markdown code fences if present
  const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`LLM output is not valid JSON: ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('LLM output must be a JSON object');
  }

  // 2. Strict Schema Validation
  const validated = {
    response_text: typeof parsed.response_text === 'string' && parsed.response_text.trim()
      ? parsed.response_text.trim()
      : 'Vanakkam! How can I help you today?',
    proposed_action: typeof parsed.proposed_action === 'string' && ALLOWED_ACTIONS.has(parsed.proposed_action.toUpperCase())
      ? parsed.proposed_action.toUpperCase()
      : null,
    items: [],
    delivery_address: typeof parsed.delivery_address === 'string' && parsed.delivery_address.trim() && parsed.delivery_address !== 'null'
      ? parsed.delivery_address.trim()
      : null,
    landmark: typeof parsed.landmark === 'string' && parsed.landmark.trim() && parsed.landmark !== 'null'
      ? parsed.landmark.trim()
      : null,
    detected_language: typeof parsed.detected_language === 'string'
      ? parsed.detected_language
      : 'mixed',
  };

  // Validate items array — NEVER allow LLM to invent authoritative prices
  const rawItems = Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed.updated_state?.items) ? parsed.updated_state.items : []);
  for (const item of rawItems) {
    if (item && typeof item === 'object' && item.name && typeof item.name === 'string') {
      validated.items.push({
        name: item.name.trim(),
        quantity: Math.max(1, Math.min(20, parseInt(item.quantity, 10) || 1)),
      });
    }
  }

  return validated;
}

// ── Main Export: Call LLM with Auto-Fallback ──

/**
 * Call the LLM with automatic provider fallback.
 * 
 * @param {string} systemPrompt - The system prompt with menu, caller context, etc.
 * @param {Array} messages - Conversation history in OpenAI format [{role, content}]
 * @returns {Object|null} - Parsed response { response_text, updated_state, detected_language, provider, latency_ms } or null if all fail
 */
export async function callLlm(systemPrompt, messages) {
  const chain = getFallbackChain();

  if (chain.length === 0) {
    console.warn('[LLM] No LLM providers configured. Falling back to rule engine.');
    return null;
  }

  for (const providerKey of chain) {
    try {
      let raw;

      if (PROVIDERS[providerKey].format === 'gemini') {
        raw = await callGemini(systemPrompt, messages);
      } else {
        raw = await callOpenAiCompatible(providerKey, systemPrompt, messages);
      }

      const parsed = parseLlmResponse(raw.content);

      return {
        response_text: parsed.response_text,
        updated_state: parsed.updated_state,
        detected_language: parsed.detected_language || 'mixed',
        provider: raw.provider,
        model: raw.model,
        latency_ms: raw.latency,
      };
    } catch (err) {
      console.warn(`[LLM] ${PROVIDERS[providerKey]?.name || providerKey} failed: ${err.message}`);
      // Continue to next provider in chain
    }
  }

  console.error('[LLM] All providers exhausted. Falling back to rule engine.');
  return null;
}

/**
 * Get the current provider configuration status.
 * @returns {Object} - Status of each configured provider
 */
export function getProviderStatus() {
  const status = {};
  for (const [key, config] of Object.entries(PROVIDERS)) {
    status[key] = {
      name: config.name,
      configured: !!process.env[config.envKey],
      model: config.model || config.models?.[0] || 'N/A',
    };
  }
  return {
    primary: process.env.AI_LLM_PROVIDER || 'gemini',
    providers: status,
    fallback_chain: getFallbackChain(),
  };
}
