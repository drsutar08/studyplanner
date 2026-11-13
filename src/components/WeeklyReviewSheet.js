import React, { useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles } from '../theme';
import { t } from '../i18n';
import { addDays, dateKey, formatDate, formatDue, parseKey } from '../dates';
import { hoursText } from '../durations';
import { useStore } from '../store';
import { weeklyReview, spreadOut } from '../weeklyReview';

const plainDate = (key) => formatDate(parseKey(key), { day: 'numeric', month: 'short' }); // the week's range: dates, not "Yesterday"

const SHOWN = 8; // slipped tasks listed one by one; the rest move with the buttons

// The week in review (this one or the last): done, focus time against the week before, by subject, what slipped
// (with one-tap moves, Undo-able) and what's coming
export default function WeeklyReviewSheet({ visible, onClose, weekStart }) {
  const { state, dispatch } = useStore();
  const [back, setBack] = useState(0); // 0 this week, 1 last week
  const [done, setDone] = useState(null); // the last move: { message, undo }, shown in the sheet (a toast would be behind it)
  const [openFor, setOpenFor] = useState(false);
  if (visible !== openFor) {
    setOpenFor(visible);
    if (visible) {
      setBack(0);
      setDone(null);
    }
  }
  const today = dateKey();
  const start = addDays(weekStart, -7 * back);
  const r = weeklyReview(state, start, today);
  const subjectById = Object.fromEntries((state.subjects || []).map((s) => [s.id, s]));

  // moves, with Undo putting each task back on its own day
  const move = (plan, message) => {
    const before = {};
    for (const p of plan) for (const id of p.ids) before[id] = state.tasks.find((x) => x.id === id).due;
    for (const p of plan) dispatch({ type: 'MOVE_TASKS', ids: p.ids, due: p.due });
    setDone({
      message,
      undo: () => {
        const byDay = {};
        for (const [id, due] of Object.entries(before)) (byDay[due] = byDay[due] || []).push(id);
        for (const [due, ids] of Object.entries(byDay)) dispatch({ type: 'MOVE_TASKS', ids, due });
        setDone(null);
      },
    });
  };
  const ids = r.slipped.map((x) => x.id);
  const allToday = () => move([{ due: today, ids }], t('review.movedToday', { count: ids.length }));
  const spread = () => {
    const plan = spreadOut(r.slipped, today);
    move(plan, t('review.spread', { count: ids.length, days: plan.length }));
  };
  const one = (task, due) => move([{ due, ids: [task.id] }], t('review.movedOne', { title: task.title, when: formatDue(due) }));

  const diff = r.focus - r.focusBefore;
  const stat = (icon, tint, value, label) => (
    <View style={styles.stat}>
      <Ionicons name={icon} size={18} color={tint} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1, alignSelf: 'stretch' }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={styles.headIcon}>
              <Ionicons name="calendar-number" size={20} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{t('review.title')}</Text>
              <Text style={styles.headSub}>{t('review.range', { start: plainDate(r.start), end: plainDate(r.end) })}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <View style={styles.seg} accessibilityRole="tablist">
            {[t('review.thisWeek'), t('review.lastWeek')].map((label, i) => (
              <Pressable key={label} onPress={() => setBack(i)} style={[styles.segBtn, back === i && styles.segOn]} accessibilityRole="tab" accessibilityState={{ selected: back === i }} aria-selected={back === i}>
                <Text style={[styles.segText, back === i && styles.segTextOn]}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <ScrollView style={{ maxHeight: 520 }}>
            <View style={styles.stats}>
              {stat('checkmark-done', colors.success, String(r.done.length), t('review.done', { count: r.done.length }))}
              {stat('time', colors.accent, hoursText(r.focus), diff === 0 ? t('review.focusSame') : diff > 0 ? t('review.focusUp', { time: hoursText(diff) }) : t('review.focusDown', { time: hoursText(-diff) }))}
              {stat('alert-circle', r.slipped.length ? colors.danger : colors.muted, String(r.slipped.length), t('review.slippedLabel', { count: r.slipped.length }))}
            </View>

            {r.bySubject.length ? (
              <>
                <Text style={styles.section}>{t('review.bySubject')}</Text>
                {r.bySubject.map((s) => (
                  <View key={s.id} style={styles.subjRow}>
                    <View style={[styles.dot, { backgroundColor: s.color }]} />
                    <Text style={styles.subjName} numberOfLines={1}>{s.name}</Text>
                    <Text style={styles.subjMeta}>{t('review.subjectLine', { count: s.done, time: hoursText(s.minutes) })}</Text>
                  </View>
                ))}
              </>
            ) : (
              <Text style={styles.empty}>{t('review.quiet')}</Text>
            )}

            <Text style={styles.section}>{t('review.slippedTitle')}</Text>
            {!r.slipped.length ? (
              <Text style={styles.empty}>{t('review.nothingSlipped')}</Text>
            ) : (
              <>
                {r.slipped.slice(0, SHOWN).map((task) => {
                  const s = subjectById[task.subjectId];
                  return (
                    <View key={task.id} style={styles.taskRow}>
                      <View style={[styles.dot, { backgroundColor: s ? s.color : colors.muted }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
                        <Text style={styles.taskMeta}>{t('review.wasDue', { when: formatDue(task.due) })}</Text>
                      </View>
                      <Pressable onPress={() => one(task, today)} style={styles.small} accessibilityRole="button" accessibilityLabel={t('review.todayA11y', { title: task.title })}>
                        <Text style={styles.smallText}>{t('common.today')}</Text>
                      </Pressable>
                      <Pressable onPress={() => one(task, addDays(today, 1))} style={styles.small} accessibilityRole="button" accessibilityLabel={t('review.tomorrowA11y', { title: task.title })}>
                        <Text style={styles.smallText}>{t('review.tomorrow')}</Text>
                      </Pressable>
                    </View>
                  );
                })}
                {r.slipped.length > SHOWN ? <Text style={styles.more}>{t('review.more', { count: r.slipped.length - SHOWN })}</Text> : null}
                <View style={styles.actions}>
                  <Pressable onPress={spread} style={[styles.btn, styles.btnMain]} accessibilityRole="button">
                    <Ionicons name="git-branch-outline" size={16} color={colors.onAccent} />
                    <Text style={styles.btnMainText}>{t('review.spreadButton')}</Text>
                  </Pressable>
                  <Pressable onPress={allToday} style={styles.btn} accessibilityRole="button">
                    <Text style={styles.btnText}>{t('review.allToday')}</Text>
                  </Pressable>
                </View>
              </>
            )}

            <Text style={styles.section}>{t('review.nextTitle')}</Text>
            <Text style={styles.empty}>{t('review.next', { tasks: t('review.tasksCount', { count: r.next.tasks }), exams: t('review.examsCount', { count: r.next.exams }) })}</Text>
          </ScrollView>

          {done ? (
            <View style={styles.banner} accessibilityLiveRegion="polite">
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.bannerText} numberOfLines={2}>{done.message}</Text>
              <Pressable onPress={done.undo} hitSlop={8} accessibilityRole="button">
                <Text style={styles.bannerUndo}>{t('common.undo')}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 10, paddingBottom: 28 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  headIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 12, padding: 3, marginBottom: 14 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  segOn: { backgroundColor: colors.accentFill },
  segText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  segTextOn: { color: colors.onAccent },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: colors.bg, alignItems: 'flex-start', gap: 2 },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.ink, marginTop: 4 },
  statLabel: { fontSize: 12, color: colors.muted },
  section: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.muted, textTransform: 'uppercase', marginTop: 18, marginBottom: 6 },
  subjRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  subjName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink },
  subjMeta: { fontSize: 12, color: colors.muted },
  empty: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  taskTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  taskMeta: { fontSize: 12, color: colors.danger, marginTop: 1 },
  small: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.accentSoft },
  smallText: { fontSize: 12, fontWeight: '800', color: colors.accent },
  more: { fontSize: 12, color: colors.muted, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  btnMain: { backgroundColor: colors.accentFill, borderColor: colors.accentFill },
  btnMainText: { color: colors.onAccent, fontWeight: '800', fontSize: 14 },
  btnText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: colors.successSoft },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.ink },
  bannerUndo: { fontSize: 14, fontWeight: '800', color: colors.accent },
}));
