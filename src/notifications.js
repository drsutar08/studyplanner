import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import {
  FOCUS_END_ID,
  isFocusEnd,
  sessionEndAt,
  TASK_CATEGORY,
  ACTION_DONE,
  ACTION_SNOOZE,
  taskReminderAt,
  reminderAction,
} from './notificationRules';
import { classAlerts } from './classes';
import { attendanceNudge } from './attendance';
import { t } from './i18n';
import { reportNotice } from './report';
import { nextNudge } from './smartReminders';
import { nudgeText } from './smartNudgeText';
import { hoursText } from './durations';

// Local (on-device) reminders. Nothing here needs a server.
const supported = Platform.OS === 'ios' || Platform.OS === 'android';
const CHANNEL = 'reminders';
const MAX_SCHEDULED = 40; // iOS caps pending local notifications at 64
const MAX_CLASS_ALERTS = 14; // shares that cap with tasks and exams

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export const notificationsSupported = supported;

export async function hasPermission() {
  if (!supported) return false;
  try {
    const p = await Notifications.getPermissionsAsync();
    return !!p.granted;
  } catch {
    return false;
  }
}

// Asks the OS for permission (shows the system prompt the first time). Returns true if granted.
export async function requestPermission() {
  if (!supported) return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: t('reminders.channel'),
        importance: AndroidImportance.DEFAULT,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const next = await Notifications.requestPermissionsAsync();
    return !!next.granted;
  } catch {
    return false;
  }
}

// Cancels the study reminders but leaves a running focus-session alert alone, unless asked to cancel it too.
export async function cancelAllReminders({ includeSession = false } = {}) {
  if (!supported) return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if (includeSession || !isFocusEnd(n.identifier)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch {
    // ignore
  }
}

// Text for a notification: plain text, or a { key, params } pair from notificationRules (translated here).
const text = (m) => (m && typeof m === 'object' ? t(m.key, m.params) : m);

// Alert for the moment a focus session ends, so you hear about it even after leaving the app.
// `title` and `body` come from sessionEndMessage() as translation keys.
export async function scheduleSessionEnd({ endAt, title, body }) {
  if (!supported || !(await hasPermission())) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: FOCUS_END_ID,
      content: { title: text(title), body: text(body) },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: sessionEndAt(endAt), channelId: CHANNEL },
    });
  } catch {
    // best effort
  }
}

export async function cancelSessionEnd() {
  if (!supported) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(FOCUS_END_ID);
  } catch {
    // nothing scheduled
  }
}

// Task reminders carry two buttons. Registered at launch and again after a language change, so the
// button titles are in the app's language. Neither button opens the app.
export async function registerReminderActions() {
  if (!supported) return;
  try {
    await Notifications.setNotificationCategoryAsync(TASK_CATEGORY, [
      { identifier: ACTION_DONE, buttonTitle: t('reminderActions.done'), options: { opensAppToForeground: false } },
      { identifier: ACTION_SNOOZE, buttonTitle: t('reminderActions.snooze'), options: { opensAppToForeground: false } },
    ]);
  } catch {
    // buttons are a nicety; the reminder still works without them
  }
}

// Calls onAction({ type: 'done' | 'snooze' | 'open', taskId }) for every task-reminder interaction,
// including the one that launched the app. Returns an unsubscribe function.
export function listenForReminderActions(onAction) {
  if (!supported) return () => {};
  const seen = new Set();
  const handle = (response) => {
    const action = reminderAction(response);
    if (!action) return;
    const id = response.notification.request.identifier;
    const key = `${id}|${response.actionIdentifier}`;
    if (seen.has(key)) return; // the launch response can also arrive through the listener
    seen.add(key);
    onAction(action);
    if (action.type !== 'open') Notifications.dismissNotificationAsync(id).catch(() => {});
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
  };
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  Notifications.getLastNotificationResponseAsync()
    .then((r) => r && handle(r))
    .catch(() => {});
  return () => sub.remove();
}

// Rebuilds every scheduled reminder from the current tasks and settings.
// Cheap enough to call whenever tasks or settings change.
export async function syncReminders({ tasks, exams = [], classes = [], term = null, vacations = [], rotation = null, sessions = [], subjects = [], settings }) {
  if (!supported) return;
  await cancelAllReminders();
  if (!settings.pushEnabled || !(await hasPermission())) return;

  try {
    const now = Date.now();
    const upcoming = tasks
      .map((task) => ({ task, at: taskReminderAt(task, now) }))
      .filter((x) => x.at)
      .sort((a, b) => a.at - b.at)
      .slice(0, MAX_SCHEDULED);

    for (const { task, at } of upcoming) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: task.snoozedUntil && task.snoozedUntil > now ? t('reminderActions.snoozedTitle') : t('reminders.dueToday'),
          body: task.title,
          data: { taskId: task.id },
          categoryIdentifier: TASK_CATEGORY,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
      });
    }

    // Exams: the evening before (6 PM) and on the day, an hour before it starts (8 AM if it has no time)
    for (const e of exams) {
      const [y, m, d] = e.date.split('-').map(Number);
      const eve = new Date(y, m - 1, d - 1, 18, 0, 0, 0);
      const [hh, mm] = e.time ? e.time.split(':').map(Number) : [9, 0];
      const morn = new Date(y, m - 1, d, hh - 1, mm, 0, 0);
      if (eve.getTime() > now) {
        await Notifications.scheduleNotificationAsync({
          content: { title: t('reminders.examTomorrow'), body: e.title },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: eve, channelId: CHANNEL },
        });
      }
      if (morn.getTime() > now) {
        await Notifications.scheduleNotificationAsync({
          content: { title: t('reminders.examToday'), body: e.title },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: morn, channelId: CHANNEL },
        });
      }
    }

    // Classes: 10 minutes before each timed class in the coming week
    for (const { cls, at } of classAlerts(classes, term, new Date(now), { vacations, rotation }).slice(0, MAX_CLASS_ALERTS)) {
      const where = cls.mode === 'online' ? t('reminders.online') : cls.location;
      await Notifications.scheduleNotificationAsync({
        content: { title: t(cls.kind === 'activity' ? 'reminders.activitySoon' : 'reminders.classSoon', { title: cls.title }), body: where || t('reminders.startingSoon'), data: { classId: cls.id } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
      });
    }

    // The evening nudge when today's classes aren't marked yet (re-planned whenever classes change, so
    // marking them all before then cancels it)
    if (settings.attendanceNudge !== false) {
      const day = new Date(now);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      const nudge = attendanceNudge(classes, key, term, vacations, rotation);
      if (nudge) {
        const [h, m] = nudge.at.split(':').map(Number);
        const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
        if (at.getTime() > now) {
          await Notifications.scheduleNotificationAsync({
            content: { title: t('reminders.markTitle', { count: nudge.count }), body: t('reminders.markBody', { titles: nudge.titles.slice(0, 3).join(', ') }) },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
          });
        }
      }
    }

    // The smart reminder: at the usual study time, about what's due soon (re-planned as things change)
    if (settings.smartReminders !== false) {
      const n = nextNudge({ tasks, exams, sessions }, new Date(now));
      if (n) {
        const { title, body } = nudgeText(n);
        await Notifications.scheduleNotificationAsync({
          content: { title, body, data: { screen: 'Focus' } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: CHANNEL },
        });
      }
    }

    // The weekly report: 7 PM on the last day of the week, re-planned as sessions are logged so it reads right
    if (settings.weeklyReport !== false) {
      const { at, report } = reportNotice({ subjects, tasks, sessions, exams, classes }, { now: new Date(now), weekStart: settings.weekStart || 0, attendanceTarget: settings.attendanceTarget });
      const names = report.behind.slice(0, 2).map((r) => r.name);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t('reminders.weekTitle', { time: hoursText(report.total) }),
          body: !report.subjects.length ? t('reminders.weekNoSubjects') : names.length ? t('reminders.weekBehind', { count: report.behind.length, names: names.join(', ') }) : t('reminders.weekOnTrack'),
          data: { screen: 'Progress' },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
      });
    }

    if (settings.dailyReminder) {
      await Notifications.scheduleNotificationAsync({
        content: { title: t('reminders.dailyTitle'), body: t('reminders.dailyBody') },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: settings.reminderHour,
          minute: 0,
          channelId: CHANNEL,
        },
      });
    }
  } catch {
    // Scheduling is best-effort; never crash the app over a reminder.
  }
}
