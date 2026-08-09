import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

const PRODUCTION_SERVER = 'wss://voicecartai.onrender.com/web-stream';
const LOCAL_WIFI_SERVER = 'ws://10.195.48.140:3001/web-stream';

export default function App() {
  const [serverUrl, setServerUrl] = useState(PRODUCTION_SERVER);
  const [callState, setCallState] = useState('idle'); // idle | connecting | active
  const [transcript, setTranscript] = useState([]);
  const [cartItems, setCartItems] = useState([]);
  const [cartTotal, setCartTotal] = useState(0);
  const [textInput, setTextInput] = useState('');
  const [aiSpeaking, setAiSpeaking] = useState(false);

  const wsRef = useRef(null);
  const recordingRef = useRef(null);
  const scrollViewRef = useRef(null);

  // Request audio recording permissions on mount
  useEffect(() => {
    (async () => {
      try {
        await Audio.requestPermissionsAsync();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch (e) {
        console.warn('Audio permission error:', e);
      }
    })();
  }, []);

  // ── Start Call ──
  async function startCall() {
    try {
      setCallState('connecting');
      setTranscript([{ speaker: 'ai', text: 'Connecting to VoiceCart AI...' }]);

      // Wake up Render server if using production URL
      if (serverUrl.includes('onrender.com')) {
        fetch('https://voicecartai.onrender.com/api/stats').catch(() => {});
      }

      const ws = new WebSocket(serverUrl);

      ws.onopen = () => {
        setCallState('active');
        ws.send(JSON.stringify({ type: 'start' }));
        startAudioRecording(ws);
      };

      ws.onmessage = async (e) => {
        try {
          const msg = JSON.parse(e.data);

          if (msg.type === 'ai_response') {
            setTranscript((prev) => [...prev, { speaker: 'ai', text: msg.text }]);

            if (msg.state?.items) {
              setCartItems(msg.state.items);
              setCartTotal(msg.state.total || 0);
            }

            // Speak response via native Expo Speech API
            if (msg.text) {
              setAiSpeaking(true);
              Speech.stop();
              Speech.speak(msg.text, {
                language: 'en-IN',
                rate: 0.95,
                pitch: 1.0,
                onDone: () => setAiSpeaking(false),
                onError: () => setAiSpeaking(false),
              });
            }
          } else if (msg.type === 'transcript') {
            setTranscript((prev) => [...prev, { speaker: msg.speaker, text: msg.text }]);
          } else if (msg.type === 'stt_transcript' && msg.isFinal) {
            setTranscript((prev) => [...prev, { speaker: 'user', text: msg.transcript }]);
          }
        } catch (err) {
          console.error('[WS Message Error]', err);
        }
      };

      ws.onerror = (err) => {
        console.error('[WS Error]', err);
        Alert.alert('Connection Error', 'Could not connect to AI backend. Ensure server is awake.');
        setCallState('idle');
      };

      ws.onclose = () => {
        endCall();
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[Call Error]', err);
      setCallState('idle');
    }
  }

  // ── Native Audio Recording ──
  async function startAudioRecording(ws) {
    try {
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 64000,
        },
        ios: {
          extension: '.m4a',
          audioQuality: Audio.IOSAudioQuality.MEDIUM,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 64000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {},
      });

      recording.setOnRecordingStatusUpdate(async (status) => {
        if (status.isRecording && ws.readyState === WebSocket.OPEN) {
          // Keep recording active
        }
      });

      await recording.startAsync();
      recordingRef.current = recording;
    } catch (e) {
      console.warn('Native recording start error:', e);
    }
  }

  // ── End Call ──
  async function endCall() {
    Speech.stop();
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'end' }));
        wsRef.current.close();
      } catch (e) {}
      wsRef.current = null;
    }
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (e) {}
      recordingRef.current = null;
    }
    setCallState('idle');
    setAiSpeaking(false);
  }

  // ── Send Text Message ──
  function sendText() {
    if (!textInput.trim() || !wsRef.current) return;
    const txt = textInput.trim();
    wsRef.current.send(JSON.stringify({ type: 'text', text: txt }));
    setTranscript((prev) => [...prev, { speaker: 'user', text: txt }]);
    setTextInput('');
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>VoiceCart AI Mobile</Text>
        <Text style={styles.headerSub}>Call-First Backend Voice Agent</Text>
      </View>

      {/* Server Selector Bar */}
      <View style={styles.serverBar}>
        <TouchableOpacity
          style={[styles.presetBtn, serverUrl === PRODUCTION_SERVER && styles.presetBtnActive]}
          onPress={() => setServerUrl(PRODUCTION_SERVER)}
          disabled={callState !== 'idle'}
        >
          <Text style={styles.presetText}>🌐 Cloud Render</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.presetBtn, serverUrl === LOCAL_WIFI_SERVER && styles.presetBtnActive]}
          onPress={() => setServerUrl(LOCAL_WIFI_SERVER)}
          disabled={callState !== 'idle'}
        >
          <Text style={styles.presetText}>📶 Local Wi-Fi</Text>
        </TouchableOpacity>
      </View>

      {/* Call Status & Big Button */}
      <View style={styles.callCard}>
        {callState === 'connecting' && <ActivityIndicator size="large" color="#10b981" />}

        {callState === 'active' && (
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>
              {aiSpeaking ? '🤖 AI Speaking...' : '🎤 Listening to your voice...'}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.callButton,
            callState === 'active' ? styles.callButtonActive : styles.callButtonIdle,
          ]}
          onPress={callState === 'active' ? endCall : startCall}
        >
          <Text style={styles.callButtonIcon}>
            {callState === 'active' ? '📞' : '🎙️'}
          </Text>
          <Text style={styles.callButtonText}>
            {callState === 'active'
              ? 'End Call'
              : callState === 'connecting'
              ? 'Connecting...'
              : 'Start Voice Order Call'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Live Order Sub-Cart Preview */}
      {cartItems.length > 0 && (
        <View style={styles.cartCard}>
          <Text style={styles.cartTitle}>🛒 Current Order Cart (₹{cartTotal})</Text>
          <View style={styles.cartList}>
            {cartItems.map((item, idx) => (
              <Text key={idx} style={styles.cartItemText}>
                • {item.quantity}× {item.name} — ₹{(item.price || 0) * (item.quantity || 1)}
              </Text>
            ))}
          </View>
        </View>
      )}

      {/* Conversation Feed */}
      <ScrollView
        style={styles.transcriptContainer}
        ref={scrollViewRef}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {transcript.length === 0 ? (
          <Text style={styles.emptyText}>
            Tap "Start Voice Order Call" and speak naturally to test the AI ordering engine!
          </Text>
        ) : (
          transcript.map((msg, idx) => (
            <View
              key={idx}
              style={[
                styles.bubble,
                msg.speaker === 'user' ? styles.userBubble : styles.aiBubble,
              ]}
            >
              <Text style={styles.bubbleLabel}>
                {msg.speaker === 'user' ? '🎤 You' : '🤖 VoiceCart AI'}
              </Text>
              <Text style={styles.bubbleText}>{msg.text}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Text Input Fallback */}
      {callState === 'active' && (
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={textInput}
            onChangeText={setTextInput}
            placeholder="Or type an order..."
            placeholderTextColor="#64748b"
            onSubmitEditing={sendText}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendText}>
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
  },
  headerSub: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  serverBar: {
    flexDirection: 'row',
    padding: 10,
    gap: 8,
    justifyContent: 'center',
    backgroundColor: '#1e293b',
  },
  presetBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#334155',
  },
  presetBtnActive: {
    backgroundColor: '#10b981',
  },
  presetText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  callCard: {
    margin: 16,
    padding: 20,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    alignItems: 'center',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginRight: 6,
  },
  liveText: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '600',
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
    width: '100%',
    justifyContent: 'center',
  },
  callButtonIdle: {
    backgroundColor: '#10b981',
  },
  callButtonActive: {
    backgroundColor: '#ef4444',
  },
  callButtonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  callButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  cartCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  cartTitle: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  cartList: {
    marginTop: 2,
  },
  cartItemText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
  },
  transcriptContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  emptyText: {
    color: '#64748b',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
    lineHeight: 20,
  },
  bubble: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    maxWidth: '88%',
  },
  userBubble: {
    backgroundColor: '#334155',
    alignSelf: 'flex-end',
  },
  aiBubble: {
    backgroundColor: '#1e293b',
    alignSelf: 'flex-start',
    borderLeftWidth: 3,
    borderLeftColor: '#10b981',
  },
  bubbleLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 4,
    fontWeight: '600',
  },
  bubbleText: {
    color: '#f8fafc',
    fontSize: 14,
    lineHeight: 20,
  },
  inputBar: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#1e293b',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#f8fafc',
    fontSize: 14,
  },
  sendBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
  },
  sendBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});
