import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles, readable } from '../theme';
import { t } from '../i18n';

// "Attended / Missed / ⋯" for one class session or exam. ⋯ opens Excused / Cancelled (which don't count).
// `status` is the current mark; `onMark(status)` sets it, and the same status again clears it.
// `stats` (attendanceOf()) adds the class's running percentage on the right.
// `label` replaces the "ATTENDANCE" heading (the timetable says "TODAY": its cards stand for a repeating class).
// `compact`: no heading and no side padding, for a narrow card (the dashboard's schedule).
export default function AttendanceStrip({ title, status, onMark, stats, label, compact = false }) {
  const [more, setMore] = useState(false);
  const showMore = more || status === 'excused' || status === 'cancelled';
  const chips = [
    ['attended', 'checkmark', colors.success, colors.successSoft],
    ['missed', 'close', colors.danger, colors.dangerSoft],
    ...(showMore
      ? [
          ['excused', 'medkit-outline', colors.warn, colors.warnSoft],
          ['cancelled', 'remove-circle-outline', colors.muted, colors.bg],
        ]
      : []),
  ];
  return (
    <View style={[styles.att, compact && styles.compact]}>
      {compact ? null : <Text style={styles.attLabel}>{label || t('attendance.label')}</Text>}
      {chips.map(([s, icon, tone, soft]) => {
        const on = status === s;
        return (
          <Pressable
            key={s}
            onPress={() => onMark(s)}
            hitSlop={4}
            style={[styles.attChip, on && { backgroundColor: soft, borderColor: tone }]}
            accessibilityRole="button"
            aria-pressed={!!on} accessibilityState={{ selected: on }}
            accessibilityLabel={t(`attendance.${s}A11y`, { title })}
          >
            <Ionicons name={icon} size={13} color={on ? tone : colors.muted} />
            <Text style={[styles.attChipText, on && { color: readable(tone) }]}>{t(`attendance.${s}`)}</Text>
          </Pressable>
        );
      })}
      {!showMore && (
        <Pressable onPress={() => setMore(true)} hitSlop={4} style={styles.attChip} accessibilityRole="button" accessibilityLabel={t('attendance.moreA11y', { title })}>
          <Ionicons name="ellipsis-horizontal" size={13} color={colors.muted} />
        </Pressable>
      )}
      {stats && stats.total > 0 ? (
        <Text style={styles.attPct} accessibilityLabel={t('attendance.classPctA11y', { pct: Math.round(stats.pct), attended: stats.attended, total: stats.total })}>
          {t('attendance.pctOf', { pct: Math.round(stats.pct), attended: stats.attended, total: stats.total })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  att: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line, flexWrap: 'wrap' },
  compact: { paddingHorizontal: 0, paddingTop: 0, borderTopWidth: 0 },
  attLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: colors.muted, marginRight: 2 },
  attChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 11, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  attChipText: { fontSize: 12, fontWeight: '700', color: colors.muted },
  attPct: { marginLeft: 'auto', fontSize: 11, fontWeight: '700', color: colors.muted },
}));
