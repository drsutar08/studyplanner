// Unit tests for the focus-session alert rules. Pure logic, no phone needed: `npm run test:notifications`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notif-'));
fs.writeFileSync(path.join(tmp, 'rules.mjs'), fs.readFileSync(new URL('../src/notificationRules.js', import.meta.url), 'utf8'));
const { FOCUS_END_ID, isFocusEnd, sessionEndAt, shouldScheduleSessionEnd, sessionEndMessage, taskReminderAt, reminderAction, snoozeUntil, TASK_CATEGORY, ACTION_DONE, ACTION_SNOOZE } = await import(pathToFileURL(path.join(tmp, 'rules.mjs')).href);
// The English strings (a plain object, no imports) and a minimal English t(): placeholders + one/other plurals
fs.writeFileSync(path.join(tmp, 'en-today.mjs'), fs.readFileSync(new URL('../src/i18n/en/today.js', import.meta.url), 'utf8'));
const { default: en } = await import(pathToFileURL(path.join(tmp, 'en-today.mjs')).href);
const tr = ({ key, params = {} }) => {
  let v = key.split('.').reduce((n, k) => n && n[k], en);
  if (v && typeof v === 'object') v = params.count === 1 ? v.one : v.other;
  return v.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
};

let pass = 0;
const test = (name, fn) => {
  try {
    fn();
    pass += 1;
    console.log('  PASS', name);
  } catch (e) {
    console.log('  FAIL', name, '\n      ', e.message.split('\n')[0]);
    process.exitCode = 1;
  }
};

test('the session alert uses one fixed id, so only it is recognised as the session alert', () => {
  assert.equal(FOCUS_END_ID, 'focus-end');
  assert.ok(isFocusEnd('focus-end'));
  assert.ok(!isFocusEnd('abc-123'));
  assert.ok(!isFocusEnd(undefined));
});

test('the alert fires one second after the timer ends', () => {
  assert.equal(sessionEndAt(1_000_000).getTime(), 1_001_000);
});

test('nothing is scheduled unless notifications are on', () => {
  assert.equal(shouldScheduleSessionEnd({ pushEnabled: false, msLeft: 600000 }), false);
  assert.equal(shouldScheduleSessionEnd({ pushEnabled: undefined, msLeft: 600000 }), false);
});

test('nothing is scheduled when the session is about to end anyway', () => {
  assert.equal(shouldScheduleSessionEnd({ pushEnabled: true, msLeft: 3000 }), false);
  assert.equal(shouldScheduleSessionEnd({ pushEnabled: true, msLeft: 0 }), false);
  assert.equal(shouldScheduleSessionEnd({ pushEnabled: true, msLeft: -50 }), false);
});

test('an alert is scheduled for a normal running session', () => {
  assert.equal(shouldScheduleSessionEnd({ pushEnabled: true, msLeft: 25 * 60 * 1000 }), true);
});

// The message is returned as translation keys + params; notifications.js turns them into text with t().
test('message mentions the task when there is one', () => {
  const m = sessionEndMessage({ minutes: 25, taskTitle: 'Integrals' });
  assert.deepEqual(m.title, { key: 'reminders.sessionEndTitle', params: {} });
  assert.deepEqual(m.body, { key: 'reminders.sessionEndTask', params: { count: 25, title: 'Integrals' } });
});

test('message works for a free session with no task', () => {
  const m = sessionEndMessage({ minutes: 45, taskTitle: null });
  assert.deepEqual(m.body, { key: 'reminders.sessionEndFree', params: { count: 45 } });
  assert.ok(!('title' in m.body.params));
});

test('the keys turn into the same English text as before', () => {
  const m = sessionEndMessage({ minutes: 25, taskTitle: 'Integrals' });
  assert.equal(tr(m.title), 'Focus session complete');
  assert.equal(tr(m.body), '25 min on “Integrals”. Time for a break.');
  assert.equal(tr(sessionEndMessage({ minutes: 45, taskTitle: null }).body), '45 minutes done. Time for a break.');
});

// ---- task reminder buttons ----
const nowMs = new Date(2026, 10, 2, 8, 0).getTime(); // Monday 08:00
const task = { id: 't1', title: 'Integrals', due: '2026-11-02', time: null, done: false };

test('a task is reminded at 9:00 on its day, or at its own time', () => {
  assert.equal(taskReminderAt(task, nowMs).getHours(), 9);
  const at = taskReminderAt({ ...task, time: '14:30' }, nowMs);
  assert.equal(`${at.getHours()}:${at.getMinutes()}`, '14:30');
});

test('no reminder once the time has passed or the task is done', () => {
  assert.equal(taskReminderAt({ ...task, time: '07:00' }, nowMs), null);
  assert.equal(taskReminderAt({ ...task, done: true }, nowMs), null);
});

test('a snooze that is still ahead replaces the due time; an old one is ignored', () => {
  const until = snoozeUntil(nowMs);
  assert.equal(until - nowMs, 60 * 60000);
  assert.equal(taskReminderAt({ ...task, time: '07:00', snoozedUntil: until }, nowMs).getTime(), until);
  assert.equal(taskReminderAt({ ...task, snoozedUntil: nowMs - 1000 }, nowMs).getHours(), 9);
});

test('button taps map to done / snooze / open for task reminders only', () => {
  const resp = (actionIdentifier, data) => ({ actionIdentifier, notification: { request: { identifier: 'n1', content: { data } } } });
  assert.deepEqual(reminderAction(resp(ACTION_DONE, { taskId: 't1' })), { type: 'done', taskId: 't1' });
  assert.deepEqual(reminderAction(resp(ACTION_SNOOZE, { taskId: 't1' })), { type: 'snooze', taskId: 't1' });
  assert.deepEqual(reminderAction(resp('expo.modules.notifications.actions.DEFAULT', { taskId: 't1' })), { type: 'open', taskId: 't1' });
  assert.equal(reminderAction(resp(ACTION_DONE, { classId: 'c1' })), null); // class alerts have no buttons
  assert.ok(!/[:-]/.test(TASK_CATEGORY)); // expo-notifications rejects ':' and '-' in category ids
  // the weekly report opens a screen
  assert.deepEqual(reminderAction(resp('expo.modules.notifications.actions.DEFAULT', { screen: 'Progress' })), { type: 'open', taskId: null, screen: 'Progress' });
});

console.log(`\n${pass} passed`);
