import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, shadow, themedStyles, readable } from '../theme';
import { t } from '../i18n';
import { AdBanner } from '../ads';
import { useStore } from '../store';
import { useToast } from '../toast';
import { dateKey, formatDue } from '../dates';
import { useTwoColumns } from '../layout';
import { deckStats, dueCards } from '../flashcards';
import CardSheet from '../components/CardSheet';
import ReviewSheet from '../components/ReviewSheet';
import AIHelperSheet from '../components/AIHelperSheet';

// Flashcards: a deck per subject (cards without a subject in a deck of their own), how many are due, and Review.
// Opening a deck lists its cards to edit; + adds one card or many at once.
export default function FlashcardsScreen() {
  const { state, dispatch } = useStore();
  const { show } = useToast();
  const wide = useTwoColumns();
  const today = dateKey();
  const cards = state.cards || [];
  const decks = deckStats(cards, state.subjects, today);
  const due = dueCards(cards, today).length;
  const [open, setOpen] = useState(undefined); // the deck being looked at: a subject id, null (no subject), undefined (none)
  const [editing, setEditing] = useState(null); // null | { card } | { subjectId } (new)
  const [reviewing, setReviewing] = useState(null); // null | { subjectId } (undefined = every deck)
  const [helper, setHelper] = useState(null); // the AI helper, open on a tab
  const subjectById = Object.fromEntries(state.subjects.map((s) => [s.id, s]));
  const deckName = (id) => (id ? (subjectById[id] || {}).name || t('cards.noSubject') : t('cards.noSubject'));

  const remove = (card) => {
    dispatch({ type: 'DELETE_CARD', id: card.id });
    show({ message: t('cards.deleted'), actionLabel: t('common.undo'), onAction: () => dispatch({ type: 'RESTORE_CARD', card }) });
  };

  const stats = [
    [due, t('cards.statDue')],
    [cards.length, t('cards.statTotal')],
    [cards.filter((c) => c.reps >= 3).length, t('cards.statLearnt')],
  ];
  const openCards = open === undefined ? [] : cards.filter((c) => (c.subjectId || null) === open).sort((a, b) => a.due.localeCompare(b.due));

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#3B1F7A', '#5B3FD9', '#8E7DFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.glow} pointerEvents="none" />
          <View style={{ flex: 1, zIndex: 2 }}>
            <View style={styles.kickerPill}>
              <Ionicons name="albums" size={11} color="#EFEAFF" />
              <Text style={styles.heroKicker}>{t('cards.kicker')}</Text>
            </View>
            <Text style={styles.heroTitle}>{due ? t('cards.heroDue', { count: due }) : t('cards.heroNone')}</Text>
            <Text style={styles.heroSub}>{t('cards.heroSub')}</Text>
            <View style={styles.heroButtons}>
              <Pressable onPress={() => setReviewing({ subjectId: undefined })} disabled={!due} style={[styles.heroBtn, !due && { opacity: 0.5 }]} accessibilityRole="button">
                <Ionicons name="play" size={15} color="#5B3FD9" />
                <Text style={styles.heroBtnText}>{t('cards.reviewAll', { count: due })}</Text>
              </Pressable>
              <Pressable onPress={() => setEditing({ subjectId: open === undefined ? null : open })} style={styles.heroGhost} accessibilityRole="button">
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.heroGhostText}>{t('cards.add')}</Text>
              </Pressable>
              <Pressable onPress={() => setHelper('cards')} style={styles.heroGhost} accessibilityRole="button">
                <Ionicons name="sparkles" size={15} color="#fff" />
                <Text style={styles.heroGhostText}>{t('ai.openCards')}</Text>
              </Pressable>
            </View>
          </View>
          {wide ? (
            <View style={styles.heroStats}>
              {stats.map(([n, label]) => (
                <View key={label} style={styles.heroStat}>
                  <Text style={styles.heroStatNum}>{n}</Text>
                  <Text style={styles.heroStatLbl}>{label}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </LinearGradient>

        <Text style={styles.section}>{t('cards.decks')}</Text>
        {!decks.length ? (
          <View style={styles.empty}>
            <Ionicons name="albums-outline" size={34} color={colors.accent} />
            <Text style={styles.emptyTitle}>{t('cards.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('cards.emptyText')}</Text>
          </View>
        ) : null}
        <View style={[styles.decks, wide && styles.decksWide]}>
          {decks.map((d) => {
            const tint = d.color || colors.accent;
            const isOpen = open === d.id;
            return (
              <View key={String(d.id)} style={[styles.deck, wide && styles.deckWide, isOpen && { borderColor: tint }]}>
                <Pressable onPress={() => setOpen(isOpen ? undefined : d.id)} style={styles.deckMain} accessibilityRole="button" aria-expanded={isOpen} accessibilityState={{ expanded: isOpen }} accessibilityLabel={t('cards.deckA11y', { name: deckName(d.id), count: d.total })}>
                  <View style={[styles.deckDot, { backgroundColor: tint }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deckName} numberOfLines={1}>{deckName(d.id)}</Text>
                    <Text style={styles.deckMeta}>{[t('cards.cardsCount', { count: d.total }), d.fresh ? t('cards.newCount', { count: d.fresh }) : null].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Text style={[styles.deckDue, { color: d.due ? readable(tint) : colors.muted }]}>{d.due ? t('cards.dueCount', { count: d.due }) : t('cards.allDone')}</Text>
                </Pressable>
                {d.due ? (
                  <Pressable onPress={() => setReviewing({ subjectId: d.id })} style={styles.deckReview} accessibilityRole="button" accessibilityLabel={t('cards.reviewDeckA11y', { name: deckName(d.id) })}>
                    <Ionicons name="play" size={13} color={colors.onAccent} />
                    <Text style={styles.deckReviewText}>{t('cards.review')}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>

        {open !== undefined ? (
          <>
            <View style={styles.cardsHead}>
              <Text style={styles.section}>{t('cards.inDeck', { name: deckName(open) })}</Text>
              <Pressable onPress={() => setEditing({ subjectId: open })} hitSlop={8} accessibilityRole="button" style={styles.addSmall}>
                <Ionicons name="add" size={15} color={colors.accent} />
                <Text style={styles.addSmallText}>{t('cards.add')}</Text>
              </Pressable>
            </View>
            {openCards.map((c) => (
              <View key={c.id} style={styles.cardRow}>
                <Pressable onPress={() => setEditing({ card: c })} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={t('cards.editA11y', { front: c.front })}>
                  <Text style={styles.cardFront} numberOfLines={2}>{c.front}</Text>
                  <Text style={styles.cardBack} numberOfLines={1}>{c.back}</Text>
                  <Text style={styles.cardMeta}>{c.reps ? (c.due <= today ? t('cards.dueNow') : t('cards.nextOn', { when: formatDue(c.due) })) : t('cards.notStarted')}</Text>
                </Pressable>
                <Pressable onPress={() => remove(c)} hitSlop={8} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t('cards.deleteA11y', { front: c.front })}>
                  <Ionicons name="trash-outline" size={17} color={colors.muted} />
                </Pressable>
              </View>
            ))}
          </>
        ) : null}
        <AdBanner />
      </ScrollView>

      <CardSheet visible={!!editing} card={editing && editing.card} subjectId={editing && !editing.card ? editing.subjectId : undefined} onClose={() => setEditing(null)} />
      <AIHelperSheet visible={!!helper} initialTab={helper || 'cards'} onClose={() => setHelper(null)} />
      <ReviewSheet visible={!!reviewing} subjectId={reviewing ? reviewing.subjectId : undefined} title={reviewing && reviewing.subjectId !== undefined ? deckName(reviewing.subjectId) : t('cards.allDecks')} onClose={() => setReviewing(null)} />
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 20, paddingTop: 16, paddingBottom: 120, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  hero: { borderRadius: 28, padding: 22, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', ...shadow },
  glow: { position: 'absolute', right: -40, top: -50, width: 170, height: 170, borderRadius: 85, backgroundColor: '#fff', opacity: 0.12 },
  kickerPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  heroKicker: { color: '#EFEAFF', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  heroTitle: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 10, letterSpacing: -0.6 },
  heroSub: { color: '#EFEAFF', fontSize: 13, marginTop: 4, maxWidth: 420 },
  heroButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  heroBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', paddingHorizontal: 16, height: 42, borderRadius: 14 },
  heroBtnText: { color: '#3B1F7A', fontSize: 14, fontWeight: '800' },
  heroGhost: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', paddingHorizontal: 14, height: 42, borderRadius: 14 },
  heroGhostText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  heroStats: { flexDirection: 'row', gap: 12, zIndex: 2 },
  heroStat: { minWidth: 104, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)' },
  heroStatNum: { color: '#fff', fontSize: 26, fontWeight: '800' },
  heroStatLbl: { color: '#EFEAFF', fontSize: 12, fontWeight: '700', marginTop: 2 },
  section: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.muted, textTransform: 'uppercase', marginTop: 22, marginBottom: 10 },
  empty: { alignItems: 'center', padding: 28, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 4 },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center', maxWidth: 360, lineHeight: 19 },
  decks: { gap: 10 },
  decksWide: { flexDirection: 'row', flexWrap: 'wrap' },
  deck: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  deckWide: { width: '48.8%' },
  deckMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  deckDot: { width: 14, height: 14, borderRadius: 7 },
  deckName: { fontSize: 15, fontWeight: '800', color: colors.ink },
  deckMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  deckDue: { fontSize: 13, fontWeight: '800' },
  deckReview: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 34, borderRadius: 12, backgroundColor: colors.accentFill },
  deckReviewText: { color: colors.onAccent, fontSize: 13, fontWeight: '800' },
  cardsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addSmall: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 12 },
  addSmallText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, marginBottom: 8 },
  cardFront: { fontSize: 15, fontWeight: '700', color: colors.ink },
  cardBack: { fontSize: 13, color: colors.muted, marginTop: 2 },
  cardMeta: { fontSize: 11, fontWeight: '700', color: colors.accent, marginTop: 4 },
  iconBtn: { padding: 6 },
}));
