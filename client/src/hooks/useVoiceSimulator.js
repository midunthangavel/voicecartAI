import { useState, useRef, useEffect, useCallback } from 'react';

const isLocal = typeof window !== 'undefined' &&
  (['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.hostname.startsWith('10.'));

/**
 * Custom Hook: Voice Call Simulator & Audio Streaming
 * 
 * Manages Web Audio API microphone capture, WebSocket streaming to /web-stream,
 * audio playback queue, speech state, and real-time turn latency metrics.
 */
export function useVoiceSimulator() {
  const [isConnected, setIsConnected] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [interimText, setInterimText] = useState('');
  const [sessionState, setSessionState] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [latencies, setLatencies] = useState({ stt: 0, dialogue: 0, tts: 0, total: 0 });
  const [waveformBars, setWaveformBars] = useState(Array(32).fill(4));

  const wsConnection = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const timerRef = useRef(null);

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

  // Decode and play Mu-law audio
  const playMulawAudio = useCallback((base64Data, fallbackText) => {
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 8000 });

      // Mu-law to Linear PCM decoding table
      const pcmSamples = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        let u = ~bytes[i];
        let sign = (u & 0x80) ? -1 : 1;
        let exponent = (u >> 4) & 0x07;
        let mantissa = u & 0x0F;
        let sample = (mantissa << (exponent + 3)) + (1 << (exponent + 2)) - 132;
        pcmSamples[i] = (sign * sample) / 32768.0;
      }

      const audioBuffer = ctx.createBuffer(1, len, 8000);
      audioBuffer.copyToChannel(pcmSamples, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start();
    } catch {
      if (fallbackText && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(fallbackText);
        utterance.lang = 'en-IN';
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
      }
    }
  }, []);

  // Stop microphone
  const stopMicrophone = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsMicActive(false);
    setWaveformBars(Array(32).fill(4));
  }, []);

  // Start microphone
  const startMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!wsConnection.current || wsConnection.current.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        let sum = 0;

        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          sum += Math.abs(s);
        }

        const avgVolume = sum / inputData.length;
        setWaveformBars(Array.from({ length: 32 }, () => Math.max(4, Math.min(48, Math.floor(avgVolume * 250 * (0.6 + Math.random() * 0.8))))));

        const base64Chunk = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
        wsConnection.current.send(JSON.stringify({
          type: 'audio',
          audio: base64Chunk,
        }));
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
      setIsMicActive(true);
    } catch (err) {
      console.error('[Mic] Error accessing microphone:', err);
    }
  }, []);

  // Start Voice Call
  const startCall = useCallback(async () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const backendHost = isLocal ? window.location.host : 'voicecartai.onrender.com';
      const wsUrl = `${protocol}//${backendHost}/web-stream`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        wsConnection.current = ws;
        ws.send(JSON.stringify({ type: 'start' }));
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
              setLatencies(prev => ({
                ...prev,
                dialogue: msg.latency_ms,
                total: (prev.stt || 0) + msg.latency_ms + (prev.tts || 0),
              }));
            }

            if (msg.audio) {
              playMulawAudio(msg.audio, msg.text);
            } else if (msg.text && 'speechSynthesis' in window) {
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance(msg.text);
              utterance.lang = 'en-IN';
              utterance.rate = 0.95;
              window.speechSynthesis.speak(utterance);
            }
          } else if (msg.type === 'tts_complete') {
            if (msg.latency_ms) {
              setLatencies(prev => ({ ...prev, tts: msg.latency_ms }));
            }
          }
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      ws.onclose = () => {
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
  }, [playMulawAudio, stopMicrophone]);

  const endCall = useCallback(() => {
    if (wsConnection.current) {
      wsConnection.current.send(JSON.stringify({ type: 'end' }));
      wsConnection.current.close();
    }
    stopMicrophone();
    setIsConnected(false);
  }, [stopMicrophone]);

  const toggleMicrophone = useCallback(() => {
    if (isMicActive) {
      stopMicrophone();
    } else {
      startMicrophone();
    }
  }, [isMicActive, startMicrophone, stopMicrophone]);

  const sendTextMessage = useCallback((text) => {
    if (!text || !text.trim() || !wsConnection.current) return;
    const cleanText = text.trim();
    setTranscript(prev => [...prev, { role: 'user', text: cleanText }]);
    wsConnection.current.send(JSON.stringify({ type: 'text', text: cleanText }));
  }, []);

  return {
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
  };
}

export default useVoiceSimulator;
