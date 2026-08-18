import React from 'react';
import { ScrollView, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

const SHORTCUTS = [
  { label: '🍗 1 Chicken Biryani', text: '1 chicken biryani' },
  { label: '🥩 2 Mutton Biryani', text: '2 mutton biryani' },
  { label: '🧀 1 Paneer Masala & 2 Naan', text: '1 paneer butter masala and 2 garlic naan' },
  { label: '🥤 1 Thums Up', text: '1 thums up' },
  { label: '💰 Total how much?', text: 'Total how much?' },
  { label: '📍 42 DB Road', text: 'Deliver to 42 DB Road near Senthil Hospital' },
  { label: '✅ Confirm Order', text: 'Yes confirm order' },
  { label: '❌ Cancel Order', text: 'No cancel order' },
];

export default function ShortcutsBar({ onSelectShortcut, isActive = false }) {
  if (!isActive) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {SHORTCUTS.map((s, idx) => (
        <TouchableOpacity
          key={idx}
          style={styles.chip}
          onPress={() => onSelectShortcut && onSelectShortcut(s.text)}
          activeOpacity={0.7}
        >
          <Text style={styles.chipText}>{s.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 38,
    marginVertical: 4,
  },
  content: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    backgroundColor: colors.surfaceLight,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
