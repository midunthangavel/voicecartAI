import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, Clock, Zap, User, Globe, RefreshCw, Volume2, Pause } from 'lucide-react';

export default function LiveCallMonitor() {
  const [calls, setCalls] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);
  const [playingAudio, setPlayingAudio] = useState(null);

  useEffect(() => {
    fetchCalls();
    fetchSessions();
    const interval = setInterval(() => {
      fetchCalls();
      fetchSessions();
    }, 4000);
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

  function toggleAudio(callId) {
    if (playingAudio === callId) {
      setPlayingAudio(null);
    } else {
      const audio = new Audio(`/api/calls/${callId}/audio`);
      audio.onended = () => setPlayingAudio(null);
      audio.play().catch(() => {});
      setPlayingAudio(callId);
    }
  }

  const activeSessions = sessions.length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Live Call Monitor & Audio Logs</h2>
          <p className="page-subtitle">Real-time telephony sessions (Exotel/Twilio/Web), turn latency profiler, and audio dispute logs</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {activeSessions > 0 && (
            <span className="slot-status confirmed" style={{ fontSize: '0.78rem' }}>
              <div className="status-dot" style={{ width: 6, height: 6 }} />
              {activeSessions} Active Call{activeSessions > 1 ? 's' : ''}
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => { fetchCalls(); fetchSessions(); }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Active Sessions */}
      {sessions.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Active Live Sessions
          </h3>
          <div className="calls-list">
            {sessions.map(session => (
              <div key={session.id} className="call-card" style={{ borderColor: 'rgba(16, 185, 129, 0.3)', background: 'var(--bg-card)' }}>
                <div className="call-card-avatar active">
                  <Phone size={18} />
                </div>
                <div className="call-card-info" style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="call-card-phone">{session.caller_phone}</span>
                    <span style={{
                      fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px',
                      background: session.source === 'exotel' ? 'rgba(52, 211, 153, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                      color: session.source === 'exotel' ? 'var(--accent-emerald)' : 'var(--accent-cyan)',
                      fontWeight: 600,
                    }}>
                      {session.source === 'exotel' ? '🇮🇳 Exotel (Local)' : session.source === 'web' ? '🌐 Browser' : '📞 Twilio'}
                    </span>
                  </div>
                  <div className="call-card-meta">
                    {session.transcript?.length || 0} turns · Latency avg:{' '}
                    <strong style={{ color: 'var(--accent-emerald)' }}>
                      {session.latencies?.length ? Math.round(session.latencies.reduce((a, b) => a + b, 0) / session.latencies.length) : 0}ms
                    </strong>
                    {session.state?.items?.length > 0 && ` · 🛒 ${session.state.items.length} items`}
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
            <span className="card-title">Call History & Recordings</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{calls.length} calls</span>
          </div>
          {calls.length === 0 ? (
            <div className="empty-state">
              <Phone className="empty-state-icon" />
              <h3>No calls recorded yet</h3>
              <p>Inbound Exotel/Twilio calls or simulated web calls will appear here</p>
            </div>
          ) : (
            <div className="calls-list">
              {calls.map(call => (
                <div
                  key={call.id}
                  className={`call-card ${selectedCall?.id === call.id ? 'selected' : ''}`}
                  onClick={() => fetchCallDetail(call.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={`call-card-avatar ${call.status}`}>
                    <Phone size={16} />
                  </div>
                  <div className="call-card-info" style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="call-card-phone">{call.caller_phone || 'Web Caller'}</span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        {call.source === 'exotel' ? '🇮🇳 Exotel' : call.source === 'web' ? '🌐 Web' : '📞 Twilio'}
                      </span>
                    </div>
                    <div className="call-card-meta">
                      {new Date(call.started_at).toLocaleTimeString()}
                      {call.latency_avg_ms > 0 && ` · ⚡ ${call.latency_avg_ms}ms`}
                    </div>
                  </div>
                  <span className={`call-card-badge ${call.status}`}>{call.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Call Detail */}
        {selectedCall && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Call Detail #{selectedCall.id}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedCall(null)}>✕</button>
            </div>

            <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)', marginBottom: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.75rem' }}>
                <div><strong>Caller:</strong> {selectedCall.caller_phone}</div>
                <div><strong>Source:</strong> {selectedCall.source}</div>
                <div><strong>Status:</strong> {selectedCall.status}</div>
                <div><strong>Avg Latency:</strong> {selectedCall.latency_avg_ms || 0}ms</div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', marginTop: '10px', fontSize: '0.72rem' }}
                onClick={() => toggleAudio(selectedCall.id)}
              >
                {playingAudio === selectedCall.id ? (
                  <><Pause size={12} /> Pause Audio</>
                ) : (
                  <><Volume2 size={12} /> 🎧 Listen to Recording</>
                )}
              </button>
            </div>

            <div className="card-header" style={{ padding: '0 0 8px 0' }}>
              <span className="card-title" style={{ fontSize: '0.8rem' }}>Transcript & Turns</span>
            </div>
            <div className="transcript-feed" style={{ maxHeight: '280px' }}>
              {(typeof selectedCall.transcript === 'string'
                ? JSON.parse(selectedCall.transcript || '[]')
                : (selectedCall.transcript || [])
              ).map((turn, i) => (
                <div key={i} className="transcript-message">
                  <div className={`transcript-avatar ${turn.role === 'user' ? 'user' : 'ai'}`}>
                    {turn.role === 'user' ? '🎤' : '🤖'}
                  </div>
                  <div className={`transcript-bubble ${turn.role === 'user' ? 'user' : 'ai'}`}>
                    {turn.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
