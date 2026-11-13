// Unit tests for the "Next class" widget timeline. Pure logic, no device: `npm run test:widget`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'widget-'));
fs.writeFileSync(path.join(tmp, 'classes.mjs'), fs.readFileSync(new URL('../src/classes.js', import.meta.url), 'utf8'));
fs.writeFileSync(
  path.join(tmp, 'timeline.mjs'),
  fs.readFileSync(new URL('../src/widgets/timeline.js', import.meta.url), 'utf8').replace("'../classes'", "'./classes.mjs'")
);
const { upcomingSessions, widgetTimeline } = await import(pathToFileURL(path.join(tmp, 'timeline.mjs')).href);
fs.writeFileSync(path.join(tmp, 'today.mjs'), fs.readFileSync(new URL('../src/widgets/today.js', import.meta.url), 'utf8'));
const { todaySummary } = await import(pathToFileURL(path.join(tmp, 'today.mjs')).href);

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

// 2026-11-02 is a Monday
const base = { teacher: '', date: null, range: 'none', rangeStart: null, rangeEnd: null, mode: 'inPerson', location: '', link: '', notes: '' };
const calc = { ...base, id: 'a', title: 'Calculus', repeat: 'weekly', days: [1, 3], start: '09:00', end: '10:30' };
const lab = { ...base, id: 'b', title: 'Lab', repeat: 'weekly', days: [1], start: '14:00', end: null };
const untimed = { ...base, id: 'c', title: 'Office hours', repeat: 'weekly', days: [1], start: null, end: null };
const hm = (d) => `${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

test('upcoming sessions skip untimed and finished classes, soonest first', () => {
  const now = new Date(2026, 10, 2, 11, 0); // Monday 11:00, Calculus is over
  assert.deepEqual(upcomingSessions([lab, calc, untimed], null, [], now).map((s) => `${s.date} ${s.cls.title}`), ['2026-11-02 Lab']);
  // Tuesday has nothing, so a two-day window from Monday ends there; three days reaches Wednesday
  assert.equal(upcomingSessions([calc], null, [], now, 3).at(-1).date, '2026-11-04');
});

test('a class without an end time lasts one hour', () => {
  const [s] = upcomingSessions([lab], null, [], new Date(2026, 10, 2, 8, 0));
  assert.equal(hm(s.endAt), '2 15:00');
});

test('a class still running counts as upcoming', () => {
  const [s] = upcomingSessions([calc], null, [], new Date(2026, 10, 2, 10, 0));
  assert.equal(s.cls.title, 'Calculus');
});

test('timeline: shows the next class now, switches as each ends, then goes empty', () => {
  const now = new Date(2026, 10, 2, 7, 0);
  const entries = widgetTimeline([calc, lab], null, [], now);
  assert.deepEqual(
    entries.map((e) => `${hm(e.date)} ${e.session ? e.session.cls.title : '-'}`),
    ['2 7:00 Calculus', '2 10:30 Lab', '2 15:00 -']
  );
});

test('timeline is empty with no timed classes, and during a paused break', () => {
  const now = new Date(2026, 10, 2, 7, 0);
  assert.deepEqual(widgetTimeline([untimed], null, [], now).map((e) => e.session), [null]);
  const brk = [{ start: '2026-11-01', end: '2026-11-08', pause: true }];
  assert.deepEqual(widgetTimeline([calc, lab], null, brk, now).map((e) => e.session), [null]);
});

// ---- the "Today" widget
test('today: open tasks (overdue first, then by time), done today, focus minutes and cards due', () => {
  const today = '2026-11-02';
  const tasks = [
    { title: 'Later this week', due: '2026-11-04', done: false },
    { title: 'Essay', due: today, time: '18:00', done: false },
    { title: 'Worksheet', due: today, done: false, priority: 'high' },
    { title: 'Reading', due: today, time: '09:00', done: false },
    { title: 'Overdue lab', due: '2026-10-30', done: false },
    { title: 'Done one', due: today, done: true },
  ];
  const sessions = [{ date: today, minutes: 25 }, { date: today, minutes: 20 }, { date: '2026-11-01', minutes: 90 }];
  assert.deepEqual(todaySummary({ tasks, sessions, cardsDue: 7, dailyGoal: 60, today }), {
    left: 4,
    overdue: 1,
    done: 1,
    titles: ['Overdue lab', 'Reading', 'Essay'],
    minutes: 45,
    goal: 60,
    cardsDue: 7,
  });
  assert.equal(todaySummary({ today }).left, 0);
});

console.log(`\n${pass} passed`);
