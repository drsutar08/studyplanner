import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, type, themedStyles } from '../theme';
import { t } from '../i18n';
import { addDays, formatDate, parseKey } from '../dates';
import { weeklyReport } from '../report';

import { hoursText } from '../durations';

export { hoursText };

// One reason a subject is falling behind, as a short phrase
const reasonText = (r, row) => {
  switch (r) {
    case 'goal':
      return t('report.reason.goal', { goal: hoursText(row.goal), done: hoursText(row.minutes) });
    case 'examSoon':
      return t('report.reason.examSoon', { count: row.daysToExam, title: row.nextExam.title });
    case 'drop':
      return t('report.reason.drop', { pct: Math.round((1 - row.minutes / row.prevMinutes) * 100) });
    case 'overdue':
      return t('report.reason.overdue', { count: row.overdue });
    case 'lowGrade':
      return t('report.reason.lowGrade', { pct: Math.round(row.average) });
    case 'attendance':
      return t('report.reason.attendance', { pct: Math.round(row.attendance) });
    default:
      return r;
  }
};

const Delta = ({ now, before }) => {
  if (!before && !now) return null;
  if (!before) return <Text style={[styles.delta, { color: colors.success }]}>{t('report.new')}</Text>;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <Text style={styles.delta}>±0%</Text>;
  const up = pct > 0;
  return (
    <Text style={[styles.delta, { color: up ? colors.success : colors.danger }]}>
      {up ? '▲' : '▼'} {Math.abs(pct)}%
    </Text>
  );
};

// Progress: this week (or last) per subject — focus time against last week and the subject's goal, tasks,
// grades — and which subjects are falling behind and why. `weekStart` is the first day of this week.
export default function ReportCard({ data, weekStart, today, attendanceTarget }) {
  const [which, setWhich] = useState('this'); // 'this' | 'last'
  const start = which === 'this' ? weekStart : addDays(weekStart, -7);
  const report = useMemo(() => weeklyReport(data, start, { today, attendanceTarget }), [data, start, today, attendanceTarget]);
  const range = t('calendar.range', {
    start: formatDate(parseKey(report.start), { month: 'short', day: 'numeric' }),
    end: formatDate(parseKey(report.end), { month: 'short', day: 'numeric' }),
  });
  const top = Math.max(60, ...report.subjects.map((r) => Math.max(r.minutes, r.goal || 0)));

  return (
    <View style={styles.card} accessibilityLabel={t('report.title')}>
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Text style={type.h2}>{t('report.title')}</Text>
          <Text style={styles.range}>{range}</Text>
        </View>
        <View style={styles.seg}>
          {['this', 'last'].map((w) => {
            const on = which === w;
            return (
              <Pressable key={w} onPress={() => setWhich(w)} style={[styles.segItem, on && styles.segOn]} accessibilityRole="button" aria-pressed={!!on} accessibilityState={{ selected: on }}>
                <Text style={[styles.segText, on && { color: colors.onAccent }]}>{t(`report.${w}Week`)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{hoursText(report.total)}</Text>
          <View style={styles.statLine}>
            <Text style={styles.statLabel}>{t('report.focus')}</Text>
            <Delta now={report.total} before={report.prevTotal} />
          </View>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{report.done}</Text>
          <Text style={styles.statLabel}>{t('report.tasksDone')}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, report.overdue > 0 && { color: colors.danger }]}>{report.overdue}</Text>
          <Text style={styles.statLabel}>{t('report.overdue')}</Text>
        </View>
      </View>

      {report.subjects.length === 0 ? (
        <Text style={styles.empty}>{t('report.noSubjects')}</Text>
      ) : report.behind.length === 0 ? (
        <View style={[styles.verdict, { backgroundColor: colors.successSoft }]}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={[styles.verdictText, { color: colors.success }]}>{t('report.allOnTrack')}</Text>
        </View>
      ) : (
        <View style={[styles.verdict, styles.behindBox]}>
          <View style={styles.behindHead}>
            <Ionicons name="alert-circle" size={17} color={colors.danger} />
            <Text style={[styles.verdictText, { color: colors.danger }]}>{t('report.behind', { count: report.behind.length })}</Text>
          </View>
          {report.behind.map((row) => (
            <View key={row.id} style={styles.behindRow}>
              <View style={[styles.dot, { backgroundColor: row.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.behindName}>{row.name}</Text>
                <Text style={styles.behindWhy}>{row.reasons.map((r) => reasonText(r, row)).join(' · ')}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {report.subjects.map((row) => (
        <View key={row.id} style={styles.row} accessibilityLabel={t('report.rowA11y', { name: row.name, time: hoursText(row.minutes) })}>
          <View style={styles.rowHead}>
            <View style={[styles.dot, { backgroundColor: row.color, marginTop: 0 }]} />
            <Text style={styles.rowName} numberOfLines={1}>
              {row.name}
            </Text>
            <Delta now={row.minutes} before={row.prevMinutes} />
            <Text style={styles.rowTime}>
              {hoursText(row.minutes)}
              {row.goal ? <Text style={styles.rowGoal}>{` / ${hoursText(row.goal)}`}</Text> : null}
            </Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.min(100, (row.minutes / top) * 100)}%`, backgroundColor: row.color }]} />
            {row.goal ? <View style={[styles.goalMark, { left: `${Math.min(100, (row.goal / top) * 100)}%` }]} /> : null}
          </View>
          <Text style={styles.rowMeta}>
            {[
              t('report.doneCount', { count: row.done }),
              row.average !== null ? t('report.average', { pct: Math.round(row.average) }) : null,
              row.attendance !== null ? t('report.attendance', { pct: Math.round(row.attendance) }) : null,
              row.nextExam ? t('report.nextExam', { count: row.daysToExam }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = themedStyles(() => ({
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 18, marginTop: 16, borderWidth: 1, borderColor: colors.line },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  range: { fontSize: 12, color: colors.muted, marginTop: 2 },
  seg: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 12, padding: 3 },
  segItem: { paddingVertical: 5, paddingHorizontal: 9, borderRadius: 9 },
  segOn: { backgroundColor: colors.accentFill },
  segText: { fontSize: 11, fontWeight: '800', color: colors.muted },
  stats: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  stat: { flex: 1, backgroundColor: colors.bg, borderRadius: 14, padding: 10 },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  statLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  statLabel: { fontSize: 11, color: colors.muted, fontWeight: '600', marginTop: 2 },
  delta: { fontSize: 11, fontWeight: '800', color: colors.muted },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, padding: 12, marginBottom: 14 },
  verdictText: { flex: 1, fontSize: 13, fontWeight: '700' },
  behindBox: { flexDirection: 'column', alignItems: 'stretch', backgroundColor: colors.dangerSoft },
  behindHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  behindRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 },
  behindName: { fontSize: 13, fontWeight: '800', color: colors.ink },
  behindWhy: { fontSize: 12, color: colors.ink, opacity: 0.8, marginTop: 1, lineHeight: 17 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  empty: { fontSize: 13, color: colors.muted },
  row: { marginBottom: 12 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink },
  rowTime: { fontSize: 13, fontWeight: '800', color: colors.ink },
  rowGoal: { fontSize: 12, fontWeight: '600', color: colors.muted },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.bg, marginTop: 6, overflow: 'visible', position: 'relative' },
  fill: { height: 6, borderRadius: 3 },
  goalMark: { position: 'absolute', top: -3, width: 2, height: 12, marginLeft: -1, borderRadius: 1, backgroundColor: colors.ink, opacity: 0.55 },
  rowMeta: { fontSize: 11, color: colors.muted, marginTop: 4 },
}));
