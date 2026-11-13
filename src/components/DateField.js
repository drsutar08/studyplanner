import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles, readable } from '../theme';
import { t } from '../i18n';
import { dateKey, addDays, monthOf, formatDue, formatDate, parseKey } from '../dates';
import MonthGrid from './MonthGrid';

// Short enough for a half-width field: "Today", "Tomorrow", "Oct 22" (plus the year when it is not this year)
const shortDate = (key) => {
  const today = dateKey();
  if (key === today) return t('common.today');
  if (key === addDays(today, 1)) return t('common.tomorrow');
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return formatDate(parseKey(key), { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
};

// Optional date as 'YYYY-MM-DD' (or null). Tapping the pill opens a month calendar under it;
// picking a day closes it again.
export default function DateField({ value, onChange, accent = colors.accent, background = colors.bg, placeholder = t('dateField.placeholder'), label, minKey }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(monthOf(value || dateKey()));

  const toggle = () => {
    if (!open) setMonth(monthOf(value || dateKey()));
    setOpen((o) => !o);
  };

  return (
    <View>
      <Pressable
        onPress={toggle}
        style={[styles.pill, { backgroundColor: background }, value && { backgroundColor: accent + '1F', borderColor: accent }]}
        accessibilityRole="button"
        accessibilityLabel={value ? t('dateField.a11yValue', { label: label || placeholder, date: formatDue(value) }) : label || placeholder}
      >
        <Ionicons name="calendar-outline" size={17} color={value ? accent : colors.muted} />
        <Text style={[styles.pillText, value && { color: readable(accent) }]} numberOfLines={1}>
          {value ? shortDate(value) : placeholder}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={value ? accent : colors.muted} style={{ marginLeft: 'auto' }} />
      </Pressable>
      {open && (
        <View style={[styles.cal, { backgroundColor: background }]}>
          <MonthGrid
            month={month}
            onMonthChange={setMonth}
            selected={value}
            minKey={minKey}
            onSelect={(k) => {
              onChange(k);
              setOpen(false);
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  pillText: { fontSize: 15, fontWeight: '700', color: colors.muted, flexShrink: 1 },
  cal: { marginTop: 8, borderRadius: 16, padding: 10 },
}));
