import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles } from '../theme';

export default function Field({ label, icon, secure, error, style, inputRef, ...props }) {
  const [focus, setFocus] = useState(false);
  const [hidden, setHidden] = useState(!!secure);

  return (
    <View style={[{ marginBottom: 14 }, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.box, focus && styles.boxFocus, error && styles.boxError]}>
        {icon ? <Ionicons name={icon} size={18} color={focus ? colors.accent : colors.muted} /> : null}
        <TextInput
          {...props}
          ref={inputRef}
          accessibilityLabel={props.accessibilityLabel || label}
          secureTextEntry={hidden}
          onFocus={(e) => {
            setFocus(true);
            props.onFocus && props.onFocus(e);
          }}
          onBlur={(e) => {
            setFocus(false);
            props.onBlur && props.onBlur(e);
          }}
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        {secure ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={8}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  label: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  boxFocus: { borderColor: colors.accent, backgroundColor: colors.surface },
  boxError: { borderColor: colors.danger },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 0,
    ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }),
  },
  error: { color: colors.danger, fontSize: 12, marginTop: 4 },
}));
