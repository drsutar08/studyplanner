import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, type, themedStyles } from '../theme';
import { t } from '../i18n';
import { goalProgress } from '../report';
import { hoursText } from '../durations';

// Dashboard: this week's focus time against each subject's weekly goal. Nothing when no subject has a goal.
// onOpen() goes to Subjects (where goals are set).
export default function WeeklyGoalsCard({ subjects, sessions, weekStart, today, onOpen }) {
  const rows = subjects.map((s) => ({ s, g: goalProgress(s, sessions, weekStart, today) })).filter((r) => r.g);
  if (!rows.length) return null;
  const met = rows.filter((r) => r.g.left === 0).length;
  const onTrack = rows.filter((r) => r.g.onTrack).length;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={type.h2}>{t('goals.title')}</Text>
          <Text style={styles.sub}>{met === rows.length ? t('goals.allMet') : t('goals.onTrack', { done: onTrack, count: rows.length })}</Text>
        </View>
        <Pressable onPress={onOpen} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('goals.editA11y')}>
          <Text style={styles.link}>{t('goals.edit')}</Text>
        </Pressable>
      </View>
      {rows.map(({ s, g }) => {
        const tone = g.left === 0 ? colors.success : g.onTrack ? s.color : colors.danger;
        return (
          <View key={s.id} style={styles.row} accessibilityLabel={t('subjects.goalProgress', { done: hoursText(g.minutes), goal: hoursText(g.goal) })}>
            <View style={styles.rowHead}>
              <View style={[styles.dot, { backgroundColor: s.color }]} />
              <Text style={styles.name} numberOfLines={1}>
                {s.name}
              </Text>
              {g.left === 0 ? <Ionicons name="trophy" size={13} color={colors.success} /> : null}
              <Text style={styles.value}>
                {hoursText(g.minutes)}
                <Text style={styles.of}>{` / ${hoursText(g.goal)}`}</Text>
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.min(100, g.pct)}%`, backgroundColor: tone }]} />
            </View>
            {g.left > 0 && !g.onTrack ? <Text style={styles.behind}>{t('goals.left', { time: hoursText(g.left) })}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 18, marginTop: 16, borderWidth: 1, borderColor: colors.line },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  link: { fontSize: 13, fontWeight: '800', color: colors.accent },
  row: { marginBottom: 10 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink },
  value: { fontSize: 13, fontWeight: '800', color: colors.ink },
  of: { fontSize: 12, fontWeight: '600', color: colors.muted },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.bg, marginTop: 6, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  behind: { fontSize: 11, color: colors.danger, fontWeight: '700', marginTop: 4 },
}));
