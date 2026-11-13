import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, shadow, themedStyles, readable } from '../theme';
import { t } from '../i18n';
import { buildPlan, defaultBudget } from '../planner';
import { busyBlocks, freeSlots, freeMinutes, scheduleIntoSlots, fromMin } from '../freeTime';
import { dateKey, formatTime } from '../dates';
import { formatDuration } from './AddExamSheet';
import { ProgressRing } from './Illustrations';

// Reason chip colours. A function so it follows the theme.
const tones = () => ({
  danger: { fg: colors.danger, bg: colors.dangerSoft, icon: 'alert-circle' },
  warn: { fg: colors.warn, bg: colors.warnSoft, icon: 'flag' },
  accent: { fg: colors.accent, bg: colors.accentSoft, icon: 'time' },
});
const SHOW = 3;
const SHOW_GAPS = 2; // the line has room for two gaps
const clock = (min) => formatTime(fromMin(min));
const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

// Plans around today's timetable: the free gaps between classes and timed exams (until 22:00) cap the
// suggested time, and each suggested task gets a clock time in one of those gaps.
export default function SmartPlan({ tasks, exams, classes = [], term = null, vacations = [], rotation = null, subjectById, minutesToday, dailyGoal, onStart, onToggle }) {
  const today = dateKey();
  const busy = useMemo(() => busyBlocks({ classes, term, vacations, exams, rotation }, today), [classes, term, vacations, exams, rotation, today]);
  const slots = freeSlots(busy, nowMinutes());
  const free = freeMinutes(slots);
  const goal = defaultBudget(dailyGoal, minutesToday);
  // On a day with classes or timed exams, never suggest more than the free time left around them
  // (in 15-minute steps). On other days the daily goal decides, as before.
  const auto = busy.length > 0 && free >= 15 ? Math.min(goal, Math.floor(free / 15) * 15) : goal;
  // the time left in the day decides until the user picks their own (null = not picked)
  const [picked, setPicked] = useState(null);
  const budget = picked ?? auto;
  const [expanded, setExpanded] = useState(false);

  const plan = useMemo(() => buildPlan({ tasks, exams, budget }), [tasks, exams, budget]);
  const timed = scheduleIntoSlots(plan.items, slots);
  const shown = expanded ? timed : timed.slice(0, SHOW);
  const pct = Math.min(1, plan.totalMinutes / Math.max(1, budget));
  const TONES = tones();

  const bump = (d) => setPicked(Math.min(480, Math.max(15, budget + d)));

  return (
    <View style={styles.card} accessibilityLabel={t('plan.a11y')}>
      {/* header */}
      <LinearGradient colors={['#151B33', '#27307A', '#4C3FCB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <View style={styles.glow} pointerEvents="none" />
        <View style={styles.headTop}>
          <View style={styles.kicker}>
            <Ionicons name="sparkles" size={12} color="#FFD479" />
            <Text style={styles.kickerText}>{t('plan.kicker')}</Text>
          </View>
        </View>

        <View style={styles.headMain}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{t('plan.title')}</Text>
            {plan.items.length > 0 ? (
              <Text style={styles.summary}>
                {t('plan.summary', { count: plan.items.length, used: plan.totalMinutes, budget })}
              </Text>
            ) : (
              <Text style={styles.summary}>{t('plan.nothing')}</Text>
            )}
            <Text style={styles.sub}>{t('plan.sub')}</Text>
            {busy.length > 0 ? (
              <View style={styles.freeRow} accessibilityLabel={t('planTime.freeA11y', { free: formatDuration(free) })}>
                <Ionicons name="easel-outline" size={12} color="#B5BDF0" />
                <Text style={styles.freeText} numberOfLines={2}>
                  {slots.length === 0
                    ? t('planTime.noFree')
                    : t('planTime.freeBetween', {
                        free: formatDuration(free),
                        gaps: slots
                          .slice(0, SHOW_GAPS)
                          .map((g) => t('calendar.range', { start: clock(g.start), end: clock(g.end) }))
                          .join(' · '),
                      })}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.ringBox}>
            <ProgressRing
              size={64}
              stroke={7}
              value={pct}
              color={plan.overBudget ? '#FF8FA8' : '#FFD479'}
              trackColor="rgba(255,255,255,0.18)"
            />
            <View style={styles.ringCenter} pointerEvents="none">
              <Ionicons name="timer-outline" size={20} color="#fff" />
            </View>
          </View>
        </View>

        <View style={styles.timeRow}>
          <Text style={styles.timeLabel}>{t('plan.timeAvailable')}</Text>
          <View style={styles.stepper}>
            <Pressable onPress={() => bump(-15)} hitSlop={6} style={styles.stepBtn} accessibilityLabel={t('plan.lessA11y')}>
              <Ionicons name="remove" size={16} color="#fff" />
            </Pressable>
            <Text style={styles.stepVal} accessibilityLabel={t('plan.timeA11y')}>{t('common.minutes', { count: budget })}</Text>
            <Pressable onPress={() => bump(15)} hitSlop={6} style={styles.stepBtn} accessibilityLabel={t('plan.moreA11y')}>
              <Ionicons name="add" size={16} color="#fff" />
            </Pressable>
          </View>
        </View>
        {plan.overBudget ? <Text style={styles.over}>{t('plan.over')}</Text> : null}
        {!plan.overBudget && free >= 15 && budget > free ? <Text style={styles.over}>{t('planTime.overFree', { free: formatDuration(free) })}</Text> : null}
      </LinearGradient>

      {/* body */}
      <View style={styles.body}>
        {plan.items.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="checkmark-done" size={26} color="#17A398" />
            </View>
            <Text style={styles.emptyTitle}>{t('plan.emptyTitle')}</Text>
            <Text style={styles.emptySub}>{t('plan.emptySub')}</Text>
          </View>
        ) : (
          <>
            {shown.map((it, i) => {
              const s = subjectById[it.task.subjectId];
              const accent = s ? s.color : colors.accent;
              const last = i === shown.length - 1;
              return (
                <View key={it.task.id} style={styles.item}>
                  {/* timeline rail */}
                  <View style={styles.rail}>
                    <View style={[styles.node, { borderColor: accent }, i === 0 && { backgroundColor: accent }]}>
                      {i === 0 ? <Ionicons name="play" size={9} color="#fff" style={{ marginLeft: 1 }} /> : <Text style={[styles.nodeNum, { color: readable(accent) }]}>{i + 1}</Text>}
                    </View>
                    {!last || plan.items.length > shown.length ? <View style={styles.line} /> : null}
                  </View>

                  <View style={[styles.task, i === 0 && { borderColor: accent + '66', backgroundColor: accent + '0F' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.slot}>
                        {it.at
                          ? t(i === 0 ? 'planTime.slotFirst' : 'planTime.slot', { start: clock(it.at.start), end: clock(it.at.end) })
                          : slots.length > 0
                            ? t('planTime.noSlot')
                            : t(i === 0 ? 'plan.slotFirst' : 'plan.slot', { start: it.startMin, end: it.endMin })}
                      </Text>
                      <Text style={styles.taskTitle} numberOfLines={2}>{it.task.title}</Text>
                      <View style={styles.meta}>
                        {s ? <View style={[styles.dot, { backgroundColor: s.color }]} /> : null}
                        <Text style={styles.metaText} numberOfLines={1}>
                          {s ? t('plan.meta', { name: s.name, count: it.task.estimate }) : t('common.minutes', { count: it.task.estimate })}
                        </Text>
                      </View>
                      {it.reasons.length > 0 && (
                        <View style={styles.chips}>
                          {it.reasons.slice(0, 2).map((r) => (
                            <View key={r.key} style={[styles.chip, { backgroundColor: TONES[r.tone].bg }]}>
                              <Ionicons name={TONES[r.tone].icon} size={10} color={TONES[r.tone].fg} />
                              <Text style={[styles.chipText, { color: TONES[r.tone].fg }]}>{t(r.label, r.params)}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                    <Pressable onPress={() => onToggle(it.task.id)} hitSlop={8} style={styles.check} accessibilityLabel={t('plan.doneA11y', { title: it.task.title })}>
                      <Ionicons name="checkmark" size={16} color={colors.muted} />
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {plan.items.length > SHOW && (
              <Pressable onPress={() => setExpanded((v) => !v)} style={styles.more} accessibilityLabel={t('plan.toggleA11y')}>
                <Text style={styles.moreText}>{expanded ? t('plan.showLess') : t('plan.showAll', { count: plan.items.length })}</Text>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accent} />
              </Pressable>
            )}

            <Pressable onPress={() => onStart(plan.items[0].task.id)} accessibilityLabel={t('plan.startA11y')} style={styles.startWrap}>
              <LinearGradient colors={['#5B6CF0', '#7A5CFA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.start}>
                <View style={styles.playCircle}>
                  <Ionicons name="play" size={14} color="#5B6CF0" style={{ marginLeft: 2 }} />
                </View>
                <Text style={styles.startText} numberOfLines={1}>{t('plan.start')}</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </LinearGradient>
            </Pressable>

            {plan.skipped.length > 0 && (
              <View style={styles.skippedBox}>
                <Ionicons name="information-circle-outline" size={15} color={colors.muted} />
                <Text style={styles.skipped}>
                  {t('plan.skipped', { count: plan.skipped.length })}
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}


const styles = themedStyles(() => ({
  card: { marginTop: 14, borderRadius: 26, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, ...shadow, shadowOpacity: 0.1 },
  header: { padding: 18, paddingBottom: 16, overflow: 'hidden' },
  glow: { position: 'absolute', right: -40, top: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: '#8D9BFF', opacity: 0.18 },
  headTop: { flexDirection: 'row' },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  kickerText: { color: '#E6E9FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  headMain: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  title: { color: '#fff', fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  summary: { color: '#FFD479', fontSize: 14, fontWeight: '800', marginTop: 6 },
  sub: { color: '#B5BDF0', fontSize: 12, marginTop: 3 },
  ringBox: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  ringCenter: { position: 'absolute' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, paddingVertical: 8, paddingLeft: 14, paddingRight: 8 },
  timeLabel: { color: '#DCE0FF', fontSize: 13, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  stepVal: { minWidth: 64, textAlign: 'center', fontSize: 14, fontWeight: '800', color: '#fff' },
  freeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 6 },
  freeText: { flex: 1, color: '#DCE0FF', fontSize: 12, fontWeight: '600' },
  over: { color: '#FFB3C4', fontSize: 12, fontWeight: '700', marginTop: 10 },
  body: { padding: 16, paddingTop: 18 },
  item: { flexDirection: 'row' },
  rail: { width: 28, alignItems: 'center' },
  node: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, marginTop: 14 },
  nodeNum: { fontSize: 10, fontWeight: '800' },
  line: { flex: 1, width: 2, backgroundColor: colors.line, marginTop: 4, marginBottom: -2 },
  task: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 8, marginBottom: 10, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceAlt },
  slot: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: colors.muted },
  taskTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  metaText: { fontSize: 12, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9 },
  chipText: { fontSize: 11, fontWeight: '800' },
  check: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6, marginLeft: 36 },
  moreText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  startWrap: { marginTop: 8, borderRadius: 18, overflow: 'hidden' },
  start: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16 },
  playCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  startText: { color: '#fff', fontWeight: '800', fontSize: 15, flexShrink: 1 },
  skippedBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: colors.bg, borderRadius: 12, padding: 10 },
  skipped: { flex: 1, fontSize: 12, color: colors.muted },
  empty: { alignItems: 'center', paddingVertical: 14, gap: 4 },
  emptyIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  emptySub: { fontSize: 12, color: colors.muted, textAlign: 'center', maxWidth: 260 },
}));
