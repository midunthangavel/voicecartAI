import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import { socketService } from '../services/voiceSocketService';
import { initAudioSystem, startRecording, stopRecording, speakAiResponse, stopSpeech } from '../services/audioManager';
import { fetchMenuCatalog, pingServerHealth } from '../services/apiService';

const PRODUCTION_SERVER = 'wss://voicecartai.onrender.com/web-stream';
const LOCAL_WIFI_SERVER = 'ws://192.168.0.101:3001/web-stream';
const DEFAULT_SERVER_URL = process.env.EXPO_PUBLIC_WS_URL || LOCAL_WIFI_SERVER;

const VoiceSessionContext = createContext(null);

export function VoiceSessionProvider({ children }) {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [callState, setCallState] = useState('idle'); // 'idle' | 'connecting' | 'active'
  const [transcript, setTranscript] = useState([]);
  const [cartItems, setCartItems] = useState([]);
  const [cartTotal, setCartTotal] = useState(0);
  const [deliveryAddress, setDeliveryAddress] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [latencyMs, setLatencyMs] = useState(0);
  const [activeLanguage, setActiveLanguage] = useState('en-IN'); // 'en-IN' | 'ta-IN'
  const [catalog, setCatalog] = useState([]);
  
  // UI Modal States
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isDTMFOpen, setIsDTMFOpen] = useState(false);
  const [isAddressOpen, setIsAddressOpen] = useState(false);

  const callStartTimeRef = useRef(null);

  // 1. Initialize audio & fetch catalog on mount
  useEffect(() => {
    initAudioSystem();
    fetchMenuCatalog(serverUrl).then(setCatalog);
  }, [serverUrl]);

  // 2. Setup WebSocket event listeners
  useEffect(() => {
    const unsubAiResponse = socketService.on('ai_response', (msg) => {
      console.log('[Context] Received ai_response:', msg.text);

      if (msg.text) {
        setTranscript((prev) => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            speaker: 'ai',
            text: msg.text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            language: msg.language || activeLanguage,
          },
        ]);

        if (msg.state?.items) {
          setCartItems(msg.state.items);
          setCartTotal(msg.state.total || 0);
          if (msg.state.delivery_address) {
            setDeliveryAddress(msg.state.delivery_address);
          }
        }

        if (msg.latency_ms) {
          setLatencyMs(msg.latency_ms);
        }

        // Trigger AI speech output
        speakAiResponse(
          msg.text,
          msg.language || activeLanguage,
          () => setIsAiSpeaking(true),
          () => setIsAiSpeaking(false),
          () => setIsAiSpeaking(false)
        );
      }
    });

    const unsubStt = socketService.on('stt_transcript', (msg) => {
      if (msg.isFinal && msg.transcript) {
        setTranscript((prev) => [
          ...prev,
          {
            id: `user_${Date.now()}`,
            speaker: 'user',
            text: msg.transcript,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            provider: msg.provider,
          },
        ]);
      }
    });

    const unsubOrderConfirmed = socketService.on('order_confirmed', (msg) => {
      setTranscript((prev) => [
        ...prev,
        {
          id: `sys_${Date.now()}`,
          speaker: 'system',
          text: `🎉 Order #${msg.orderId || '101'} Confirmed! Total: ₹${msg.order?.total || cartTotal}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    });

    const unsubClose = socketService.on('close', () => {
      setCallState('idle');
      setIsRecording(false);
      setIsAiSpeaking(false);
      stopSpeech();
    });

    const unsubError = socketService.on('error', () => {
      setCallState('idle');
      Alert.alert(
        'Connection Notice',
        'Could not connect to VoiceCart backend. Ensure the server is running on ws://192.168.0.101:3001 or check your Wi-Fi.'
      );
    });

    return () => {
      unsubAiResponse();
      unsubStt();
      unsubOrderConfirmed();
      unsubClose();
      unsubError();
    };
  }, [activeLanguage, cartTotal]);

  // ── Start Call ──
  const startCall = useCallback(async () => {
    try {
      setCallState('connecting');
      setTranscript([
        {
          id: `sys_${Date.now()}`,
          speaker: 'ai',
          text: activeLanguage === 'ta-IN' ? 'வணக்கம்! வாய்ஸ்கார்ட் உடன் இணைகிறது...' : 'Connecting to VoiceCart AI Assistant...',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);

      // Ping health first
      await pingServerHealth(serverUrl);

      // Connect WebSocket
      await socketService.connect(serverUrl);
      setCallState('active');
      callStartTimeRef.current = Date.now();
    } catch (err) {
      console.error('[Call] Start error:', err);
      setCallState('idle');
      Alert.alert('Connection Failed', 'Unable to reach backend server. Please verify your connection.');
    }
  }, [serverUrl, activeLanguage]);

  // ── End Call ──
  const endCall = useCallback(async () => {
    stopSpeech();
    if (isRecording) {
      await stopRecording();
      setIsRecording(false);
    }
    socketService.disconnect();
    setCallState('idle');
    setIsAiSpeaking(false);
  }, [isRecording]);

  // ── Push-To-Talk / Toggle Voice Recording ──
  const toggleRecording = useCallback(async () => {
    if (callState !== 'active') return;

    if (isRecording) {
      // Stop recording and send audio
      setIsRecording(false);
      setAudioLevel(0);
      const result = await stopRecording();

      if (result && result.data) {
        setTranscript((prev) => [
          ...prev,
          {
            id: `user_audio_${Date.now()}`,
            speaker: 'user',
            text: '🎙️ [Voice Audio Sent — Transcribing...]',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);

        socketService.sendAudio(result.data, result.format, activeLanguage);
      }
    } else {
      // Start recording
      stopSpeech();
      setIsAiSpeaking(false);
      const started = await startRecording((status) => {
        if (status.metering) {
          // Normalize dB (-160 to 0) to 0.0 - 1.0 scale
          const normalized = Math.max(0, Math.min(1, (status.metering + 60) / 60));
          setAudioLevel(normalized);
        }
      });
      if (started) {
        setIsRecording(true);
      }
    }
  }, [callState, isRecording, activeLanguage]);

  // ── Send Text Message ──
  const sendTextMessage = useCallback((text) => {
    if (!text || !text.trim() || callState !== 'active') return;
    stopSpeech();
    setIsAiSpeaking(false);

    setTranscript((prev) => [
      ...prev,
      {
        id: `user_text_${Date.now()}`,
        speaker: 'user',
        text: text.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    socketService.sendText(text.trim());
  }, [callState]);

  // ── Send DTMF Digit ──
  const sendDTMFDigit = useCallback((digit) => {
    if (callState !== 'active') return;
    socketService.sendDTMF(digit);
    setTranscript((prev) => [
      ...prev,
      {
        id: `dtmf_${Date.now()}`,
        speaker: 'user',
        text: `🔢 [DTMF Pressed: ${digit}]`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  }, [callState]);

  // ── Quick Add Item via Voice / Text ──
  const askForDish = useCallback((dishName, qty = 1) => {
    sendTextMessage(`${qty} ${dishName}`);
  }, [sendTextMessage]);

  // ── Toggle Language ──
  const toggleLanguage = useCallback(() => {
    setActiveLanguage((prev) => (prev === 'en-IN' ? 'ta-IN' : 'en-IN'));
  }, []);

  return (
    <VoiceSessionContext.Provider
      value={{
        serverUrl,
        setServerUrl,
        PRODUCTION_SERVER,
        LOCAL_WIFI_SERVER,
        callState,
        transcript,
        cartItems,
        cartTotal,
        deliveryAddress,
        isRecording,
        isAiSpeaking,
        audioLevel,
        latencyMs,
        activeLanguage,
        catalog,
        isCatalogOpen,
        setIsCatalogOpen,
        isCartOpen,
        setIsCartOpen,
        isDTMFOpen,
        setIsDTMFOpen,
        isAddressOpen,
        setIsAddressOpen,
        startCall,
        endCall,
        toggleRecording,
        sendTextMessage,
        sendDTMFDigit,
        askForDish,
        toggleLanguage,
      }}
    >
      {children}
    </VoiceSessionContext.Provider>
  );
}

export function useVoiceSession() {
  const context = useContext(VoiceSessionContext);
  if (!context) {
    throw new Error('useVoiceSession must be used within a VoiceSessionProvider');
  }
  return context;
}
