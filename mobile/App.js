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
import * as FileSystem from 'expo-file-system';

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
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);

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
      setTranscript([{ speaker: 'ai', text: 'Connecting to VoiceCart AI Assistant...' }]);

      // Wake up Render server if using production URL
      if (serverUrl.includes('onrender.com')) {
        fetch('https://voicecartai.onrender.com/api/stats').catch(() => {});
      }

      const ws = new WebSocket(serverUrl);

      ws.onopen = () => {
        setCallState('active');
        ws.send(JSON.stringify({ type: 'start' }));
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

  // ── Voice Recording & Audio Streaming ──
  async function toggleVoiceRecording() {
    if (!wsRef.current || callState !== 'active') return;

    if (isRecordingVoice) {
      // Stop Recording & Send Audio
      try {
        setIsRecordingVoice(false);
        const recording = recordingRef.current;
        if (recording) {
          await recording.stopAndUnloadAsync();
          const uri = recording.getURI();
          recordingRef.current = null;

          if (uri) {
            const base64Audio = await FileSystem.readAsStringAsync(uri, {
              encoding: FileSystem.EncodingType.Base64,
            });

            // Send base64 audio packet to backend WebSocket
            wsRef.current.send(
              JSON.stringify({
                type: 'audio',
                data: base64Audio,
              })
            );

            setTranscript((prev) => [...prev, { speaker: 'user', text: '🎙️ [Spoken Audio Sent]' }]);
          }
        }
      } catch (err) {
        console.warn('Stop voice recording error:', err);
        setIsRecordingVoice(false);
      }
    } else {
      // Start Recording Voice
      try {
        Speech.stop();
        setAiSpeaking(false);
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recordingRef.current = recording;
        setIsRecordingVoice(true);
      } catch (err) {
        console.warn('Start voice recording error:', err);
        Alert.alert('Microphone Error', 'Could not start microphone recording.');
      }
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
    setIsRecordingVoice(false);
  }

  // ── Send Text Message ──
  function sendText(txt = textInput) {
    const textToSend = (typeof txt === 'string' ? txt : textInput).trim();
    if (!textToSend || !wsRef.current) return;
    Speech.stop();
    wsRef.current.send(JSON.stringify({ type: 'text', text: textToSend }));
    setTranscript((prev) => [...prev, { speaker: 'user', text: textToSend }]);
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

      {/* Call Status & Controls */}
      <View style={styles.callCard}>
        {callState === 'connecting' && <ActivityIndicator size="large" color="#10b981" />}

        {callState === 'active' && (
          <View style={styles.liveIndicator}>
            <View style={[styles.liveDot, isRecordingVoice && styles.recordingDot]} />
            <Text style={[styles.liveText, isRecordingVoice && styles.recordingText]}>
              {isRecordingVoice
                ? '🔴 Recording voice... Tap "Send Voice" when done'
                : aiSpeaking
                ? '🤖 AI Speaking...'
                : '🎤 Call Active — Tap Mic to Speak'}
            </Text>
          </View>
        )}

        <View style={styles.buttonRow}>
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

        {/* Dedicated Push-to-Talk Microphone Button when Active */}
        {callState === 'active' && (
          <TouchableOpacity
            style={[
              styles.micButton,
              isRecordingVoice ? styles.micButtonRecording : styles.micButtonNormal,
            ]}
            onPress={toggleVoiceRecording}
          >
            <Text style={styles.micButtonText}>
              {isRecordingVoice ? '⏹️ Send Voice Input' : '🎤 Tap to Speak Voice Input'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Quick Voice Order Test Shortcuts */}
      {callState === 'active' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.shortcutsBar}>
          <TouchableOpacity style={styles.shortcutChip} onPress={() => sendText('1 chicken biryani')}>
            <Text style={styles.chipText}>🍗 1 Chicken Biryani</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.shortcutChip} onPress={() => sendText('2 mutton biryani')}>
            <Text style={styles.chipText}>🥩 2 Mutton Biryani</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.shortcutChip} onPress={() => sendText('Total how much?')}>
            <Text style={styles.chipText}>💰 Total how much?</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.shortcutChip} onPress={() => sendText('Deliver to 42 DB Road near Senthil Hospital')}>
            <Text style={styles.chipText}>📍 42 DB Road</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.shortcutChip} onPress={() => sendText('Yes confirm order')}>
            <Text style={styles.chipText}>✅ Confirm Order</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

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
            onSubmitEditing={() => sendText()}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={() => sendText()}>
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
    padding: 16,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    alignItems: 'center',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginRight: 6,
  },
  recordingDot: {
    backgroundColor: '#ef4444',
  },
  liveText: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '600',
  },
  recordingText: {
    color: '#ef4444',
  },
  buttonRow: {
    width: '100%',
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
  micButton: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    width: '100%',
    alignItems: 'center',
  },
  micButtonNormal: {
    backgroundColor: '#3b82f6',
  },
  micButtonRecording: {
    backgroundColor: '#dc2626',
  },
  micButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  shortcutsBar: {
    marginHorizontal: 16,
    marginBottom: 10,
    maxHeight: 40,
  },
  shortcutChip: {
    backgroundColor: '#334155',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 8,
  },
  chipText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
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
