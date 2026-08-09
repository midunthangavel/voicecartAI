import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Phone, PhoneOff, Send, Mic, MicOff, Volume2 } from 'lucide-react';

export default function VoiceSimulator({ wsRef }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [interimText, setInterimText] = useState('');
  const [sessionState, setSessionState] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [latencies, setLatencies] = useState({ stt: 0, dialogue: 0, tts: 0 });
  const [waveformBars, setWaveformBars] = useState(Array(32).fill(4));

  const wsConnection = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const timerRef = useRef(null);
  const transcriptEndRef = useRef(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, interimText]);

  // Call timer
  useEffect(() => {
    if (isConnected) {
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      setCallDuration(0);
    }
    return () => clearInterval(timerRef.current);
  }, [isConnected]);

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ── Connect to voice WebSocket ──
  const startCall = useCallback(async () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/web-stream`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] Connected to voice stream');
        setIsConnected(true);
        wsConnection.current = ws;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'stt_transcript') {
            if (msg.isFinal) {
              setTranscript(prev => [...prev, { role: 'user', text: msg.transcript }]);
              setInterimText('');
            } else {
              setInterimText(msg.transcript);
            }
          } else if (msg.type === 'ai_response') {
            setTranscript(prev => [...prev, { role: 'ai', text: msg.text }]);
            setSessionState(msg.state);
            if (msg.latency_ms) {
              setLatencies(prev => ({ ...prev, dialogue: msg.latency_ms }));
            }

            // Play audio response
            if (msg.audio) {
              playMulawAudio(msg.audio);
            }
          }
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected');
        setIsConnected(false);
        wsConnection.current = null;
        stopMicrophone();
      };

      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
      };
    } catch (err) {
      console.error('[Call] Failed to start:', err);
    }
  }, []);

  const endCall = useCallback(() => {
    if (wsConnection.current) {
      wsConnection.current.send(JSON.stringify({ type: 'end' }));
      wsConnection.current.close();
    }
    stopMicrophone();
    setIsConnected(false);
    setIsMicActive(false);
  }, []);

  // ── Microphone ──
  const startMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      mediaStreamRef.current = stream;

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // Waveform visualization + audio sending
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (e) => {
        // Send audio to server
        if (wsConnection.current?.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = float32ToPcm16(inputData);
          const b64 = arrayBufferToBase64(pcm16.buffer);
          wsConnection.current.send(JSON.stringify({ type: 'audio', data: b64 }));
        }

        // Update waveform
        analyser.getByteFrequencyData(dataArray);
        const bars = Array.from(dataArray).slice(0, 32).map(v => Math.max(4, (v / 255) * 56));
        setWaveformBars(bars);
      };

      setIsMicActive(true);
    } catch (err) {
      console.error('[Mic] Error:', err);
      alert('Microphone access denied. Please allow microphone access in your browser settings.');
    }
  }, []);

  const stopMicrophone = useCallback(() => {
    processorRef.current?.disconnect();
    audioContextRef.current?.close();
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    setIsMicActive(false);
    setWaveformBars(Array(32).fill(4));
  }, []);

  const toggleMic = useCallback(() => {
    if (isMicActive) {
      stopMicrophone();
    } else {
      startMicrophone();
    }
  }, [isMicActive, startMicrophone, stopMicrophone]);

  // ── Text input (testing without mic) ──
  const sendTextMessage = useCallback(() => {
    if (!textInput.trim() || !wsConnection.current) return;
    wsConnection.current.send(JSON.stringify({ type: 'text', text: textInput.trim() }));
    setTranscript(prev => [...prev, { role: 'user', text: textInput.trim() }]);
    setTextInput('');
  }, [textInput]);

  // ── Audio playback ──
  function playMulawAudio(base64Audio) {
    try {
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      // Decode mulaw to PCM
      const pcmSamples = new Float32Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) {
        pcmSamples[i] = mulawDecode(bytes[i]) / 32768.0;
      }

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = ctx.createBuffer(1, pcmSamples.length, 8000);
      buffer.getChannelData(0).set(pcmSamples);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start();

      // AI waveform animation
      const duration = pcmSamples.length / 8000;
      const startTime = Date.now();
      const animate = () => {
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed < duration) {
          const bars = Array(32).fill(0).map((_, i) =>
            Math.max(4, Math.sin(elapsed * 8 + i * 0.5) * 28 + 20 + Math.random() * 8)
          );
          setWaveformBars(bars);
          requestAnimationFrame(animate);
        } else {
          setWaveformBars(Array(32).fill(4));
        }
      };
      animate();
    } catch (err) {
      console.error('[Audio] Playback error:', err);
    }
  }

  const latencyColor = (ms) => ms < 500 ? 'good' : ms < 1000 ? 'okay' : 'slow';

  return (
    <div className="voice-sim-container">
      {/* ── Left: Call Controls + Transcript ── */}
      <div className="voice-panel">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Voice Call Simulator</span>
            {isConnected && (
              <div className="latency-meters">
                <div className="latency-meter">
                  <span className="latency-label">Dialogue</span>
                  <span className={`latency-value ${latencyColor(latencies.dialogue)}`}>
                    {latencies.dialogue}ms
                  </span>
                </div>
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
              <button className={`btn ${isMicActive ? 'btn-primary' : 'btn-ghost'}`} onClick={toggleMic}>
                {isMicActive ? <MicOff size={16} /> : <Mic size={16} />}
                {isMicActive ? 'Mute' : 'Unmute'}
              </button>
            </div>
          )}
        </div>

        {/* Transcript */}
        <div className="card" style={{ flex: 1 }}>
          <div className="card-header">
            <span className="card-title">Conversation</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {transcript.length} messages
            </span>
          </div>

          <div className="transcript-feed">
            {transcript.length === 0 && !isConnected && (
              <div className="empty-state">
                <Volume2 className="empty-state-icon" />
                <h3>No active conversation</h3>
                <p>Start a call to begin the voice ordering experience</p>
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

          {/* Text input fallback + quick testing shortcuts */}
          {isConnected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { label: '🔁 Repeat Last Order', text: 'Repeat my last order' },
                  { label: '📍 Landmark Address', text: 'Deliver to 42 DB Road, near Senthil Hospital' },
                  { label: '🧑‍🤝‍🧑 Group Order', text: 'Karthik wants 1 chicken biryani, Priya wants 1 paneer butter masala' },
                  { label: '⭐ Today\'s Specials', text: 'What is special today?' },
                  { label: '⏰ Schedule Order', text: 'Deliver at 8:30 PM tonight' },
                ].map((chip, idx) => (
                  <button
                    key={idx}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '0.68rem', padding: '3px 8px', borderRadius: '12px', background: 'var(--bg-input)' }}
                    onClick={() => {
                      if (!wsConnection.current) return;
                      wsConnection.current.send(JSON.stringify({ type: 'text', text: chip.text }));
                      setTranscript(prev => [...prev, { role: 'user', text: chip.text }]);
                    }}
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
                  onKeyDown={e => e.key === 'Enter' && sendTextMessage()}
                  placeholder="Type to test (e.g., 'I want one chicken biryani')"
                />
                <button className="btn btn-primary btn-sm" onClick={sendTextMessage}>
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
            <span className="card-title">Order State</span>
            {sessionState?.status && (
              <span className={`slot-status ${sessionState.status}`}>
                {sessionState.status.replace('_', ' ')}
              </span>
            )}
          </div>

          <div className="slot-state">
            {(!sessionState || sessionState.items?.length === 0) ? (
              <div className="empty-state" style={{ padding: '32px 10px' }}>
                <h3>Waiting for items...</h3>
                <p>Speak or type an order to see slot extraction in real time</p>
              </div>
            ) : (
              <>
                {sessionState.items?.map((item, i) => (
                  <div className="slot-item" key={i}>
                    <span className="slot-item-name">{item.quantity}× {item.name}</span>
                    <span className="slot-item-detail">₹{(item.price || 0) * (item.quantity || 1)}</span>
                  </div>
                ))}

                {sessionState.total > 0 && (
                  <div className="slot-item" style={{ fontWeight: 700, marginTop: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                    <span>Total</span>
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
            <span className="card-title">Raw State JSON</span>
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

// ── Utility: Float32 → PCM16 ──
function float32ToPcm16(float32Array) {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return pcm16;
}

// ── Utility: ArrayBuffer → Base64 ──
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ── Utility: Mu-law decode ──
function mulawDecode(mulawByte) {
  const BIAS = 0x84;
  mulawByte = ~mulawByte;
  const sign = (mulawByte & 0x80) ? -1 : 1;
  const exponent = (mulawByte & 0x70) >> 4;
  const mantissa = mulawByte & 0x0F;
  let sample = (mantissa << (exponent + 3)) + (BIAS << exponent) - BIAS;
  return sign * sample;
}
