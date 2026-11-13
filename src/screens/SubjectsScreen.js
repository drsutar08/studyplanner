import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, shadow, subjectPalette, type, themedStyles, readable } from '../theme';
import { t } from '../i18n';
import { AdBanner } from '../ads';
import { useStore } from '../store';
import { useUndoableDelete } from '../undo';
import { addDays, dateKey, formatDue, countdownLabel } from '../dates';
import { ShelfIllustration, EmptyIllustration } from '../components/Illustrations';
import SubjectSheet from '../components/SubjectSheet';
import { subjectSummary } from '../subjects';
import { subjectAverages } from '../grades';
import { attendanceOf } from '../attendance';
import { onlyClasses, weekStartOf } from '../classes';
import { useAuth } from '../auth';
import { goalProgress } from '../report';
import { hoursText } from '../durations';
import { useTwoColumns } from '../layout';

// cards per row by window width: one on a phone, two on a tablet, three next to the desktop sidebar
const columnsFor = (width) => (width >= 1180 ? 3 : width >= 720 ? 2 : 1);

export default function SubjectsScreen() {
  const { state, dispatch } = useStore();
  const { deleteSubject } = useUndoableDelete();
  // delete (and later undo) the stored subject, not the card's row with its extra numbers
  const remove = (id) => {
    const subject = state.subjects.find((x) => x.id === id);
    if (subject) deleteSubject(subject);
  };
  const { width } = useWindowDimensions();
  const wide = useTwoColumns();
  const columns = columnsFor(width);
  const [sheet, setSheet] = useState(null); // null | { subject: null (new) | subject (edit) }
  const today = dateKey();
  const { settings } = useAuth();
  // "this week" is the calendar week (Sun or Mon start), the same week the weekly goals count
  const goalWeek = weekStartOf(today, settings.weekStart || 0);
  const week = useMemo(() => new Set(Array.from({ length: 7 }, (_, i) => addDays(goalWeek, i))), [goalWeek]);

  const rows = useMemo(() => {
    const grades = Object.fromEntries(subjectAverages(state.exams).map((g) => [g.subjectId, g.average]));
    const lessons = onlyClasses(state.classes);
    return state.subjects.map((s) => {
      const att = lessons
        .filter((c) => c.subjectId === s.id)
        .map(attendanceOf)
        .reduce((a, x) => ({ attended: a.attended + x.attended, total: a.total + x.total }), { attended: 0, total: 0 });
      return {
        ...s,
        ...subjectSummary(s, state, today, week),
        grade: grades[s.id] ?? null,
        attendance: att.total ? (att.attended / att.total) * 100 : null,
        goal: goalProgress(s, state.sessions, goalWeek, today),
      };
    });
  }, [state, today, week, goalWeek]);

  const totals = useMemo(
    () => ({
      open: rows.reduce((a, r) => a + r.open, 0),
      done: rows.reduce((a, r) => a + r.done, 0),
      minutes: rows.reduce((a, r) => a + r.weekMinutes, 0),
    }),
    [rows]
  );

  // the next unused colour, so a new subject doesn't look like an existing one
  const nextColor = subjectPalette.find((c) => !state.subjects.some((s) => s.color === c)) || subjectPalette[state.subjects.length % subjectPalette.length];

  const save = ({ name, color, weeklyGoal }) => {
    if (sheet && sheet.subject) dispatch({ type: 'UPDATE_SUBJECT', id: sheet.subject.id, name, color, weeklyGoal });
    else dispatch({ type: 'ADD_SUBJECT', name, color, weeklyGoal });
  };

  const stats = [
    [totals.open, t('subjects.statOpen')],
    [totals.done, t('subjects.statDone')],
    [totals.minutes, t('subjects.statMinutes')],
  ];

  const hero = (
    <View>
      <LinearGradient colors={['#0B5F66', '#13897F', '#3CC1A6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, wide && styles.heroWide]}>
        <View style={styles.glow} pointerEvents="none" />
        <View style={{ flex: 1, zIndex: 2 }}>
          <View style={styles.kickerPill}>
            <Ionicons name="library" size={11} color="#D4FFF6" />
            <Text style={styles.heroKicker}>{t('subjects.kicker')}</Text>
          </View>
          <Text style={styles.heroTitle}>{t('subjects.heroTitle', { count: rows.length })}</Text>
          <Text style={[styles.heroSub, wide && { maxWidth: 320 }]}>{t('subjects.heroSub')}</Text>
        </View>
        {wide ? (
          // desktop: the numbers sit in the banner
          <View style={styles.heroStats}>
            {stats.map(([n, label]) => (
              <View key={label} style={styles.heroStat}>
                <Text style={styles.heroStatNum}>{n}</Text>
                <Text style={styles.heroStatLbl}>{label}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.heroArt} pointerEvents="none">
            <ShelfIllustration width={132} height={88} />
          </View>
        )}
      </LinearGradient>

      {!wide ? (
        <View style={styles.strip}>
          {stats.map(([n, label], i) => (
            <React.Fragment key={label}>
              {i > 0 ? <View style={styles.stripDivider} /> : null}
              <View style={styles.stripCell}>
                <Text style={styles.stripNum}>{n}</Text>
                <Text style={styles.stripLbl}>{label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      ) : null}
    </View>
  );

  // one subject: progress, the numbers, and what's coming up. Tap (or ✎) to edit. The card itself has no
  // button role: on the web that would put the ✎ and 🗑 buttons inside another button.
  const card = (item) => {
    const pct = item.total ? item.done / item.total : 0;
    const tint = item.color;
    const facts = [
      ['list', t('subjects.openChip', { count: item.open })],
      ['time-outline', t('subjects.weekChip', { count: item.weekMinutes })],
      item.classesPerWeek ? ['easel-outline', t('subjects.classesChip', { count: item.classesPerWeek })] : null,
      item.grade !== null ? ['school-outline', t('subjects.gradeChip', { pct: Math.round(item.grade) })] : null,
      item.attendance !== null ? ['hand-left-outline', t('subjects.attendanceChip', { pct: Math.round(item.attendance) })] : null,
    ].filter(Boolean);
    return (
      <Pressable onPress={() => setSheet({ subject: state.subjects.find((x) => x.id === item.id) })} style={({ hovered }) => [styles.card, hovered && { borderColor: tint + '88' }]} accessibilityLabel={t('subjects.openA11y', { name: item.name })}>
        <View style={[styles.band, { backgroundColor: tint }]} />
        <View style={styles.cardTop}>
          <View style={[styles.avatar, { backgroundColor: tint }]}>
            <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            <Text style={type.meta}>{item.total === 0 ? t('subjects.noTasks') : t('subjects.progress', { done: item.done, count: item.total })}</Text>
          </View>
          <Pressable onPress={() => setSheet({ subject: state.subjects.find((x) => x.id === item.id) })} hitSlop={8} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t('subjects.editA11y', { name: item.name })}>
            <Ionicons name="create-outline" size={18} color={colors.muted} />
          </Pressable>
          <Pressable onPress={() => remove(item.id)} hitSlop={8} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t('subjects.deleteA11y', { name: item.name })}>
            <Ionicons name="trash-outline" size={18} color={colors.muted} />
          </Pressable>
        </View>

        <View style={styles.barRow}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: tint }]} />
          </View>
          <Text style={[styles.pct, { color: readable(tint) }]}>{Math.round(pct * 100)}%</Text>
        </View>

        <View style={styles.chips}>
          {facts.map(([icon, text], i) => (
            <View key={icon} style={[styles.chip, { backgroundColor: i === 0 ? tint + '1F' : colors.bg }]}>
              <Ionicons name={icon} size={12} color={i === 0 ? tint : colors.muted} />
              <Text style={[styles.chipText, { color: i === 0 ? readable(tint) : colors.muted }]}>{text}</Text>
            </View>
          ))}
        </View>

        {item.goal ? (
          <View style={styles.goal} accessibilityLabel={t('subjects.goalProgress', { done: hoursText(item.goal.minutes), goal: hoursText(item.goal.goal) })}>
            <View style={styles.goalHead}>
              <Ionicons name={item.goal.left === 0 ? 'trophy' : 'flag-outline'} size={13} color={item.goal.left === 0 ? colors.success : item.goal.onTrack ? tint : colors.danger} />
              <Text style={styles.goalLabel}>{t('subjects.goalProgress', { done: hoursText(item.goal.minutes), goal: hoursText(item.goal.goal) })}</Text>
              <Text style={[styles.goalState, { color: item.goal.left === 0 ? colors.success : item.goal.onTrack ? colors.muted : colors.danger }]}>
                {item.goal.left === 0 ? t('subjects.goalMet') : item.goal.onTrack ? t('subjects.goalOnTrack') : t('subjects.goalBehind')}
              </Text>
            </View>
            <View style={styles.goalTrack}>
              <View style={[styles.fill, { height: 4, width: `${Math.min(100, item.goal.pct)}%`, backgroundColor: item.goal.left === 0 ? colors.success : tint }]} />
            </View>
          </View>
        ) : null}

        <View style={styles.next}>
          <View style={styles.nextRow}>
            <Ionicons name={item.nextTask && item.nextTask.due < today ? 'alert-circle-outline' : 'arrow-forward-circle-outline'} size={15} color={item.nextTask && item.nextTask.due < today ? colors.danger : colors.muted} />
            <Text style={[styles.nextText, item.nextTask && item.nextTask.due < today && { color: colors.danger }]} numberOfLines={1}>
              {item.nextTask ? t('subjects.nextTask', { title: item.nextTask.title, when: formatDue(item.nextTask.due) }) : t('subjects.caughtUp')}
            </Text>
          </View>
          {item.nextExam ? (
            <View style={styles.nextRow}>
              <Ionicons name="flag" size={14} color={colors.danger} />
              <Text style={[styles.nextText, { color: colors.danger }]} numberOfLines={1}>
                {t('subjects.nextExam', { title: item.nextExam.title, when: countdownLabel(item.nextExam.date) })}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const addCard = (
    <Pressable onPress={() => setSheet({ subject: null })} style={styles.addCard} accessibilityRole="button">
      <View style={styles.addIcon}>
        <Ionicons name="add" size={24} color={colors.accent} />
      </View>
      <Text style={styles.addTitle}>{t('subjects.addCard')}</Text>
      <Text style={styles.addSub}>{t('subjects.addCardSub')}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <ScrollView contentContainerStyle={[styles.list, columns > 1 && styles.listWide]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {hero}

        <View style={[styles.titleRow, wide && { marginTop: 28 }]}>
          <Text style={type.h2}>
            {t('subjects.all')} <Text style={styles.count}>{rows.length}</Text>
          </Text>
          <Pressable style={styles.newBtn} onPress={() => setSheet({ subject: null })} accessibilityRole="button">
            <Ionicons name="add" size={18} color={colors.accent} />
            <Text style={styles.newBtnText}>{t('subjects.new')}</Text>
          </Pressable>
        </View>

        {rows.length === 0 ? (
          <View style={styles.empty}>
            <EmptyIllustration />
            <Text style={[type.h2, { marginTop: 8 }]}>{t('subjects.emptyTitle')}</Text>
            <Text style={[type.meta, { textAlign: 'center', marginTop: 6 }]}>{t('subjects.emptyBody')}</Text>
          </View>
        ) : null}

        <View style={styles.grid}>
          {rows.map((item) => (
            <View key={item.id} style={[styles.cell, { width: `${100 / columns}%` }]}>
              {card(item)}
            </View>
          ))}
          {/* the grid ends with a card for adding one (on a phone the button above is enough once there are some) */}
          {columns > 1 || rows.length === 0 ? <View style={[styles.cell, { width: `${100 / columns}%` }]}>{addCard}</View> : null}
        </View>
        <AdBanner />
      </ScrollView>

      <SubjectSheet
        visible={!!sheet}
        editing={sheet ? sheet.subject : null}
        subjects={state.subjects}
        nextColor={nextColor}
        onClose={() => setSheet(null)}
        onSave={save}
        onDelete={() => sheet && sheet.subject && remove(sheet.subject.id)}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 20, paddingTop: 16, paddingBottom: 120, maxWidth: 760, width: '100%', alignSelf: 'center' },
  listWide: { maxWidth: 1280 },
  hero: { borderRadius: 28, padding: 20, paddingBottom: 46, minHeight: 168, overflow: 'hidden', flexDirection: 'row', ...shadow },
  heroWide: { paddingBottom: 22, minHeight: 0, alignItems: 'center', paddingHorizontal: 26 },
  glow: { position: 'absolute', right: -40, top: -50, width: 170, height: 170, borderRadius: 85, backgroundColor: '#fff', opacity: 0.12 },
  kickerPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  heroKicker: { color: '#D4FFF6', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  heroTitle: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 10, letterSpacing: -0.6 },
  heroSub: { color: '#D4FFF6', fontSize: 12, marginTop: 4, maxWidth: 170 },
  heroArt: { position: 'absolute', right: 6, bottom: 22 },
  heroStats: { flexDirection: 'row', gap: 12, zIndex: 2 },
  heroStat: { minWidth: 120, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)' },
  heroStatNum: { color: '#fff', fontSize: 26, fontWeight: '800' },
  heroStatLbl: { color: '#D4FFF6', fontSize: 12, fontWeight: '700', marginTop: 2 },
  strip: { flexDirection: 'row', alignItems: 'center', marginTop: -28, marginHorizontal: 14, backgroundColor: colors.surface, borderRadius: 22, paddingVertical: 14, ...shadow, shadowOpacity: 0.12 },
  stripCell: { flex: 1, alignItems: 'center' },
  stripNum: { fontSize: 22, fontWeight: '800', color: colors.ink },
  stripLbl: { fontSize: 11, color: colors.muted, marginTop: 1 },
  stripDivider: { width: 1, height: 30, backgroundColor: colors.line },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
  count: { color: colors.muted, fontSize: 15, fontWeight: '700' },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accentSoft, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20 },
  newBtnText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -7 },
  cell: { paddingHorizontal: 7, marginBottom: 14 },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: 22, padding: 16, paddingTop: 20, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  band: { position: 'absolute', left: 0, right: 0, top: 0, height: 5 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  name: { fontSize: 17, fontWeight: '800', color: colors.ink, marginBottom: 1 },
  iconBtn: { padding: 7, borderRadius: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.bg, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  pct: { width: 38, textAlign: 'right', fontSize: 12, lineHeight: 14, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  chipText: { fontSize: 12, fontWeight: '700' },
  goal: { marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: colors.bg },
  goalHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  goalLabel: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.ink },
  goalState: { fontSize: 11, fontWeight: '800' },
  goalTrack: { height: 4, borderRadius: 2, backgroundColor: colors.line, marginTop: 7, overflow: 'hidden' },
  next: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line, gap: 6 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nextText: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.muted },
  addCard: { flex: 1, minHeight: 170, alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accentBorder, backgroundColor: colors.surfaceAlt },
  addIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  addTitle: { fontSize: 15, fontWeight: '800', color: colors.accent, marginTop: 10 },
  addSub: { fontSize: 12, color: colors.muted, marginTop: 3, textAlign: 'center' },
  empty: { alignItems: 'center', marginTop: 8, marginBottom: 16 },
}));
