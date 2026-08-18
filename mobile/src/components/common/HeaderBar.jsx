import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../../theme/colors';

export default function HeaderBar({
  serverUrl,
  onSelectServer,
  activeLanguage = 'en-IN',
  onToggleLanguage,
  callState = 'idle',
  PRODUCTION_SERVER,
  LOCAL_WIFI_SERVER,
}) {
  const isLocal = serverUrl === LOCAL_WIFI_SERVER;

  return (
    <View style={styles.container}>
      {/* Top Title & Language Switcher */}
      <View style={styles.topRow}>
        <View style={styles.brandRow}>
          <Text style={styles.brandIcon}>⚡</Text>
          <View>
            <Text style={styles.brandTitle}>VoiceCart AI</Text>
            <Text style={styles.brandSubtitle}>Pipecat Voice Telephony</Text>
          </View>
        </View>

        {/* Bilingual Language Switcher */}
        <TouchableOpacity
          style={styles.langBtn}
          onPress={onToggleLanguage}
          activeOpacity={0.7}
        >
          <Text style={styles.langIcon}>🌐</Text>
          <Text style={styles.langText}>
            {activeLanguage === 'ta-IN' ? 'தமிழ்' : 'English'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Server Environment Bar */}
      <View style={styles.serverBar}>
        <TouchableOpacity
          style={[styles.serverChip, isLocal && styles.serverChipActive]}
          onPress={() => onSelectServer && onSelectServer(LOCAL_WIFI_SERVER)}
          disabled={callState !== 'idle'}
        >
          <Text style={[styles.serverText, isLocal && styles.serverTextActive]}>
            📶 Local Wi-Fi (192.168.0.101)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.serverChip, !isLocal && styles.serverChipActive]}
          onPress={() => onSelectServer && onSelectServer(PRODUCTION_SERVER)}
          disabled={callState !== 'idle'}
        >
          <Text style={[styles.serverText, !isLocal && styles.serverTextActive]}>
            🌐 Cloud Render
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandIcon: {
    fontSize: 24,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  brandSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
  },
  langBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
  },
  langIcon: {
    fontSize: 12,
  },
  langText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  serverBar: {
    flexDirection: 'row',
    gap: 8,
  },
  serverChip: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
  },
  serverChipActive: {
    backgroundColor: colors.primaryGlow,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  serverText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  serverTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
});
