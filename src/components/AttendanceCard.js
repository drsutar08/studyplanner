import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, type, themedStyles, readable } from '../theme';
import { t } from '../i18n';
import { formatDue, formatTime } from '../dates';
import { attendanceSummary, standing, TARGETS } from '../attendance';

const SHOW_UNMARKED = 3;

// Attendance on the Progress screen: the overall %, each class against the minimum (`target`, percent)
// with how many more can be missed or must be attended, and recent sessions still to mark.
// `unmarked` comes from unmarkedSessions(); `onMark(cls, date, status)` marks one of them.
// `exams` (examAttendance()) adds a row for exams sat; it is kept out of the class percentage.
// `onMarkAll(unmarked)` marks every listed session attended (for students who were at all of them).
export default function AttendanceCard({ classes, unmarked, subjectById, target, onTarget, onMark, onMarkAll, exams }) {
  const sum = attendanceSummary(classes);
  const rows = sum.rows.map((r) => ({ ...r, st: standing(r, target) }));
  const below = rows.filter((r) => !r.st.ok).length;
  const showExams = !!exams && exams.attended + exams.missed + exams.excused + exams.cancelled > 0;
  const overallOk = sum.pct !== null && sum.pct >= target - 1e-9;

  const advice = (st) => {
    if (!st.ok) return st.needed === Infinity ? t('attendance.cantReach') : t('attendance.needed', { count: st.needed, target });
    return st.canMiss > 0 ? t('attendance.canMiss', { count: st.canMiss }) : t('attendance.noneToSpare');
  };

  return (
    <View style={styles.card}>
      <Text style={type.h2}>{t('attendance.title')}</Text>
      <View style={styles.targetRow}>
        <Text style={styles.targetLabel}>{t('attendance.minimum')}</Text>
        <View style={styles.seg}>
          {TARGETS.map((v) => {
            const on = target === v;
            return (
              <Pressable key={v} onPress={() => onTarget(v)} style={[styles.segItem, on && styles.segOn]} accessibilityRole="button" aria-pressed={!!on} accessibilityState={{ selected: on }} accessibilityLabel={t('attendance.targetA11y', { target: v })}>
                <Text style={[styles.segText, on && { color: colors.onAccent }]}>{v}%</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {sum.pct === null && !showExams ? (
        <View style={styles.empty}>
          <Ionicons name="hand-left-outline" size={22} color={colors.accent} />
          <Text style={styles.emptyText}>{t('attendance.empty')}</Text>
        </View>
      ) : null}
      {sum.pct !== null ? (
        <>
          <View style={styles.overall} accessibilityLabel={t('attendance.overallA11y', { pct: Math.round(sum.pct), attended: sum.attended, total: sum.total })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.overallKicker}>{t('attendance.overall')}</Text>
              <Text style={styles.overallValue}>{Math.round(sum.pct)}%</Text>
              <Text style={styles.overallSub}>{t('attendance.overallSub', { attended: sum.attended, count: sum.total, missed: sum.missed })}</Text>
            </View>
            <View style={[styles.badge, below || !overallOk ? { backgroundColor: colors.warnSoft, borderColor: colors.warnBorder } : { backgroundColor: colors.successSoft, borderColor: colors.successBorder }]}>
              <Ionicons name={below || !overallOk ? 'alert' : 'checkmark'} size={22} color={below || !overallOk ? colors.warn : colors.success} />
              <Text style={[styles.badgeText, { color: below || !overallOk ? colors.warn : colors.success }]}>{below ? t('attendance.belowBadge', { count: below }) : t('attendance.okBadge')}</Text>
            </View>
          </View>

          {rows.map(({ cls, attended, total, pct, st, excused, cancelled }) => {
            const sub = subjectById[cls.subjectId];
            const tint = sub ? sub.color : colors.accent;
            const tone = st.ok ? colors.ink : colors.danger;
            // excused / cancelled sessions are left out of the %; say how many so the count adds up
            const left = [excused ? t('attendance.excusedCount', { count: excused }) : null, cancelled ? t('attendance.cancelledCount', { count: cancelled }) : null].filter(Boolean).join(' · ');
            return (
              <View key={cls.id} style={styles.row} accessibilityLabel={t('attendance.rowA11y', { title: cls.title, pct: Math.round(pct), attended, total, advice: advice(st) })}>
                <View style={styles.rowHead}>
                  <View style={[styles.dot, { backgroundColor: tint }]} />
                  <Text style={styles.rowTitle} numberOfLines={1}>{cls.title}</Text>
                  <Text style={styles.rowCount}>{attended}/{total}</Text>
                  <Text style={[styles.rowPct, { color: readable(tone) }]}>{Math.round(pct)}%</Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.max(2, pct)}%`, backgroundColor: st.ok ? tint : colors.danger }]} />
                  <View style={[styles.tick, { left: `${target}%` }]} />
                </View>
                <Text style={styles.advice}>
                  <Text style={!st.ok && { color: colors.danger }}>{advice(st)}</Text>
                  {left ? ` · ${left}` : ''}
                </Text>
              </View>
            );
          })}
        </>
      ) : null}

      {showExams ? (
        <View style={[styles.row, sum.pct !== null && styles.examRow]} accessibilityLabel={t('attendance.examsA11y', { attended: exams.attended, count: exams.total })}>
          <View style={styles.rowHead}>
            <Ionicons name="flag" size={12} color={colors.danger} />
            <Text style={styles.rowTitle} numberOfLines={1}>{t('attendance.exams')}</Text>
            <Text style={styles.rowCount}>{exams.attended}/{exams.total}</Text>
            <Text style={[styles.rowPct, { color: exams.missed ? colors.danger : colors.ink }]}>{exams.pct === null ? '–' : `${Math.round(exams.pct)}%`}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(2, exams.pct ?? 0)}%`, backgroundColor: exams.missed ? colors.danger : colors.success }]} />
          </View>
          <Text style={styles.advice}>
            {[
              t('attendance.examsSat', { attended: exams.attended, count: exams.total }),
              exams.missed ? t('attendance.missedCount', { count: exams.missed }) : null,
              exams.excused ? t('attendance.excusedCount', { count: exams.excused }) : null,
              exams.cancelled ? t('attendance.cancelledCount', { count: exams.cancelled }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      ) : null}

      {unmarked.length > 0 && (
        <View style={styles.marks}>
          <View style={styles.marksHead}>
            <Text style={[styles.marksTitle, { marginBottom: 0, flex: 1 }]}>{t('attendance.toMark', { count: unmarked.length })}</Text>
            {onMarkAll && unmarked.length > 1 ? (
              <Pressable onPress={() => onMarkAll(unmarked)} style={styles.markAll} accessibilityRole="button" accessibilityLabel={t('attendance.markAllA11y', { count: unmarked.length })}>
                <Ionicons name="checkmark-done" size={15} color={colors.success} />
                <Text style={styles.markAllText}>{t('attendance.markAll')}</Text>
              </Pressable>
            ) : null}
          </View>
          {unmarked.slice(0, SHOW_UNMARKED).map(({ cls, date }) => {
            const sub = subjectById[cls.subjectId];
            return (
              <View key={`${cls.id}:${date}`} style={styles.markRow}>
                <View style={[styles.dot, { backgroundColor: sub ? sub.color : colors.accentFill }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{cls.title}</Text>
                  <Text style={styles.markMeta}>{[formatDue(date), cls.start && formatTime(cls.start)].filter(Boolean).join(' · ')}</Text>
                </View>
                <Pressable onPress={() => onMark(cls, date, 'attended')} style={[styles.markBtn, { backgroundColor: colors.successSoft }]} accessibilityRole="button" accessibilityLabel={t('attendance.markAttendedA11y', { title: cls.title, date: formatDue(date) })}>
                  <Ionicons name="checkmark" size={16} color={colors.success} />
                </Pressable>
                <Pressable onPress={() => onMark(cls, date, 'missed')} style={[styles.markBtn, { backgroundColor: colors.dangerSoft }]} accessibilityRole="button" accessibilityLabel={t('attendance.markMissedA11y', { title: cls.title, date: formatDue(date) })}>
                  <Ionicons name="close" size={16} color={colors.danger} />
                </Pressable>
              </View>
            );
          })}
          {unmarked.length > SHOW_UNMARKED ? <Text style={styles.more}>{t('attendance.more', { count: unmarked.length - SHOW_UNMARKED })}</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 18, marginTop: 16, borderWidth: 1, borderColor: colors.line },
  targetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10, marginBottom: 14, flexWrap: 'wrap' },
  targetLabel: { fontSize: 12, fontWeight: '700', color: colors.muted },
  seg: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 12, padding: 3 },
  segItem: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 9 },
  segOn: { backgroundColor: colors.accentFill },
  segText: { fontSize: 11, fontWeight: '800', color: colors.muted },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accentBorder, backgroundColor: colors.surfaceAlt },
  emptyText: { flex: 1, fontSize: 13, color: colors.muted, lineHeight: 18 },
  overall: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.accentSoft, borderRadius: 18, padding: 14, marginBottom: 14 },
  overallKicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: colors.accent },
  overallValue: { fontSize: 30, fontWeight: '800', color: colors.ink, letterSpacing: -0.5, marginTop: 2 },
  overallSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  badge: { minWidth: 64, height: 64, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontSize: 10, fontWeight: '800', marginTop: 2, textAlign: 'center' },
  row: { marginBottom: 12 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink },
  rowCount: { fontSize: 11, color: colors.muted },
  rowPct: { fontSize: 15, fontWeight: '800', minWidth: 44, textAlign: 'right' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.bg, marginTop: 6 },
  fill: { height: 6, borderRadius: 3 },
  tick: { position: 'absolute', top: -3, width: 2, height: 12, marginLeft: -1, borderRadius: 1, backgroundColor: colors.ink, opacity: 0.45 },
  examRow: { marginTop: 2, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  advice: { fontSize: 11, color: colors.muted, marginTop: 4 },
  marks: { marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  marksHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  markAll: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.successSoft },
  markAllText: { fontSize: 12, fontWeight: '800', color: colors.success },
  marksTitle: { fontSize: 12, fontWeight: '800', color: colors.warn, marginBottom: 6 },
  markRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  markMeta: { fontSize: 11, color: colors.muted },
  markBtn: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  more: { fontSize: 12, color: colors.muted, marginTop: 4 },
}));
