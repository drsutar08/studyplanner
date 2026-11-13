import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles } from '../theme';
import { t } from '../i18n';
import { formatDate, parseKey } from '../dates';
import { badges, nextUp, BADGE_ICONS } from '../achievements';
import { protectedStreak } from '../stats';

const TINT = { streak: '#E8590C', hours: '#2E86DE', sessions: '#5B3FD9', tasks: '#157A52', prep: '#B93636', cards: '#7A5CFA' };

// "7-day streak", "10 hours of focus"... from a badge id (`${group}-${target}`)
export const badgeName = (id) => {
  const [group, target] = id.split('-');
  return t(`badges.names.${group}`, { count: Number(target) });
};
const shortDay = (key) => formatDate(parseKey(key), { day: 'numeric', month: 'short' });

// The badges on Progress: how many are earned, the streak's protection, the next ones within reach, and all of them
export default function AchievementsCard({ state, today, weekStart = 0 }) {
  const list = badges(state, today, weekStart);
  const earned = list.filter((b) => b.earned).length;
  const next = nextUp(list).slice(0, 2);
  const streak = protectedStreak(state.sessions || [], today, weekStart);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="trophy" size={18} color="#E8590C" />
        <Text style={styles.title}>{t('badges.title')}</Text>
        <Text style={styles.count}>{t('badges.count', { earned, count: list.length })}</Text>
      </View>

      {streak.saved.length ? (
        <View style={styles.saved}>
          <Ionicons name="shield-checkmark" size={16} color={colors.success} />
          <Text style={styles.savedText}>{t('badges.saved', { count: streak.days, days: streak.saved.map(shortDay).join(', ') })}</Text>
        </View>
      ) : (
        <Text style={styles.hint}>{t('badges.protectionHint')}</Text>
      )}

      {next.length ? <Text style={styles.section}>{t('badges.nextUp')}</Text> : null}
      {next.map((b) => (
        <View key={b.id} style={styles.next}>
          <View style={[styles.icon, { backgroundColor: TINT[b.group] + '1F' }]}>
            <Ionicons name={BADGE_ICONS[b.group]} size={16} color={TINT[b.group]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nextName}>{badgeName(b.id)}</Text>
            <View style={styles.track} accessibilityRole="progressbar" aria-valuenow={b.value} aria-valuemax={b.target} aria-valuemin={0} accessibilityLabel={t('badges.progressA11y', { name: badgeName(b.id), value: b.value, target: b.target })}>
              <View style={[styles.fill, { width: `${Math.round((b.value / b.target) * 100)}%`, backgroundColor: TINT[b.group] }]} />
            </View>
          </View>
          <Text style={styles.nextValue}>{`${b.value} / ${b.target}`}</Text>
        </View>
      ))}

      <View style={styles.grid}>
        {list.map((b) => (
          <View key={b.id} style={[styles.badge, !b.earned && styles.locked]} accessibilityLabel={b.earned ? t('badges.earnedA11y', { name: badgeName(b.id), date: b.earnedAt ? shortDay(b.earnedAt) : t('badges.today') }) : t('badges.lockedA11y', { name: badgeName(b.id), value: b.value, target: b.target })}>
            <View style={[styles.medal, { backgroundColor: b.earned ? TINT[b.group] : colors.line }]}>
              <Ionicons name={b.earned ? BADGE_ICONS[b.group] : 'lock-closed'} size={18} color={b.earned ? '#fff' : colors.muted} />
            </View>
            <Text style={styles.badgeName} numberOfLines={2}>{badgeName(b.id)}</Text>
            <Text style={styles.badgeMeta}>{b.earned ? (b.earnedAt ? shortDay(b.earnedAt) : t('badges.today')) : `${b.value} / ${b.target}`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  card: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 16, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.ink },
  count: { fontSize: 13, fontWeight: '700', color: colors.muted },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: colors.successSoft, marginTop: 12 },
  savedText: { flex: 1, fontSize: 13, color: colors.ink, lineHeight: 18 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 17 },
  section: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.muted, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  nextName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.bg, marginTop: 5, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  nextValue: { fontSize: 12, fontWeight: '800', color: colors.muted, minWidth: 52, textAlign: 'right' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  badge: { width: 92, alignItems: 'center', padding: 8, borderRadius: 14, backgroundColor: colors.bg },
  locked: { opacity: 0.75 },
  medal: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badgeName: { fontSize: 11, fontWeight: '700', color: colors.ink, textAlign: 'center', marginTop: 6, minHeight: 28 },
  badgeMeta: { fontSize: 10, color: colors.muted, marginTop: 2 },
}));
