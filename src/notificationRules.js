// Pure rules for the focus-session alert. No device APIs, so they can be unit tested.

// One fixed id: scheduling again replaces the old alert, and cancelling needs no bookkeeping.
export const FOCUS_END_ID = 'focus-end';

export const isFocusEnd = (id) => id === FOCUS_END_ID;

// The alert fires a second after the timer would end. If the app is open the timer finishes first and
// cancels it, so you never get both the in-app vibration and a notification.
export const sessionEndAt = (endAtMs) => new Date(endAtMs + 1000);

// Only worth scheduling when the person turned notifications on and there is real time left.
export const shouldScheduleSessionEnd = ({ pushEnabled, msLeft }) => !!pushEnabled && msLeft > 5000;

// ---- task reminders with "Mark done" / "Snooze" buttons ----
// Category ids may not contain ':' or '-' (expo-notifications).
export const TASK_CATEGORY = 'taskReminder';
export const ACTION_DONE = 'done';
export const ACTION_SNOOZE = 'snooze';
export const SNOOZE_MINUTES = 60;
export const DUE_HOUR = 9; // a task without a time is reminded at 9:00 on its due day

export const snoozeUntil = (nowMs) => nowMs + SNOOZE_MINUTES * 60000;

// When a task's reminder should fire, or null when it shouldn't (done, or its time has passed).
// A snooze that is still ahead wins over the due time.
export const taskReminderAt = (task, nowMs) => {
  if (task.done) return null;
  if (task.snoozedUntil && task.snoozedUntil > nowMs) return new Date(task.snoozedUntil);
  const [y, m, d] = task.due.split('-').map(Number);
  const [hh, mm] = task.time ? task.time.split(':').map(Number) : [DUE_HOUR, 0];
  const at = new Date(y, m - 1, d, hh, mm, 0, 0);
  return at.getTime() > nowMs ? at : null;
};

// What a tap on a notification asks for: { type: 'done' | 'snooze' | 'open', taskId } or null when it
// isn't a task reminder. `response` is expo-notifications' NotificationResponse.
export const reminderAction = (response) => {
  const content = response && response.notification && response.notification.request && response.notification.request.content;
  const taskId = content && content.data && content.data.taskId;
  // a notification about a screen (the weekly report opens Progress)
  const screen = content && content.data && typeof content.data.screen === 'string' ? content.data.screen : null;
  if (!taskId) return screen ? { type: 'open', taskId: null, screen } : null;
  const id = response.actionIdentifier;
  return { type: id === ACTION_DONE ? 'done' : id === ACTION_SNOOZE ? 'snooze' : 'open', taskId };
};

// No text here (this file stays import-free): each part is a translation key plus its params, and the
// caller turns it into text with t(key, params).
export const sessionEndMessage = ({ minutes, taskTitle }) => ({
  title: { key: 'reminders.sessionEndTitle', params: {} },
  body: taskTitle
    ? { key: 'reminders.sessionEndTask', params: { count: minutes, title: taskTitle } }
    : { key: 'reminders.sessionEndFree', params: { count: minutes } },
});
