import React, { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles, solid } from '../theme';
import { t } from '../i18n';
import { dateKey, formatDue } from '../dates';
import { useStore } from '../store';
import { useToast } from '../toast';
import { askHelper } from '../cloud/aiHelper';
import { cloudConfigured } from '../cloud/supabase';
import { usePlan, refreshPlan } from '../cloud/plan';
import { aiLocked } from '../plans';
import { openPremium } from './PremiumSheet';
import { prepPlan, prepDays, suggestedSessions, parseTopics, planTasks, PREP_MINUTES, MAX_SESSIONS } from '../examPrep';

// a plan step's task title, in the person's language
export const prepTitle = (step, exam) => {
  if (step.kind === 'final') return t('prep.taskFinal', { exam: exam.title });
  if (step.kind === 'practice') return t('prep.taskPractice', { exam: exam.title });
  if (step.kind === 'topic') return step.rest ? t('prep.taskTopicRest', { topic: step.topic, rest: step.rest.join(', '), exam: exam.title }) : t('prep.taskTopic', { topic: step.topic, exam: exam.title });
  return t('prep.taskSession', { exam: exam.title, n: step.n, of: step.of });
};

let seq = 0;
const newId = (examId) => `prep-${examId}-${Date.now().toString(36)}${(seq++).toString(36)}`;

// Make (or remake) an exam's prep plan: how many sessions, how long, and optionally the topics; the preview shows
// each day's task. Adding puts them in as ordinary tasks for the exam's subject, with Undo.
export default function ExamPrepSheet({ visible, exam, subject, onClose }) {
  const { state, dispatch } = useStore();
  const { show } = useToast();
  const plan = usePlan();
  const today = dateKey();
  const days = exam ? prepDays(exam, today).length : 0;
  const [count, setCount] = useState(null);
  const [minutes, setMinutes] = useState(45);
  const [topicsText, setTopicsText] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState('');
  const [openFor, setOpenFor] = useState(null);
  const key = visible && exam ? exam.id : null;
  if (key !== openFor) {
    setOpenFor(key);
    if (key) {
      setCount(null);
      setMinutes(45);
      setTopicsText('');
      setSuggestError('');
    }
  }

  const sessions = count == null ? suggestedSessions(days) : count;
  const topics = parseTopics(topicsText);
  const steps = exam ? prepPlan({ exam, today, count: sessions, minutes, topics }) : [];
  const existing = exam ? planTasks(state.tasks, exam.id) : [];
  const left = existing.filter((x) => !x.done);
  const tint = solid(subject ? subject.color : colors.accentFill);

  if (!exam) return null;

  const add = () => {
    const tasks = steps.map((s) => ({
      id: newId(exam.id),
      title: prepTitle(s, exam),
      subjectId: exam.subjectId || null,
      due: s.due,
      time: null,
      notes: '',
      estimate: s.estimate,
      priority: s.kind === 'final' || s.kind === 'practice' ? 'high' : 'med',
      done: false,
      completedAt: null,
      prepFor: exam.id,
    }));
    const replaced = left;
    dispatch({ type: 'ADD_PREP_PLAN', examId: exam.id, tasks });
    onClose();
    show({
      tone: 'success',
      message: t('prep.added', { count: tasks.length, title: exam.title }),
      actionLabel: t('common.undo'),
      onAction: () => dispatch({ type: 'UNDO_PREP_PLAN', ids: tasks.map((x) => x.id), restore: replaced }),
    });
  };
  const remove = () => {
    dispatch({ type: 'DELETE_TASKS', ids: left.map((x) => x.id) });
    onClose();
    show({ message: t('prep.removed'), actionLabel: t('common.undo'), onAction: () => dispatch({ type: 'UNDO_PREP_PLAN', ids: [], restore: left }) });
  };

  // the AI helper lists the topics (from the exam, and the syllabus when one is pasted in the box)
  const suggest = async () => {
    // the helper is Premium only: Free accounts are shown what Premium adds
    if (aiLocked(plan)) {
      openPremium('ai');
      return;
    }
    setSuggesting(true);
    setSuggestError('');
    try {
      const r = await askHelper('topics', { exam: exam.title, subject: subject ? subject.name : '', text: topicsText });
      if (r.topics && r.topics.length) setTopicsText(r.topics.join('\n'));
    } catch (e) {
      if (e.kind === 'premium') refreshPlan();
      setSuggestError(t(`ai.errors.${e.kind || 'server'}`, { max: 20000 }));
    }
    setSuggesting(false);
  };

  const step = (d) => setCount(Math.max(1, Math.min(Math.min(days, MAX_SESSIONS), sessions + d)));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1, alignSelf: 'stretch' }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={[styles.headIcon, { backgroundColor: tint }]}>
              <Ionicons name="school" size={20} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{t('prep.title')}</Text>
              <Text style={styles.headSub} numberOfLines={1}>{t('prep.sub', { title: exam.title, when: formatDue(exam.date) })}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          {!days ? (
            <Text style={styles.note}>{t('prep.noDays')}</Text>
          ) : (
            <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
              {left.length ? (
                <View style={styles.existing}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
                  <Text style={styles.existingText}>{t('prep.existing', { count: left.length })}</Text>
                </View>
              ) : null}

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('prep.sessionsLabel')}</Text>
                  <Text style={styles.hint}>{t('prep.daysLeft', { count: days })}</Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable onPress={() => step(-1)} disabled={sessions <= 1} style={[styles.stepBtn, sessions <= 1 && { opacity: 0.35 }]} accessibilityRole="button" accessibilityLabel={t('prep.fewer')}>
                    <Ionicons name="remove" size={16} color={colors.accent} />
                  </Pressable>
                  <Text style={styles.stepValue} accessibilityLiveRegion="polite">{sessions}</Text>
                  <Pressable onPress={() => step(1)} disabled={sessions >= Math.min(days, MAX_SESSIONS)} style={[styles.stepBtn, sessions >= Math.min(days, MAX_SESSIONS) && { opacity: 0.35 }]} accessibilityRole="button" accessibilityLabel={t('prep.more')}>
                    <Ionicons name="add" size={16} color={colors.accent} />
                  </Pressable>
                </View>
              </View>

              <Text style={[styles.label, { marginTop: 14 }]}>{t('prep.lengthLabel')}</Text>
              <View style={styles.chips}>
                {PREP_MINUTES.map((m) => {
                  const on = m === minutes;
                  return (
                    <Pressable key={m} onPress={() => setMinutes(m)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" aria-pressed={!!on} accessibilityState={{ selected: on }}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{t('common.minutes', { count: m })}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.topicsHead}>
                <Text style={[styles.label, { marginTop: 14, flex: 1 }]}>{t('prep.topicsLabel')}</Text>
                {cloudConfigured ? (
                  <Pressable onPress={suggest} disabled={suggesting} style={[styles.suggest, suggesting && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={t('ai.suggestTopicsA11y')}>
                    <Ionicons name="sparkles" size={13} color="#5B3FD9" />
                    <Text style={styles.suggestText}>{suggesting ? t('ai.thinking') : t('ai.suggestTopics')}</Text>
                  </Pressable>
                ) : null}
              </View>
              <TextInput
                value={topicsText}
                onChangeText={setTopicsText}
                placeholder={t('prep.topicsPlaceholder')}
                placeholderTextColor={colors.muted}
                multiline
                style={styles.input}
                accessibilityLabel={t('prep.topicsLabel')}
              />
              {suggestError ? <Text style={styles.suggestError}>{suggestError}</Text> : <Text style={styles.suggestHint}>{t('ai.suggestHint')}</Text>}

              <Text style={[styles.label, { marginTop: 14 }]}>{t('prep.preview')}</Text>
              {steps.map((s) => (
                <View key={s.n} style={styles.stepRow}>
                  <Text style={styles.stepDay}>{formatDue(s.due)}</Text>
                  <Text style={styles.stepTitle} numberOfLines={2}>{prepTitle(s, exam)}</Text>
                  <Text style={styles.stepMin}>{t('common.minutes', { count: s.estimate })}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {days ? (
            <Pressable onPress={add} style={[styles.save, { backgroundColor: tint }]} accessibilityRole="button">
              <Text style={styles.saveText}>{left.length ? t('prep.replace', { count: steps.length }) : t('prep.add', { count: steps.length })}</Text>
            </Pressable>
          ) : null}
          {left.length ? (
            <Pressable onPress={remove} style={styles.removeBtn} accessibilityRole="button">
              <Text style={styles.removeText}>{t('prep.remove')}</Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 10, paddingBottom: 28 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  headIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  existing: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: 12, backgroundColor: colors.accentSoft, marginBottom: 12 },
  existingText: { flex: 1, fontSize: 13, color: colors.ink, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontSize: 13, fontWeight: '800', color: colors.ink },
  hint: { fontSize: 12, color: colors.muted, marginTop: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 17, fontWeight: '800', color: colors.ink, minWidth: 22, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.accentFill, borderColor: colors.accentFill },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  chipTextOn: { color: colors.onAccent },
  input: { marginTop: 8, minHeight: 60, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, padding: 10, fontSize: 14, color: colors.ink, textAlignVertical: 'top' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  stepDay: { width: 84, fontSize: 12, fontWeight: '700', color: colors.muted },
  stepTitle: { flex: 1, fontSize: 14, color: colors.ink },
  stepMin: { fontSize: 12, fontWeight: '700', color: colors.muted },
  topicsHead: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.violetSoft },
  suggestText: { fontSize: 12, fontWeight: '800', color: '#5B3FD9' },
  suggestHint: { fontSize: 11, color: colors.muted, marginTop: 4 },
  suggestError: { fontSize: 12, color: colors.danger, fontWeight: '600', marginTop: 4 },
  note: { fontSize: 14, color: colors.muted, lineHeight: 20, marginVertical: 8 },
  save: { marginTop: 16, borderRadius: radius.md, height: 52, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
  removeBtn: { alignSelf: 'center', marginTop: 12, padding: 6 },
  removeText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
}));
