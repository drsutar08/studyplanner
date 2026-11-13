import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, type, themedStyles, readable } from '../theme';
import { t } from '../i18n';
import { dateKey, formatDue } from '../dates';
import { subjectAverages, overallAverage, overallGpa, gpa4Of, gpa10Of, letterOf, percentOf, needsScore, gradeTrend } from '../grades';
import TrendChart from './TrendChart';

const SCALES = ['percent', 'gpa4', 'gpa10'];
const SHOW_NEEDS = 3;

// A subject's (or the overall) result on the chosen scale: "84%", "3.0" or "8.8"
const valueOn = (scale, pct, gpa) => {
  if (scale === 'gpa4') return (gpa ?? gpa4Of(pct)).toFixed(1);
  if (scale === 'gpa10') return (gpa ?? gpa10Of(pct)).toFixed(1);
  return `${Math.round(pct)}%`;
};

// Grades on the Progress screen: overall result, an average per subject (tap to see its exams), and the
// past exams that still need a score. `onEditExam` opens the exam sheet to add or change a score;
// `onWhatIf(subjectId | null)` opens the "what do I need?" calculator.
export default function GradesCard({ exams, subjectById, scale = 'percent', onScale, onEditExam, onWhatIf }) {
  const [open, setOpen] = useState(null); // subjectId whose exams are listed
  const today = dateKey();
  const subjects = subjectAverages(exams);
  const pending = needsScore(exams, today);
  const graded = subjects.reduce((n, s) => n + s.count, 0);
  const overall = overallAverage(exams);
  const overallValue = overall === null ? null : valueOn(scale, overall, scale === 'percent' ? null : overallGpa(exams, scale));

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={type.h2}>{t('grades.title')}</Text>
        <View style={styles.seg}>
          {SCALES.map((s) => {
            const on = scale === s;
            return (
              <Pressable key={s} onPress={() => onScale(s)} style={[styles.segItem, on && styles.segOn]} accessibilityRole="button" aria-pressed={!!on} accessibilityState={{ selected: on }} accessibilityLabel={t('grades.scaleA11y', { name: t(`grades.scale.${s}`) })}>
                <Text style={[styles.segText, on && { color: colors.onAccent }]}>{t(`grades.scale.${s}`)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {overall === null ? (
        <View style={styles.empty}>
          <Ionicons name="school-outline" size={22} color={colors.accent} />
          <Text style={styles.emptyText}>{t('grades.empty')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.overall} accessibilityLabel={t('grades.overallA11y', { value: overallValue, letter: letterOf(overall) })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.overallKicker}>{scale === 'percent' ? t('grades.overallAvg') : t('grades.overallGpa')}</Text>
              <Text style={styles.overallValue}>
                {overallValue}
                {scale === 'gpa4' ? <Text style={styles.overallOf}> / 4.0</Text> : scale === 'gpa10' ? <Text style={styles.overallOf}> / 10</Text> : null}
              </Text>
              <Text style={styles.overallSub}>{t('grades.overallSub', { subjects: subjects.length, count: graded })}</Text>
            </View>
            <View style={styles.letterBox}>
              <Text style={styles.letter}>{letterOf(overall)}</Text>
            </View>
          </View>

          {subjects.map((s) => {
            const sub = subjectById[s.subjectId];
            const tint = sub ? sub.color : colors.muted;
            const isOpen = open === s.subjectId;
            return (
              <View key={String(s.subjectId)} style={styles.subject}>
                <Pressable
                  onPress={() => setOpen(isOpen ? null : s.subjectId)}
                  style={styles.subjectRow}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  accessibilityLabel={t('grades.subjectA11y', { name: sub ? sub.name : t('common.noSubject'), value: valueOn(scale, s.average), count: s.count })}
                >
                  <View style={[styles.dot, { backgroundColor: tint }]} />
                  <Text style={styles.subjectName} numberOfLines={1}>{sub ? sub.name : t('common.noSubject')}</Text>
                  <Text style={styles.subjectCount}>{t('grades.examCount', { count: s.count })}</Text>
                  <Text style={[styles.subjectValue, { color: readable(tint) }]}>{valueOn(scale, s.average)}</Text>
                  <Text style={styles.subjectLetter}>{letterOf(s.average)}</Text>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} />
                </Pressable>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.max(2, Math.min(100, s.average))}%`, backgroundColor: tint }]} />
                </View>
                {isOpen ? <TrendChart {...gradeTrend(s.exams)} average={s.average} color={tint} /> : null}
                {isOpen &&
                  s.exams.map((e) => (
                    <Pressable key={e.id} onPress={() => onEditExam(e)} style={styles.examRow} accessibilityRole="button" accessibilityLabel={t('grades.editA11y', { title: e.title })}>
                      <Text style={styles.examTitle} numberOfLines={1}>{e.title}</Text>
                      <Text style={styles.examMeta}>
                        {t('grades.examLine', { date: formatDue(e.date), score: e.score, outOf: e.outOf || 100 })}
                        {e.weight > 1 ? ` · ${t('grades.weightChip', { n: e.weight })}` : ''}
                      </Text>
                      <Text style={[styles.examPct, { color: readable(tint) }]}>{Math.round(percentOf(e))}%</Text>
                    </Pressable>
                  ))}
              </View>
            );
          })}
        </>
      )}

      {onWhatIf && exams.some((e) => e.subjectId) ? (
        <Pressable onPress={() => onWhatIf(open)} style={styles.whatIf} accessibilityRole="button" accessibilityLabel={t('whatIf.open')}>
          <Ionicons name="calculator-outline" size={16} color={colors.accent} />
          <Text style={styles.whatIfText}>{t('whatIf.open')}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.accent} />
        </Pressable>
      ) : null}

      {pending.length > 0 && (
        <View style={styles.needs}>
          <Text style={styles.needsTitle}>{t('grades.needsTitle', { count: pending.length })}</Text>
          {pending.slice(0, SHOW_NEEDS).map((e) => {
            const sub = subjectById[e.subjectId];
            return (
              <View key={e.id} style={styles.needsRow}>
                <View style={[styles.dot, { backgroundColor: sub ? sub.color : colors.muted }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.examTitle} numberOfLines={1}>{e.title}</Text>
                  <Text style={styles.examMeta}>{[sub && sub.name, formatDue(e.date)].filter(Boolean).join(' · ')}</Text>
                </View>
                <Pressable onPress={() => onEditExam(e)} style={styles.addScore} accessibilityRole="button" accessibilityLabel={t('grades.addScoreA11y', { title: e.title })}>
                  <Ionicons name="add" size={14} color={colors.accent} />
                  <Text style={styles.addScoreText}>{t('grades.addScore')}</Text>
                </Pressable>
              </View>
            );
          })}
          {pending.length > SHOW_NEEDS ? <Text style={styles.more}>{t('grades.more', { count: pending.length - SHOW_NEEDS })}</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 18, marginTop: 16, borderWidth: 1, borderColor: colors.line },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  seg: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 12, padding: 3 },
  segItem: { paddingVertical: 5, paddingHorizontal: 9, borderRadius: 9 },
  segOn: { backgroundColor: colors.accentFill },
  segText: { fontSize: 11, fontWeight: '800', color: colors.muted },
  whatIf: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.accentSoft },
  whatIfText: { flex: 1, fontSize: 13, fontWeight: '800', color: colors.accent },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accentBorder, backgroundColor: colors.surfaceAlt },
  emptyText: { flex: 1, fontSize: 13, color: colors.muted, lineHeight: 18 },
  overall: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.accentSoft, borderRadius: 18, padding: 14, marginBottom: 14 },
  overallKicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: colors.accent },
  overallValue: { fontSize: 30, fontWeight: '800', color: colors.ink, letterSpacing: -0.5, marginTop: 2 },
  overallOf: { fontSize: 15, fontWeight: '700', color: colors.muted },
  overallSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  letterBox: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 22, fontWeight: '800', color: colors.onAccent },
  subject: { marginBottom: 12 },
  subjectRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  subjectName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink },
  subjectCount: { fontSize: 11, color: colors.muted },
  subjectValue: { fontSize: 15, fontWeight: '800', minWidth: 44, textAlign: 'right' },
  subjectLetter: { fontSize: 12, fontWeight: '800', color: colors.muted, minWidth: 22, textAlign: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.bg, marginTop: 6, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  examRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingLeft: 18 },
  examTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.ink },
  examMeta: { fontSize: 11, color: colors.muted },
  examPct: { fontSize: 13, fontWeight: '800', minWidth: 40, textAlign: 'right' },
  needs: { marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  needsTitle: { fontSize: 12, fontWeight: '800', color: colors.warn, marginBottom: 6 },
  needsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  addScore: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.accentSoft, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12 },
  addScoreText: { fontSize: 12, fontWeight: '800', color: colors.accent },
  more: { fontSize: 12, color: colors.muted, marginTop: 4 },
}));
