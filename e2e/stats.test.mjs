// Unit tests for the dashboard / profile numbers: streaks, "what's next" and "Needs your attention".
// Pure logic, no browser: `npm run test:stats`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-'));
const copy = (src, name) =>
  fs.writeFileSync(
    path.join(tmp, name),
    fs
      .readFileSync(new URL(`../src/${src}`, import.meta.url), 'utf8')
      .replace(/'\.\/(classes|attendance|grades)'/g, "'./$1.mjs'")
  );
['classes', 'attendance', 'grades', 'stats', 'attention'].forEach((m) => copy(`${m}.js`, `${m}.mjs`));
const load = (m) => import(pathToFileURL(path.join(tmp, `${m}.mjs`)).href);
const { currentStreak, bestStreak, focusMinutes, protectedStreak } = await load('stats');
const { nextUp } = await load('classes');
const { attentionItems } = await load('attention');

let pass = 0;
const test = (name, fn) => {
  try {
    fn();
    pass += 1;
    console.log('  PASS', name);
  } catch (e) {
    console.log('  FAIL', name, '\n      ', e.message);
    process.exitCode = 1;
  }
};

const s = (date, minutes = 25) => ({ date, minutes });

test('current streak counts back from today, or from yesterday before studying today', () => {
  const sessions = [s('2026-10-27'), s('2026-10-28'), s('2026-10-29'), s('2026-10-29', 10)];
  assert.equal(currentStreak(sessions, '2026-10-29'), 3);
  assert.equal(currentStreak(sessions, '2026-10-30'), 3); // nothing yet today: still 3
  assert.equal(currentStreak(sessions, '2026-10-31'), 0); // missed a day
  assert.equal(currentStreak([], '2026-10-31'), 0);
  assert.equal(currentStreak([s('2026-10-30', 0)], '2026-10-30'), 0); // a 0-minute session is not a study day
});

test('best streak is the longest run ever, across months', () => {
  const sessions = [s('2026-09-29'), s('2026-09-30'), s('2026-10-01'), s('2026-10-02'), s('2026-10-10'), s('2026-10-11')];
  assert.equal(bestStreak(sessions), 4);
  assert.equal(bestStreak([]), 0);
  assert.equal(focusMinutes(sessions), 150);
  assert.equal(focusMinutes([s('2026-10-10', 40), s('2026-10-11', 15)], '2026-10-10'), 40);
});

test("what's next: the class on now, else the next one, skipping untimed and finished ones", () => {
  const list = [
    { id: 'a', title: 'Calculus', start: '09:00', end: '10:30' },
    { id: 'b', title: 'Biology', start: '13:00', end: '14:00' },
    { id: 'c', title: 'Reading', start: null, end: null },
  ];
  assert.deepEqual(nextUp(list, '08:00'), { cls: list[0], status: 'next', minutes: 60 });
  assert.deepEqual(nextUp(list, '09:45'), { cls: list[0], status: 'now', minutes: 45 });
  assert.deepEqual(nextUp(list, '10:30'), { cls: list[1], status: 'next', minutes: 150 });
  assert.equal(nextUp(list, '14:00'), null);
  assert.equal(nextUp([], '09:00'), null);
});

test('needs your attention: only what applies, worst first', () => {
  const base = { repeat: 'weekly', range: 'none', date: null, start: '09:00', end: '10:00' };
  const classes = [
    { ...base, id: 'p', title: 'Physics', days: [1], createdAt: '2026-10-01', attendance: { '2026-10-05': 'attended', '2026-10-12': 'missed', '2026-10-19': 'missed' } },
    { ...base, id: 'c', title: 'Chemistry', days: [3], createdAt: '2026-10-27', attendance: {} }, // Wed 28 not marked
    { ...base, id: 'w', title: 'Cafe', kind: 'activity', category: 'work', days: [1, 2, 3, 4, 5], start: '16:00', end: '21:00' }, // 25 h
  ];
  const exams = [{ id: 'x', title: 'Quiz', date: '2026-10-20' }, { id: 'y', title: 'Lab', date: '2026-10-21', attendance: 'excused' }];
  const items = attentionItems({ classes, exams, today: '2026-10-30', nowHHMM: '12:00', target: 75, workLimit: 20, weekStart: 1 });
  assert.deepEqual(items.map((i) => i.id), ['below', 'hours', 'mark', 'score']);
  assert.deepEqual(items[0].classes, [{ title: 'Physics', pct: 33 }]);
  assert.deepEqual(items[1], { id: 'hours', over: 5 * 60, limit: 20 });
  assert.ok(items[2].count >= 1);
  assert.equal(items[3].count, 1);
  // nothing to do: nothing listed
  assert.deepEqual(attentionItems({ classes: [], exams: [], today: '2026-10-30', nowHHMM: '12:00', target: 75 }), []);
  // no work limit set: no hours item
  assert.ok(!attentionItems({ classes, exams: [], today: '2026-10-30', nowHHMM: '12:00', target: 75 }).some((i) => i.id === 'hours'));
});

test('streak protection: one missed day a week keeps the streak; two in a row, or a second in the week, end it', () => {
  const on = (...days) => days.map((date) => ({ date, minutes: 25 }));
  // studied Thu 29, Fri 30, (missed Sat 31), Sun 1, Mon 2 (weeks from Sunday: 31 Oct and 1 Nov are in different weeks)
  const s1 = on('2026-10-29', '2026-10-30', '2026-11-01', '2026-11-02');
  assert.equal(currentStreak(s1, '2026-11-02'), 2);
  assert.deepEqual(protectedStreak(s1, '2026-11-02'), { days: 4, saved: ['2026-10-31'] });
  // two days missed in a row: no protection
  assert.deepEqual(protectedStreak(on('2026-10-29', '2026-11-01', '2026-11-02'), '2026-11-02'), { days: 2, saved: [] });
  // misses on Sat 31 Oct and Thu 29 Oct are in the same week (from Sun 25 Oct): only the first is saved
  const s2 = on('2026-10-26', '2026-10-28', '2026-10-30', '2026-11-01');
  assert.deepEqual(protectedStreak(s2, '2026-11-01'), { days: 2, saved: ['2026-10-31'] });
  // nothing yet today: the streak still counts up to yesterday
  assert.equal(protectedStreak(s1, '2026-11-03').days, 4);
});

console.log(`\n${pass} passed`);
