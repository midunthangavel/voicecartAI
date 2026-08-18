import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

export default function MessageBubble({ message }) {
  const isUser = message.speaker === 'user';
  const isSystem = message.speaker === 'system';

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={styles.systemText}>{message.text}</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.bubbleContainer,
        isUser ? styles.userContainer : styles.aiContainer,
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.roleLabel}>
          {isUser ? '🎤 You' : '🤖 VoiceCart AI'}
        </Text>
        {message.timestamp ? (
          <Text style={styles.timeLabel}>{message.timestamp}</Text>
        ) : null}
      </View>

      <Text
        style={[
          styles.messageText,
          isUser ? styles.userText : styles.aiText,
        ]}
      >
        {message.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleContainer: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 8,
    maxWidth: '86%',
  },
  userContainer: {
    backgroundColor: colors.surfaceElevated,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  aiContainer: {
    backgroundColor: colors.surfaceLight,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  roleLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  timeLabel: {
    fontSize: 10,
    color: colors.textMuted,
    marginLeft: 8,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userText: {
    color: colors.textPrimary,
  },
  aiText: {
    color: colors.textPrimary,
  },
  systemContainer: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 8,
    marginVertical: 6,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: colors.primaryGlow,
  },
  systemText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
