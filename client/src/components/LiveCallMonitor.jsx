import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, Clock, Zap, User, Globe } from 'lucide-react';

export default function LiveCallMonitor() {
  const [calls, setCalls] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);

  useEffect(() => {
    fetchCalls();
    fetchSessions();
    const interval = setInterval(() => {
      fetchCalls();
      fetchSessions();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  async function fetchCalls() {
    try {
      const res = await fetch('/api/calls');
      if (res.ok) setCalls(await res.json());
    } catch {}
  }

  async function fetchSessions() {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) setSessions(await res.json());
    } catch {}
  }

  async function fetchCallDetail(id) {
    try {
      const res = await fetch(`/api/calls/${id}`);
      if (res.ok) setSelectedCall(await res.json());
    } catch {}
  }

  const activeSessions = sessions.length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Live Call Monitor</h2>
          <p className="page-subtitle">Real-time voice session tracking and call history</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {activeSessions > 0 && (
            <span className="slot-status confirmed" style={{ fontSize: '0.78rem' }}>
              <div className="status-dot" style={{ width: 6, height: 6 }} />
              {activeSessions} Active
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => { fetchCalls(); fetchSessions(); }}>
            Refresh
          </button>
        </div>
      </div>

      {/* Active Sessions */}
      {sessions.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Active Sessions
          </h3>
          <div className="calls-list">
            {sessions.map(session => (
              <div key={session.id} className="call-card" style={{ borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                <div className="call-card-avatar active">
                  <Phone size={18} />
                </div>
                <div className="call-card-info">
                  <div className="call-card-phone">{session.caller_phone}</div>
                  <div className="call-card-meta">
                    {session.source === 'web' ? '🌐 Browser' : '📞 Twilio'} · {session.transcript?.length || 0} turns
                    {session.state?.items?.length > 0 && ` · ${session.state.items.length} items`}
                  </div>
                </div>
                <span className="call-card-badge active">LIVE</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Call History + Detail Split */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedCall ? '1fr 1fr' : '1fr', gap: '20px' }}>
        {/* Call List */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Call History</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{calls.length} calls</span>
          </div>
          {calls.length === 0 ? (
            <div className="empty-state">
              <Phone className="empty-state-icon" />
              <h3>No calls yet</h3>
              <p>Start a voice session from the simulator to see call history here</p>
            </div>
          ) : (
            <div className="calls-list">
              {calls.map(call => (
                <div
                  key={call.id}
                  className="call-card"
                  onClick={() => fetchCallDetail(call.id)}
                  style={selectedCall?.id === call.id ? { borderColor: 'var(--accent-violet)', background: 'var(--accent-violet-dim)' } : {}}
                >
                  <div className={`call-card-avatar ${call.status === 'active' ? 'active' : 'completed'}`}>
                    {call.status === 'active' ? <Phone size={16} /> : <PhoneOff size={16} />}
                  </div>
                  <div className="call-card-info">
                    <div className="call-card-phone">{call.caller_phone || 'Browser'}</div>
                    <div className="call-card-meta">
                      <Clock size={11} style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
                      {new Date(call.started_at).toLocaleTimeString()} · {call.duration_seconds || 0}s
                      {call.latency_avg_ms > 0 && (
                        <> · <Zap size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> {call.latency_avg_ms}ms</>
                      )}
                    </div>
                  </div>
                  <span className={`call-card-badge ${call.status}`}>{call.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Call Detail */}
        {selectedCall && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Call Detail #{selectedCall.id}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedCall(null)}>Close</button>
            </div>

            {/* Meta */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div className="latency-meter">
                <User size={13} />
                <span className="latency-label">Phone</span>
                <span className="latency-value good">{selectedCall.caller_phone || 'Browser'}</span>
              </div>
              <div className="latency-meter">
                <Globe size={13} />
                <span className="latency-label">Source</span>
                <span className="latency-value good">{selectedCall.source}</span>
              </div>
              <div className="latency-meter">
                <Zap size={13} />
                <span className="latency-label">Avg Latency</span>
                <span className={`latency-value ${selectedCall.latency_avg_ms < 500 ? 'good' : selectedCall.latency_avg_ms < 1000 ? 'okay' : 'slow'}`}>
                  {selectedCall.latency_avg_ms}ms
                </span>
              </div>
            </div>

            {/* Transcript */}
            <h4 style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase' }}>Transcript</h4>
            <div className="transcript-feed" style={{ maxHeight: '350px' }}>
              {(selectedCall.transcript || []).map((msg, i) => (
                <div key={i} className="transcript-message">
                  <div className={`transcript-avatar ${msg.role === 'user' ? 'user' : 'ai'}`}>
                    {msg.role === 'user' ? '🎤' : '🤖'}
                  </div>
                  <div className={`transcript-bubble ${msg.role === 'user' ? 'user' : 'ai'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Event Logs */}
            {selectedCall.logs?.length > 0 && (
              <>
                <h4 style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', margin: '16px 0 10px', textTransform: 'uppercase' }}>Event Log</h4>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {selectedCall.logs.map((log, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', padding: '6px 10px',
                      fontSize: '0.78rem', borderBottom: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}>
                      <span style={{ fontFamily: 'var(--font-mono)', color: log.event_type === 'user_speech' ? 'var(--accent-cyan)' : 'var(--accent-violet)' }}>
                        {log.event_type}
                      </span>
                      <span style={{ color: 'var(--text-muted)', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.content}
                      </span>
                      {log.latency_ms > 0 && (
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-amber)' }}>{log.latency_ms}ms</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
