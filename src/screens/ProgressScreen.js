import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, shadow, type, themedStyles } from '../theme';
import { t, weekdayName } from '../i18n';
import { useStore } from '../store';
import { addDays, dateKey, lastNDays, weekdayLetter, parseKey } from '../dates';
import { useAuth } from '../auth';
import { FlameIcon, Donut, EmptyIllustration } from '../components/Illustrations';
import GradesCard from '../components/GradesCard';
import { useTwoColumns } from '../layout';
import { useToast } from '../toast';
import AddExamSheet from '../components/AddExamSheet';
import AttendanceCard from '../components/AttendanceCard';
import { unmarkedSessions, examAttendance, DEFAULT_TARGET } from '../attendance';
import { onlyClasses, weekStartOf } from '../classes';
import ReportCard from '../components/ReportCard';
import WhatIfSheet from '../components/WhatIfSheet';
import WeeklyReviewSheet from '../components/WeeklyReviewSheet';
import ProgressReportSheet from '../components/ProgressReportSheet';
import AchievementsCard from '../components/AchievementsCard';
import { AdBanner } from '../ads';
import { weeklyReview } from '../weeklyReview';

const nowHHMM = () => {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

const BAR_MAX = 120;

export default function ProgressScreen() {
  const { state, dispatch } = useStore();
  const { settings, updateSettings } = useAuth();
  const DAILY_GOAL = settings.dailyGoal;
  const twoColumns = useTwoColumns();
  const { show } = useToast();
  const [editingExam, setEditingExam] = useState(null); // exam whose score is being added or changed
  const [whatIf, setWhatIf] = useState(undefined); // the what-if sheet: undefined = closed, else the subject id it opens on
  const subjectById = useMemo(() => Object.fromEntries(state.subjects.map((x) => [x.id, x])), [state.subjects]);

  const today = dateKey(); // also a dependency below so the week window rolls over at midnight
  const review = weeklyReview(state, weekStartOf(today, settings.weekStart || 0), today);
  const [reviewing, setReviewing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const reviewLine = t('review.cardSub', { done: t('review.doneCount', { count: review.done.length }), slipped: t('review.slippedCount', { count: review.slipped.length }) });

  const data = useMemo(() => {
    const days = lastNDays(7);
    const perDay = days.map((k) =>
      state.sessions.filter((s) => s.date === k).reduce((sum, s) => sum + s.minutes, 0)
    );
    const weekTotal = perDay.reduce((a, b) => a + b, 0);
    const max = Math.max(DAILY_GOAL, ...perDay);

    const tasksDone = state.tasks.filter(
      (t) => t.done && t.completedAt && days.includes(t.completedAt)
    ).length;

    // Streak: consecutive days with at least one session, ending today
    // (or yesterday, so the streak doesn't reset before you've studied today)
    const studied = new Set(state.sessions.map((s) => s.date));
    let cursor = today;
    if (!studied.has(cursor)) cursor = addDays(cursor, -1);
    let streak = 0;
    while (studied.has(cursor)) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }

    // Minutes per subject over the week
    const bySubject = {};
    state.sessions
      .filter((s) => days.includes(s.date))
      .forEach((s) => {
        // sessions whose subject was deleted fold into "No subject" with the untagged ones
        const key = state.subjects.some((x) => x.id === s.subjectId) ? s.subjectId : 'none';
        bySubject[key] = (bySubject[key] || 0) + s.minutes;
      });
    const breakdown = Object.entries(bySubject)
      .map(([id, minutes]) => {
        const subj = state.subjects.find((x) => x.id === id);
        return {
          id,
          minutes,
          name: subj ? subj.name : t('common.noSubject'),
          color: subj ? subj.color : colors.muted,
        };
      })
      .sort((a, b) => b.minutes - a.minutes);

    const sessionsCount = state.sessions.filter((s) => days.includes(s.date)).length;
    const goalDays = perDay.filter((v) => v >= DAILY_GOAL).length;
    const bestIdx = perDay.indexOf(Math.max(...perDay));

    return { days, perDay, weekTotal, max, tasksDone, streak, breakdown, sessionsCount, goalDays, bestIdx };
  }, [state, DAILY_GOAL, today]);

  const hours = Math.floor(data.weekTotal / 60);
  const mins = data.weekTotal % 60;
  const totalLabel = hours > 0 ? t('progress.hoursMinutes', { hours, mins }) : t('progress.minutesShort', { mins });
  const goalLine = (DAILY_GOAL / data.max) * BAR_MAX;
  const avg = Math.round(data.weekTotal / 7);
  const bestDay =
    data.perDay[data.bestIdx] > 0
      ? weekdayName(parseKey(data.days[data.bestIdx]).getDay(), 'long')
      : null;

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <ScrollView contentContainerStyle={[styles.content, twoColumns && styles.contentWide]} showsVerticalScrollIndicator={false}>
        {/* wide screens: the week on the left, attendance and grades on the right */}
        <View style={twoColumns ? styles.wideRow : null}>
        <View style={twoColumns ? styles.wideCol : null}>
        <LinearGradient colors={['#B93A0B', '#EA580C', '#F59E0B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.glow} pointerEvents="none" />
          <View style={{ flex: 1 }}>
            <View style={styles.kickerPill}>
              <Ionicons name="calendar-outline" size={11} color="#FFE9C7" />
              <Text style={styles.heroKicker}>{t('progress.kicker')}</Text>
            </View>
            <Text style={styles.heroTitle}>{t('progress.focused', { total: totalLabel })}</Text>
            <Text style={styles.heroSub}>
              {data.weekTotal === 0
                ? t('progress.emptySub')
                : t('progress.avgSub', { avg, count: data.sessionsCount })}
            </Text>
          </View>
          <View style={styles.flameBox}>
            <FlameIcon size={60} />
            <Text style={styles.flameNum}>{data.streak}</Text>
            <Text style={styles.flameLbl}>{t('progress.streak')}</Text>
          </View>
        </LinearGradient>

        {/* floating summary */}
        <View style={styles.strip}>
          <Stat icon="checkmark-done" tint={colors.success} bg={colors.successSoft} value={data.tasksDone} label={t('progress.tasksDone')} />
          <View style={styles.stripDivider} />
          <Stat icon="timer" tint={colors.accent} bg={colors.accentSoft} value={data.sessionsCount} label={t('progress.sessions')} />
          <View style={styles.stripDivider} />
          <Stat icon="trending-up" tint="#D6336C" bg={colors.dangerSoft} value={t('progress.minutesShort', { mins: avg })} label={t('progress.dailyAvg')} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={{ flex: 1 }}>
              <Text style={type.h2}>{t('progress.perDay')}</Text>
              <Text style={styles.cardSub}>
                {bestDay ? t('progress.goalDaysBest', { count: data.goalDays, day: bestDay }) : t('progress.goalDays', { count: data.goalDays })}
              </Text>
            </View>
            <View style={styles.goalTag}>
              <View style={styles.goalDash} />
              <Text style={styles.goalText}>{t('progress.goal', { count: DAILY_GOAL })}</Text>
            </View>
          </View>
          <View style={styles.chart}>
            <View style={[styles.goalLine, { bottom: 26 + goalLine }]} />
            {data.days.map((k, i) => {
              const v = data.perDay[i];
              const h = v === 0 ? 4 : Math.max(8, (v / data.max) * BAR_MAX);
              const isToday = k === today;
              const hit = v >= DAILY_GOAL;
              return (
                <View key={k} style={styles.col}>
                  <Text style={[styles.value, isToday && { color: colors.accent, fontWeight: '800' }]}>{v > 0 ? v : ''}</Text>
                  <View
                    style={[
                      styles.bar,
                      { height: h },
                      v === 0
                        ? { backgroundColor: colors.line }
                        : { backgroundColor: hit ? colors.success : isToday ? colors.accentFill : colors.accentBorder },
                    ]}
                  />
                  <Text style={[styles.day, isToday && styles.dayToday]}>{weekdayLetter(k)}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={[type.h2, { marginBottom: 14 }]}>{t('progress.bySubject')}</Text>
          {data.breakdown.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              <EmptyIllustration width={150} height={116} />
              <Text style={[type.meta, { textAlign: 'center', marginTop: 4 }]}>
                {t('progress.bySubjectEmpty')}
              </Text>
            </View>
          ) : (
            <View style={styles.donutRow}>
              <Donut
                size={132}
                stroke={18}
                segments={data.breakdown.map((b) => ({ value: b.minutes, color: b.color }))}
              />
              <View style={styles.legend}>
                {data.breakdown.map((b) => (
                  <View key={b.id} style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: b.color }]} />
                    <Text style={styles.legendName} numberOfLines={1}>{b.name}</Text>
                    <Text style={styles.legendVal}>
                      {t('progress.legend', { pct: Math.round((b.minutes / data.weekTotal) * 100), mins: b.minutes })}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        <Pressable onPress={() => setReviewing(true)} style={({ hovered }) => [styles.reviewCard, hovered && { borderColor: colors.accentBorder }]} accessibilityRole="button" accessibilityLabel={`${t('review.title')}: ${reviewLine}`}>
          <View style={styles.reviewIcon}>
            <Ionicons name="calendar-number-outline" size={20} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reviewTitle}>{t('review.title')}</Text>
            <Text style={styles.reviewSub} numberOfLines={1}>{reviewLine}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
        <WeeklyReviewSheet visible={reviewing} onClose={() => setReviewing(false)} weekStart={weekStartOf(today, settings.weekStart || 0)} />
        <Pressable onPress={() => setReporting(true)} style={({ hovered }) => [styles.reviewCard, hovered && { borderColor: colors.accentBorder }]} accessibilityRole="button" accessibilityLabel={t('report2.cardA11y')}>
          <View style={styles.reviewIcon}>
            <Ionicons name="document-text-outline" size={20} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reviewTitle}>{t('report2.title')}</Text>
            <Text style={styles.reviewSub} numberOfLines={1}>{t('report2.cardSub')}</Text>
          </View>
          <Ionicons name="share-outline" size={18} color={colors.muted} />
        </Pressable>
        <ProgressReportSheet visible={reporting} onClose={() => setReporting(false)} weekStart={weekStartOf(today, settings.weekStart || 0)} />
        <AchievementsCard state={state} today={today} weekStart={settings.weekStart || 0} />

        <ReportCard data={state} weekStart={weekStartOf(today, settings.weekStart || 0)} today={today} attendanceTarget={settings.attendanceTarget || DEFAULT_TARGET} />
        </View>

        <View style={twoColumns ? [styles.wideCol, styles.colSide] : null}>
        <AttendanceCard
          classes={onlyClasses(state.classes)}
          exams={examAttendance(state.exams, today)}
          unmarked={unmarkedSessions(onlyClasses(state.classes), today, nowHHMM(), state.term, state.vacations, state.rotation)}
          subjectById={subjectById}
          target={settings.attendanceTarget || DEFAULT_TARGET}
          onTarget={(attendanceTarget) => updateSettings({ attendanceTarget })}
          onMark={(cls, date, status) => dispatch({ type: 'MARK_ATTENDANCE', id: cls.id, date, status })}
          onMarkAll={(list) => {
            const items = list.map(({ cls, date }) => ({ id: cls.id, date }));
            dispatch({ type: 'SET_ATTENDANCE_MANY', items, status: 'attended' });
            show({ tone: 'success', message: t('attendance.allMarked', { count: items.length }), actionLabel: t('common.undo'), onAction: () => dispatch({ type: 'SET_ATTENDANCE_MANY', items, status: null }) });
          }}
        />

        <GradesCard
          exams={state.exams}
          subjectById={subjectById}
          scale={settings.gradeScale || 'percent'}
          onScale={(gradeScale) => updateSettings({ gradeScale })}
          onEditExam={(e) => setEditingExam(e)}
          onWhatIf={(subjectId) => setWhatIf(subjectId)}
        />
        </View>
        </View>
        {/* a banner ad at the very end, for an account that is shown ads (ads.native.js) */}
        <AdBanner />
      </ScrollView>
      <WhatIfSheet visible={whatIf !== undefined} onClose={() => setWhatIf(undefined)} exams={state.exams} subjects={state.subjects} initialSubjectId={whatIf} today={today} scale={settings.gradeScale || 'percent'} />
      <AddExamSheet
        visible={!!editingExam}
        editing={editingExam}
        focus="result"
        onClose={() => setEditingExam(null)}
        subjects={state.subjects}
        onSave={(e) => editingExam && dispatch({ type: 'UPDATE_EXAM', id: editingExam.id, ...e })}
      />
    </SafeAreaView>
  );
}

function Stat({ icon, tint, bg, value, label }) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  reviewCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, marginBottom: 14 },
  reviewIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  reviewTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  reviewSub: { fontSize: 13, color: colors.muted, marginTop: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 16, paddingBottom: 120, maxWidth: 760, width: '100%', alignSelf: 'center' },
  contentWide: { maxWidth: 1280 },
  wideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  wideCol: { flex: 1, minWidth: 0 },
  colSide: { marginTop: -16 }, // the first card's own top margin: line it up with the hero
  hero: { borderRadius: 28, padding: 20, paddingBottom: 46, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', ...shadow },
  glow: { position: 'absolute', right: -50, top: -60, width: 190, height: 190, borderRadius: 95, backgroundColor: '#fff', opacity: 0.13 },
  kickerPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  heroKicker: { color: '#FFE9C7', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  heroTitle: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 10, letterSpacing: -0.6 },
  heroSub: { color: '#FFEFD6', fontSize: 13, marginTop: 6, maxWidth: 200 },
  flameBox: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 22, paddingVertical: 10, paddingHorizontal: 14 },
  flameNum: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 2 },
  flameLbl: { color: '#FFEFD6', fontSize: 11 },
  strip: { flexDirection: 'row', alignItems: 'center', marginTop: -28, marginHorizontal: 14, backgroundColor: colors.surface, borderRadius: 22, paddingVertical: 14, ...shadow, shadowOpacity: 0.12 },
  stripDivider: { width: 1, height: 52, backgroundColor: colors.line },
  stat: { flex: 1, alignItems: 'center' },
  statIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.ink },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 1 },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 18, marginTop: 16, borderWidth: 1, borderColor: colors.line },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  cardSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  goalTag: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.successSoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  goalDash: { width: 14, height: 0, borderTopWidth: 2, borderColor: colors.success, borderStyle: 'dashed' },
  goalText: { fontSize: 11, fontWeight: '700', color: colors.success },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: BAR_MAX + 50 },
  goalLine: { position: 'absolute', left: 0, right: 0, height: 0, borderTopWidth: 1.5, borderColor: colors.success, borderStyle: 'dashed', opacity: 0.6 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: 26, borderRadius: 10 },
  value: { fontSize: 11, color: colors.muted, marginBottom: 4, height: 14 },
  day: { fontSize: 12, color: colors.muted, marginTop: 8, height: 18 },
  dayToday: { color: colors.accent, fontWeight: '800' },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  legend: { flex: 1, gap: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink },
  legendVal: { fontSize: 12, color: colors.muted },
}));
