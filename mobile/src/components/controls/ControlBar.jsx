import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
} from 'react-native';
import { colors } from '../../theme/colors';

export default function ControlBar({
  callState = 'idle',
  isRecording = false,
  cartCount = 0,
  onToggleRecording,
  onOpenMenu,
  onOpenCart,
  onOpenDTMF,
  onSendText,
}) {
  const [inputText, setInputText] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);

  const isActive = callState === 'active';

  const handleSend = () => {
    if (inputText.trim()) {
      if (onSendText) onSendText(inputText.trim());
      setInputText('');
      setShowTextInput(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      {/* Optional Expandable Text Input Bar */}
      {showTextInput && isActive && (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Type your food order (e.g. 2 biryani)..."
            placeholderTextColor={colors.textMuted}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            autoFocus
          />
          <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main Floating Glass Control Bar */}
      <View style={styles.bar}>
        {/* Menu Catalog Button */}
        <TouchableOpacity
          style={styles.controlItem}
          onPress={onOpenMenu}
          activeOpacity={0.7}
        >
          <View style={styles.iconCircle}>
            <Text style={styles.iconEmoji}>🍽️</Text>
          </View>
          <Text style={styles.controlLabel}>Menu</Text>
        </TouchableOpacity>

        {/* DTMF Dialer */}
        <TouchableOpacity
          style={styles.controlItem}
          onPress={onOpenDTMF}
          disabled={!isActive}
          activeOpacity={0.7}
        >
          <View style={[styles.iconCircle, !isActive && styles.disabledIcon]}>
            <Text style={styles.iconEmoji}>🔢</Text>
          </View>
          <Text style={[styles.controlLabel, !isActive && styles.disabledText]}>
            Keypad
          </Text>
        </TouchableOpacity>

        {/* Center Microphone / Push-to-Talk Button */}
        <TouchableOpacity
          style={[
            styles.micButton,
            isRecording ? styles.micRecording : isActive ? styles.micActive : styles.micIdle,
          ]}
          onPress={onToggleRecording}
          disabled={!isActive}
          activeOpacity={0.8}
        >
          <Text style={styles.micEmoji}>{isRecording ? '⏹️' : '🎤'}</Text>
        </TouchableOpacity>

        {/* Text Mode Toggle */}
        <TouchableOpacity
          style={styles.controlItem}
          onPress={() => setShowTextInput((prev) => !prev)}
          disabled={!isActive}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.iconCircle,
              showTextInput && styles.activeIcon,
              !isActive && styles.disabledIcon,
            ]}
          >
            <Text style={styles.iconEmoji}>💬</Text>
          </View>
          <Text style={[styles.controlLabel, !isActive && styles.disabledText]}>
            Type
          </Text>
        </TouchableOpacity>

        {/* Live Cart Button with Badge */}
        <TouchableOpacity
          style={styles.controlItem}
          onPress={onOpenCart}
          activeOpacity={0.7}
        >
          <View style={styles.iconCircle}>
            <Text style={styles.iconEmoji}>🛒</Text>
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount}</Text>
              </View>
            )}
          </View>
          <Text style={styles.controlLabel}>Cart</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  textInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sendButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  sendButtonText: {
    color: colors.textInverse,
    fontWeight: '700',
    fontSize: 13,
  },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 30,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  controlItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeIcon: {
    backgroundColor: colors.primary,
  },
  disabledIcon: {
    opacity: 0.4,
  },
  iconEmoji: {
    fontSize: 18,
  },
  controlLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 3,
  },
  disabledText: {
    opacity: 0.4,
  },
  micButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  micIdle: {
    backgroundColor: colors.surfaceBorder,
    shadowColor: '#000',
  },
  micActive: {
    backgroundColor: colors.accentBlue,
    shadowColor: colors.accentBlue,
  },
  micRecording: {
    backgroundColor: colors.accentRed,
    shadowColor: colors.accentRed,
  },
  micEmoji: {
    fontSize: 26,
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.primary,
    borderRadius: 10,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartBadgeText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: '800',
  },
});
