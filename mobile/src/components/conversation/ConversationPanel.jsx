import React, { useRef, useEffect } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import MessageBubble from './MessageBubble';
import ThinkingIndicator from './ThinkingIndicator';
import { colors } from '../../theme/colors';

export default function ConversationPanel({
  transcript = [],
  callState = 'idle',
  isAiSpeaking = false,
  isRecording = false,
}) {
  const scrollViewRef = useRef(null);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [transcript, isAiSpeaking, isRecording]);

  return (
    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {transcript.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🎙️</Text>
          <Text style={styles.emptyTitle}>VoiceCart AI Voice Telephony</Text>
          <Text style={styles.emptySub}>
            Tap "Start Voice Order Call" below to speak naturally in Tamil or English and order delicious food!
          </Text>
        </View>
      ) : (
        <>
          {transcript.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Show thinking indicator when processing without active AI speech */}
          {callState === 'active' && isAiSpeaking === false && isRecording === false && (
            <View style={styles.liveListeningPill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveListeningText}>AI Assistant Ready — Speak anytime</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  contentContainer: {
    paddingVertical: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  liveListeningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    alignSelf: 'center',
    marginTop: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginRight: 6,
  },
  liveListeningText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
  },
});
