import React, { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles, solid } from '../theme';
import { t } from '../i18n';
import { dateKey } from '../dates';
import { useStore } from '../store';
import { useToast } from '../toast';
import { newCard, parseCards } from '../flashcards';
import { usePlan } from '../cloud/plan';
import { roomFor } from '../plans';
import { openPremium } from './PremiumSheet';

let seq = 0;
const newId = () => `card-${Date.now().toString(36)}${(seq++).toString(36)}`;

// Add flashcards (one, or many pasted as "question | answer" lines) or edit one: its question, answer and subject
export default function CardSheet({ visible, card, subjectId, onClose }) {
  const { state, dispatch } = useStore();
  const plan = usePlan();
  const { show } = useToast();
  const [mode, setMode] = useState('one'); // 'one' | 'many'
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [many, setMany] = useState('');
  const [subject, setSubject] = useState(null);
  const [openFor, setOpenFor] = useState(null);
  const key = visible ? (card ? card.id : `new:${subjectId}`) : null;
  if (key !== openFor) {
    setOpenFor(key);
    if (key) {
      setMode('one');
      setFront(card ? card.front : '');
      setBack(card ? card.back : '');
      setMany('');
      setSubject(card ? card.subjectId || null : subjectId === undefined ? null : subjectId);
    }
  }
  const parsed = mode === 'many' ? parseCards(many) : [];
  const canSave = mode === 'one' ? front.trim() && back.trim() : parsed.length > 0;

  const save = () => {
    if (!canSave) return;
    const today = dateKey();
    if (card) {
      dispatch({ type: 'UPDATE_CARD', id: card.id, patch: { front: front.trim().slice(0, 500), back: back.trim().slice(0, 1000), subjectId: subject } });
      onClose();
      return;
    }
    const cards = (mode === 'one' ? [{ front, back }] : parsed).map((c) => newCard({ id: newId(), subjectId: subject, front: c.front, back: c.back, today }));
    // the Free plan's flashcard limit (the server refuses more as well)
    if (cards.length > roomFor(plan, 'cards', (state.cards || []).length)) {
      show({ tone: 'error', message: t('premium.limits.cards', { count: plan.limits.cards }), actionLabel: t('premium.see'), onAction: () => openPremium('cards') });
      return;
    }
    dispatch({ type: 'ADD_CARDS', cards });
    onClose();
    show({ tone: 'success', message: t('cards.added', { count: cards.length }), actionLabel: t('common.undo'), onAction: () => cards.forEach((c) => dispatch({ type: 'DELETE_CARD', id: c.id })) });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1, alignSelf: 'stretch' }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={styles.headIcon}>
              <Ionicons name="albums" size={20} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{card ? t('cards.editTitle') : t('cards.addTitle')}</Text>
              <Text style={styles.headSub}>{t('cards.sheetSub')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled">
            {!card ? (
              <View style={styles.seg} accessibilityRole="tablist">
                {[['one', t('cards.modeOne')], ['many', t('cards.modeMany')]].map(([k, label]) => (
                  <Pressable key={k} onPress={() => setMode(k)} style={[styles.segBtn, mode === k && styles.segOn]} accessibilityRole="tab" aria-selected={mode === k} accessibilityState={{ selected: mode === k }}>
                    <Text style={[styles.segText, mode === k && styles.segTextOn]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {mode === 'one' ? (
              <>
                <Text style={styles.label}>{t('cards.front')}</Text>
                <TextInput value={front} onChangeText={setFront} placeholder={t('cards.frontPlaceholder')} placeholderTextColor={colors.muted} multiline style={styles.input} accessibilityLabel={t('cards.front')} maxLength={500} />
                <Text style={styles.label}>{t('cards.back')}</Text>
                <TextInput value={back} onChangeText={setBack} placeholder={t('cards.backPlaceholder')} placeholderTextColor={colors.muted} multiline style={styles.input} accessibilityLabel={t('cards.back')} maxLength={1000} />
              </>
            ) : (
              <>
                <Text style={styles.label}>{t('cards.manyLabel')}</Text>
                <TextInput value={many} onChangeText={setMany} placeholder={t('cards.manyPlaceholder')} placeholderTextColor={colors.muted} multiline style={[styles.input, { minHeight: 140 }]} accessibilityLabel={t('cards.manyLabel')} />
                <Text style={styles.hint}>{parsed.length ? t('cards.manyFound', { count: parsed.length }) : t('cards.manyHint')}</Text>
              </>
            )}

            <Text style={styles.label}>{t('cards.subject')}</Text>
            <View style={styles.chips}>
              {[{ id: null, name: t('cards.noSubject'), color: colors.muted }, ...state.subjects].map((s) => {
                const on = subject === s.id;
                return (
                  <Pressable key={String(s.id)} onPress={() => setSubject(s.id)} style={[styles.chip, on && { backgroundColor: solid(s.color), borderColor: solid(s.color) }]} accessibilityRole="button" aria-pressed={on} accessibilityState={{ selected: on }}>
                    <View style={[styles.chipDot, { backgroundColor: on ? colors.onAccent : s.color }]} />
                    <Text style={[styles.chipText, on && { color: colors.onAccent }]} numberOfLines={1}>{s.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Pressable onPress={save} disabled={!canSave} style={[styles.save, !canSave && { opacity: 0.4 }]} accessibilityRole="button">
            <Text style={styles.saveText}>{card ? t('cards.saveChanges') : t('cards.addCount', { count: mode === 'one' ? 1 : parsed.length || 0 })}</Text>
          </Pressable>
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
  headIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#5B3FD9', alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 12, padding: 3, marginBottom: 6 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  segOn: { backgroundColor: colors.accentFill },
  segText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  segTextOn: { color: colors.onAccent },
  label: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 12, marginBottom: 6 },
  input: { minHeight: 56, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, padding: 10, fontSize: 15, color: colors.ink, textAlignVertical: 'top' },
  hint: { fontSize: 12, color: colors.muted, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, maxWidth: 200 },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  save: { marginTop: 16, borderRadius: radius.md, height: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentFill },
  saveText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
}));
