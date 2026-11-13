import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, themedStyles } from '../theme';

export default function Chip({ label, selected, color, onPress, disabled }) {
  const tint = color || colors.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      aria-pressed={!!selected}
      disabled={disabled}
      style={[
        styles.chip,
        selected && { backgroundColor: tint, borderColor: tint },
        disabled && { opacity: 0.5 },
      ]}
    >
      {color && !selected ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.label, selected && { color: colors.onAccent }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    marginRight: 8,
    marginBottom: 8,
    maxWidth: 220,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink },
}));
