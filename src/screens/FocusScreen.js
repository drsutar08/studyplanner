import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, Vibration } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, shadow, type, themedStyles } from '../theme';
import { t } from '../i18n';
import { useStore } from '../store';
import { dateKey, formatDue, formatTime } from '../dates';
import { useAuth } from '../auth';
import { useToast } from '../toast';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { notificationsSupported, scheduleSessionEnd, cancelSessionEnd } from '../notifications';
import { shouldScheduleSessionEnd, sessionEndMessage } from '../notificationRules';
import { ProgressRing, StarsDecor } from '../components/Illustrations';
import StepList from '../components/StepList';
import AttachmentList from '../components/AttachmentList';
import { stepProgress } from '../subtasks';
import { scoreTask } from '../planner';
import { breakAfter, roundPosition, restoreTimer, minutesFocused, focusRules } from '../focusTimer';
import { showTabTimer, clearTabTimer, showLiveActivity, endLiveActivity } from '../focusActivity';
import { useTwoColumns } from '../layout';
import { useIsFocused } from '@react-navigation/native';
import { useShortcuts } from '../shortcuts';
import StudyingNow from '../components/StudyingNow';
import { setMyStudyStatus } from '../cloud/studyTogether';
import { myStatus, joinPlan } from '../studyTogether';
import { useBreakAd } from '../ads';

const KEEP_AWAKE_TAG = 'focus-timer';
const DURATIONS = [25, 45, 60];
const MIN_LENGTH = 5;
const MAX_LENGTH = 180;
const BREAK_COLOR = '#2DD4BF';
// the timer is saved per user, so a session survives the app being closed (see restoreTimer)
const timerKey = (userId) => `studyplanner:focus:${userId}`;
const breakEndMessage = () => ({ title: { key: 'reminders.breakEndTitle', params: {} }, body: { key: 'reminders.breakEndBody', params: {} } });

const fmt = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export default function FocusScreen({ route, navigation }) {
  const { state, dispatch } = useStore();
  const { user, settings } = useAuth();
  const { show } = useToast();
  const breakAd = useBreakAd();
  const twoColumns = useTwoColumns();
  const scrollRef = useRef(null);
  const today = dateKey();

  const [taskId, setTaskId] = useState(null);
  const [chosen, setChosen] = useState(false); // picked by hand; otherwise the suggested task is picked for you
  const [phase, setPhase] = useState('focus'); // 'focus' | 'break'
  const [minutes, setMinutes] = useState(settings.focusMinutes);
  const [remaining, setRemaining] = useState(settings.focusMinutes * 60 * 1000);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(null); // the "session complete" panel: { kind: 'focus', minutes } | { kind: 'break' }
  const [loaded, setLoaded] = useState(false); // the saved timer has been read
  const [showLater, setShowLater] = useState(false);
  const endAt = useRef(0);

  const task = state.tasks.find((x) => x.id === taskId) || null;
  const subject = task ? state.subjects.find((s) => s.id === task.subjectId) : null;
  const isBreak = phase === 'break';
  const total = minutes * 60 * 1000;
  const elapsedMs = total - remaining;
  const started = remaining < total;

  const todaySessions = state.sessions.filter((s) => s.date === today);
  const minutesToday = todaySessions.reduce((sum, s) => sum + s.minutes, 0);
  const goalPct = Math.min(100, Math.round((minutesToday / Math.max(1, settings.dailyGoal)) * 100));
  const taskMinutes = task ? state.sessions.filter((s) => s.taskId === task.id).reduce((sum, s) => sum + s.minutes, 0) : 0;
  // break lengths and the round, from Settings
  const rules = focusRules(settings);
  const position = roundPosition(todaySessions.length, rules);
  // the break after the sessions so far; during a break, whether it is the long one
  const nextBreak = breakAfter(todaySessions.length, rules);

  const lengthFor = (tk) => (tk ? Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, tk.estimate)) : settings.focusMinutes);

  // Today's and overdue tasks in the Smart plan's order (shortest first when equal), later ones behind "Show more"
  const pending = useMemo(() => state.tasks.filter((x) => !x.done), [state.tasks]);
  const { soon, later } = useMemo(() => {
    const ranked = pending
      .map((x) => ({ x, score: scoreTask(x, state.exams, today).score }))
      .sort((a, b) => b.score - a.score || a.x.estimate - b.x.estimate || a.x.title.localeCompare(b.x.title))
      .map((r) => r.x);
    // later ones simply by date: the plan's score only ranks what's due soon
    const later = ranked.filter((x) => x.due > today).sort((a, b) => a.due.localeCompare(b.due) || a.estimate - b.estimate);
    return { soon: ranked.filter((x) => x.due <= today), later };
  }, [pending, state.exams, today]);

  const log = (mins, tk, date) => {
    if (mins < 1) return false;
    dispatch({ type: 'LOG_SESSION', minutes: mins, subjectId: tk ? tk.subjectId : null, taskId: tk ? tk.id : null, ...(date ? { date } : {}) });
    return true;
  };

  // the timer's interval reads the current values from here, not from when it started
  const latest = useRef({});
  useEffect(() => {
    latest.current = { phase, minutes, task };
  });

  // A focus or break session ran out
  const phaseEnded = () => {
    const now = latest.current;
    setRunning(false);
    if (settings.vibration) Vibration.vibrate([0, 400, 200, 400]);
    if (now.phase === 'focus') {
      log(now.minutes, now.task);
      setDone({ kind: 'focus', minutes: now.minutes });
      setRemaining(now.minutes * 60 * 1000);
    } else {
      const m = lengthFor(now.task);
      setDone({ kind: 'break' });
      setPhase('focus');
      setMinutes(m);
      setRemaining(m * 60 * 1000);
    }
  };

  // Bring back the session saved when the app was last open (once the data has loaded)
  useEffect(() => {
    if (!state.ready || !user || loaded) return undefined;
    let off = false;
    AsyncStorage.getItem(timerKey(user.id))
      .then((raw) => {
        if (off) return;
        let r = null;
        try {
          r = restoreTimer(JSON.parse(raw), Date.now(), dateKey());
        } catch {
          r = null;
        }
        if (r) {
          const tk = state.tasks.find((x) => x.id === r.taskId && !x.done) || null;
          setTaskId(tk ? tk.id : null);
          setChosen(r.chosen && (!!tk || r.taskId === null));
          setPhase(r.phase);
          setMinutes(r.minutes);
          if (r.status === 'running') {
            endAt.current = r.endAt;
            setRemaining(r.remainingMs);
            setRunning(true);
          } else if (r.status === 'paused') {
            setRemaining(r.remainingMs);
          } else if (r.status === 'finished') {
            // it ran out while the app was closed: log it on the day it ended, then offer the break
            if (r.phase === 'focus') {
              log(r.minutes, tk, dateKey(new Date(r.endedAt)));
              setDone({ kind: 'focus', minutes: r.minutes });
              setRemaining(r.minutes * 60 * 1000);
            } else {
              const m = lengthFor(tk);
              setDone({ kind: 'break' });
              setPhase('focus');
              setMinutes(m);
              setRemaining(m * 60 * 1000);
            }
          } else {
            setRemaining(r.minutes * 60 * 1000);
            if (r.done) setDone(r.done); // the "session complete" panel was still open
          }
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      off = true;
    };
  }, [state.ready, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save the timer whenever it changes state (not on every tick: a running timer is saved by its end time)
  const pausedAt = running ? 0 : remaining;
  useEffect(() => {
    if (!loaded || !user) return;
    const record = {
      phase,
      minutes,
      taskId,
      chosen,
      status: running ? 'running' : started ? 'paused' : 'idle',
      endAt: running ? endAt.current : null,
      remainingMs: running ? null : remaining,
      done, // an open "session complete" panel comes back too (the same day)
      day: dateKey(),
    };
    AsyncStorage.setItem(timerKey(user.id), JSON.stringify(record)).catch(() => {});
  }, [loaded, user, phase, minutes, taskId, chosen, running, pausedAt, done]); // eslint-disable-line react-hooks/exhaustive-deps

  // With nothing picked by hand, the first task of today's plan is ready to go (kept in step while rendering)
  const suggested = soon[0] || null;
  if (loaded && !chosen && !running && !started && !done && !isBreak && (suggested ? suggested.id : null) !== taskId) {
    const m = lengthFor(suggested);
    setTaskId(suggested ? suggested.id : null);
    setMinutes(m);
    setRemaining(m * 60 * 1000);
  }

  // Tick from a wall-clock end time so the timer stays right if the app is backgrounded
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      const left = endAt.current - Date.now();
      if (left <= 0) {
        clearInterval(id);
        phaseEnded();
      } else {
        setRemaining(left);
      }
    }, 250);
    return () => clearInterval(id);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  // Alert when the session or break ends, even if the app is in the background. Cancelled on pause, reset or finish.
  useEffect(() => {
    if (!running) return undefined;
    if (shouldScheduleSessionEnd({ pushEnabled: settings.pushEnabled, msLeft: endAt.current - Date.now() })) {
      scheduleSessionEnd({ endAt: endAt.current, ...(isBreak ? breakEndMessage() : sessionEndMessage({ minutes, taskTitle: task ? task.title : null })) });
    }
    return () => {
      cancelSessionEnd();
    };
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the screen on while a session or break is running (can be turned off in Settings)
  useEffect(() => {
    if (!running || !settings.keepAwake) return undefined;
    try {
      Promise.resolve(activateKeepAwakeAsync(KEEP_AWAKE_TAG)).catch(() => {});
    } catch {
      // not supported here
    }
    return () => {
      try {
        Promise.resolve(deactivateKeepAwake(KEEP_AWAKE_TAG)).catch(() => {});
      } catch {
        // ignore
      }
    };
  }, [running, settings.keepAwake]);

  const startTimer = (ms) => {
    endAt.current = Date.now() + ms;
    setRunning(true);
  };

  const toggle = () => {
    if (running) {
      setRunning(false);
      return;
    }
    setDone(null);
    startTimer(remaining);
  };

  // Space starts or pauses (desktop), only while this screen is showing
  useShortcuts({ space: toggle }, useIsFocused());

  // ✓: save what has been done so far, running or paused
  const saveNow = () => {
    const mins = minutesFocused(elapsedMs);
    setRunning(false);
    setRemaining(total);
    if (!log(mins, task)) {
      show({ message: t('focus.tooShort') });
      return;
    }
    setDone({ kind: 'focus', minutes: mins });
  };

  // Only while paused, and it can be undone: a stray tap never throws a session away
  const reset = () => {
    const keepMs = remaining;
    const keepMin = minutes;
    setRunning(false);
    setRemaining(total);
    show({
      icon: 'refresh',
      message: minutesFocused(total - keepMs) ? t('focus.resetDone', { count: minutesFocused(total - keepMs) }) : t('focus.resetDoneNone'),
      actionLabel: t('common.undo'),
      onAction: () => {
        setMinutes(keepMin);
        setRemaining(keepMs);
      },
    });
  };

  const pickDuration = (m) => {
    setMinutes(m);
    setRemaining(m * 60 * 1000);
  };

  const startBreak = (m) => {
    setDone(null);
    setPhase('break');
    setMinutes(m);
    setRemaining(m * 60 * 1000);
    startTimer(m * 60 * 1000);
    breakAd.atBreak(); // a break is a natural pause: a full-screen ad may show (ads.native.js)
  };

  const skipBreak = () => {
    const m = lengthFor(task);
    setRunning(false);
    setPhase('focus');
    setMinutes(m);
    setRemaining(m * 60 * 1000);
    setDone(null);
  };

  // Another focus session on the same task, or the next one in the plan once it's done
  const anotherSession = () => {
    const next = task && !task.done ? task : soon[0] || null;
    const m = lengthFor(next);
    setDone(null);
    setTaskId(next ? next.id : null);
    setPhase('focus');
    setMinutes(m);
    setRemaining(m * 60 * 1000);
    startTimer(m * 60 * 1000);
  };

  // Choosing a task sets the timer to its estimate, unless a session is already under way
  const pickTask = (id) => {
    setTaskId(id);
    setChosen(true);
    if (running || started || isBreak) return;
    const picked = id ? state.tasks.find((x) => x.id === id) : null;
    const m = lengthFor(picked);
    setDone(null);
    setMinutes(m);
    setRemaining(m * 60 * 1000);
  };

  const chooseTask = (id) => {
    pickTask(id);
    if (scrollRef.current) scrollRef.current.scrollTo({ y: 0, animated: true }); // back up to the timer
  };

  // A task can be passed in from the dashboard: picked up (once the saved timer is read) as the params change
  const [seenParams, setSeenParams] = useState(undefined);
  if (loaded && route.params !== seenParams) {
    setSeenParams(route.params);
    if (route.params && route.params.taskId) pickTask(route.params.taskId);
  }
  useEffect(() => {
    if (route.params && route.params.taskId && scrollRef.current) scrollRef.current.scrollTo({ y: 0, animated: true });
  }, [route.params]);

  // Focus mode: while a focus session runs, only the timer, the task and its subtasks stay (no tab bar)
  const focusMode = running && !isBreak;
  useEffect(() => {
    navigation.setOptions({ focusMode });
  }, [focusMode, navigation]);

  // The browser tab shows the countdown while a session or break is under way
  const shownTime = fmt(remaining);
  const underWay = running || started;
  const what = isBreak ? t('focus.breakRunning') : task ? task.title : t('focus.freeSession');
  useEffect(() => {
    if (!underWay) {
      clearTabTimer();
      return undefined;
    }
    const text = `${running ? '' : '⏸ '}${shownTime} · ${what}`;
    showTabTimer(text);
    // the navigator sets the page title after a screen's options change (entering or leaving focus mode): set it again
    const again = setTimeout(() => showTabTimer(text), 120);
    return () => clearTimeout(again);
  }, [underWay, running, shownTime, what, focusMode]);

  // ...and on iOS, a Live Activity on the lock screen: updated on start, pause and resume (it counts down itself)
  useEffect(() => {
    if (!underWay) {
      endLiveActivity();
      return;
    }
    showLiveActivity({
      kicker: isBreak ? t(nextBreak.long ? 'focus.longBreakKicker' : 'focus.breakKicker') : t('focus.kicker'),
      title: what,
      color: isBreak ? BREAK_COLOR : subject ? subject.color : '#8D9BFF',
      startAt: running ? endAt.current - total : Date.now(),
      endAt: running ? endAt.current : Date.now() + remaining,
      paused: !running,
      pausedText: shownTime,
    });
  }, [underWay, running, phase, taskId, minutes, pausedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // ...and tells the study groups (study together): the subject and when it ends, never the task
  useEffect(() => {
    setMyStudyStatus(myStatus({ underWay, running, phase, endAt: endAt.current, remaining, minutes, subject }));
  }, [underWay, running, phase, taskId, minutes, pausedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the app's screens (signing out) takes the timer off the tab and the lock screen
  useEffect(
    () => () => {
      clearTabTimer();
      endLiveActivity();
      setMyStudyStatus(null);
    },
    []
  );

  // Joining someone's session from "Studying now": a focus session that ends when theirs does
  const joinSession = (p) => {
    if (running || (started && !isBreak)) {
      show({ message: t('together.busy') });
      return;
    }
    const plan = joinPlan(p, Date.now());
    setDone(null);
    setPhase('focus');
    setMinutes(plan.minutes);
    setRemaining(plan.endAt - Date.now());
    endAt.current = plan.endAt;
    setRunning(true);
    show({ icon: 'people', message: t('together.joined', { name: p.name.split(' ')[0] || t('together.someone') }) });
    if (scrollRef.current) scrollRef.current.scrollTo({ y: 0, animated: true });
  };

  // Today's sessions, newest first; one logged by mistake can be deleted (with Undo)
  const todayLog = [...todaySessions].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const deleteSession = (s) => {
    dispatch({ type: 'DELETE_SESSION', id: s.id });
    show({ icon: 'trash-outline', message: t('focus.sessionDeleted', { count: s.minutes }), actionLabel: t('common.undo'), onAction: () => dispatch({ type: 'RESTORE_SESSION', session: s }) });
  };

  const pct = total === 0 ? 0 : (total - remaining) / total;
  const ringColor = isBreak ? BREAK_COLOR : subject ? subject.color : '#8D9BFF';
  const matchesTask = !!task && minutes === lengthFor(task);
  const hint = isBreak
    ? t('focus.hintBreak', { n: position.n, of: position.of })
    : running
    ? t('focus.hintRunning')
    : started
    ? t('focus.hintStarted', { count: minutesFocused(elapsedMs) })
    : matchesTask
    ? t('focus.hintTask', { count: task.estimate })
    : t('focus.hintIdle');

  // The usual lengths, plus the current one (e.g. a task estimate such as 15 min)
  const durationOptions = [...new Set([...DURATIONS, minutes])].sort((a, b) => a - b);
  // dots for the sessions done in this round (all four lit right after the 4th)
  const lit = done && done.kind === 'focus' && todaySessions.length > 0 && todaySessions.length % rules.round === 0 ? rules.round : todaySessions.length % rules.round;

  const pickRow = (pt) => {
    const s = state.subjects.find((x) => x.id === pt.subjectId);
    return (
      <TaskPick
        key={pt.id}
        title={pt.title}
        sub={`${t('focus.pickSub', { name: s ? s.name : t('common.noSubject'), count: pt.estimate })} · ${formatDue(pt.due)}`}
        color={s ? s.color : colors.muted}
        selected={taskId === pt.id}
        disabled={running}
        onPress={() => chooseTask(pt.id)}
      />
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <ScrollView ref={scrollRef} contentContainerStyle={[styles.content, twoColumns && styles.contentWide]} showsVerticalScrollIndicator={false}>
        {/* wide screens: the timer on the left, subtasks, today's sessions and tasks on the right */}
        <View style={twoColumns ? styles.wideRow : null}>
        <View style={twoColumns ? styles.colTimer : null}>
        <LinearGradient colors={isBreak ? ['#0F2A2A', '#164E4A', '#1E6B63'] : ['#151B33', '#2A2F6B', '#3B3F9E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <StarsDecor width={300} height={460} />
          <View style={styles.glow} pointerEvents="none" />

          {/* kicker and the task's time on one line, so the title below gets the full width */}
          <View style={styles.heroTop}>
            <View style={styles.kicker}>
              <View style={[styles.live, running && { backgroundColor: isBreak ? BREAK_COLOR : '#4ADE80' }]} />
              <Text style={styles.heroKicker}>{isBreak ? t(nextBreak.long ? 'focus.longBreakKicker' : 'focus.breakKicker') : t('focus.kicker')}</Text>
            </View>
            {task && !isBreak ? (
              <View style={styles.todayPill} accessibilityLabel={t('focus.taskTimeA11y', { done: taskMinutes, count: task.estimate })}>
                <Ionicons name="flash" size={14} color="#FFD479" />
                <Text style={styles.todayPillText}>{t('focus.taskTime', { done: taskMinutes, count: task.estimate })}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.heroTitle} numberOfLines={1}>
            {isBreak ? t('focus.breakTitle') : task ? task.title : t('focus.freeSession')}
          </Text>
          <Text style={styles.heroSub} numberOfLines={1}>
            {isBreak ? t('focus.breakSub') : subject ? subject.name : t('focus.noSubject')}
          </Text>

          <View style={styles.ringBox}>
            <View style={[styles.ringGlow, isBreak && { backgroundColor: BREAK_COLOR }]} />
            <ProgressRing size={236} stroke={14} value={pct} color={ringColor} trackColor="rgba(255,255,255,0.14)" />
            <View style={styles.ringCenter} pointerEvents="none">
              <Text maxFontSizeMultiplier={1.15} style={styles.time} testID="focus-time">{fmt(remaining)}</Text>
              <Text style={styles.timeSub}>
                {isBreak ? (running ? t('focus.breakRunning') : t('focus.paused')) : running ? t('focus.stayFocused') : started ? t('focus.paused') : t('focus.sessionLength', { count: minutes })}
              </Text>
              <View style={styles.dots} role="img" accessibilityLabel={t('focus.roundA11y', { n: position.n, of: position.of })}>
                {Array.from({ length: rules.round }, (_, i) => (
                  <View key={i} style={[styles.dot, i < lit && styles.dotOn]} />
                ))}
              </View>
            </View>
          </View>

          {done ? (
            <View style={styles.donePanel} accessibilityLiveRegion="polite">
              <View style={[styles.doneIcon, done.kind === 'break' && { backgroundColor: BREAK_COLOR + '33' }]}>
                <Ionicons name={done.kind === 'focus' ? 'trophy' : 'cafe'} size={22} color={done.kind === 'focus' ? '#FFD479' : BREAK_COLOR} />
              </View>
              <Text style={styles.doneTitle}>{done.kind === 'focus' ? t('focus.doneTitle') : t('focus.breakOverTitle')}</Text>
              <Text style={styles.doneSub}>
                {done.kind === 'focus'
                  ? task
                    ? t('focus.doneSubTask', { count: done.minutes, title: task.title })
                    : t('focus.doneSub', { count: done.minutes })
                  : t('focus.breakOverSub', { n: position.n, of: position.of })}
              </Text>
              {done.kind === 'focus' ? (
                <>
                  <PanelButton primary icon="cafe-outline" label={t(nextBreak.long ? 'focus.startLongBreak' : 'focus.startBreak', { count: nextBreak.minutes })} onPress={() => startBreak(nextBreak.minutes)} />
                  {task ? (
                    <PanelButton
                      icon={task.done ? 'checkmark-done' : 'checkmark-circle-outline'}
                      label={task.done ? t('focus.taskMarked') : t('focus.markDone')}
                      disabled={task.done}
                      onPress={() => dispatch({ type: 'TOGGLE_TASK', id: task.id })}
                    />
                  ) : null}
                  <PanelButton icon="play" label={t('focus.another')} onPress={anotherSession} />
                </>
              ) : (
                <PanelButton primary icon="play" label={t('focus.startFocus')} onPress={anotherSession} />
              )}
              <Pressable onPress={() => setDone(null)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.doneLater}>{t('focus.doneForNow')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {!isBreak && !focusMode ? (
                <>
                  <View style={styles.durations}>
                    {durationOptions.map((m) => {
                      const on = minutes === m;
                      const locked = running || started;
                      return (
                        <Pressable
                          key={m}
                          disabled={locked}
                          onPress={() => pickDuration(m)}
                          style={[styles.dur, on && styles.durOn, locked && !on && { opacity: 0.4 }]}
                          accessibilityRole="button"
                          aria-pressed={!!on} accessibilityState={{ selected: on, disabled: locked }}
                          accessibilityLabel={t('focus.lengthA11y', { amount: t('common.minutes', { count: m }) })}
                        >
                          <Text style={[styles.durText, on && { color: '#151B33' }]}>{t('common.minutes', { count: m })}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {/* any length in 5-minute steps, as well as the usual ones (its own row: the chips fill a phone's width) */}
                  {!started ? (
                    <View style={styles.stepRow}>
                      <Pressable
                        onPress={() => pickDuration(Math.max(MIN_LENGTH, minutes - 5))}
                        disabled={minutes <= MIN_LENGTH}
                        style={[styles.stepBtn, minutes <= MIN_LENGTH && { opacity: 0.35 }]}
                        accessibilityRole="button"
                        accessibilityLabel={t('focus.shorterA11y', { amount: t('common.minutes', { count: 5 }) })}
                      >
                        <Ionicons name="remove" size={15} color="#fff" />
                        <Text style={styles.stepText}>{t('common.minutes', { count: 5 })}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => pickDuration(Math.min(MAX_LENGTH, minutes + 5))}
                        disabled={minutes >= MAX_LENGTH}
                        style={[styles.stepBtn, minutes >= MAX_LENGTH && { opacity: 0.35 }]}
                        accessibilityRole="button"
                        accessibilityLabel={t('focus.longerA11y', { amount: t('common.minutes', { count: 5 }) })}
                      >
                        <Ionicons name="add" size={15} color="#fff" />
                        <Text style={styles.stepText}>{t('common.minutes', { count: 5 })}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </>
              ) : null}

              <View style={styles.controls}>
                {isBreak ? (
                  <Pressable accessibilityLabel={t('focus.skipBreakA11y')} onPress={skipBreak} style={styles.side}>
                    <Ionicons name="play-skip-forward" size={22} color="#fff" />
                  </Pressable>
                ) : (
                  <Pressable accessibilityLabel={t('focus.resetA11y')} onPress={reset} disabled={!started || running} style={[styles.side, (!started || running) && { opacity: 0.3 }]}>
                    <Ionicons name="refresh" size={22} color="#fff" />
                  </Pressable>
                )}
                <Pressable accessibilityLabel={running ? t('focus.pauseA11y') : t('focus.startA11y')} style={styles.main} onPress={toggle}>
                  <Ionicons name={running ? 'pause' : 'play'} size={34} color="#151B33" style={running ? undefined : { marginLeft: 4 }} />
                </Pressable>
                {isBreak ? (
                  <View style={[styles.side, { opacity: 0 }]} />
                ) : (
                  <Pressable accessibilityLabel={t('focus.saveA11y')} onPress={saveNow} disabled={!started} style={[styles.side, !started && { opacity: 0.3 }]}>
                    <Ionicons name="checkmark" size={24} color="#fff" />
                  </Pressable>
                )}
              </View>
              <Text style={styles.hint}>{hint}</Text>
              {focusMode ? <StudyingNow compact /> : null}
              {notificationsSupported && !settings.pushEnabled && !running && !started ? <Text style={styles.tip}>{t('focus.tip')}</Text> : null}
            </>
          )}
        </LinearGradient>

        {/* floating summary (hidden in focus mode) */}
        {focusMode ? null : (
        <View style={styles.strip}>
          <View style={styles.stripCell}>
            <Text style={styles.stripNum}>{minutesToday}</Text>
            <Text style={styles.stripLbl}>{t('focus.minFocused')}</Text>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.stripCell}>
            <Text style={styles.stripNum}>{todaySessions.length}</Text>
            <Text style={styles.stripLbl}>{t('focus.sessions', { count: todaySessions.length })}</Text>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.stripCell}>
            <Text style={[styles.stripNum, goalPct >= 100 && { color: colors.success }]}>{goalPct}%</Text>
            <Text style={styles.stripLbl}>{t('focus.ofGoal')}</Text>
          </View>
        </View>
        )}
        </View>

        <View style={twoColumns ? styles.colSide : null}>
        {/* who in the study groups is studying now, with Join (not in focus mode: a line under the timer instead) */}
        {focusMode ? null : (
          <View style={twoColumns ? null : { marginTop: 14 }}>
            <StudyingNow onJoin={joinSession} />
          </View>
        )}
        {/* the chosen task's steps, ticked off while focusing */}
        {task ? (
          <View style={[styles.stepsCard, twoColumns && { marginTop: 0 }]}>
            <View style={styles.stepsHead}>
              <Ionicons name="list" size={15} color={subject ? subject.color : colors.accent} />
              <Text style={styles.stepsTitle}>{t('steps.focusTitle')}</Text>
              {(task.subtasks || []).length > 0 ? (
                <Text style={type.meta}>{t('steps.progress', { done: stepProgress(task.subtasks).done, count: task.subtasks.length })}</Text>
              ) : null}
            </View>
            <StepList
              steps={task.subtasks || []}
              onToggle={(stepId) => dispatch({ type: 'TOGGLE_SUBTASK', id: task.id, stepId })}
              onAdd={(title) => dispatch({ type: 'ADD_SUBTASK', id: task.id, title })}
              tint={subject ? subject.color : colors.accent}
            />
            {task.attachments && task.attachments.length ? (
              <View style={styles.attachBox}>
                <AttachmentList list={task.attachments} tint={subject ? subject.color : colors.accent} />
              </View>
            ) : null}
          </View>
        ) : null}

        {focusMode ? (
          <Text style={styles.focusNote}>{t('focus.focusModeNote')}</Text>
        ) : (
        <>
        {/* today's sessions: what you did, and a way to remove one logged by mistake */}
        {todayLog.length > 0 ? (
          <View style={[styles.stepsCard, twoColumns && !task && { marginTop: 0 }]}>
            <View style={styles.stepsHead}>
              <Ionicons name="time" size={15} color={colors.accent} />
              <Text style={styles.stepsTitle}>{t('focus.logTitle')}</Text>
              <Text style={type.meta}>{t('common.minutes', { count: minutesToday })}</Text>
            </View>
            {todayLog.map((s, i) => {
              const tk = state.tasks.find((x) => x.id === s.taskId);
              const sub = state.subjects.find((x) => x.id === s.subjectId);
              const name = tk ? tk.title : t('focus.freeSession');
              return (
                <View key={s.id} style={[styles.logRow, i > 0 && styles.logDivider]}>
                  <Text style={styles.logTime}>{s.at ? formatTime(s.at) : '–'}</Text>
                  <View style={[styles.logDot, { backgroundColor: sub ? sub.color : colors.muted }]} />
                  <Text style={styles.logName} numberOfLines={1}>{name}</Text>
                  <Text style={styles.logMin}>{t('common.minutes', { count: s.minutes })}</Text>
                  <Pressable onPress={() => deleteSession(s)} hitSlop={8} style={styles.logDelete} accessibilityRole="button" accessibilityLabel={t('focus.deleteSessionA11y', { count: s.minutes, title: name })}>
                    <Ionicons name="trash-outline" size={16} color={colors.muted} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.labelRow}>
          <Text style={type.h2}>{t('focus.workingOn')}</Text>
          <Text style={type.meta}>{t('focus.open', { count: pending.length })}</Text>
        </View>
        <View style={styles.tasks}>
          <TaskPick title={t('focus.noTask')} sub={t('focus.freeSession')} color={colors.muted} selected={!taskId} disabled={running} onPress={() => chooseTask(null)} />
          {soon.length > 0 ? <Text style={styles.group}>{t('focus.forToday')}</Text> : null}
          {soon.map(pickRow)}
          {later.length > 0 && (showLater || soon.length === 0) ? <Text style={styles.group}>{t('focus.later')}</Text> : null}
          {later.length > 0 && (showLater || soon.length === 0) ? later.map(pickRow) : null}
          {later.length > 0 && soon.length > 0 ? (
            <Pressable onPress={() => setShowLater((v) => !v)} style={styles.more} accessibilityRole="button" accessibilityState={{ expanded: showLater }}>
              <Text style={styles.moreText}>{showLater ? t('focus.showLess') : t('focus.showLater', { count: later.length })}</Text>
              <Ionicons name={showLater ? 'chevron-up' : 'chevron-down'} size={15} color={colors.accent} />
            </Pressable>
          ) : null}
        </View>
        </>
        )}
        </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PanelButton({ icon, label, onPress, primary, disabled }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.panelBtn, primary && styles.panelBtnOn, disabled && { opacity: 0.6 }]} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}>
      <Ionicons name={icon} size={18} color={primary ? '#151B33' : '#fff'} />
      <Text style={[styles.panelBtnText, primary && { color: '#151B33' }]}>{label}</Text>
    </Pressable>
  );
}

function TaskPick({ title, sub, color, selected, disabled, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.pick,
        selected && { borderColor: color, backgroundColor: color + '12' },
        disabled && !selected && { opacity: 0.5 },
      ]}
    >
      <View style={[styles.pickTile, { backgroundColor: color + '22' }]}>
        <View style={[styles.pickDot, { backgroundColor: color }]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.pickTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.pickSub} numberOfLines={1}>{sub}</Text>
      </View>
      <View style={[styles.radio, selected && { backgroundColor: color, borderColor: color }]}>
        {selected ? <Ionicons name="checkmark" size={14} color={colors.onAccent} /> : null}
      </View>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 16, paddingBottom: 120, maxWidth: 760, width: '100%', alignSelf: 'center' },
  hero: { borderRadius: 30, padding: 20, paddingBottom: 46, overflow: 'hidden', alignItems: 'center', ...shadow },
  glow: { position: 'absolute', left: -90, bottom: 40, width: 220, height: 220, borderRadius: 110, backgroundColor: '#7A5CFA', opacity: 0.14 },
  heroTop: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 30 },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  live: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#8D9BFF' },
  heroKicker: { color: '#AEB6E6', fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  heroTitle: { alignSelf: 'stretch', color: '#fff', fontSize: 19, fontWeight: '800', marginTop: 6 },
  heroSub: { alignSelf: 'stretch', color: '#B5BDF0', fontSize: 12, marginTop: 2 },
  todayPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14 },
  todayPillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  ringBox: { marginTop: 22, width: 236, height: 236, alignItems: 'center', justifyContent: 'center' },
  ringGlow: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: '#8D9BFF', opacity: 0.1 },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  time: { fontSize: 54, fontWeight: '800', color: '#fff', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  timeSub: { color: '#AEB6E6', fontSize: 13, marginTop: 2 },
  durations: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', marginTop: 22, backgroundColor: 'rgba(255,255,255,0.1)', padding: 4, borderRadius: 22 },
  dur: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18 },
  durOn: { backgroundColor: '#fff' },
  durText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 28, marginTop: 24 },
  main: { width: 82, height: 82, borderRadius: 41, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#8D9BFF', shadowOpacity: 0.6, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  side: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  hint: { color: '#AEB6E6', fontSize: 12, marginTop: 16, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 6, marginTop: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)' },
  dotOn: { backgroundColor: '#FFD479' },
  donePanel: { alignSelf: 'stretch', alignItems: 'center', marginTop: 18, gap: 8 },
  doneIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,212,121,0.18)', alignItems: 'center', justifyContent: 'center' },
  doneTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  doneSub: { color: '#C9D0FF', fontSize: 13, textAlign: 'center', marginBottom: 6, paddingHorizontal: 10 },
  panelBtn: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)' },
  panelBtnOn: { backgroundColor: '#fff' },
  panelBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  doneLater: { color: '#AEB6E6', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline', marginTop: 4 },
  group: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.muted, marginTop: 6, textTransform: 'uppercase' },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 16, backgroundColor: colors.accentSoft },
  moreText: { fontSize: 13, fontWeight: '800', color: colors.accent },
  stepRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  stepBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)' },
  stepText: { color: '#E6E9FF', fontSize: 12, fontWeight: '700' },
  contentWide: { maxWidth: 1240 },
  wideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  colTimer: { flex: 1, minWidth: 0 },
  colSide: { flex: 1, minWidth: 0 },
  focusNote: { textAlign: 'center', fontSize: 12, color: colors.muted, marginTop: 18 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  logDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  logTime: { width: 64, fontSize: 12, fontWeight: '700', color: colors.muted, fontVariant: ['tabular-nums'] },
  logDot: { width: 8, height: 8, borderRadius: 4 },
  logName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink },
  logMin: { fontSize: 13, fontWeight: '800', color: colors.ink },
  logDelete: { padding: 4 },
  tip: { color: '#8D9BFF', fontSize: 11, marginTop: 8, textAlign: 'center', maxWidth: 260 },
  strip: { flexDirection: 'row', alignItems: 'center', marginTop: -26, marginHorizontal: 14, backgroundColor: colors.surface, borderRadius: 22, paddingVertical: 14, ...shadow, shadowOpacity: 0.12 },
  stripCell: { flex: 1, alignItems: 'center' },
  stripNum: { fontSize: 22, fontWeight: '800', color: colors.ink },
  stripLbl: { fontSize: 11, color: colors.muted, marginTop: 1 },
  stripDivider: { width: 1, height: 30, backgroundColor: colors.line },
  attachBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  stepsCard: { marginTop: 16, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: colors.line },
  stepsHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  stepsTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.ink },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 26, marginBottom: 12 },
  tasks: { gap: 10 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 12, borderWidth: 1.5, borderColor: colors.line },
  pickTile: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  pickDot: { width: 12, height: 12, borderRadius: 6 },
  pickTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  pickSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
}));
