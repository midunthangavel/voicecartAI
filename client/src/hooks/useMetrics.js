import { useState, useEffect, useCallback } from 'react';

const isLocal = typeof window !== 'undefined' &&
  (['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.hostname.startsWith('10.'));
const apiBase = isLocal ? '' : 'https://voicecartai.onrender.com';

/**
 * Custom Hook: Observability, Latency Metrics & Audit Trails
 * 
 * Fetches turn-by-turn latency analytics (P50, P95, P99), queue health,
 * and immutable state transition logs.
 */
export function useMetrics() {
  const [latencyStats, setLatencyStats] = useState({
    count: 0,
    avg_total_ms: 0,
    avg_stt_ms: 0,
    avg_llm_ms: 0,
    avg_tts_ms: 0,
    p50_ms: 0,
    p95_ms: 0,
    p99_ms: 0,
    recent_turns: [],
  });
  const [queueStats, setQueueStats] = useState({
    notifications: { pending: 0, active: 0, dlqCount: 0 },
    dispatch: { pending: 0, active: 0, dlqCount: 0 },
    recordings: { pending: 0, active: 0, dlqCount: 0 },
  });
  const [auditLogs, setAuditLogs] = useState([]);
  const [engineStatus, setEngineStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMetricsData = useCallback(async () => {
    try {
      setLoading(true);
      const [latRes, qRes, audRes, engRes] = await Promise.all([
        fetch(`${apiBase}/api/metrics/latency`),
        fetch(`${apiBase}/api/queues`),
        fetch(`${apiBase}/api/metrics/audit-logs?limit=30`),
        fetch(`${apiBase}/api/engine-status`),
      ]);

      if (latRes.ok) setLatencyStats(await latRes.json());
      if (qRes.ok) setQueueStats(await qRes.json());
      if (audRes.ok) setAuditLogs(await audRes.json());
      if (engRes.ok) setEngineStatus(await engRes.json());
    } catch (err) {
      console.warn('[useMetrics] Fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetricsData();
    const interval = setInterval(fetchMetricsData, 6000);
    return () => clearInterval(interval);
  }, [fetchMetricsData]);

  return {
    latencyStats,
    queueStats,
    auditLogs,
    engineStatus,
    loading,
    refreshMetrics: fetchMetricsData,
  };
}

export default useMetrics;
