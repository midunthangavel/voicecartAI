import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

export default function FunctionCallBadge({ label, detail, type = 'cart' }) {
  const isAddress = type === 'address';
  const isConfirm = type === 'confirm';

  const badgeColor = isConfirm
    ? colors.primary
    : isAddress
    ? colors.accentBlue
    : colors.accentAmber;

  return (
    <View style={[styles.container, { borderColor: `${badgeColor}50` }]}>
      <Text style={[styles.iconText, { color: badgeColor }]}>
        {isConfirm ? '✅' : isAddress ? '📍' : '🛒'}
      </Text>
      <View style={styles.textContainer}>
        <Text style={[styles.labelText, { color: badgeColor }]}>{label}</Text>
        {detail ? <Text style={styles.detailText}>{detail}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    marginVertical: 3,
    alignSelf: 'flex-start',
    maxWidth: '90%',
  },
  iconText: {
    fontSize: 14,
    marginRight: 6,
  },
  textContainer: {
    flexShrink: 1,
  },
  labelText: {
    fontSize: 11,
    fontWeight: '700',
  },
  detailText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
