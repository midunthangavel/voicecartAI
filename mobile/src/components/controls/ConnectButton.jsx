import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors } from '../../theme/colors';

export default function ConnectButton({
  callState = 'idle',
  latencyMs = 0,
  onStartCall,
  onEndCall,
}) {
  const isConnecting = callState === 'connecting';
  const isActive = callState === 'active';

  return (
    <View style={styles.container}>
      {isActive && (
        <View style={styles.statusPill}>
          <View style={styles.activeDot} />
          <Text style={styles.statusText}>Call Connected</Text>
          {latencyMs > 0 ? (
            <Text style={styles.latencyText}>• {latencyMs}ms</Text>
          ) : null}
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.button,
          isActive ? styles.btnActive : styles.btnIdle,
          isConnecting && styles.btnConnecting,
        ]}
        onPress={isActive ? onEndCall : onStartCall}
        disabled={isConnecting}
        activeOpacity={0.85}
      >
        {isConnecting ? (
          <View style={styles.btnRow}>
            <ActivityIndicator size="small" color={colors.textInverse} />
            <Text style={styles.btnTextInverse}>Connecting...</Text>
          </View>
        ) : isActive ? (
          <View style={styles.btnRow}>
            <Text style={styles.btnIcon}>📞</Text>
            <Text style={styles.btnText}>End Call</Text>
          </View>
        ) : (
          <View style={styles.btnRow}>
            <Text style={styles.btnIcon}>🎙️</Text>
            <Text style={styles.btnTextInverse}>Start Voice Order Call</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginVertical: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.primaryGlow,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '700',
  },
  latencyText: {
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: 4,
  },
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnIdle: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
  },
  btnActive: {
    backgroundColor: colors.accentRed,
    shadowColor: colors.accentRed,
  },
  btnConnecting: {
    backgroundColor: colors.accentAmber,
    shadowColor: colors.accentAmber,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnIcon: {
    fontSize: 18,
  },
  btnText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  btnTextInverse: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '800',
  },
});
