import React, { useState, useRef, useEffect } from 'react';
import { Phone, PhoneOff, Send, Mic, MicOff, Volume2, Zap } from 'lucide-react';
import { useVoiceSimulator } from '../hooks/useVoiceSimulator.js';

export default function VoiceSimulator() {
  const {
    isConnected,
    isMicActive,
    transcript,
    interimText,
    sessionState,
    callDuration,
    latencies,
    waveformBars,
    startCall,
    endCall,
    toggleMicrophone,
    sendTextMessage,
  } = useVoiceSimulator();

  const [textInput, setTextInput] = useState('');
  const transcriptEndRef = useRef(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, interimText]);

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSendText = () => {
    if (!textInput.trim()) return;
    sendTextMessage(textInput);
    setTextInput('');
  };

  const latencyColor = (ms) => (ms < 500 ? 'good' : ms < 1000 ? 'okay' : 'slow');

  return (
    <div className="voice-sim-container">
      {/* ── Left: Call Controls + Transcript ── */}
      <div className="voice-panel">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Voice Call Simulator</span>
            {isConnected && (
              <div className="latency-meters" style={{ display: 'flex', gap: '8px' }}>
                <div className="latency-meter">
                  <span className="latency-label">Inference</span>
                  <span className={`latency-value ${latencyColor(latencies.dialogue)}`}>
                    {latencies.dialogue}ms
                  </span>
                </div>
                {latencies.total > 0 && (
                  <div className="latency-meter">
                    <span className="latency-label">Turn Total</span>
                    <span className={`latency-value ${latencyColor(latencies.total)}`}>
                      {latencies.total}ms
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="call-button-area">
            <button
              className={`call-button ${isConnected ? 'active' : 'idle'}`}
              onClick={isConnected ? endCall : startCall}
            >
              {isConnected ? <PhoneOff size={32} color="white" /> : <Phone size={32} color="white" />}
            </button>
            <span className="call-status-text">
              {isConnected ? 'Call Active' : 'Tap to Start Call'}
            </span>
            {isConnected && <span className="call-timer">{formatDuration(callDuration)}</span>}
          </div>

          {/* Waveform */}
          {isConnected && (
            <div className="waveform-container">
              {waveformBars.map((h, i) => (
                <div
                  key={i}
                  className={`waveform-bar ${isMicActive ? 'user' : 'ai'}`}
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
          )}

          {/* Mic toggle */}
          {isConnected && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', padding: '8px' }}>
              <button className={`btn ${isMicActive ? 'btn-primary' : 'btn-ghost'}`} onClick={toggleMicrophone}>
                {isMicActive ? <MicOff size={16} /> : <Mic size={16} />}
                {isMicActive ? 'Mute Mic' : 'Unmute Mic'}
              </button>
            </div>
          )}
        </div>

        {/* Transcript */}
        <div className="card" style={{ flex: 1 }}>
          <div className="card-header">
            <span className="card-title">Conversation</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {transcript.length} turns
            </span>
          </div>

          <div className="transcript-feed">
            {transcript.length === 0 && !isConnected && (
              <div className="empty-state">
                <Volume2 className="empty-state-icon" />
                <h3>No active conversation</h3>
                <p>Start a call to begin the bilingual Tamil/English voice ordering experience</p>
              </div>
            )}

            {transcript.map((msg, i) => (
              <div key={i} className="transcript-message">
                <div className={`transcript-avatar ${msg.role === 'user' ? 'user' : 'ai'}`}>
                  {msg.role === 'user' ? '🎤' : '🤖'}
                </div>
                <div className={`transcript-bubble ${msg.role === 'user' ? 'user' : 'ai'}`}>
                  {msg.text}
                </div>
              </div>
            ))}

            {interimText && (
              <div className="transcript-message">
                <div className="transcript-avatar user">🎤</div>
                <div className="transcript-bubble user transcript-interim">{interimText}...</div>
              </div>
            )}

            <div ref={transcriptEndRef} />
          </div>

          {/* Quick testing shortcuts + text input */}
          {isConnected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { label: '🍗 2 Chicken Biryani', text: 'I want 2 chicken biryani' },
                  { label: '📍 DB Road RS Puram', text: 'Deliver to 42 DB Road, RS Puram' },
                  { label: '✅ Yes Confirm', text: 'Yes confirm the order' },
                  { label: '⭐ Specials Today', text: 'What is special today?' },
                  { label: '🔁 Repeat Order', text: 'Repeat my last order' },
                ].map((chip, idx) => (
                  <button
                    key={idx}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '0.68rem', padding: '3px 8px', borderRadius: '12px', background: 'var(--bg-input)' }}
                    onClick={() => sendTextMessage(chip.text)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <div className="text-input-area">
                <input
                  className="text-input"
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendText()}
                  placeholder="Type to test (e.g., 'I want 2 chicken biryani and 2 butter naan')"
                />
                <button className="btn btn-primary btn-sm" onClick={handleSendText}>
                  <Send size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: State Inspector ── */}
      <div className="voice-panel">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Order State (Authoritative Cart)</span>
            {sessionState?.status && (
              <span className={`slot-status ${sessionState.status}`}>
                {sessionState.status.replace('_', ' ')}
              </span>
            )}
          </div>

          <div className="slot-state">
            {(!sessionState || sessionState.items?.length === 0) ? (
              <div className="empty-state" style={{ padding: '32px 10px' }}>
                <h3>Waiting for food items...</h3>
                <p>Speak or type an order to see deterministic pricing and slot extraction</p>
              </div>
            ) : (
              <>
                {sessionState.items?.map((item, i) => (
                  <div className="slot-item" key={i}>
                    <span className="slot-item-name">{item.quantity}× {item.name || item.item_name_snapshot}</span>
                    <span className="slot-item-detail">₹{(item.price || item.unit_price_snapshot || 0) * (item.quantity || 1)}</span>
                  </div>
                ))}

                {sessionState.total > 0 && (
                  <div className="slot-item" style={{ fontWeight: 700, marginTop: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                    <span>Total (incl. 5% GST)</span>
                    <span style={{ color: 'var(--accent-emerald)', fontSize: '1.1rem' }}>₹{sessionState.total}</span>
                  </div>
                )}

                {sessionState.delivery_address && (
                  <div className="slot-item" style={{ marginTop: '8px' }}>
                    <span className="slot-item-name">📍 Delivery</span>
                    <span className="slot-item-detail">{sessionState.delivery_address}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* JSON Inspector */}
        <div className="card" style={{ flex: 1 }}>
          <div className="card-header">
            <span className="card-title">State Machine Inspector</span>
          </div>
          <pre style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            lineHeight: 1.6,
            maxHeight: '300px',
            overflowY: 'auto',
            padding: '8px',
            background: 'var(--bg-input)',
            borderRadius: 'var(--radius-md)',
          }}>
            {JSON.stringify(sessionState || { status: 'idle' }, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
