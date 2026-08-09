import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Sparkles, CheckCircle2, ShoppingBag, ArrowLeft } from 'lucide-react';

export default function MobileCallView() {
  const [callState, setCallState] = useState('idle'); // idle, calling, connected, ended
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [currentCart, setCurrentCart] = useState([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [confirmedOrder, setConfirmedOrder] = useState(null);

  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioCtxRef = useRef(null);
  const timerRef = useRef(null);

  // ── Call Timer ──
  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      if (callState === 'idle') setCallDuration(0);
    }
    return () => clearInterval(timerRef.current);
  }, [callState]);

  const formatTime = (s) => {
    const mins = Math.floor(s / 60).toString().padStart(2, '0');
    const secs = (s % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // ── Start Call ──
  async function startCall() {
    setCallState('calling');
    setTranscript([{ speaker: 'ai', text: 'Connecting to VoiceCart AI server...' }]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/web-stream`);

      ws.onopen = () => {
        setCallState('connected');
        ws.send(JSON.stringify({ type: 'start' }));
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'transcript') {
            setTranscript(prev => [...prev, { speaker: msg.speaker, text: msg.text }]);
          } else if (msg.type === 'order_update' || msg.event === 'order_update') {
            setCurrentCart(msg.items || []);
            setTotalAmount(msg.total || 0);
          } else if (msg.type === 'order_confirmed') {
            setConfirmedOrder(msg.order);
          } else if (msg.type === 'audio' && msg.data) {
            setAiSpeaking(true);
            await playAudioPayload(msg.data);
            setAiSpeaking(false);
          } else if (msg.type === 'stt_transcript') {
            if (msg.isFinal) {
              setTranscript(prev => [...prev, { speaker: 'user', text: msg.transcript }]);
            }
          }
        } catch (e) {
          console.error('[WebStream] Parse error:', e);
        }
      };

      ws.onclose = () => {
        setCallState('ended');
      };

      wsRef.current = ws;

      // ── Media Recorder for Audio Streaming ──
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN && !isMuted) {
          const buffer = await e.data.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
          wsRef.current.send(JSON.stringify({
            type: 'audio',
            data: base64
          }));
        }
      };
      mediaRecorder.start(250);
      mediaRecorderRef.current = mediaRecorder;

    } catch (err) {
      console.error('Microphone error:', err);
      alert('Microphone access is required to make a voice order call.');
      setCallState('idle');
    }
  }

  async function playAudioPayload(base64Payload) {
    try {
      const binary = atob(base64Payload);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);

      const audioBuffer = await audioCtxRef.current.decodeAudioData(bytes.buffer);
      const source = audioCtxRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtxRef.current.destination);
      source.start(0);

      await new Promise(resolve => { source.onended = resolve; });
    } catch (e) {
      console.warn('Audio playback decode error:', e);
    }
  }

  function endCall() {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'end' }));
      wsRef.current.close();
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    setCallState('ended');
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--bg-main)',
      color: 'var(--text-main)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '20px',
      maxWidth: '480px',
      margin: '0 auto',
    }}>
      {/* ── App Header ── */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)'
          }}>
            <Phone size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>VoiceCart AI</h1>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Anbu Biryani House (Free Call)</span>
          </div>
        </div>

        <a href="/" style={{
          padding: '8px 12px', borderRadius: '20px',
          background: 'var(--neu-bg)', border: '1px solid var(--neu-border)',
          color: 'var(--text-main)', textDecoration: 'none', fontSize: '0.8rem',
          display: 'flex', alignItems: 'center', gap: '6px'
        }}>
          <ArrowLeft size={14} /> Dashboard
        </a>
      </header>

      {/* ── Call Screen Area ── */}
      {callState === 'idle' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          gap: '24px'
        }}>
          <div style={{
            width: '120px', height: '120px', borderRadius: '50%',
            background: 'var(--neu-bg)', boxShadow: 'var(--neu-shadow-flat)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid rgba(139, 92, 246, 0.2)'
          }}>
            <Sparkles size={48} color="#8b5cf6" />
          </div>

          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>Free AI Voice Ordering</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '320px', lineHeight: 1.5 }}>
              Tap below to place your food order in <strong>Tamil or English</strong>. No phone call charges!
            </p>
          </div>

          <button onClick={startCall} style={{
            width: '100%', maxWidth: '320px', padding: '16px 24px',
            borderRadius: '16px', border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#fff', fontSize: '1.1rem', fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            boxShadow: '0 8px 24px rgba(16, 185, 129, 0.35)', transition: 'transform 0.2s'
          }}>
            <Phone size={22} /> Start Free Voice Order
          </button>
        </div>
      )}

      {(callState === 'calling' || callState === 'connected') && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', gap: '20px'
        }}>
          {/* Active Call Status Card */}
          <div style={{
            background: 'var(--neu-bg)', borderRadius: '20px', padding: '20px',
            boxShadow: 'var(--neu-shadow-flat)', textAlign: 'center'
          }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '6px 16px', borderRadius: '20px',
              background: callState === 'connected' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: callState === 'connected' ? '#10b981' : '#f59e0b',
              fontWeight: 600, fontSize: '0.85rem', marginBottom: '12px'
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: callState === 'connected' ? '#10b981' : '#f59e0b'
              }} />
              {callState === 'connected' ? `Live Call (${formatTime(callDuration)})` : 'Connecting...'}
            </div>

            <h3 style={{ margin: '4px 0 16px', fontSize: '1.2rem' }}>Anbu Biryani AI Assistant</h3>

            {/* Speaking / Listening Visualizer */}
            <div style={{
              height: '40px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '6px'
            }}>
              {[...Array(9)].map((_, i) => (
                <div key={i} style={{
                  width: '4px',
                  height: aiSpeaking ? `${Math.floor(Math.random() * 28) + 8}px` : '8px',
                  backgroundColor: aiSpeaking ? '#8b5cf6' : '#10b981',
                  borderRadius: '2px',
                  transition: 'height 0.15s ease'
                }} />
              ))}
            </div>
          </div>

          {/* Subtitle / Live Transcript Stream */}
          <div style={{
            flex: 1, background: 'var(--neu-bg)', borderRadius: '20px',
            padding: '16px', boxShadow: 'var(--neu-shadow-inset)',
            overflowY: 'auto', maxHeight: '220px', display: 'flex',
            flexDirection: 'column', gap: '10px'
          }}>
            {transcript.map((t, idx) => (
              <div key={idx} style={{
                alignSelf: t.speaker === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                background: t.speaker === 'user' ? 'var(--accent-gradient)' : 'rgba(255, 255, 255, 0.08)',
                color: t.speaker === 'user' ? '#fff' : 'var(--text-main)',
                padding: '10px 14px', borderRadius: '14px', fontSize: '0.9rem',
                lineHeight: 1.4
              }}>
                <strong>{t.speaker === 'user' ? 'You' : 'VoiceCart AI'}: </strong>
                {t.text}
              </div>
            ))}
          </div>

          {/* Cart Live Preview */}
          {currentCart.length > 0 && (
            <div style={{
              background: 'var(--neu-bg)', borderRadius: '16px', padding: '14px',
              boxShadow: 'var(--neu-shadow-flat)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginBottom: '8px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShoppingBag size={16} color="#8b5cf6" /> Live Sub-Cart
                </span>
                <span style={{ color: '#10b981' }}>₹{totalAmount}</span>
              </div>
              {currentCart.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '2px 0' }}>
                  <span>{item.quantity}× {item.name} {item.person ? `(${item.person})` : ''}</span>
                  <span>₹{item.price * item.quantity}</span>
                </div>
              ))}
            </div>
          )}

          {/* Call Controls */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: 'auto' }}>
            <button onClick={() => setIsMuted(!isMuted)} style={{
              width: '56px', height: '56px', borderRadius: '50%', border: 'none',
              background: isMuted ? '#ef4444' : 'var(--neu-bg)',
              color: isMuted ? '#fff' : 'var(--text-main)',
              boxShadow: 'var(--neu-shadow-flat)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>

            <button onClick={endCall} style={{
              width: '64px', height: '64px', borderRadius: '50%', border: 'none',
              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
              color: '#fff', boxShadow: '0 6px 20px rgba(239, 68, 68, 0.4)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <PhoneOff size={26} />
            </button>
          </div>
        </div>
      )}

      {callState === 'ended' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          gap: '20px'
        }}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.15)', color: '#10b981',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <CheckCircle2 size={44} />
          </div>

          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>Call Finished!</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {confirmedOrder ? `Order #${confirmedOrder.order_id} placed successfully!` : 'Thank you for testing VoiceCart AI.'}
            </p>
          </div>

          <button onClick={() => setCallState('idle')} style={{
            padding: '14px 28px', borderRadius: '14px', border: 'none',
            background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
            color: '#fff', fontSize: '1rem', fontWeight: 600, cursor: 'pointer'
          }}>
            Start Another Order
          </button>
        </div>
      )}
    </div>
  );
}
