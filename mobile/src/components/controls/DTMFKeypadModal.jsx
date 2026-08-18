import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { colors } from '../../theme/colors';

const DTMF_KEYS = [
  { digit: '1', letters: 'Quick Reorder' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*', letters: '' },
  { digit: '0', letters: '+' },
  { digit: '#', letters: '' },
];

export default function DTMFKeypadModal({ isOpen, onClose, onSendDigit }) {
  const handlePress = (digit) => {
    if (onSendDigit) onSendDigit(digit);
  };

  return (
    <Modal visible={isOpen} animationType="fade" transparent>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.modalCard}>
          <View style={styles.header}>
            <Text style={styles.title}>🔢 Telephony Dialpad</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
            Press 1 to trigger instant repeat reorder of your last meal
          </Text>

          <View style={styles.grid}>
            {DTMF_KEYS.map((k) => (
              <TouchableOpacity
                key={k.digit}
                style={styles.keyBtn}
                onPress={() => handlePress(k.digit)}
                activeOpacity={0.7}
              >
                <Text style={styles.digitText}>{k.digit}</Text>
                {k.letters ? <Text style={styles.lettersText}>{k.letters}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceLight,
  },
  closeBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  keyBtn: {
    width: '30%',
    aspectRatio: 1.1,
    backgroundColor: colors.surfaceLight,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
  },
  digitText: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  lettersText: {
    fontSize: 8,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
});
