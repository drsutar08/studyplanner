import React, { useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles, readable } from '../theme';
import { t } from '../i18n';
import { formatDue } from '../dates';
import { isGraded, letterOf, gpa4Of, gpa10Of } from '../grades';
import { TARGETS, neededScore, projectedAverage, projectedOverall } from '../whatIf';

const WEIGHTS = [1, 2, 3];
const pct = (v) => `${Math.round(v)}%`;

// Grade "what-if" for one subject: pick a target average and see the score needed on the exams still to
// come (each with its weight, which can be changed here to try things), then "what if I score…" to see the
// subject and overall averages that would give. Nothing here is saved.
export default function WhatIfSheet({ visible, onClose, exams, subjects, initialSubjectId, today, scale = 'percent' }) {
  // subjects worth asking about: with a score or an exam still to come
  const choices = useMemo(() => subjects.filter((s) => exams.some((e) => e.subjectId === s.id && (isGraded(e) || e.date >= today))), [subjects, exams, today]);
  const [subjectId, setSubjectId] = useState(null);
  const [target, setTarget] = useState(75);
  const [weights, setWeights] = useState({}); // exam id -> weight tried here
  const [extraWeight, setExtraWeight] = useState(1); // a next exam when none is in the calendar yet
  const [tryScore, setTryScore] = useState(null); // null: follow the needed score

  // start on the subject it was opened for, each time it opens
  const [openFor, setOpenFor] = useState(false);
  if (visible !== openFor) {
    setOpenFor(visible);
    if (visible) {
      setSubjectId(initialSubjectId && choices.some((s) => s.id === initialSubjectId) ? initialSubjectId : choices[0] ? choices[0].id : null);
      setWeights({});
      setExtraWeight(1);
      setTryScore(null);
    }
  }

  const subject = subjects.find((s) => s.id === subjectId);
  const tint = subject ? subject.color : colors.accent;
  const mine = exams.filter((e) => e.subjectId === subjectId);
  const graded = mine.filter(isGraded);
  const upcoming = mine.filter((e) => !isGraded(e) && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const weightOf = (e) => weights[e.id] ?? (e.weight > 0 ? e.weight : 1);
  const upcomingWeights = upcoming.length ? upcoming.map(weightOf) : [extraWeight];
  const need = neededScore({ graded, upcoming: upcomingWeights, target });
  const score = tryScore ?? Math.min(100, Math.round(need.needed));
  const subjectAvg = projectedAverage({ graded, upcoming: upcomingWeights, score });
  const overall = projectedOverall(exams, subjectId, subjectAvg);
  const gpa = (v) => (scale === 'gpa4' ? ` · ${gpa4Of(v).toFixed(1)} / 4.0` : scale === 'gpa10' ? ` · ${gpa10Of(v).toFixed(1)} / 10` : '');

  const chip = (on, label, onPress, a11y) => (
    <Pressable key={label} onPress={onPress} style={[styles.chip, on && { backgroundColor: tint, borderColor: tint }]} accessibilityRole="button" aria-pressed={!!on} accessibilityState={{ selected: on }} accessibilityLabel={a11y || label}>
      <Text style={[styles.chipText, on && { color: colors.onAccent }]}>{label}</Text>
    </Pressable>
  );

  const verdict =
    need.status === 'reached'
      ? { icon: 'checkmark-circle', color: colors.success, bg: colors.successSoft, text: t('whatIf.reached', { target: pct(target), worst: pct(need.worst) }) }
      : need.status === 'impossible'
        ? { icon: 'alert-circle', color: colors.danger, bg: colors.dangerSoft, text: t('whatIf.impossible', { target: pct(target), best: pct(need.best) }) }
        : {
            icon: 'flag',
            color: tint,
            bg: tint + '1A',
            text: upcoming.length > 1 ? t('whatIf.neededEach', { score: pct(Math.ceil(need.needed)), count: upcoming.length, target: pct(target) }) : t('whatIf.needed', { score: pct(Math.ceil(need.needed)), exam: upcoming.length ? upcoming[0].title : t('whatIf.nextExam'), target: pct(target) }),
          };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={[styles.headIcon, { backgroundColor: tint }]}>
              <Ionicons name="calculator" size={20} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{t('whatIf.title')}</Text>
              <Text style={styles.headSub}>{t('whatIf.sub')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          {!subject ? (
            <Text style={styles.empty}>{t('whatIf.noSubjects')}</Text>
          ) : (
            <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
              <View style={styles.row}>{choices.map((s) => chip(s.id === subjectId, s.name, () => { setSubjectId(s.id); setWeights({}); setTryScore(null); }))}</View>

              <Text style={styles.now}>
                {need.current === null ? t('whatIf.noScores') : t('whatIf.current', { avg: pct(need.current), letter: letterOf(need.current), count: graded.length })}
              </Text>

              <Text style={styles.label}>{t('whatIf.target')}</Text>
              <View style={styles.row}>{TARGETS.map((v) => chip(target === v, `${v}%`, () => { setTarget(v); setTryScore(null); }, t('whatIf.targetA11y', { pct: v })))}</View>

              <Text style={styles.label}>{t('whatIf.ahead')}</Text>
              {upcoming.length ? (
                upcoming.map((e) => (
                  <View key={e.id} style={styles.exam}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.examTitle} numberOfLines={1}>{e.title}</Text>
                      <Text style={styles.examMeta}>{formatDue(e.date)}</Text>
                    </View>
                    <View style={styles.row}>{WEIGHTS.map((w) => chip(weightOf(e) === w, `×${w}`, () => { setWeights((cur) => ({ ...cur, [e.id]: w })); setTryScore(null); }, t('whatIf.weightA11y', { title: e.title, n: w })))}</View>
                  </View>
                ))
              ) : (
                <View style={styles.exam}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.examTitle}>{t('whatIf.nextExam')}</Text>
                    <Text style={styles.examMeta}>{t('whatIf.notInCalendar')}</Text>
                  </View>
                  <View style={styles.row}>{WEIGHTS.map((w) => chip(extraWeight === w, `×${w}`, () => { setExtraWeight(w); setTryScore(null); }, t('whatIf.weightA11y', { title: t('whatIf.nextExam'), n: w })))}</View>
                </View>
              )}

              <View style={[styles.verdict, { backgroundColor: verdict.bg }]} accessibilityLiveRegion="polite">
                <Ionicons name={verdict.icon} size={20} color={verdict.color} />
                <Text style={[styles.verdictText, { color: verdict.color }]}>{verdict.text}</Text>
              </View>

              <Text style={styles.label}>{t('whatIf.tryLabel')}</Text>
              <View style={styles.stepper}>
                <Pressable onPress={() => setTryScore(Math.max(0, score - 5))} style={styles.step} accessibilityRole="button" accessibilityLabel={t('whatIf.lower')}>
                  <Ionicons name="remove" size={18} color={colors.ink} />
                </Pressable>
                <Text style={styles.score} accessibilityLabel={t('whatIf.scoreA11y', { pct: score })}>{score}%</Text>
                <Pressable onPress={() => setTryScore(Math.min(100, score + 5))} style={styles.step} accessibilityRole="button" accessibilityLabel={t('whatIf.higher')}>
                  <Ionicons name="add" size={18} color={colors.ink} />
                </Pressable>
              </View>
              <View style={styles.results}>
                <View style={styles.result}>
                  <Text style={styles.resultLabel}>{subject.name}</Text>
                  <Text style={[styles.resultValue, { color: readable(tint) }]}>{pct(subjectAvg)}</Text>
                  <Text style={styles.resultSub}>{`${letterOf(subjectAvg)}${gpa(subjectAvg)}`}</Text>
                </View>
                <View style={styles.result}>
                  <Text style={styles.resultLabel}>{t('whatIf.overall')}</Text>
                  <Text style={styles.resultValue}>{pct(overall)}</Text>
                  <Text style={styles.resultSub}>{`${letterOf(overall)}${gpa(overall)}`}</Text>
                </View>
              </View>
              <Text style={styles.note}>{t('whatIf.note')}</Text>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.scrim },
  dismiss: { flex: 1, alignSelf: 'stretch' },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 10, paddingBottom: 28 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  headIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  now: { fontSize: 13, color: colors.muted, marginTop: 12 },
  label: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 16, marginBottom: 8 },
  exam: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  examTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  examMeta: { fontSize: 12, color: colors.muted, marginTop: 1 },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md, marginTop: 14 },
  verdictText: { flex: 1, fontSize: 14, fontWeight: '800', lineHeight: 20 },
  stepper: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 12, backgroundColor: colors.bg, borderRadius: 999, padding: 4 },
  step: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: 18, fontWeight: '800', color: colors.ink, minWidth: 52, textAlign: 'center' },
  results: { flexDirection: 'row', gap: 10, marginTop: 12 },
  result: { flex: 1, backgroundColor: colors.bg, borderRadius: 16, padding: 12 },
  resultLabel: { fontSize: 11, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  resultValue: { fontSize: 24, fontWeight: '800', color: colors.ink, marginTop: 2 },
  resultSub: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  note: { fontSize: 12, color: colors.muted, marginTop: 12, lineHeight: 17 },
}));
