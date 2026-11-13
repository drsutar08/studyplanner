// Unit tests for homework due dates, free time around classes, and the week view layout.
// Pure logic, no browser: `npm run test:timetable`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'timetable-'));
const copy = (src, name) =>
  fs.writeFileSync(path.join(tmp, name), fs.readFileSync(new URL(`../src/${src}`, import.meta.url), 'utf8').replace("'./classes'", "'./classes.mjs'"));
copy('classes.js', 'classes.mjs');
copy('freeTime.js', 'freeTime.mjs');
copy('weekLayout.js', 'weekLayout.mjs');
const load = (name) => import(pathToFileURL(path.join(tmp, name)).href);
const { nextSessionDate, classHomework } = await load('classes.mjs');
const { busyBlocks, freeSlots, freeMinutes, scheduleIntoSlots, fromMin } = await load('freeTime.mjs');
const { weekDays, assignLanes, buildWeek } = await load('weekLayout.mjs');

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
const base = { teacher: '', date: null, range: 'none', rangeStart: null, rangeEnd: null, mode: 'inPerson', location: '', link: '', notes: '', subjectId: 's1' };
const calc = { ...base, id: 'a', title: 'Calculus', repeat: 'weekly', days: [1, 3], start: '09:00', end: '10:30' };
const lab = { ...base, id: 'b', title: 'Lab', repeat: 'weekly', days: [1], start: '14:00', end: null };
const once = { ...base, id: 'c', title: 'Guest talk', repeat: 'once', date: '2026-11-05', days: [], start: '11:00', end: '12:00' };
const span = (s) => `${fromMin(s.start)}-${fromMin(s.end)}`;

// ---- homework: due next class ----
test('homework is due at the next session after the given day', () => {
  assert.equal(nextSessionDate(calc, '2026-11-02', null), '2026-11-04'); // Mon -> Wed
  assert.equal(nextSessionDate(calc, '2026-11-04', null), '2026-11-09'); // Wed -> next Mon
  assert.equal(nextSessionDate(calc, '2026-10-31', null), '2026-11-02'); // Sat -> Mon
});

test('next session skips a paused break, and is null when the class does not meet again', () => {
  const brk = [{ start: '2026-11-03', end: '2026-11-08', pause: true }];
  assert.equal(nextSessionDate(calc, '2026-11-02', null, brk), '2026-11-09');
  assert.equal(nextSessionDate(once, '2026-11-01', null), '2026-11-05');
  assert.equal(nextSessionDate(once, '2026-11-05', null), null);
  assert.equal(nextSessionDate({ ...calc, range: 'manual', rangeStart: '2026-11-01', rangeEnd: '2026-11-04' }, '2026-11-04', null), null);
});

test('a class lists its own open homework, soonest first, and counts the overdue ones', () => {
  const tasks = [
    { id: '1', title: 'Essay', classId: 'a', due: '2026-11-09', done: false },
    { id: '2', title: 'Problems', classId: 'a', due: '2026-11-04', done: false },
    { id: '3', title: 'Late', classId: 'a', due: '2026-10-30', done: false },
    { id: '4', title: 'Done', classId: 'a', due: '2026-11-04', done: true },
    { id: '5', title: 'Other class', classId: 'b', due: '2026-11-04', done: false },
    { id: '6', title: 'Not homework', due: '2026-11-04', done: false },
  ];
  const hw = classHomework(tasks, 'a', '2026-11-02');
  assert.deepEqual(hw.open.map((t) => t.title), ['Late', 'Problems', 'Essay']);
  assert.equal(hw.overdue, 1);
  assert.deepEqual(hw.done.map((t) => t.title), ['Done']); // finished homework stays visible under the class
  assert.deepEqual(classHomework(tasks, 'zzz', '2026-11-02'), { open: [], overdue: 0, done: [] });
});

// ---- free time ----
test('busy blocks: classes (1 h without an end) and timed exams, merged when they overlap', () => {
  const exams = [{ id: 'e', date: '2026-11-02', time: '10:00', duration: 90 }, { id: 'x', date: '2026-11-02', time: null }];
  assert.deepEqual(busyBlocks({ classes: [calc, lab], exams }, '2026-11-02').map(span), ['09:00-11:30', '14:00-15:00']);
});

test('free slots run from now (rounded up to 5 min) to 22:00 around the busy blocks', () => {
  const busy = busyBlocks({ classes: [calc, lab] }, '2026-11-02');
  assert.deepEqual(freeSlots(busy, 7 * 60 + 2).map(span), ['07:05-09:00', '10:30-14:00', '15:00-22:00']);
  assert.deepEqual(freeSlots(busy, 9 * 60 + 30).map(span), ['10:30-14:00', '15:00-22:00']); // in a class now
  assert.deepEqual(freeSlots(busy, 21 * 60 + 50), []); // under 15 minutes left
  assert.equal(freeMinutes(freeSlots([], 20 * 60)), 120);
});

test('gaps shorter than 15 minutes are not offered', () => {
  const busy = [{ start: 600, end: 660 }, { start: 670, end: 720 }];
  assert.deepEqual(freeSlots(busy, 600).map(span), ['12:00-22:00']);
});

test('plan items go into the earliest gap with room, in order; what fits nowhere gets null', () => {
  const slots = [{ start: 600, end: 645 }, { start: 700, end: 820 }];
  const items = [30, 60, 30, 200].map((estimate, i) => ({ task: { id: `t${i}`, estimate } }));
  assert.deepEqual(
    scheduleIntoSlots(items, slots).map((it) => (it.at ? span(it.at) : null)),
    ['10:00-10:30', '11:40-12:40', '12:40-13:10', null]
  );
});

// ---- week view ----
test('week days follow the week-start setting', () => {
  assert.deepEqual(weekDays('2026-11-04', 1), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  assert.equal(weekDays('2026-11-04', 0)[0], '2026-11-01');
});

test('overlapping blocks are placed side by side; separate ones keep the full width', () => {
  const out = assignLanes([
    { id: 'a', startMin: 540, endMin: 630 },
    { id: 'b', startMin: 600, endMin: 660 },
    { id: 'c', startMin: 630, endMin: 700 }, // overlaps b only, can reuse lane 0
    { id: 'd', startMin: 800, endMin: 860 },
  ]);
  const by = Object.fromEntries(out.map((b) => [b.id, `${b.lane}/${b.lanes}`]));
  assert.deepEqual(by, { a: '0/2', b: '1/2', c: '0/2', d: '0/1' });
});

test('the week holds classes, timed exams and timed tasks; untimed ones are counted', () => {
  const tasks = [
    { id: 't1', title: 'Essay', due: '2026-11-02', time: '16:00', estimate: 45, done: false },
    { id: 't2', title: 'Read', due: '2026-11-02', time: null, estimate: 30, done: false },
    { id: 't3', title: 'Old', due: '2026-11-02', time: null, estimate: 30, done: true },
  ];
  const exams = [{ id: 'e1', title: 'Quiz', date: '2026-11-04', time: '07:00', duration: 30 }, { id: 'e2', title: 'Final', date: '2026-11-06', time: null }];
  const w = buildWeek({ classes: [calc, lab], tasks, exams }, weekDays('2026-11-02', 1));
  const mon = w.columns[0];
  assert.deepEqual(mon.blocks.map((b) => `${b.kind}:${b.title}`).sort(), ['class:Calculus', 'class:Lab', 'task:Essay']);
  assert.equal(mon.untimedTasks, 1); // done tasks aren't counted
  assert.deepEqual(w.columns[2].blocks.map((b) => b.title).sort(), ['Calculus', 'Quiz']);
  assert.equal(w.columns[4].untimedExams, 1);
  assert.equal(w.startHour, 7); // widened for the 7:00 quiz
  assert.equal(w.endHour, 20);
});

console.log(`\n${pass} passed`);
