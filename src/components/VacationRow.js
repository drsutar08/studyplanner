import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles } from '../theme';
import { t } from '../i18n';
import { dateKey, parseKey, formatDate } from '../dates';
import { lengthLabel, vacationLength } from '../vacations';

const short = (key) => formatDate(parseKey(key), { month: 'short', day: 'numeric' });

// "Dec 20 – Jan 4" (or one date for a one-day break)
export const vacationRange = (v) => (v.start === v.end ? short(v.start) : t('calendar.range', { start: short(v.start), end: short(v.end) }));

// One vacation: tinted card with its dates, length, and whether classes pause. `compact` is the banner
// version shown on a selected day inside the break.
export default function VacationRow({ vacation: v, onEdit, onDelete, compact = false }) {
  const today = dateKey();
  const now = v.start <= today && v.end >= today;
  const status = now
    ? t('vacation.daysLeft', { count: vacationLength(today, v.end) })
    : v.start > today
      ? t('common.inDays', { count: vacationLength(today, v.start) - 1 })
      : t('vacation.over');
  const length = lengthLabel(v.start, v.end); // { key, params }
  return (
    <View style={[styles.row, compact && styles.compact]}>
      <View style={styles.icon}>
        <Ionicons name="sunny" size={18} color={colors.teal} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.tagRow}>
          <Text style={styles.tag}>{compact ? t('vacation.onBreak') : t('vacation.tag')}</Text>
          {!compact && <Text style={[styles.status, now && styles.statusNow]}>{now ? t('vacation.nowStatus', { status }) : status}</Text>}
        </View>
        <Text style={styles.title} numberOfLines={1}>{v.title}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {vacationRange(v)} · {t(length.key, length.params)} · {v.pause !== false ? t('vacation.paused') : t('vacation.notPaused')}
        </Text>
        {!compact && v.notes ? <Text style={styles.notes} numberOfLines={1}>{v.notes}</Text> : null}
      </View>
      {onEdit && (
        <Pressable onPress={onEdit} hitSlop={10} accessibilityLabel={t('vacation.editA11y', { title: v.title })} style={styles.iconBtn}>
          <Ionicons name="create-outline" size={17} color={colors.muted} />
        </Pressable>
      )}
      {onDelete && (
        <Pressable onPress={onDelete} hitSlop={10} accessibilityLabel={t('vacation.deleteA11y', { title: v.title })} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={17} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.tealSoft, borderRadius: 16, padding: 12, paddingRight: 6, marginBottom: 10, borderWidth: 1, borderColor: colors.tealBorder },
  compact: { marginBottom: 12 },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: colors.teal },
  status: { fontSize: 10, fontWeight: '700', color: colors.muted },
  statusNow: { color: colors.teal },
  title: { fontSize: 15, fontWeight: '800', color: colors.ink, marginTop: 2 },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  notes: { fontSize: 11, color: colors.muted, marginTop: 3, fontStyle: 'italic' },
  iconBtn: { padding: 7 },
}));
