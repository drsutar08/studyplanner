import React, { useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles, readable } from '../theme';
import { t } from '../i18n';
import { dateKey } from '../dates';
import { useStore } from '../store';
import { dueCards, nextInterval, intervalUnit, GRADES } from '../flashcards';
import { useBreakAd } from '../ads';

const GRADE_TONE = { again: 'danger', hard: 'warn', good: 'success', easy: 'accent' };

// When a grade brings a card back: "now", "1 day", "3 weeks"…
const whenText = (days) => {
  const { n, unit } = intervalUnit(days);
  return unit === 'now' ? t('cards.whenNow') : t(`cards.when.${unit}`, { count: n });
};

// A review session: the cards due (one deck, or all), each shown question first; after "Show answer" it is graded,
// which schedules it. Cards graded Again come back later in the same session. Ends with a summary.
export default function ReviewSheet({ visible, subjectId, title, onClose }) {
  const breakAd = useBreakAd();
  const { state, dispatch } = useStore();
  const [queue, setQueue] = useState([]); // card ids still to see
  const [shown, setShown] = useState(false);
  const [tally, setTally] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [openFor, setOpenFor] = useState(false);
  if (visible !== openFor) {
    setOpenFor(visible);
    if (visible) {
      setQueue(dueCards(state.cards, dateKey(), { subjectId }).map((c) => c.id));
      setShown(false);
      setTally({ again: 0, hard: 0, good: 0, easy: 0 });
    }
  }
  const card = queue.length ? (state.cards || []).find((c) => c.id === queue[0]) : null;
  const total = queue.length + Object.values(tally).reduce((a, b) => a + b, 0) - tally.again;
  const done = total - queue.length;
  const subject = card && state.subjects.find((s) => s.id === card.subjectId);

  const grade = (g) => {
    dispatch({ type: 'REVIEW_CARD', id: card.id, grade: g, today: dateKey() });
    setTally((x) => ({ ...x, [g]: x[g] + 1 }));
    // forgotten: again at the end of this session
    setQueue((q) => (g === 'again' ? [...q.slice(1), q[0]] : q.slice(1)));
    setShown(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1, alignSelf: 'stretch' }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading} numberOfLines={1}>{t('cards.reviewTitle', { name: title })}</Text>
              <Text style={styles.headSub}>{card ? t('cards.progress', { done: done + 1, count: total }) : t('cards.sessionDone')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
          {total ? (
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${Math.round((done / Math.max(1, total)) * 100)}%` }]} />
            </View>
          ) : null}

          {card ? (
            <>
              <ScrollView style={styles.cardBox} contentContainerStyle={{ padding: 20 }}>
                {subject ? <Text style={[styles.cardSubject, { color: readable(subject.color) }]}>{subject.name}</Text> : null}
                <Text style={styles.cardFront} accessibilityRole="header">{card.front}</Text>
                {shown ? (
                  <>
                    <View style={styles.divider} />
                    <Text style={styles.cardBack} accessibilityLiveRegion="polite">{card.back}</Text>
                  </>
                ) : null}
              </ScrollView>
              {!shown ? (
                <Pressable onPress={() => setShown(true)} style={styles.show} accessibilityRole="button">
                  <Text style={styles.showText}>{t('cards.showAnswer')}</Text>
                </Pressable>
              ) : (
                <View style={styles.grades}>
                  {GRADES.map((g) => (
                    <Pressable key={g} onPress={() => grade(g)} style={[styles.grade, { borderColor: colors[GRADE_TONE[g]] }]} accessibilityRole="button" accessibilityLabel={t('cards.gradeA11y', { grade: t(`cards.grades.${g}`), when: whenText(nextInterval(card, g)) })}>
                      <Text style={[styles.gradeName, { color: colors[GRADE_TONE[g]] }]}>{t(`cards.grades.${g}`)}</Text>
                      <Text style={styles.gradeWhen}>{whenText(nextInterval(card, g))}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.doneBox}>
              <Ionicons name="checkmark-circle" size={44} color={colors.success} />
              <Text style={styles.doneTitle}>{total ? t('cards.doneTitle') : t('cards.nothingDue')}</Text>
              {total ? <Text style={styles.doneText}>{t('cards.doneSummary', { count: total, again: tally.again })}</Text> : null}
              {/* a finished review is a natural break: a full-screen ad may show as it closes (ads.native.js) */}
              <Pressable
                onPress={() => {
                  onClose();
                  if (total) breakAd.atBreak();
                }}
                style={styles.show}
                accessibilityRole="button"
              >
                <Text style={styles.showText}>{t('cards.finish')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 10, paddingBottom: 28 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: 'hidden', marginBottom: 14 },
  barFill: { height: 6, borderRadius: 3, backgroundColor: '#5B3FD9' },
  cardBox: { maxHeight: 320, minHeight: 180, borderRadius: 20, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line },
  cardSubject: { fontSize: 12, fontWeight: '800', marginBottom: 8 },
  cardFront: { fontSize: 22, fontWeight: '800', color: colors.ink, lineHeight: 30 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 16 },
  cardBack: { fontSize: 18, color: colors.ink, lineHeight: 26 },
  show: { marginTop: 16, borderRadius: radius.md, height: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentFill, alignSelf: 'stretch' },
  showText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
  grades: { flexDirection: 'row', gap: 8, marginTop: 16 },
  grade: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14, borderWidth: 2, backgroundColor: colors.surface },
  gradeName: { fontSize: 14, fontWeight: '800' },
  gradeWhen: { fontSize: 11, color: colors.muted, marginTop: 2 },
  doneBox: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  doneTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 4 },
  doneText: { fontSize: 14, color: colors.muted, textAlign: 'center' },
}));
