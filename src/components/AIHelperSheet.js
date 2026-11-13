import React, { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles, solid } from '../theme';
import { t } from '../i18n';
import { dateKey } from '../dates';
import { useStore } from '../store';
import { useToast } from '../toast';
import { askHelper, AI_MAX_TEXT } from '../cloud/aiHelper';
import { adviceSummary } from '../aiSummary';
import { newCard } from '../flashcards';
import { usePlan, refreshPlan } from '../cloud/plan';
import { roomFor, aiLocked, PREMIUM } from '../plans';
import { openPremium } from './PremiumSheet';

const TABS = ['advice', 'cards', 'quiz'];
let seq = 0;
const newId = () => `card-ai-${Date.now().toString(36)}${(seq++).toString(36)}`;

// The AI study helper: what to study now (from the plan), flashcards from notes, and a practice quiz from notes.
// Notes are sent to the helper (Claude, through the app's server); nothing else of the student's leaves except the
// short summary the "what to study" tab shows it is using.
export default function AIHelperSheet({ visible, onClose, initialTab = 'advice' }) {
  const { state, dispatch } = useStore();
  const { show } = useToast();
  const [tab, setTab] = useState(initialTab);
  const [subject, setSubject] = useState(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const plan = usePlan();
  const locked = aiLocked(plan); // the helper is Premium only
  const [advice, setAdvice] = useState(null);
  const [cards, setCards] = useState(null); // [{ front, back, keep }]
  const [quiz, setQuiz] = useState(null); // { questions, picked: { [i]: option } }
  const [openFor, setOpenFor] = useState(false);
  if (visible !== openFor) {
    setOpenFor(visible);
    if (visible) {
      setTab(initialTab);
      setError('');
      setAdvice(null);
      setCards(null);
      setQuiz(null);
    }
  }
  const subjectName = subject ? (state.subjects.find((s) => s.id === subject) || {}).name : '';

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      // the server says Premium is needed (the plan wasn't known yet when the sheet opened): show the lock
      if (e.kind === 'premium') refreshPlan();
      setError(t(`ai.errors.${e.kind || 'server'}`, { max: AI_MAX_TEXT }));
    }
    setBusy(false);
  };
  const askAdvice = () =>
    run(async () => {
      const r = await askHelper('advice', { today: dateKey(), summary: adviceSummary(state, dateKey()) });
      setAdvice(r);
    });
  const askCards = () =>
    run(async () => {
      const r = await askHelper('cards', { subject: subjectName, text: notes });
      setCards((r.cards || []).map((c) => ({ ...c, keep: true })));
    });
  const askQuiz = () =>
    run(async () => {
      const r = await askHelper('quiz', { subject: subjectName, text: notes });
      setQuiz({ questions: r.questions || [], picked: {} });
    });
  const addCards = () => {
    const today = dateKey();
    const made = cards.filter((c) => c.keep).map((c) => newCard({ id: newId(), subjectId: subject, front: c.front, back: c.back, today }));
    if (!made.length) return;
    if (made.length > roomFor(plan, 'cards', (state.cards || []).length)) {
      show({ tone: 'error', message: t('premium.limits.cards', { count: plan.limits.cards }), actionLabel: t('premium.see'), onAction: () => openPremium('cards') });
      return;
    }
    dispatch({ type: 'ADD_CARDS', cards: made });
    onClose();
    show({ tone: 'success', message: t('cards.added', { count: made.length }), actionLabel: t('common.undo'), onAction: () => made.forEach((c) => dispatch({ type: 'DELETE_CARD', id: c.id })) });
  };

  const notesBox = (
    <>
      <Text style={styles.label}>{t('ai.subject')}</Text>
      <View style={styles.chips}>
        {[{ id: null, name: t('cards.noSubject'), color: colors.muted }, ...state.subjects].map((s) => {
          const on = subject === s.id;
          return (
            <Pressable key={String(s.id)} onPress={() => setSubject(s.id)} style={[styles.chip, on && { backgroundColor: solid(s.color), borderColor: solid(s.color) }]} accessibilityRole="button" aria-pressed={on} accessibilityState={{ selected: on }}>
              <Text style={[styles.chipText, on && { color: colors.onAccent }]} numberOfLines={1}>{s.name}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.label}>{t('ai.notesLabel')}</Text>
      <TextInput value={notes} onChangeText={setNotes} placeholder={t('ai.notesPlaceholder')} placeholderTextColor={colors.muted} multiline style={styles.input} accessibilityLabel={t('ai.notesLabel')} />
      <Text style={styles.hint}>{t('ai.notesHint', { count: notes.length, max: AI_MAX_TEXT })}</Text>
    </>
  );
  const askButton = (label, onPress, disabled) => (
    <Pressable onPress={onPress} disabled={busy || disabled} style={[styles.ask, (busy || disabled) && { opacity: 0.5 }]} accessibilityRole="button">
      {busy ? <ActivityIndicator color={colors.onAccent} /> : <Ionicons name="sparkles" size={16} color={colors.onAccent} />}
      <Text style={styles.askText}>{busy ? t('ai.thinking') : label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1, alignSelf: 'stretch' }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={styles.headIcon}>
              <Ionicons name="sparkles" size={20} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{t('ai.title')}</Text>
              <Text style={styles.headSub}>{t('ai.sub')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          {locked ? (
            <View style={styles.lock}>
              <View style={styles.lockIcon}>
                <Ionicons name="lock-closed" size={24} color={colors.onAccent} />
              </View>
              <Text style={styles.lockTitle} accessibilityRole="header">{t('ai.locked.title')}</Text>
              <Text style={styles.lockText}>{t('ai.locked.text', { count: PREMIUM.ai })}</Text>
              <Pressable onPress={() => openPremium('ai')} style={[styles.ask, styles.lockButton]} accessibilityRole="button">
                <Ionicons name="diamond" size={18} color="#fff" />
                <Text style={styles.askText}>{t('premium.see')}</Text>
              </Pressable>
            </View>
          ) : (
          <>
          <View style={styles.seg} accessibilityRole="tablist">
            {TABS.map((k) => (
              <Pressable key={k} onPress={() => { setTab(k); setError(''); }} style={[styles.segBtn, tab === k && styles.segOn]} accessibilityRole="tab" aria-selected={tab === k} accessibilityState={{ selected: tab === k }}>
                <Text style={[styles.segText, tab === k && styles.segTextOn]} numberOfLines={1}>{t(`ai.tabs.${k}`)}</Text>
              </Pressable>
            ))}
          </View>

          <ScrollView style={{ maxHeight: 470 }} keyboardShouldPersistTaps="handled">
            {tab === 'advice' ? (
              <>
                <Text style={styles.intro}>{t('ai.adviceIntro')}</Text>
                {advice ? (
                  <View style={styles.result}>
                    <Text style={styles.headline}>{advice.headline}</Text>
                    {(advice.steps || []).map((s, i) => (
                      <View key={i} style={styles.step}>
                        <Text style={styles.stepNum}>{i + 1}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.stepTitle}>{s.title}</Text>
                          <Text style={styles.stepWhy}>{s.why}</Text>
                        </View>
                        <Text style={styles.stepMin}>{t('common.minutes', { count: s.minutes })}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {askButton(advice ? t('ai.askAgain') : t('ai.askAdvice'), askAdvice)}
              </>
            ) : null}

            {tab === 'cards' ? (
              cards ? (
                <>
                  <Text style={styles.intro}>{t('ai.cardsReview', { count: cards.length })}</Text>
                  {cards.map((c, i) => (
                    <Pressable key={i} onPress={() => setCards((list) => list.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))} style={[styles.cardRow, !c.keep && { opacity: 0.45 }]} accessibilityRole="checkbox" aria-checked={c.keep} accessibilityState={{ checked: c.keep }}>
                      <Ionicons name={c.keep ? 'checkbox' : 'square-outline'} size={20} color={c.keep ? colors.accent : colors.muted} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardFront}>{c.front}</Text>
                        <Text style={styles.cardBack}>{c.back}</Text>
                      </View>
                    </Pressable>
                  ))}
                  <Pressable onPress={addCards} disabled={!cards.some((c) => c.keep)} style={[styles.ask, !cards.some((c) => c.keep) && { opacity: 0.5 }]} accessibilityRole="button">
                    <Ionicons name="add" size={18} color={colors.onAccent} />
                    <Text style={styles.askText}>{t('cards.addCount', { count: cards.filter((c) => c.keep).length })}</Text>
                  </Pressable>
                  <Pressable onPress={() => setCards(null)} style={styles.back} accessibilityRole="button">
                    <Text style={styles.backText}>{t('ai.startOver')}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.intro}>{t('ai.cardsIntro')}</Text>
                  {notesBox}
                  {askButton(t('ai.makeCards'), askCards, !notes.trim())}
                </>
              )
            ) : null}

            {tab === 'quiz' ? (
              quiz ? (
                <>
                  {quiz.questions.map((q, i) => {
                    const picked = quiz.picked[i];
                    return (
                      <View key={i} style={styles.question}>
                        <Text style={styles.qText}>{`${i + 1}. ${q.question}`}</Text>
                        {q.options.map((o, j) => {
                          const answered = picked !== undefined;
                          const right = answered && j === q.answer;
                          const wrong = answered && j === picked && j !== q.answer;
                          return (
                            <Pressable key={j} disabled={answered} onPress={() => setQuiz((x) => ({ ...x, picked: { ...x.picked, [i]: j } }))} style={[styles.option, right && styles.optRight, wrong && styles.optWrong]} accessibilityRole="button" aria-pressed={picked === j} accessibilityState={{ selected: picked === j, disabled: answered }}>
                              <Text style={styles.optText}>{o}</Text>
                              {right ? <Ionicons name="checkmark-circle" size={18} color={colors.success} /> : wrong ? <Ionicons name="close-circle" size={18} color={colors.danger} /> : null}
                            </Pressable>
                          );
                        })}
                        {picked !== undefined ? <Text style={styles.explain}>{q.explanation}</Text> : null}
                      </View>
                    );
                  })}
                  <Text style={styles.score}>{t('ai.score', { right: quiz.questions.filter((q, i) => quiz.picked[i] === q.answer).length, count: quiz.questions.length })}</Text>
                  <Pressable onPress={() => setQuiz(null)} style={styles.back} accessibilityRole="button">
                    <Text style={styles.backText}>{t('ai.startOver')}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.intro}>{t('ai.quizIntro')}</Text>
                  {notesBox}
                  {askButton(t('ai.makeQuiz'), askQuiz, !notes.trim())}
                </>
              )
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.privacy}>{t('ai.privacy')}</Text>
          </ScrollView>
          </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 10, paddingBottom: 24 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  headIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#5B3FD9', alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 12, padding: 3, marginBottom: 10 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  segOn: { backgroundColor: colors.accentFill },
  segText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  segTextOn: { color: colors.onAccent },
  intro: { fontSize: 13, color: colors.muted, lineHeight: 19, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 10, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, maxWidth: 180 },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  input: { minHeight: 120, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, padding: 10, fontSize: 14, color: colors.ink, textAlignVertical: 'top' },
  hint: { fontSize: 11, color: colors.muted, marginTop: 4 },
  ask: { marginTop: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', height: 50, borderRadius: radius.md, backgroundColor: '#5B3FD9' },
  askText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  result: { padding: 14, borderRadius: 16, backgroundColor: colors.violetSoft, marginTop: 4 },
  headline: { fontSize: 16, fontWeight: '800', color: colors.ink, lineHeight: 22 },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 12 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#5B3FD9', color: '#fff', textAlign: 'center', fontSize: 12, fontWeight: '800', lineHeight: 22, overflow: 'hidden' },
  stepTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  stepWhy: { fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 18 },
  stepMin: { fontSize: 12, fontWeight: '800', color: colors.muted },
  cardRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 10, borderRadius: 12, backgroundColor: colors.bg, marginBottom: 6 },
  cardFront: { fontSize: 14, fontWeight: '700', color: colors.ink },
  cardBack: { fontSize: 13, color: colors.muted, marginTop: 2 },
  back: { alignSelf: 'center', marginTop: 10, padding: 6 },
  backText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  question: { marginBottom: 14 },
  qText: { fontSize: 15, fontWeight: '800', color: colors.ink, marginBottom: 6, lineHeight: 21 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line, marginBottom: 6 },
  optRight: { borderColor: colors.success, backgroundColor: colors.successSoft },
  optWrong: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  optText: { flex: 1, fontSize: 14, color: colors.ink },
  explain: { fontSize: 13, color: colors.muted, lineHeight: 18, marginTop: 2 },
  score: { fontSize: 15, fontWeight: '800', color: colors.ink, textAlign: 'center', marginTop: 4 },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', marginTop: 10 },
  lock: { alignItems: 'center', paddingVertical: 12 },
  lockIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#5B3FD9', alignItems: 'center', justifyContent: 'center' },
  lockTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 12, textAlign: 'center' },
  lockButton: { alignSelf: 'stretch', marginTop: 20, paddingHorizontal: 24 },
  lockText: { fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: 6, textAlign: 'center' },
  privacy: { fontSize: 11, color: colors.muted, marginTop: 14, lineHeight: 16 },
}));
