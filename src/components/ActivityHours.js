import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles } from '../theme';
import { t } from '../i18n';
import { ACTIVITY_LOOK } from '../activityKinds';
import { overLimit } from '../classes';
import { formatDuration } from './AddExamSheet';

const LIMITS = [null, 10, 15, 20, 25]; // weekly work limit in hours (null = off)

// Scheduled activity time this week or next, by type, with an optional weekly limit on work hours.
// `hours` comes from activityHours(); `week` is 'this' | 'next'.
export default function ActivityHours({ hours, week, onWeek, limit, onLimit }) {
  const types = Object.entries(hours.byCategory).sort((a, b) => b[1] - a[1]);
  const work = hours.byCategory.work || 0;
  const over = overLimit(work, limit);
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.kicker}>{t(week === 'next' ? 'hours.kickerNext' : 'hours.kickerThis')}</Text>
        <View style={styles.seg}>
          {['this', 'next'].map((w) => {
            const on = week === w;
            return (
              <Pressable key={w} onPress={() => onWeek(w)} style={[styles.segItem, on && styles.segOn]} accessibilityRole="button" aria-pressed={!!on} accessibilityState={{ selected: on }}>
                <Text style={[styles.segText, on && { color: colors.onAccent }]}>{t(w === 'next' ? 'hours.nextWeek' : 'hours.thisWeek')}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={styles.total} accessibilityLabel={t('hours.totalA11y', { time: formatDuration(hours.total), count: hours.sessions })}>
        {formatDuration(hours.total)}
      </Text>
      <Text style={styles.sub}>{hours.total ? t('hours.sessions', { count: hours.sessions }) : t('hours.none')}</Text>

      {types.map(([cat, min]) => {
        const look = ACTIVITY_LOOK[cat] || ACTIVITY_LOOK.other;
        return (
          <View key={cat} style={styles.type}>
            <View style={styles.typeHead}>
              <Ionicons name={look.icon} size={13} color={look.color} />
              <Text style={styles.typeName}>{t(`activities.categories.${cat}`)}</Text>
              <Text style={styles.typeTime}>{formatDuration(min)}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(3, (min / hours.total) * 100)}%`, backgroundColor: look.color }]} />
            </View>
          </View>
        );
      })}
      {hours.untimed ? <Text style={styles.untimed}>{t('hours.untimed', { count: hours.untimed })}</Text> : null}

      {(work > 0 || limit) && (
        <View style={styles.limit}>
          <View style={styles.limitRow}>
            <Ionicons name="briefcase-outline" size={14} color={colors.muted} />
            <Text style={styles.limitLabel}>{t('hours.limit')}</Text>
            <View style={styles.limitChips}>
              {LIMITS.map((h) => {
                const on = (limit || null) === h;
                return (
                  <Pressable
                    key={String(h)}
                    onPress={() => onLimit(h)}
                    style={[styles.chip, on && styles.chipOn]}
                    accessibilityRole="button"
                    aria-pressed={!!on} accessibilityState={{ selected: on }}
                    accessibilityLabel={h ? t('hours.limitA11y', { n: h }) : t('hours.limitOffA11y')}
                  >
                    <Text style={[styles.chipText, on && { color: colors.accent }]}>{h ? t('hours.limitChip', { n: h }) : t('hours.limitOff')}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {limit ? (
            over > 0 ? (
              <View style={styles.warn} accessibilityRole="alert">
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.warnText}>{t('hours.over', { over: formatDuration(over), limit: t('hours.limitChip', { n: limit }) })}</Text>
              </View>
            ) : (
              <Text style={styles.under}>{t('hours.under', { work: formatDuration(work), limit: t('hours.limitChip', { n: limit }) })}</Text>
            )
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.line },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: colors.accent },
  seg: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 10, padding: 3 },
  segItem: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: 8 },
  segOn: { backgroundColor: colors.accentFill },
  segText: { fontSize: 11, fontWeight: '800', color: colors.muted },
  total: { fontSize: 28, fontWeight: '800', color: colors.ink, letterSpacing: -0.5, marginTop: 6 },
  sub: { fontSize: 12, color: colors.muted, marginBottom: 6 },
  type: { marginTop: 8 },
  typeHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeName: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.ink },
  typeTime: { fontSize: 13, fontWeight: '800', color: colors.ink },
  track: { height: 5, borderRadius: 3, backgroundColor: colors.bg, marginTop: 5, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3 },
  untimed: { fontSize: 11, color: colors.muted, marginTop: 8, fontStyle: 'italic' },
  limit: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  limitRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  limitLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, marginRight: 2 },
  limitChips: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  chip: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 9, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { fontSize: 11, fontWeight: '700', color: colors.muted },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, padding: 8, borderRadius: 10, backgroundColor: colors.dangerSoft },
  warnText: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.danger },
  under: { fontSize: 12, color: colors.muted, marginTop: 8 },
}));
