import React, { useRef, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { colors, themedStyles, readable } from '../theme';
import { t } from '../i18n';
import { formatTime } from '../dates';

const DEFAULT_TIME = '09:00';
const toDate = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m);
};
const toHHMM = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// Optional time of day as 'HH:MM' (or null). Opens the platform's own picker:
// the clock dialog on Android, a spinner wheel on iOS and the browser's time picker on the web.
export default function TimeField({ value, onChange, accent = colors.accent, background = colors.bg }) {
  const [iosOpen, setIosOpen] = useState(false);
  const webInput = useRef(null);

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: toDate(value || DEFAULT_TIME),
        mode: 'time',
        display: 'clock',
        onValueChange: (_e, d) => d && onChange(toHHMM(d)),
      });
    } else if (Platform.OS === 'ios') {
      if (!value) onChange(DEFAULT_TIME);
      setIosOpen((o) => !o);
    } else {
      const el = webInput.current;
      if (!el) return;
      try {
        el.showPicker();
      } catch {
        el.focus(); // older browsers without showPicker()
      }
    }
  };

  const clear = () => {
    setIosOpen(false);
    onChange(null);
  };

  return (
    <View>
      <View style={styles.row}>
        {/* the web's time input sits over the pill (where its picker opens), beside the button rather than in it */}
        <View style={styles.pillWrap}>
          <Pressable
            onPress={open}
            style={[styles.pill, { backgroundColor: background }, value && { backgroundColor: accent + '1F', borderColor: accent }]}
            accessibilityRole="button"
            accessibilityLabel={value ? t('timeField.valueA11y', { time: formatTime(value) }) : t('timeField.selectA11y')}
          >
            <Ionicons name="time-outline" size={18} color={value ? accent : colors.muted} />
            <Text style={[styles.pillText, value && { color: readable(accent) }]}>{value ? formatTime(value) : t('timeField.placeholder')}</Text>
          </Pressable>
          {Platform.OS === 'web' && (
            <input
              ref={webInput}
              type="time"
              value={value || ''}
              onChange={(e) => onChange(e.target.value || null)}
              tabIndex={-1}
              aria-hidden
              style={webInputStyle}
            />
          )}
        </View>
        {value && (
          <Pressable onPress={clear} hitSlop={8} style={[styles.clear, { backgroundColor: background }]} accessibilityRole="button" accessibilityLabel={t('timeField.clearA11y')}>
            <Ionicons name="close" size={16} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {Platform.OS === 'ios' && iosOpen && value && (
        <View style={[styles.iosBox, { backgroundColor: background }]}>
          <DateTimePicker
            value={toDate(value)}
            mode="time"
            display="spinner"
            minuteInterval={5}
            onValueChange={(_e, d) => onChange(toHHMM(d))}
          />
          <Pressable onPress={() => setIosOpen(false)} style={styles.done} accessibilityRole="button">
            <Text style={[styles.doneText, { color: readable(accent) }]}>{t('timeField.done')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// Invisible input under the pill: only used to open the browser's picker and receive the value.
const webInputStyle = { position: 'absolute', left: 0, bottom: 0, width: '100%', height: '100%', opacity: 0, pointerEvents: 'none', border: 0 };

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pillWrap: { alignSelf: 'flex-start' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    position: 'relative',
  },
  pillText: { fontSize: 15, fontWeight: '700', color: colors.muted },
  clear: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  iosBox: { marginTop: 8, borderRadius: 16, backgroundColor: colors.bg, overflow: 'hidden' },
  done: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingBottom: 10 },
  doneText: { fontSize: 15, fontWeight: '800' },
}));
