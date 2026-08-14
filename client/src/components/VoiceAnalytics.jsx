import React from 'react';
import { Activity, Clock, Zap, Shield, Cpu, RefreshCw, Layers, CheckCircle2 } from 'lucide-react';
import { useMetrics } from '../hooks/useMetrics.js';

export default function VoiceAnalytics() {
  const {
    latencyStats,
    queueStats,
    auditLogs,
    engineStatus,
    loading,
    refreshMetrics,
  } = useMetrics();

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Observability & Voice Latency Analytics</h2>
          <p className="page-subtitle">P50/P95 millisecond turn latency profiling, background worker queues, and audit trails</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={refreshMetrics}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Telemetry
        </button>
      </div>

      {/* Latency Percentile Cards */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">P50 Turn Latency</span>
            <div className="stat-icon-wrapper" style={{ background: 'rgba(52, 211, 153, 0.15)', color: 'var(--accent-emerald)' }}>
              <Zap size={18} />
            </div>
          </div>
          <div className="stat-value">{latencyStats.p50_ms || 0}<span style={{ fontSize: '0.9rem' }}>ms</span></div>
          <div className="stat-change" style={{ color: 'var(--accent-emerald)' }}>Median turn response time</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">P95 Turn Latency</span>
            <div className="stat-icon-wrapper" style={{ background: 'rgba(56, 189, 248, 0.15)', color: 'var(--accent-cyan)' }}>
              <Clock size={18} />
            </div>
          </div>
          <div className="stat-value">{latencyStats.p95_ms || 0}<span style={{ fontSize: '0.9rem' }}>ms</span></div>
          <div className="stat-change" style={{ color: 'var(--text-muted)' }}>Target budget: &lt; 800ms</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Avg STT / LLM / TTS</span>
            <div className="stat-icon-wrapper" style={{ background: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-violet)' }}>
              <Cpu size={18} />
            </div>
          </div>
          <div className="stat-value" style={{ fontSize: '1.2rem', display: 'flex', gap: '8px' }}>
            <span>{latencyStats.avg_stt_ms || 0}ms</span>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <span>{latencyStats.avg_llm_ms || 0}ms</span>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <span>{latencyStats.avg_tts_ms || 0}ms</span>
          </div>
          <div className="stat-change">Speech ➔ Inference ➔ Audio</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Total Turn Profiles</span>
            <div className="stat-icon-wrapper" style={{ background: 'rgba(251, 146, 60, 0.15)', color: 'var(--accent-amber)' }}>
              <Activity size={18} />
            </div>
          </div>
          <div className="stat-value">{latencyStats.count || 0}</div>
          <div className="stat-change">Sampled turns recorded</div>
        </div>
      </div>

      {/* Background Queues Health */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={16} /> Background Worker Queue Depths
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', padding: '16px' }}>
          {Object.entries(queueStats).map(([queueName, q]) => (
            <div key={queueName} style={{
              background: 'var(--bg-input)', padding: '12px 16px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
            }}>
              <div style={{ textTransform: 'capitalize', fontWeight: 600, fontSize: '0.85rem', marginBottom: '8px' }}>
                {queueName} Queue
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span>Active: <strong style={{ color: 'var(--text-primary)' }}>{q.active}</strong></span>
                <span>Pending: <strong style={{ color: 'var(--text-primary)' }}>{q.pending}</strong></span>
                <span>DLQ: <strong style={{ color: q.dlqCount > 0 ? 'var(--accent-rose)' : 'var(--text-primary)' }}>{q.dlqCount}</strong></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* State Mutation Audit Logs */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={16} /> State Transition Audit Trails
          </span>
        </div>
        {auditLogs.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px' }}>
            <Shield className="empty-state-icon" />
            <p>No audit trail events recorded yet</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px' }}>Timestamp</th>
                  <th style={{ padding: '10px 14px' }}>Action</th>
                  <th style={{ padding: '10px 14px' }}>Resource</th>
                  <th style={{ padding: '10px 14px' }}>Actor</th>
                  <th style={{ padding: '10px 14px' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log, i) => (
                  <tr key={log.id || i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        background: 'rgba(56, 189, 248, 0.15)', color: 'var(--accent-cyan)',
                        padding: '2px 6px', borderRadius: '4px', fontWeight: 600, fontSize: '0.7rem',
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>{log.resource_type} #{log.resource_id}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{log.actor_type} ({log.actor_id})</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {log.after_state?.status ? `Status ➔ ${log.after_state.status}` : JSON.stringify(log.after_state || {})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
