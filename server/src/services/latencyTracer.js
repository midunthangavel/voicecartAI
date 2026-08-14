import { dbRun, dbAll, dbGet } from '../db.js';
import { logger } from '../utils/logger.js';

const activeTraces = new Map();

/**
 * Voice Turn Latency Profiler & Metrics Engine
 * 
 * Tracks end-to-end millisecond breakdowns across VAD, STT, LLM, and TTS pipelines.
 */

export function startTurnTrace(sessionId, turnNumber = 1) {
  const trace = {
    sessionId,
    turnNumber,
    startTime: Date.now(),
    stages: {
      vad_ms: 0,
      stt_ms: 0,
      llm_ms: 0,
      tts_ms: 0,
    },
    metadata: {},
  };
  activeTraces.set(sessionId, trace);
  return trace;
}

export function recordTurnStage(sessionId, stageName, durationMs, metadata = {}) {
  const trace = activeTraces.get(sessionId);
  if (!trace) return;

  if (trace.stages[stageName] !== undefined) {
    trace.stages[stageName] = Math.round(durationMs);
  }
  Object.assign(trace.metadata, metadata);
}

export async function finishTurnTrace(sessionId, callId = null) {
  const trace = activeTraces.get(sessionId);
  if (!trace) return null;

  const { vad_ms, stt_ms, llm_ms, tts_ms } = trace.stages;
  const measuredMs = Date.now() - trace.startTime;
  const stageSumMs = vad_ms + stt_ms + llm_ms + tts_ms;
  const totalMs = Math.max(measuredMs, stageSumMs);

  const record = {
    sessionId,
    callId,
    turnNumber: trace.turnNumber,
    vadMs: vad_ms,
    sttMs: stt_ms,
    llmMs: llm_ms,
    ttsMs: tts_ms,
    totalMs,
    provider: trace.metadata.provider || 'unknown',
    providerTts: trace.metadata.providerTts || 'unknown',
    language: trace.metadata.language || 'en-IN',
  };

  logger.voiceTurn(record);

  // Persist metrics asynchronously
  try {
    await dbRun(
      `INSERT INTO turn_metrics (
         call_id, session_id, turn_number, vad_ms, stt_ms, llm_ms, tts_ms, total_ms, provider_llm, provider_tts, language
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        callId,
        sessionId,
        trace.turnNumber,
        vad_ms,
        stt_ms,
        llm_ms,
        tts_ms,
        totalMs,
        trace.metadata.provider || 'gemini',
        trace.metadata.providerTts || 'sarvam',
        trace.metadata.language || 'en-IN',
      ]
    );
  } catch (err) {
    logger.warn('[LatencyTracer] Failed to persist turn metrics:', { error: err.message });
  }

  activeTraces.delete(sessionId);
  return record;
}

/**
 * Query aggregate latency percentiles (P50, P90, P95, P99)
 */
export async function getLatencyAnalytics(limit = 100) {
  const rows = await dbAll(
    'SELECT * FROM turn_metrics ORDER BY created_at DESC LIMIT ?',
    [limit]
  );

  if (rows.length === 0) {
    return {
      count: 0,
      avg_total_ms: 0,
      avg_stt_ms: 0,
      avg_llm_ms: 0,
      avg_tts_ms: 0,
      p50_ms: 0,
      p95_ms: 0,
      p99_ms: 0,
    };
  }

  const totals = rows.map(r => r.total_ms).sort((a, b) => a - b);
  const p50 = totals[Math.floor(totals.length * 0.50)] || 0;
  const p95 = totals[Math.floor(totals.length * 0.95)] || 0;
  const p99 = totals[Math.floor(totals.length * 0.99)] || 0;

  const avg = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

  return {
    count: rows.length,
    avg_total_ms: avg(rows.map(r => r.total_ms)),
    avg_stt_ms: avg(rows.map(r => r.stt_ms)),
    avg_llm_ms: avg(rows.map(r => r.llm_ms)),
    avg_tts_ms: avg(rows.map(r => r.tts_ms)),
    p50_ms: p50,
    p95_ms: p95,
    p99_ms: p99,
    recent_turns: rows.slice(0, 10),
  };
}
