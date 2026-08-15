import { dbRun, dbGet } from '../db.js';
import { logger } from '../utils/logger.js';

// Rates per 1,000 tokens in INR
const MODEL_RATES_INR = {
  'llama-3.3-70b-versatile': 0.05,
  'gemini-1.5-flash': 0.015,
  'qwen-2.5-72b-instruct': 0.04,
  'whisper-large-v3': 0.02,
  'sarvam-bulbul-v1': 0.03,
};

/**
 * Record AI inference tokens and calculate estimated cost
 */
export async function trackAiUsage({
  tenant_id = 't_annapoorna',
  restaurant_id = 'r_coimbatore_01',
  call_id = null,
  provider = 'groq',
  model = 'llama-3.3-70b-versatile',
  prompt_tokens = 0,
  completion_tokens = 0,
  latency_ms = 0,
}) {
  const total_tokens = prompt_tokens + completion_tokens;
  const rate = MODEL_RATES_INR[model] || 0.03;
  const estimated_cost_inr = (total_tokens / 1000) * rate;

  try {
    await dbRun(
      `INSERT INTO ai_usage_logs (
         tenant_id, restaurant_id, call_id, provider, model,
         prompt_tokens, completion_tokens, total_tokens, estimated_cost_inr, latency_ms
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenant_id,
        restaurant_id,
        call_id,
        provider,
        model,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        estimated_cost_inr,
        latency_ms,
      ]
    );
  } catch (err) {
    logger.warn('[AiCostTracker] Failed to record token usage:', err.message);
  }

  return { total_tokens, estimated_cost_inr };
}

/**
 * Get aggregated daily AI spend for a tenant
 */
export async function getTenantDailyAiSpend(tenantId = 't_annapoorna') {
  const row = await dbGet(
    `SELECT 
       COUNT(*) as total_requests,
       COALESCE(SUM(total_tokens), 0) as total_tokens,
       COALESCE(SUM(estimated_cost_inr), 0) as total_cost_inr,
       COALESCE(AVG(latency_ms), 0) as avg_latency_ms
     FROM ai_usage_logs
     WHERE tenant_id = ? AND date(created_at) = date('now')`,
    [tenantId]
  );

  return {
    tenant_id: tenantId,
    total_requests: row?.total_requests || 0,
    total_tokens: row?.total_tokens || 0,
    total_cost_inr: Math.round((row?.total_cost_inr || 0) * 100) / 100,
    avg_latency_ms: Math.round(row?.avg_latency_ms || 0),
    daily_budget_inr: 1000.0,
    budget_used_percent: Math.min(Math.round(((row?.total_cost_inr || 0) / 1000.0) * 100), 100),
  };
}
