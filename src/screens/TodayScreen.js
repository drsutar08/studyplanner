import React, { useMemo, useRef, useState } from 'react';
import { View, Text, SectionList, ScrollView, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow, type, themedStyles, readable, solid } from '../theme';
import { t } from '../i18n';
import { useStore } from '../store';
import { dateKey, longDate, formatDue, formatTime } from '../dates';
import TaskRow from '../components/TaskRow';
import QuoteCard from '../components/QuoteCard';
import { AdCard } from '../ads';
import SmartPlan from '../components/SmartPlan';
import AddTaskSheet from '../components/AddTaskSheet';
import ExamItem from '../components/ExamItem';
import { classWhere } from '../components/AddClassSheet';
import { classesOn, nextSessionDate, classHomework, isActivity, nextUp, weekStartOf } from '../classes';
import WeeklyGoalsCard from '../components/WeeklyGoalsCard';
import { foldRepeats, startsDay } from '../comingUp';
import { attentionItems } from '../attention';
import { protectedStreak } from '../stats';
import { DEFAULT_TARGET, statusOn, examStatus } from '../attendance';
import { isGraded } from '../grades';
import AttendanceStrip from '../components/AttendanceStrip';
import { formatDuration } from '../components/AddExamSheet';
import { useClock, hhmmNow } from '../clock';
import { useTwoColumns } from '../layout';
import { activityLook, activityCategoryLabel } from '../activityKinds';
import { dayRotationLabel } from '../rotationLabels';
import ClassHomework from '../components/ClassHomework';
import { breakStatus } from '../vacations';
import { BREAK_COLOR } from '../components/AddVacationSheet';
import { vacationRange } from '../components/VacationRow';
import { useUndoableDelete } from '../undo';
import { SelectBar, SelectButton, PickRow, SelectionActions } from '../components/BulkActions';
import { useTaskSelection } from '../taskSelection';
import { useAuth } from '../auth';
import { LinearGradient } from 'expo-linear-gradient';
import { HeroIllustration, ProgressRing, EmptyIllustration } from '../components/Illustrations';
import { dueCards } from '../flashcards';
import AIHelperSheet from '../components/AIHelperSheet';
import QuickAdd from '../components/QuickAdd';
import { cloudConfigured } from '../cloud/supabase';

// Translated when called, so it follows a language change. The name is part of the sentence.
const greeting = (name) => {
  const h = new Date().getHours();
  return t(h < 12 ? 'today.greeting.morning' : h < 18 ? 'today.greeting.afternoon' : 'today.greeting.evening', { name });
};

// The time on the greeting card, ticking over on the minute (only this re-renders, not the dashboard)
function HeroClock() {
  const now = useClock();
  return (
    <View style={styles.clock} accessibilityLabel={t('today.hero.timeA11y', { time: formatTime(now) })}>
      <Ionicons name="time-outline" size={13} color="#E6E9FF" />
      <Text style={styles.clockText}>{formatTime(now)}</Text>
    </View>
  );
}

// The focus goal's percentage in the middle of the hero's ring: app text over the drawing (SVG text falls back to a
// serif font on Android). Its size is fixed here, not in the styles below (which grow with the Text size setting), so
// it stays inside the ring; a little smaller at 100%
function RingPercent({ value }) {
  const pct = Math.round(value * 100);
  return (
    <View style={styles.ringCenter} pointerEvents="none">
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: pct >= 100 ? 12.5 : 14 }} allowFontScaling={false} numberOfLines={1}>
        {pct}%
      </Text>
    </View>
  );
}

// Today's timetable: classes and activities. Hidden on days without either.
// `onMark(cls, status)`: attendance for today's session, offered once a class has started
function TodayClasses({ classes, term, vacations, rotation, tasks, subjectById, onOpen, onAddHomework, onToggleTask, onEditTask, onFocusTask, onDeleteTask, onMark }) {
  const [openId, setOpenId] = useState(null); // the class whose homework list is open
  const list = classesOn(classes, dateKey(), term, vacations, rotation);
  if (list.length === 0) return null;
  const now = new Date();
  const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return (
    <Pressable onPress={onOpen} style={styles.examCard} accessibilityLabel={t('today.classes.a11y')}>
      <View style={styles.examHead}>
        <Ionicons name="easel" size={14} color={colors.accent} />
        <Text style={[styles.examKicker, { color: colors.accent }]}>{list.some(isActivity) ? t('activities.todayKicker') : t('today.classes.kicker')}</Text>
        {dayRotationLabel(rotation, dateKey(), vacations) ? <Text style={styles.rotationTag}>{dayRotationLabel(rotation, dateKey(), vacations)}</Text> : null}
        <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 'auto' }} />
      </View>
      <NextUpLine list={list} nowHHMM={nowHHMM} />
      {list.map((c, i) => {
        const act = isActivity(c);
        const s = act ? null : subjectById[c.subjectId];
        const tint = act ? activityLook(c).color : s ? s.color : colors.accent;
        const over = c.end && c.end <= nowHHMM;
        const live = c.start && c.end && c.start <= nowHHMM && !over;
        return (
          <View key={c.id} style={i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }}>
          <Pressable
            onPress={act ? onOpen : () => setOpenId((id) => (id === c.id ? null : c.id))}
            style={[styles.examRow, over && { opacity: 0.5 }]}
            accessibilityRole="button"
            {...(act
              ? { accessibilityLabel: t('activities.todayA11y', { title: c.title }) }
              : { accessibilityState: { expanded: openId === c.id }, accessibilityLabel: t(openId === c.id ? 'classHomework.hideA11y' : 'classHomework.showA11y', { title: c.title }) })}
          >
            <View style={[styles.classTime, { backgroundColor: tint + '1F' }]}>
              <Text style={[styles.classTimeText, { color: readable(tint) }]}>{c.start ? formatTime(c.start) : t('today.classes.anyTime')}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.examName} numberOfLines={1}>{c.title}</Text>
              <Text style={styles.examMeta} numberOfLines={1}>
                {[act ? activityCategoryLabel(c) : s && s.name, c.end && t('today.classes.until', { time: formatTime(c.end) }), classWhere(c)].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {live ? <Text style={styles.liveTag}>{t('today.classes.now')}</Text> : null}
            {act ? null : (
            <Pressable onPress={() => onAddHomework(c)} hitSlop={8} style={[styles.hwBtn, { backgroundColor: tint + '1A' }]} accessibilityLabel={t('homework.addA11y', { title: c.title })}>
              <Ionicons name="add" size={14} color={tint} />
              <Ionicons name="document-text-outline" size={14} color={tint} />
            </Pressable>
            )}
          </Pressable>
          {!act && (!c.start || c.start <= nowHHMM) ? (
            <AttendanceStrip compact title={c.title} status={statusOn(c, dateKey())} onMark={(status) => onMark(c, status)} />
          ) : null}
          {act ? null : (
          <ClassHomework
            classTitle={c.title}
            homework={classHomework(tasks, c.id, dateKey())}
            tint={tint}
            expanded={openId === c.id}
            onToggleExpanded={() => setOpenId((id) => (id === c.id ? null : c.id))}
            subjectById={subjectById}
            onToggleTask={onToggleTask}
            onEditTask={onEditTask}
            onFocusTask={onFocusTask}
            onDeleteTask={onDeleteTask}
            onAdd={() => onAddHomework(c)}
          />
          )}
          </View>
        );
      })}
    </Pressable>
  );
}

// "You're on a break" while one is running, or a heads-up when the next one is two weeks away or less.
// "Now: Calculus II · ends in 45 min" / "Next: Football practice at 6:00 PM · in 2h 10m" / "Done for today"
function NextUpLine({ list, nowHHMM }) {
  if (!list.some((c) => c.start)) return null;
  const up = nextUp(list, nowHHMM);
  const text = !up
    ? t('today.next.done')
    : up.status === 'now'
      ? t('today.next.now', { title: up.cls.title, left: formatDuration(up.minutes) })
      : t('today.next.next', { title: up.cls.title, time: formatTime(up.cls.start), in: formatDuration(up.minutes) });
  const tone = !up ? colors.muted : up.status === 'now' ? colors.success : colors.accent;
  return (
    <View style={[styles.nextUp, { backgroundColor: tone + '14' }]}>
      <Ionicons name={!up ? 'checkmark-done' : up.status === 'now' ? 'radio-button-on' : 'time-outline'} size={14} color={tone} />
      <Text style={[styles.nextUpText, { color: readable(tone) }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

// Needs your attention: attendance, grades and work hours, only when something applies.
const ATTENTION_ICON = { below: 'trending-down', hours: 'briefcase', mark: 'hand-left-outline', score: 'school-outline' };
function AttentionCard({ items, target, onOpen }) {
  if (!items.length) return null;
  const text = (i) => {
    if (i.id === 'below')
      return i.classes.length === 1
        ? t('today.attention.belowOne', { title: i.classes[0].title, pct: i.classes[0].pct, target })
        : t('today.attention.belowMany', { count: i.classes.length, target });
    if (i.id === 'hours') return t('today.attention.hours', { over: formatDuration(i.over), limit: t('hours.limitChip', { n: i.limit }) });
    if (i.id === 'mark') return t('today.attention.mark', { count: i.count });
    return t('today.attention.score', { count: i.count });
  };
  return (
    <View style={styles.attention}>
      <View style={styles.examHead}>
        <Ionicons name="alert-circle" size={14} color={colors.warn} />
        <Text style={[styles.examKicker, { color: colors.warn }]}>{t('today.attention.title')}</Text>
      </View>
      {items.map((i, n) => (
        <Pressable
          key={i.id}
          onPress={() => onOpen(i.id === 'hours' ? 'Calendar' : 'Progress')}
          style={[styles.attnRow, n > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}
          accessibilityRole="button"
          accessibilityLabel={text(i)}
        >
          <View style={[styles.attnIcon, { backgroundColor: i.id === 'below' || i.id === 'hours' ? colors.dangerSoft : colors.warnSoft }]}>
            <Ionicons name={ATTENTION_ICON[i.id]} size={15} color={i.id === 'below' || i.id === 'hours' ? colors.danger : colors.warn} />
          </View>
          <Text style={styles.attnText}>{text(i)}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      ))}
    </View>
  );
}

function BreakBanner({ vacations, onOpen }) {
  const { current, daysLeft, next, daysUntil } = breakStatus(vacations, dateKey());
  const v = current || (next && daysUntil <= 14 ? next : null);
  if (!v) return null;
  const headline = current ? t('today.break.nowLeft', { count: daysLeft }) : t('today.break.startsIn', { count: daysUntil });
  return (
    <Pressable onPress={onOpen} style={[styles.breakCard, current && styles.breakNow]} accessibilityLabel={t('today.break.a11y', { title: v.title })}>
      <View style={styles.breakIcon}>
        <Ionicons name="sunny" size={20} color={current ? '#fff' : BREAK_COLOR} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.breakKicker, current && { color: '#D8F3EE' }]}>{headline}</Text>
        <Text style={[styles.breakTitle, current && { color: '#fff' }]} numberOfLines={1}>
          {v.title}
        </Text>
        <Text style={[styles.breakMeta, current && { color: '#D8F3EE' }]} numberOfLines={1}>
          {t(v.pause !== false ? 'today.break.metaPaused' : 'today.break.metaContinue', { range: vacationRange(v) })}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={current ? '#D8F3EE' : colors.muted} />
    </Pressable>
  );
}

// `onMark(exam, status)`: attendance for an exam today that has no score yet
function ExamCountdown({ exams, subjectById, onOpen, onMark }) {
  const today = dateKey();
  const upcoming = exams
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  const next = upcoming.slice(0, 2);

  if (next.length === 0) {
    return (
      <Pressable onPress={onOpen} style={styles.examEmpty} accessibilityLabel={t('today.exams.addTitle')}>
        <Ionicons name="flag-outline" size={20} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.examEmptyTitle}>{t('today.exams.addTitle')}</Text>
          <Text style={styles.examEmptySub}>{t('today.exams.addSub')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onOpen} style={styles.examCard} accessibilityLabel={t('today.exams.a11y')}>
      <View style={styles.examHead}>
        <Ionicons name="flag" size={14} color={colors.danger} />
        <Text style={styles.examKicker}>{t('today.exams.kicker')}</Text>
        <Text style={styles.examCount}>{t('today.exams.upcoming', { count: upcoming.length })}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </View>
      {next.map((e) => (
        <ExamItem
          key={e.id}
          exam={e}
          subject={subjectById[e.subjectId]}
          flat
          {...(e.date === today && !isGraded(e) ? { attendance: examStatus(e), onMark: (status) => onMark(e, status) } : {})}
        />
      ))}
      {upcoming.length > next.length ? <Text style={styles.examMore}>{t('today.exams.more', { count: upcoming.length - next.length })}</Text> : null}
    </Pressable>
  );
}

function FilterChip({ label, on, onPress, color, icon }) {
  const tint = color || colors.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      aria-pressed={on}
      accessibilityLabel={t('today.filter.a11y', { name: label })}
      style={[styles.fChip, on && { backgroundColor: solid(tint), borderColor: solid(tint) }]}
    >
      {icon ? <Ionicons name={icon} size={12} color={on ? colors.onAccent : tint} /> : color ? <View style={[styles.fDot, { backgroundColor: on ? colors.onAccent : tint }]} /> : null}
      <Text style={[styles.fText, on && { color: colors.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

// One of the three summary tiles under the greeting card
// `onPress` shows only that part of the task list; `selected` while it does.
function StatTile({ tone, icon, value, label, caption, captionIcon, progress, onPress, selected }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={styles.tileHit}
      accessibilityRole="button"
      aria-pressed={!!selected} accessibilityState={{ selected: !!selected, disabled: !onPress }}
    >
    <LinearGradient colors={tone.grad} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={[styles.tile, { borderColor: selected ? tone.fg : tone.border }, selected && styles.tileOn]}>
      <View style={[styles.tileIcon, { backgroundColor: tone.chip }]}>
        <Ionicons name={icon} size={17} color={tone.fg} />
      </View>
      <Text style={[styles.tileValue, { color: tone.fg }]}>{value}</Text>
      <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
      {typeof progress === "number" ? (
        <View style={[styles.tileTrack, { backgroundColor: tone.chip }]}>
          <View style={[styles.tileFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: tone.fg }]} />
        </View>
      ) : (
        <View style={styles.tileFoot} />
      )}
      <View style={styles.tileCaptionRow}>
        {captionIcon ? <Ionicons name={captionIcon} size={11} color={tone.fg} /> : null}
        <Text style={[styles.tileCaption, { color: tone.fg }]} numberOfLines={1}>{caption}</Text>
      </View>
    </LinearGradient>
    </Pressable>
  );
}

// "Coming up" shows this many at first, and this many more per "Show more"
const UPCOMING_STEP = 5;

// Flashcards due today, on the dashboard (nothing when none are)
function CardsDue({ cards, onOpen }) {
  const n = dueCards(cards, dateKey()).length;
  if (!n) return null;
  return (
    <Pressable onPress={onOpen} style={({ hovered }) => [styles.cardsDue, hovered && { borderColor: '#8E7DFF' }]} accessibilityRole="button" accessibilityLabel={t('cards.dashA11y', { count: n })}>
      <View style={styles.cardsDueIcon}>
        <Ionicons name="albums" size={20} color="#5B3FD9" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardsDueTitle}>{t('cards.dashTitle', { count: n })}</Text>
        <Text style={styles.cardsDueSub}>{t('cards.dashSub')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

export default function TodayScreen({ navigation }) {
  const { state, dispatch } = useStore();
  const { user, settings } = useAuth();
  const twoColumns = useTwoColumns();
  const listRef = useRef(null);
  const { deleteTask } = useUndoableDelete();
  const insets = useSafeAreaInsets();
  // "Select": pick several tasks and complete, move or delete them together
  const sel = useTaskSelection();
  const [editingTask, setEditingTask] = useState(null);
  const [homework, setHomework] = useState(null); // { classTitle, subjectId, due } while the homework sheet is open
  const today = dateKey();

  const subjectById = useMemo(
    () => Object.fromEntries(state.subjects.map((s) => [s.id, s])),
    [state.subjects]
  );

  const [filter, setFilter] = useState({ subjectId: null, high: false, section: null }); // section: a tile's part of the list
  const filtering = !!filter.subjectId || filter.high || !!filter.section;
  // "Coming up" lists the next few; "Show more" adds a few at a time. Back to the first few when a filter changes.
  const [upcomingShown, setUpcomingShown] = useState(UPCOMING_STEP);
  const filterKey = `${filter.subjectId}|${filter.high}|${filter.section}`;
  const [shownFor, setShownFor] = useState(filterKey);
  if (shownFor !== filterKey) {
    setShownFor(filterKey);
    setUpcomingShown(UPCOMING_STEP);
  }
  const { sections, dueToday, doneToday, minutesToday, overdueCount, upcomingCount, nextUpcoming } = useMemo(() => {
    const matches = (task) => (!filter.subjectId || task.subjectId === filter.subjectId) && (!filter.high || task.priority === 'high');
    const overdue = state.tasks
      .filter((task) => !task.done && task.due < today)
      .sort((a, b) => a.due.localeCompare(b.due));
    const todays = state.tasks
      .filter((task) => task.due === today)
      .sort((a, b) => Number(a.done) - Number(b.done));
    // a repeating task shows only its next copy here ("+6 more")
    const upcoming = foldRepeats(
      state.tasks.filter((task) => !task.done && task.due > today).sort((a, b) => a.due.localeCompare(b.due))
    );

    return {
      sections: [
        { id: 'overdue', title: t('today.sections.overdue'), data: overdue },
        { id: 'today', title: t('common.today'), data: todays },
        { id: 'upcoming', title: t('today.sections.upcoming'), data: upcoming },
      ]
        .filter((s) => !filter.section || s.id === filter.section)
        .map((s) => ({ ...s, data: s.data.filter(matches) }))
        .filter((s) => s.data.length > 0),
      dueToday: todays.length,
      overdueCount: overdue.length,
      upcomingCount: upcoming.length,
      nextUpcoming: upcoming.length ? upcoming[0].due : null,
      doneToday: todays.filter((task) => task.done).length,
      minutesToday: state.sessions
        .filter((s) => s.date === today)
        .reduce((sum, s) => sum + s.minutes, 0),
    };
  }, [state.tasks, state.sessions, today, filter]);

  const goal = settings.dailyGoal || 60;
  const focusProgress = Math.min(1, minutesToday / goal);
  const [helperOpen, setHelperOpen] = useState(false); // the AI study helper
  const streak = protectedStreak(state.sessions, today, settings.weekStart || 0).days; // one missed day a week is forgiven
  const attention = attentionItems({
    classes: state.classes,
    exams: state.exams,
    term: state.term,
    vacations: state.vacations,
    rotation: state.rotation,
    today,
    nowHHMM: hhmmNow(),
    target: settings.attendanceTarget || DEFAULT_TARGET,
    workLimit: settings.workHourLimit || null,
    weekStart: settings.weekStart || 0,
  });
  // the "+ Subtask" chip: on hover on the desktop; on a phone only on the first open task
  const firstOpenId = (sections.flatMap((x) => x.data).find((task) => !task.done) || {}).id;
  // a tile shows only its part of the list (tap again for everything) and brings the list into view
  const showSection = (id) => {
    setFilter((f) => ({ ...f, section: f.section === id ? null : id }));
    if (!twoColumns) {
      setTimeout(() => {
        try {
          listRef.current && listRef.current.scrollToLocation({ sectionIndex: 0, itemIndex: 0, viewOffset: 56, animated: true });
        } catch {
          // the list may be empty for this filter: nothing to scroll to
        }
      }, 60);
    }
  };

  const top = (
    <View>
      <LinearGradient
        colors={['#2A3A9E', '#4C3FCB', '#7A5CFA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroText}>
          <Text style={styles.heroDate}>{longDate().toUpperCase()}</Text>
          <Text style={styles.heroTitle}>{greeting(user.name.split(' ')[0])}</Text>
          <View style={styles.streakRow}>
            <Ionicons name="flame" size={14} color={streak ? '#FDBA74' : '#C9D0FF'} />
            <Text style={styles.heroSub}>{streak ? t('today.hero.streak', { count: streak }) : t('today.hero.noStreak')}</Text>
          </View>
          <View style={styles.ringRow} accessibilityLabel={t('today.hero.goalA11y', { done: minutesToday, goal })}>
            <View>
              <ProgressRing size={64} stroke={7} value={focusProgress} />
              <RingPercent value={focusProgress} />
            </View>
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.ringBig}>{t('today.hero.goal', { done: minutesToday, goal })}</Text>
              <Text style={styles.ringSmall}>{focusProgress >= 1 ? t('today.hero.goalMet') : t('today.hero.goalLabel')}</Text>
            </View>
          </View>
        </View>
        <HeroClock />
        <View style={styles.heroArt} pointerEvents="none">
          <HeroIllustration width={170} height={128} />
        </View>
      </LinearGradient>

      <QuickAdd />
      <QuoteCard />
      <AdCard />

      <View style={styles.stats}>
        <StatTile
          tone={{ fg: colors.accent, chip: colors.accentSoft, grad: [colors.surfaceAlt, colors.surface], border: colors.accentBorder }}
          icon="today"
          value={dueToday}
          label={t('today.tiles.dueToday')}
          progress={dueToday === 0 ? null : doneToday / dueToday}
          caption={dueToday === 0 ? t('today.tiles.freeDay') : t('today.tiles.done', { done: doneToday, count: dueToday })}
          onPress={dueToday ? () => showSection('today') : null}
          selected={filter.section === 'today'}
        />
        <StatTile
          tone={
            overdueCount > 0
              ? { fg: colors.danger, chip: colors.dangerSoft, grad: [colors.dangerSoft, colors.surface], border: colors.dangerBorder }
              : { fg: colors.success, chip: colors.successSoft, grad: [colors.successSoft, colors.surface], border: colors.successBorder }
          }
          icon={overdueCount > 0 ? "alert-circle" : "checkmark-circle"}
          value={overdueCount}
          label={t('today.tiles.overdue')}
          caption={overdueCount > 0 ? t('today.tiles.catchUp') : t('today.tiles.allClear')}
          captionIcon={overdueCount > 0 ? "arrow-forward" : "sparkles"}
          onPress={overdueCount ? () => showSection('overdue') : null}
          selected={filter.section === 'overdue'}
        />
        <StatTile
          tone={{ fg: colors.teal, chip: colors.tealSoft, grad: [colors.tealSoft, colors.surface], border: colors.tealBorder }}
          icon="calendar"
          value={upcomingCount}
          label={t('today.tiles.upcoming')}
          caption={nextUpcoming ? formatDue(nextUpcoming) : t('today.tiles.noneAhead')}
          captionIcon="time-outline"
          onPress={upcomingCount ? () => showSection('upcoming') : null}
          selected={filter.section === 'upcoming'}
        />
      </View>
    </View>
  );

  // today: break, timetable, what needs doing (above the list on a phone, on the right on a wide screen)
  const todayCards = (
    <>

      <BreakBanner vacations={state.vacations} onOpen={() => navigation.navigate('Calendar')} />

      <TodayClasses
        classes={state.classes}
        term={state.term}
        vacations={state.vacations}
        rotation={state.rotation}
        tasks={state.tasks}
        subjectById={subjectById}
        onToggleTask={(task) => dispatch({ type: 'TOGGLE_TASK', id: task.id })}
        onEditTask={(task) => setEditingTask(task)}
        onFocusTask={(task) => navigation.navigate('Focus', { taskId: task.id })}
        onDeleteTask={(task) => deleteTask(task)}
        onAddHomework={(c) => setHomework({ classId: c.id, classTitle: c.title, subjectId: c.subjectId, due: nextSessionDate(c, dateKey(), state.term, state.vacations, 120, state.rotation) })} onOpen={() => navigation.navigate('Calendar')}
        onMark={(c, status) => dispatch({ type: 'MARK_ATTENDANCE', id: c.id, date: dateKey(), status })}
      />

      <AttentionCard items={attention} target={settings.attendanceTarget || DEFAULT_TARGET} onOpen={(screen) => navigation.navigate(screen)} />
    </>
  );

  // later: exams and the plan (below the list on a phone)
  const laterCards = (
    <>
      <ExamCountdown
        exams={state.exams}
        subjectById={subjectById}
        onOpen={() => navigation.navigate('Calendar')}
        onMark={(e, status) => dispatch({ type: 'MARK_EXAM_ATTENDANCE', id: e.id, status })}
      />

      <CardsDue cards={state.cards || []} onOpen={() => navigation.navigate('Flashcards')} />
      {cloudConfigured ? (
        <Pressable onPress={() => setHelperOpen(true)} style={({ hovered }) => [styles.aiCard, hovered && { borderColor: '#8E7DFF' }]} accessibilityRole="button">
          <Ionicons name="sparkles" size={18} color="#5B3FD9" />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardsDueTitle}>{t('ai.dashTitle')}</Text>
            <Text style={styles.cardsDueSub}>{t('ai.dashSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
      <AIHelperSheet visible={helperOpen} initialTab="advice" onClose={() => setHelperOpen(false)} />

      <WeeklyGoalsCard subjects={state.subjects} sessions={state.sessions} weekStart={weekStartOf(dateKey(), settings.weekStart || 0)} today={dateKey()} onOpen={() => navigation.navigate('Subjects')} />

      <SmartPlan
        tasks={state.tasks}
        exams={state.exams}
        classes={state.classes}
        term={state.term}
        vacations={state.vacations}
        rotation={state.rotation}
        subjectById={subjectById}
        minutesToday={minutesToday}
        dailyGoal={settings.dailyGoal}
        onStart={(taskId) => navigation.navigate('Focus', { taskId })}
        onToggle={(id) => dispatch({ type: 'TOGGLE_TASK', id })}
      />

    </>
  );

  // the lists as shown: Coming up cut to what is shown (all of it when its tile was tapped)
  const listed = sections.map((section) => {
    if (section.id !== 'upcoming' || filter.section === 'upcoming' || section.data.length <= UPCOMING_STEP) return section;
    return { ...section, total: section.data.length, data: section.data.slice(0, upcomingShown) };
  });

  const visibleIds = listed.flatMap((section) => section.data.map((task) => task.id));

  const filters =
    state.tasks.length > 0 ? (
        <View style={styles.filterWrap}>
          {sel.selecting ? (
            <SelectBar count={sel.picked.length} total={visibleIds.length} onAll={() => sel.pickAll(visibleIds)} onNone={() => sel.pickAll([])} onCancel={sel.stop} />
          ) : (
          <>
          <View style={styles.filterHead}>
            <Text style={[styles.filterLabel, { marginBottom: 0 }]}>{t('today.filter.label')}</Text>
            <SelectButton onPress={sel.start} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            <FilterChip label={t('today.filter.all')} on={!filtering} onPress={() => setFilter({ subjectId: null, high: false, section: null })} />
            {state.subjects.map((s) => (
              <FilterChip
                key={s.id}
                label={s.name}
                color={s.color}
                on={filter.subjectId === s.id}
                onPress={() => setFilter((f) => ({ ...f, subjectId: f.subjectId === s.id ? null : s.id }))}
              />
            ))}
            <FilterChip label={t('today.filter.high')} icon="arrow-up" color="#D6336C" on={filter.high} onPress={() => setFilter((f) => ({ ...f, high: !f.high }))} />
          </ScrollView>
          </>
          )}
        </View>
    ) : null;

  // Coming up is split by day: "Tomorrow", "Mon, Nov 2"…
  const dayLabel = (section, i) => (section.id === 'upcoming' && startsDay(section.data, i) ? <Text style={styles.dayLabel}>{formatDue(section.data[i].due)}</Text> : null);

  const sectionTitle = (section) => (
    <View style={styles.sectionRow}>
      <Text style={[styles.section, section.id === 'overdue' && { color: colors.danger }]}>{section.title}</Text>
      {section.total ? <Text style={styles.sectionCount}>{section.total}</Text> : null}
    </View>
  );
  // under a cut Coming up: how many are shown, "Show more" (a few at a time) and "Show less"
  const sectionFooter = (section) => {
    if (!section.total) return null;
    const left = section.total - section.data.length;
    const next = Math.min(UPCOMING_STEP, left);
    return (
      <View style={styles.moreRow}>
        <Text style={styles.moreCount}>{t('today.more.shownOf', { shown: section.data.length, total: section.total })}</Text>
        {section.data.length > UPCOMING_STEP ? (
          <Pressable onPress={() => setUpcomingShown(UPCOMING_STEP)} hitSlop={6} style={styles.lessBtn} accessibilityRole="button" accessibilityLabel={t('today.more.showLess')}>
            <Ionicons name="chevron-up" size={14} color={colors.muted} />
            <Text style={styles.lessText}>{t('today.more.showLess')}</Text>
          </Pressable>
        ) : null}
        {left > 0 ? (
          <Pressable onPress={() => setUpcomingShown((n) => n + UPCOMING_STEP)} style={styles.moreBtn} accessibilityRole="button" accessibilityLabel={t('today.more.showMoreA11y', { count: next, left })}>
            <Text style={styles.moreText}>{t('today.more.showMore', { count: next })}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.accent} />
          </Pressable>
        ) : null}
      </View>
    );
  };
  // while picking, a tap ticks the task
  const taskRow = (item) => (sel.selecting ? <PickRow sel={sel} task={item}>{plainRow(item)}</PickRow> : plainRow(item));
  const plainRow = (item) => (
    <TaskRow
      task={item}
      subject={subjectById[item.subjectId]}
      onToggle={() => dispatch({ type: 'TOGGLE_TASK', id: item.id })}
      onDelete={() => deleteTask(item)}
      onEdit={() => setEditingTask(item)}
      onFocus={() => navigation.navigate('Focus', { taskId: item.id })}
      addStepChip={twoColumns ? 'hover' : item.id === firstOpenId}
    />
  );
  const emptyList = filtering && state.tasks.length > 0 ? (
    <View style={styles.empty}>
      <Ionicons name="funnel-outline" size={34} color={colors.line} />
      <Text style={[type.h2, { marginTop: 8 }]}>{t('today.filter.noMatch')}</Text>
      <Pressable onPress={() => setFilter({ subjectId: null, high: false, section: null })} style={styles.clearBtn} accessibilityLabel={t('today.filter.clear')}>
        <Text style={styles.clearBtnText}>{t('today.filter.clear')}</Text>
      </Pressable>
    </View>
  ) : (
    <View style={styles.empty}>
      <EmptyIllustration />
      <Text style={[type.h2, { marginTop: 8 }]}>{t('today.emptyTitle')}</Text>
      <Text style={[type.meta, { marginTop: 6, textAlign: 'center' }]}>
        {t('today.emptySub')}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      {twoColumns ? (
        <ScrollView contentContainerStyle={[styles.list, styles.wide]} showsVerticalScrollIndicator={false}>
          <View style={styles.colMain}>
            {top}
            {filters}
            {listed.length ? listed.map((section) => (
              <View key={section.id}>
                {sectionTitle(section)}
                {section.data.map((task, i) => (
                  <View key={task.id}>
                    {dayLabel(section, i)}
                    {taskRow(task)}
                  </View>
                ))}
                {sectionFooter(section)}
              </View>
            )) : emptyList}
          </View>
          <View style={styles.colSide}>
            {todayCards}
            {laterCards}
          </View>
        </ScrollView>
      ) : (
        <SectionList
          ref={listRef}
          sections={listed}
          keyExtractor={(task) => task.id}
          ListHeaderComponent={
            <View style={styles.header}>
              {top}
              {todayCards}
              {filters}
            </View>
          }
          ListFooterComponent={<View style={styles.footer}>{laterCards}</View>}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          onScrollToIndexFailed={() => {}}
          renderSectionHeader={({ section }) => sectionTitle(section)}
          renderSectionFooter={({ section }) => sectionFooter(section)}
          renderItem={({ item, index, section }) => (
            <>
              {dayLabel(section, index)}
              {taskRow(item)}
            </>
          )}
          ListEmptyComponent={emptyList}
        />
      )}

      <SelectionActions sel={sel} bottom={twoColumns ? 20 : insets.bottom + 92} />

      <AddTaskSheet
        visible={!!homework}
        homework={homework}
        onClose={() => setHomework(null)}
        subjects={state.subjects}
        onSave={(tk) => dispatch(tk.repeat ? { type: 'ADD_RECURRING', ...tk, days: tk.repeat, startDate: tk.due } : { type: 'ADD_TASK', ...tk })}
      />
      <AddTaskSheet
        visible={!!editingTask}
        editTask={editingTask}
        onClose={() => setEditingTask(null)}
        subjects={state.subjects}
        exams={state.exams}
        onSave={(task) => editingTask && dispatch({ type: 'UPDATE_TASK', id: editingTask.id, ...task })}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  aiCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, marginBottom: 14 },
  cardsDue: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.violetSoft, borderWidth: 1, borderColor: colors.line, marginBottom: 14 },
  cardsDueIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  cardsDueTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  cardsDueSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  header: { paddingTop: 16, paddingBottom: 8 },
  hero: { borderRadius: 24, padding: 20, minHeight: 190, overflow: 'hidden', flexDirection: 'row', ...shadow },
  heroText: { flex: 1, zIndex: 2 },
  heroDate: { color: '#C9D0FF', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  clock: { position: 'absolute', top: 14, right: 16, zIndex: 3, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  clockText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.2, fontVariant: ['tabular-nums'] },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 6, letterSpacing: -0.4 },
  heroSub: { color: '#DCE0FF', fontSize: 14, maxWidth: 220 },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  nextUp: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, marginBottom: 4 },
  nextUpText: { flex: 1, fontSize: 12, fontWeight: '800' },
  attention: { marginTop: 14, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, borderWidth: 1, borderColor: colors.warnBorder },
  attnRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  attnIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  attnText: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.ink },
  tileHit: { flex: 1 },
  tileOn: { borderWidth: 2 },
  footer: { paddingTop: 8 },
  wide: { flexDirection: 'row', alignItems: 'flex-start', gap: 20, paddingTop: 16 },
  colMain: { flex: 1.5, minWidth: 0 },
  colSide: { flex: 1, minWidth: 0, maxWidth: 440 },
  ringRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ringBig: { color: '#fff', fontSize: 18, fontWeight: '800' },
  ringSmall: { color: '#C9D0FF', fontSize: 12 },
  heroArt: { position: 'absolute', right: -6, bottom: -4 },
  stats: { flexDirection: 'row', gap: 12, marginTop: 14 },
  filterWrap: { marginTop: 22 },
  filterHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  filterLabel: { fontSize: 13, fontWeight: '800', color: colors.muted, letterSpacing: 0.4, marginBottom: 8 },
  fChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  fDot: { width: 8, height: 8, borderRadius: 4 },
  fText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  clearBtn: { marginTop: 12, backgroundColor: colors.accentSoft, paddingVertical: 9, paddingHorizontal: 18, borderRadius: 16 },
  clearBtnText: { color: colors.accent, fontWeight: '800', fontSize: 13 },
  breakCard: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, backgroundColor: colors.tealSoft, borderWidth: 1, borderColor: colors.tealBorder },
  breakNow: { backgroundColor: BREAK_COLOR, borderColor: BREAK_COLOR },
  breakIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  breakKicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: BREAK_COLOR, textTransform: 'uppercase' },
  breakTitle: { fontSize: 15, fontWeight: '800', color: colors.ink, marginTop: 2 },
  breakMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  examCard: { marginTop: 14, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, borderWidth: 1, borderColor: colors.line },
  examHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  examKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.danger },
  examCount: { marginLeft: 'auto', fontSize: 11, fontWeight: '700', color: colors.muted, backgroundColor: colors.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  examMore: { textAlign: 'center', fontSize: 12, fontWeight: '700', color: colors.accent, paddingTop: 2, paddingBottom: 8 },
  examRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  examName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  examMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  rotationTag: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: colors.violet, backgroundColor: colors.violetSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  hwBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 6, borderRadius: 12, marginLeft: 6 },
  classTime: { minWidth: 72, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 12 },
  classTimeText: { fontSize: 13, fontWeight: '800' },
  liveTag: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: colors.onAccent, backgroundColor: colors.success, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  examEmpty: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accentBorder, backgroundColor: colors.surfaceAlt },
  examEmptyTitle: { fontSize: 15, fontWeight: '800', color: colors.accent },
  examEmptySub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  tile: { flex: 1, borderRadius: 22, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12, borderWidth: 1 },
  tileIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  tileValue: { fontSize: 32, fontWeight: '800', letterSpacing: -1, lineHeight: 36 },
  tileLabel: { fontSize: 13, fontWeight: '700', color: colors.ink, marginTop: 2 },
  tileTrack: { height: 5, borderRadius: 3, marginTop: 12, overflow: 'hidden' },
  tileFill: { height: 5, borderRadius: 3 },
  tileFoot: { height: 5, marginTop: 12 },
  tileCaptionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 7 },
  tileCaption: { fontSize: 11, fontWeight: '700' },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.line,
    marginTop: 12,
    overflow: 'hidden',
  },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.accentFill },
  section: { ...type.h2, marginTop: 20, marginBottom: 10 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayLabel: { fontSize: 12, fontWeight: '800', color: colors.muted, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 6, marginBottom: 6, marginLeft: 2 },
  sectionCount: { marginTop: 10, fontSize: 12, fontWeight: '800', color: colors.muted, backgroundColor: colors.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line },
  moreCount: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.muted },
  moreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.accentSoft },
  moreText: { fontSize: 13, fontWeight: '800', color: colors.accent },
  lessBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 7 },
  lessText: { fontSize: 12, fontWeight: '700', color: colors.muted },
  empty: { alignItems: 'center', paddingTop: 60 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
}));
