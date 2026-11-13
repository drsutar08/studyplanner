import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, useWindowDimensions, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, type } from '../theme';
import { t, weekdayName } from '../i18n';
import { AdBanner } from '../ads';
import { useStore } from '../store';
import {
  dateKey,
  addDays,
  formatDue,
  formatDate,
  formatTime,
  monthOf,
  addMonths,
  monthTitle,
  countdownLabel,
  parseKey,
} from '../dates';
import MonthGrid from '../components/MonthGrid';
import AddTaskSheet from '../components/AddTaskSheet';
import AddExamSheet from '../components/AddExamSheet';
import ExamItem from '../components/ExamItem';
import AddClassSheet from '../components/AddClassSheet';
import ClassRow from '../components/ClassRow';
import WeekView from '../components/WeekView';
import { classesOn, occursOn, timetable, classStatus, sessionsInMonth, nextSessionDate, classHomework, onlyClasses, isActivity, activityList, activityHours, weekStartOf , rotationIndexOn } from '../classes';
import { weekDays, buildWeek } from '../weekLayout';
import { useAuth } from '../auth';
import AddVacationSheet from '../components/AddVacationSheet';
import VacationRow from '../components/VacationRow';
import { vacationOn } from '../vacations';
import { useUndoableDelete } from '../undo';
import { useCalendarDay } from '../calendarDay';
import { useTwoColumns } from '../layout';
import MonthBoard from '../components/MonthBoard';
import { activityLook } from '../activityKinds';
import { isGraded } from '../grades';
import { statusOn, attendanceOf, examStatus } from '../attendance';
import RotationSheet from '../components/RotationSheet';
import { dayRotationLabel } from '../rotationLabels';
import { hhmmNow } from '../clock';
import { styles } from './calendar/styles';
import TimetableSection from './calendar/TimetableSection';
import { TasksSection, ExamsSection, VacationsSection, RepeatsSection } from './calendar/PlannerSections';
import { useMoveItem } from './calendar/useMoveItem';
import { useTaskSelection } from '../taskSelection';
import { SelectionActions } from '../components/BulkActions';
import { useIsFocused } from '@react-navigation/native';
import { useShortcuts } from '../shortcuts';

export default function CalendarScreen({ navigation, route }) {
  const { state, dispatch } = useStore();
  const { settings, updateSettings } = useAuth();
  const twoColumns = useTwoColumns();
  const roomyBoard = useWindowDimensions().width >= 1500; // month board days wide enough for "9:00 AM Calculus"
  const weekStart = settings.weekStart || 0;
  const view = settings.calendarView === 'week' ? 'week' : 'month';
  const today = dateKey();
  const [selected, setSelected] = useState(today);
  // tell the app shell, so the centre "+" adds a task on this day
  const { setDay } = useCalendarDay();
  useEffect(() => {
    setDay(selected);
  }, [selected, setDay]);
  const [month, setMonth] = useState(monthOf(today));
  const [addingTask, setAddingTask] = useState(false);
  const [settingRotation, setSettingRotation] = useState(false);
  const [addingExam, setAddingExam] = useState(false);
  const [editingExam, setEditingExam] = useState(null);
  const [editingRec, setEditingRec] = useState(null);
  const [addingClass, setAddingClass] = useState(false);
  const [addingActivity, setAddingActivity] = useState(false);
  const [scheduleTab, setScheduleTab] = useState('classes'); // timetable section: 'classes' | 'activities'
  const [plannerTab, setPlannerTab] = useState('tasks'); // desktop: which planner section is open
  const [hoursWeek, setHoursWeek] = useState('this'); // the Activities tab's hours: 'this' | 'next' week
  const [editingClass, setEditingClass] = useState(null);
  const [addingVacation, setAddingVacation] = useState(false);
  const [editingVacation, setEditingVacation] = useState(null);
  const [homework, setHomework] = useState(null); // { classTitle, subjectId, due } while the homework sheet is open

  // "+ homework" on a class: a task due at the class's next session after `fromKey`
  const openHomework = (cls, fromKey) =>
    setHomework({ classId: cls.id, classTitle: cls.title, subjectId: cls.subjectId, due: nextSessionDate(cls, fromKey < today ? today : fromKey, state.term, state.vacations, 120, state.rotation) });

  const subjectById = useMemo(() => Object.fromEntries(state.subjects.map((s) => [s.id, s])), [state.subjects]);

  const byDate = useMemo(() => {
    const map = {};
    state.tasks.forEach((t) => {
      (map[t.due] = map[t.due] || { tasks: [], exams: [] }).tasks.push(t);
    });
    state.exams.forEach((e) => {
      (map[e.date] = map[e.date] || { tasks: [], exams: [] }).exams.push(e);
    });
    return map;
  }, [state.tasks, state.exams]);

  const marks = (key) => {
    const d = byDate[key];
    const classes = state.classes.filter((c) => occursOn(c, key, state.term, state.vacations, state.rotation)).length;
    const vacation = !!vacationOn(state.vacations, key);
    if (!d) return { dots: [], exam: false, classes, vacation };
    const seen = [];
    d.tasks.forEach((t) => {
      const c = subjectById[t.subjectId] ? subjectById[t.subjectId].color : colors.muted;
      if (!seen.includes(c)) seen.push(c);
    });
    return { dots: seen, exam: d.exams.length > 0, classes, vacation };
  };

  const day = byDate[selected] || { tasks: [], exams: [] };
  const upcomingExams = useMemo(
    () => state.exams.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
    [state.exams, today]
  );
  // graded past exams stay: they are the grade record shown on Progress
  const pastExams = state.exams.filter((e) => e.date < today && !isGraded(e) && !e.attendance);
  const dayClasses = classesOn(state.classes, selected, state.term, state.vacations, state.rotation);
  const dayBreak = vacationOn(state.vacations, selected);
  // Homework is a child of its class: when the class is in this day's list, its homework is shown inside
  // it, not again as a separate row. Homework moved to a day without its class stays a normal row.
  const dayClassIds = new Set(dayClasses.map((c) => c.id));
  const dayTasks = day.tasks.filter((tk) => !(tk.classId && dayClassIds.has(tk.classId)));
  const breaks = useMemo(() => [...state.vacations].sort((a, b) => a.start.localeCompare(b.start)), [state.vacations]);
  const upcomingBreaks = breaks.filter((v) => v.end >= today);
  const pastBreaks = breaks.filter((v) => v.end < today);
  const table = useMemo(() => timetable(onlyClasses(state.classes), today, state.term, weekStart, state.rotation), [state.classes, state.term, today, weekStart, state.rotation]);
  const activities = useMemo(() => activityList(state.classes, today, state.term, weekStart), [state.classes, state.term, today, weekStart]);
  const hours = useMemo(
    () => activityHours(state.classes, addDays(weekStartOf(today, weekStart), hoursWeek === 'next' ? 7 : 0), state.term, state.vacations, state.rotation),
    [state.classes, state.term, state.vacations, state.rotation, today, weekStart, hoursWeek]
  );
  // Live "now / done" markers only make sense for today's list
  const now = selected === today ? hhmmNow() : null;

  const monthTasks = state.tasks.filter((t) => monthOf(t.due) === month).length;
  const monthExams = state.exams.filter((e) => monthOf(e.date) === month).length;
  const monthClasses = useMemo(() => sessionsInMonth(onlyClasses(state.classes), month, state.term, state.vacations, state.rotation), [state.classes, month, state.term, state.vacations, state.rotation]);

  // picking several of the day's tasks (complete, move or delete together); a new day starts afresh
  const sel = useTaskSelection();
  const insets = useSafeAreaInsets();
  const [selFor, setSelFor] = useState(selected);
  if (selFor !== selected) {
    setSelFor(selected);
    if (sel.selecting) sel.stop();
  }

  const select = (key) => {
    setSelected(key);
    if (monthOf(key) !== month) setMonth(monthOf(key));
  };
  // a day passed in (search opens an exam or a one-off class on its date): picked up as the params change
  const params = route ? route.params : undefined;
  const [seenParams, setSeenParams] = useState(params);
  if (params !== seenParams) {
    setSeenParams(params);
    if (params && params.day) select(params.day);
  }

  const selDate = parseKey(selected);
  const days = useMemo(() => weekDays(selected, weekStart), [selected, weekStart]);
  const week = useMemo(
    () => (view === 'week' ? buildWeek({ classes: state.classes, term: state.term, vacations: state.vacations, exams: state.exams, tasks: state.tasks, rotation: state.rotation }, days) : null),
    [view, days, state.classes, state.term, state.vacations, state.exams, state.tasks, state.rotation]
  );
  const offToday = view === 'week' ? !days.includes(today) || selected !== today : selected !== today || month !== monthOf(today);
  const weekTitle = () => {
    const a = parseKey(days[0]);
    const b = parseKey(days[6]);
    return t('calendar.range', { start: formatDate(a, { month: 'short', day: 'numeric' }), end: formatDate(b, { month: 'short', day: 'numeric' }) });
  };

  // Attendance wherever today's session shows: an exam from today or earlier without a score, and a
  // timetable class that meets today (its strip is labelled "Today", the card being the repeating class)
  const examMark = (e) =>
    e.date <= today && !isGraded(e) ? { attendance: examStatus(e), onMark: (status) => dispatch({ type: 'MARK_EXAM_ATTENDANCE', id: e.id, status }) } : {};
  const todayMark = (c) =>
    !isActivity(c) && occursOn(c, today, state.term, state.vacations, state.rotation)
      ? {
          attendance: statusOn(c, today),
          attendanceLabel: t('attendance.todayLabel'),
          // not the same as the selected day's strip for this class: "Mark Calculus II · Today as attended"
          attendanceTitle: `${c.title} · ${t('common.today')}`,
          onMark: (status) => dispatch({ type: 'MARK_ATTENDANCE', id: c.id, date: today, status }) }
      : {};

  const { deleteTask, deleteExam, deleteClass, stopRepeating, clearPastExams, clearPastClasses, deleteVacation, clearPastVacations } = useUndoableDelete();
  const isFocused = useIsFocused();

  const moveItem = useMoveItem({ state, dispatch, select });
  const [editingTask, setEditingTask] = useState(null);

  // the month (or week) title, arrows and counts: the phone layout
  const header = (
    <>
        {/* month header */}
        <LinearGradient colors={['#151B33', '#2A3A9E', '#7A5CFA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.glow} pointerEvents="none" />
          <View style={styles.heroRow}>
            <Pressable
              onPress={() => (view === 'week' ? select(addDays(selected, -7)) : setMonth(addMonths(month, -1)))}
              hitSlop={8}
              style={styles.arrow}
              accessibilityLabel={view === 'week' ? t('week.prev') : t('monthGrid.prevMonth')}
            >
              <Ionicons name="chevron-back" size={20} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => (view === 'week' ? select(today) : setMonth(monthOf(today)))}
              style={{ alignItems: 'center' }}
              accessibilityLabel={view === 'week' ? t('week.thisWeek') : t('monthGrid.thisMonth')}
            >
              <Text style={styles.monthText}>{view === 'week' ? weekTitle() : monthTitle(month)}</Text>
            </Pressable>
            <Pressable
              onPress={() => (view === 'week' ? select(addDays(selected, 7)) : setMonth(addMonths(month, 1)))}
              hitSlop={8}
              style={styles.arrow}
              accessibilityLabel={view === 'week' ? t('week.next') : t('monthGrid.nextMonth')}
            >
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </Pressable>
          </View>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Ionicons name="checkbox-outline" size={13} color="#C9D0FF" />
              <Text style={styles.statText}>{t('calendar.tasks', { count: monthTasks })}</Text>
            </View>
            <View style={styles.stat}>
              <Ionicons name="flag-outline" size={13} color="#C9D0FF" />
              <Text style={styles.statText}>{t('calendar.exams', { count: monthExams })}</Text>
            </View>
            {monthClasses > 0 && (
              <View style={styles.stat}>
                <Ionicons name="easel-outline" size={13} color="#C9D0FF" />
                <Text style={styles.statText}>{t('calendar.classes', { count: monthClasses })}</Text>
              </View>
            )}
            {offToday && (
              <Pressable onPress={() => select(today)} style={styles.todayPill} accessibilityLabel={t('calendar.goToday')}>
                <Ionicons name="today-outline" size={13} color="#151B33" />
                <Text style={styles.todayPillText}>{t('calendar.goToday')}</Text>
              </Pressable>
            )}
          </View>
        </LinearGradient>
    </>
  );

  // the small month grid or the week view: the phone layout
  const grid = (
    <>
        {/* grid */}
        <View style={styles.gridCard}>
          <View style={styles.viewSwitch}>
            {[
              ['month', t('week.month')],
              ['week', t('week.week')],
            ].map(([id, label]) => {
              const on = view === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => updateSettings({ calendarView: id })}
                  style={[styles.viewItem, on && styles.viewOn]}
                  accessibilityRole="button"
                  aria-pressed={!!on} accessibilityState={{ selected: on }}
                  accessibilityLabel={t('week.viewA11y', { name: label })}
                >
                  <Text style={[styles.viewText, on && { color: colors.onAccent }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {view === 'week' ? (
            <WeekView week={week} selected={selected} onSelect={select} subjectById={subjectById} rotation={state.rotation} vacations={state.vacations} />
          ) : (
          <>
          <MonthGrid month={month} onMonthChange={setMonth} selected={selected} onSelect={select} marks={marks} showHeader={false} />
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.lDot, { backgroundColor: colors.accentFill }]} />
              <Text style={styles.legendText}>{t('calendar.legendTasks')}</Text>
            </View>
            <View style={styles.legendItem}>
              <Ionicons name="flag" size={11} color={colors.danger} />
              <Text style={styles.legendText}>{t('calendar.legendExam')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.lBar, { backgroundColor: colors.violet }]} />
              <Text style={styles.legendText}>{t('calendar.legendClass')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.lBox, { borderColor: colors.tealBorder, backgroundColor: colors.tealSoft }]} />
              <Text style={styles.legendText}>{t('calendar.legendBreak')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.lBox, { borderColor: colors.accent }]} />
              <Text style={styles.legendText}>{t('common.today')}</Text>
            </View>
          </View>
          </>
          )}
        </View>
    </>
  );

  // the selected day: its break, classes, exams and tasks
  const dayPanel = (
    <>
        {/* selected day */}
        <View style={styles.dayHead}>
          <LinearGradient colors={['#5B6CF0', '#7A5CFA']} style={styles.dateTile}>
            <Text style={styles.tileWk}>{weekdayName(selDate.getDay(), 'short').toUpperCase()}</Text>
            <Text style={styles.tileDay}>{selDate.getDate()}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={type.h2} numberOfLines={1}>{formatDate(selDate, { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
            <Text style={type.meta}>
              {[
                countdownLabel(selected),
                dayRotationLabel(state.rotation, selected, state.vacations),
                t('calendar.tasks', { count: day.tasks.length }),
                dayClasses.filter((c) => !isActivity(c)).length ? t('calendar.classes', { count: dayClasses.filter((c) => !isActivity(c)).length }) : null,
                dayClasses.some(isActivity) ? t('activities.count', { count: dayClasses.filter(isActivity).length }) : null,
                day.exams.length ? t('calendar.exams', { count: day.exams.length }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>

        {dayBreak && <VacationRow vacation={dayBreak} compact onEdit={() => setEditingVacation(dayBreak)} />}

        {dayClasses.map((c) =>
          isActivity(c) ? (
            <ClassRow key={c.id} cls={c} status={now ? classStatus(c, now) : null} onEdit={() => setEditingClass(c)} onDelete={() => deleteClass(c)} />
          ) : (
          <ClassRow
            key={c.id}
            cls={c}
            subject={subjectById[c.subjectId]}
            status={now ? classStatus(c, now) : null}
            {...(selected <= today
              ? {
                  attendance: statusOn(c, selected),
                  stats: attendanceOf(c),
                  onMark: (status) => dispatch({ type: 'MARK_ATTENDANCE', id: c.id, date: selected, status }),
                }
              : {})}
            onAddHomework={() => openHomework(c, selected)}
            homework={classHomework(state.tasks, c.id, today)}
            onToggleTask={(task) => dispatch({ type: 'TOGGLE_TASK', id: task.id })}
            onEditTask={(task) => setEditingTask(task)}
            subjectById={subjectById}
            onFocusTask={(task) => navigation.navigate('Focus', { taskId: task.id })}
            onDeleteTask={(task) => deleteTask(task)}
            onEdit={() => setEditingClass(c)}
            onDelete={() => deleteClass(c)}
          />
          )
        )}

        {day.exams.map((e) => (
          <ExamItem
            key={e.id}
            exam={e}
            subject={subjectById[e.subjectId]}
            {...(e.date <= today && !isGraded(e)
              ? { attendance: examStatus(e), onMark: (status) => dispatch({ type: 'MARK_EXAM_ATTENDANCE', id: e.id, status }) }
              : {})}
            onEdit={() => setEditingExam(e)}
            onDelete={() => deleteExam(e)}
          />
        ))}
    </>
  );

  // the selected day's tasks (on the desktop, the first planner tab)
  // the planner sections (src/screens/calendar/): below the month on a phone, tabs on the desktop
  const tasksSection = (
    <TasksSection
      sel={sel}
      day={selected}
      tasks={dayTasks}
      subjectById={subjectById}
      chip={twoColumns ? 'hover' : true}
      onAdd={() => setAddingTask(true)}
      onToggle={(tk) => dispatch({ type: 'TOGGLE_TASK', id: tk.id })}
      onDelete={deleteTask}
      onEdit={setEditingTask}
      onFocus={(tk) => navigation.navigate('Focus', { taskId: tk.id })}
    />
  );
  const examsSection = (
    <ExamsSection
      upcoming={upcomingExams}
      past={pastExams}
      subjectById={subjectById}
      examMark={examMark}
      onAdd={() => setAddingExam(true)}
      onOpenDay={select}
      onEdit={setEditingExam}
      onDelete={deleteExam}
      onClearPast={clearPastExams}
    />
  );
  const timetableSection = (
    <TimetableSection
      tab={scheduleTab}
      onTab={setScheduleTab}
      data={state}
      today={today}
      table={table}
      activities={activities}
      hours={hours}
      hoursWeek={hoursWeek}
      onHoursWeek={setHoursWeek}
      workHourLimit={settings.workHourLimit || null}
      onWorkHourLimit={(workHourLimit) => updateSettings({ workHourLimit })}
      subjectById={subjectById}
      todayMark={todayMark}
      on={{
        addClass: () => setAddingClass(true),
        addActivity: () => setAddingActivity(true),
        editClass: setEditingClass,
        deleteClass,
        clearPast: clearPastClasses,
        rotation: () => setSettingRotation(true),
        addHomework: (c) => openHomework(c, today),
        toggleTask: (task) => dispatch({ type: 'TOGGLE_TASK', id: task.id }),
        editTask: setEditingTask,
        focusTask: (task) => navigation.navigate('Focus', { taskId: task.id }),
        deleteTask,
      }}
    />
  );
  const vacationsSection = <VacationsSection upcoming={upcomingBreaks} past={pastBreaks} onAdd={() => setAddingVacation(true)} onEdit={setEditingVacation} onDelete={deleteVacation} onClearPast={clearPastVacations} />;
  const repeatsSection = <RepeatsSection recurring={state.recurring} subjectById={subjectById} onEdit={setEditingRec} onStop={stopRepeating} />;

  // ---- desktop ----
  // what each day of the month board lists: exams, then classes and activities (by time), then tasks
  const boardItems = (key) => {
    const d = byDate[key] || { tasks: [], exams: [] };
    const list = [
      ...d.exams.map((e) => ({ id: `e${e.id}`, kind: 'exam', label: e.title, color: colors.danger, drag: `e:${e.id}` })),
      ...classesOn(state.classes, key, state.term, state.vacations, state.rotation).map((c) => ({
        id: `c${c.id}`,
        kind: 'class',
        drag: c.repeat === 'once' ? `c:${c.id}` : null,
        // the time only where there is room; it's always in the agenda beside the board
        label: c.start && roomyBoard ? `${formatTime(c.start)} ${c.title}` : c.title,
        color: isActivity(c) ? activityLook(c).color : subjectById[c.subjectId] ? subjectById[c.subjectId].color : colors.violet,
      })),
      ...d.tasks.map((tk) => ({ id: `t${tk.id}`, kind: 'task', drag: `t:${tk.id}`, label: tk.title, done: tk.done, color: subjectById[tk.subjectId] ? subjectById[tk.subjectId].color : colors.accent })),
    ];
    return { list, vacation: !!vacationOn(state.vacations, key) };
  };

  const prev = () => (view === 'week' ? select(addDays(selected, -7)) : setMonth(addMonths(month, -1)));
  const next = () => (view === 'week' ? select(addDays(selected, 7)) : setMonth(addMonths(month, 1)));
  // desktop keys while the Calendar is showing: T today, ← → previous / next, M / W month or week
  useShortcuts(
    { t: () => select(today), ArrowLeft: prev, ArrowRight: next, m: () => updateSettings({ calendarView: 'month' }), w: () => updateSettings({ calendarView: 'week' }) },
    isFocused
  );
  const addButtons = [
    ['checkbox-outline', t('tasksSection.add'), () => setAddingTask(true)],
    ['flag-outline', t('calendar.addExam'), () => setAddingExam(true)],
    ['easel-outline', t('calendar.addClassLink'), () => setAddingClass(true)],
    ['sunny-outline', t('calendar.addVacation'), () => setAddingVacation(true)],
  ];

  // one toolbar instead of the phone's tall header: navigation, title, counts, view and the add buttons
  const toolbar = (
    <View style={styles.toolbar}>
      <View style={styles.tbNav}>
        <Pressable onPress={prev} hitSlop={6} style={styles.tbArrow} accessibilityLabel={view === 'week' ? t('week.prev') : t('monthGrid.prevMonth')}>
          <Ionicons name="chevron-back" size={18} color={colors.ink} />
        </Pressable>
        <Pressable onPress={next} hitSlop={6} style={styles.tbArrow} accessibilityLabel={view === 'week' ? t('week.next') : t('monthGrid.nextMonth')}>
          <Ionicons name="chevron-forward" size={18} color={colors.ink} />
        </Pressable>
        <Pressable onPress={() => select(today)} disabled={!offToday} style={[styles.tbToday, !offToday && { opacity: 0.45 }]} accessibilityLabel={t('calendar.goToday')}>
          <Text style={styles.tbTodayText}>{t('common.today')}</Text>
        </Pressable>
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.tbTitle} numberOfLines={1}>{view === 'week' ? weekTitle() : monthTitle(month)}</Text>
        <Text style={styles.tbStats} numberOfLines={1}>
          {[t('calendar.tasks', { count: monthTasks }), t('calendar.exams', { count: monthExams }), monthClasses > 0 ? t('calendar.classes', { count: monthClasses }) : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={{ flex: 1 }} />
      <View style={styles.tbSwitch}>
        {[
          ['month', t('week.month')],
          ['week', t('week.week')],
        ].map(([id, label]) => {
          const on = view === id;
          return (
            <Pressable key={id} onPress={() => updateSettings({ calendarView: id })} style={[styles.tbSwitchItem, on && styles.tbSwitchOn]} accessibilityRole="button" aria-pressed={!!on} accessibilityState={{ selected: on }} accessibilityLabel={t('week.viewA11y', { name: label })}>
              <Text style={[styles.tbSwitchText, on && { color: colors.ink }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.tbAdd}>
        {addButtons.map(([icon, label, onPress]) => (
          <Pressable key={label} onPress={onPress} style={({ hovered }) => [styles.tbAddBtn, hovered && { backgroundColor: colors.accentSoft }]} accessibilityRole="button" accessibilityLabel={label}>
            <Ionicons name={icon} size={15} color={colors.accent} />
            <Text style={styles.tbAddText}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  // the planner under the calendar: one tab at a time instead of a long column
  const plannerTabs = [
    ['tasks', 'checkbox-outline', t('tasksSection.title', { day: formatDue(selected) }), dayTasks.length, tasksSection],
    ['exams', 'flag-outline', t('calendar.upcomingExams'), upcomingExams.length, examsSection],
    ['timetable', 'easel-outline', t('calendar.timetable'), onlyClasses(state.classes).length - table.past.length + activities.current.length, timetableSection],
    ['vacations', 'sunny-outline', t('calendar.vacations'), upcomingBreaks.length, vacationsSection],
    ['repeats', 'repeat', t('calendar.repeating'), state.recurring.length, repeatsSection],
  ];
  const planner = (
    <View style={styles.planner}>
      <View style={styles.plannerTabs} accessibilityRole="tablist">
        {plannerTabs.map(([id, icon, label, n]) => {
          const on = plannerTab === id;
          return (
            <Pressable key={id} onPress={() => setPlannerTab(id)} style={[styles.plannerTab, on && styles.plannerTabOn]} accessibilityRole="tab" aria-selected={!!on} accessibilityState={{ selected: on }}>
              <Ionicons name={icon} size={15} color={on ? colors.accent : colors.muted} />
              <Text style={[styles.plannerTabText, on && { color: colors.accent }]}>{label}</Text>
              {n ? <Text style={[styles.tabCount, on && { backgroundColor: colors.accentFill, color: colors.onAccent }]}>{n}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      {/* each section starts with its own heading and add button */}
      <View style={styles.plannerBody}>{plannerTabs.find(([id]) => id === plannerTab)[4]}</View>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <ScrollView contentContainerStyle={[styles.content, twoColumns && styles.contentWide]} showsVerticalScrollIndicator={false}>
        {twoColumns ? (
          <>
            {toolbar}
            {/* the month (or week) board, and the selected day as an agenda beside it */}
            <View style={styles.wideRow}>
              <View style={styles.boardCol}>
                <View style={styles.boardCard}>
                  {view === 'week' ? (
                    <WeekView week={week} selected={selected} onSelect={select} subjectById={subjectById} rotation={state.rotation} vacations={state.vacations} onMove={moveItem} />
                  ) : (
                    <MonthBoard month={month} selected={selected} onSelect={select} items={boardItems} onMove={moveItem} />
                  )}
                  {Platform.OS === 'web' ? (
                    <View style={styles.dragHint}>
                      <Ionicons name="move-outline" size={13} color={colors.muted} />
                      <Text style={styles.dragHintText}>{t(view === 'week' ? 'calendar.dragHintWeek' : 'calendar.dragHint')}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={styles.agendaCol}>
                <View style={styles.agenda}>
                  {dayPanel}
                  {/* the day's tasks are in the planner below; say so when the day has nothing else */}
                  {!dayBreak && dayClasses.length === 0 && day.exams.length === 0 ? <Text style={styles.agendaEmpty}>{t('calendar.agendaEmpty')}</Text> : null}
                </View>
              </View>
            </View>
            {planner}
          </>
        ) : (
          <>
            {header}
            {grid}
            {dayPanel}
            {tasksSection}
            {examsSection}
            {timetableSection}
            {vacationsSection}
            {repeatsSection}
          </>
        )}
        <AdBanner />
      </ScrollView>

      <SelectionActions sel={sel} bottom={twoColumns ? 20 : insets.bottom + 92} />
      <AddTaskSheet
        visible={!!editingTask}
        editTask={editingTask}
        onClose={() => setEditingTask(null)}
        subjects={state.subjects}
        classes={state.classes}
        exams={state.exams}
        onSave={(t) => editingTask && dispatch({ type: 'UPDATE_TASK', id: editingTask.id, ...t })}
      />
      <AddTaskSheet
        visible={addingTask}
        onClose={() => setAddingTask(false)}
        subjects={state.subjects}
        classes={state.classes}
        exams={state.exams}
        defaultDue={selected}
        onSave={(tk) => dispatch(tk.repeat ? { type: 'ADD_RECURRING', ...tk, days: tk.repeat, startDate: tk.due } : { type: 'ADD_TASK', ...tk })}
      />
      <AddExamSheet
        visible={addingExam || !!editingExam}
        editing={editingExam}
        onClose={() => {
          setAddingExam(false);
          setEditingExam(null);
        }}
        subjects={state.subjects}
        defaultDate={selected}
        onSave={(e) => dispatch(editingExam ? { type: 'UPDATE_EXAM', id: editingExam.id, ...e } : { type: 'ADD_EXAM', ...e })}
      />
      <AddVacationSheet
        visible={addingVacation || !!editingVacation}
        editing={editingVacation}
        onClose={() => {
          setAddingVacation(false);
          setEditingVacation(null);
        }}
        defaultDate={selected >= today ? selected : today}
        hasRotation={!!state.rotation}
        onSave={(v) => dispatch(editingVacation ? { type: 'UPDATE_VACATION', id: editingVacation.id, ...v } : { type: 'ADD_VACATION', ...v })}
      />
      <AddTaskSheet
        visible={!!homework}
        homework={homework}
        onClose={() => setHomework(null)}
        subjects={state.subjects}
        classes={state.classes}
        onSave={(tk) => dispatch(tk.repeat ? { type: 'ADD_RECURRING', ...tk, days: tk.repeat, startDate: tk.due } : { type: 'ADD_TASK', ...tk })}
      />
      <RotationSheet
        visible={settingRotation}
        onClose={() => setSettingRotation(false)}
        rotation={state.rotation}
        weekStart={weekStart}
        current={state.rotation ? rotationIndexOn(state.rotation, today, state.vacations) : null}
        onSave={(rotation) => dispatch({ type: 'SET_ROTATION', rotation })}
      />
      <AddClassSheet
        visible={addingClass || addingActivity || !!editingClass}
        editing={editingClass}
        activity={addingActivity}
        onClose={() => {
          setAddingClass(false);
          setAddingActivity(false);
          setEditingClass(null);
        }}
        subjects={state.subjects}
        defaultDate={selected}
        term={state.term}
        rotation={state.rotation}
        onSave={(c, term) => {
          if (term) dispatch({ type: 'SET_TERM', term });
          dispatch(editingClass ? { type: 'UPDATE_CLASS', id: editingClass.id, ...c } : { type: 'ADD_CLASS', ...c });
        }}
      />
      <AddTaskSheet
        visible={!!editingRec}
        editing={editingRec}
        onClose={() => setEditingRec(null)}
        subjects={state.subjects}
        classes={state.classes}
        onSave={(t) =>
          editingRec &&
          dispatch({ type: 'UPDATE_RECURRING', id: editingRec.id, title: t.title, subjectId: t.subjectId, time: t.time, notes: t.notes, estimate: t.estimate, priority: t.priority, days: t.repeat, classId: t.classId, subtasks: t.subtasks })
        }
      />
    </SafeAreaView>
  );
}

