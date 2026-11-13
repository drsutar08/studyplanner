// Unit tests for rotating timetables (Day A / Day B, Week 1 / Week 2). Pure logic, no browser: `npm run test:rotation`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rotation-'));
fs.writeFileSync(path.join(tmp, 'classes.mjs'), fs.readFileSync(new URL('../src/classes.js', import.meta.url), 'utf8'));
const { rotationIndexOn, rotationLetter, occursOn, nextSessionDate, timetable, validateClass } = await import(pathToFileURL(path.join(tmp, 'classes.mjs')).href);

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

// 2026-11-02 is a Monday. Day A that Monday, school Mon–Fri.
const ab = { type: 'days', length: 2, startDate: '2026-11-02', startIndex: 0, schoolDays: [1, 2, 3, 4, 5] };
const letters = (rot, keys, vac = []) => keys.map((k) => (rotationIndexOn(rot, k, vac) === null ? '-' : rotationLetter(rotationIndexOn(rot, k, vac)))).join('');
const week = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'];

test('lettered days alternate on school days; weekends have no letter', () => {
  assert.equal(letters(ab, week), 'ABABA--B'); // Mon..Sun, then next Monday continues with B
});

test('days before the start count backwards', () => {
  assert.equal(letters(ab, ['2026-10-29', '2026-10-30', '2026-10-31']), 'AB-'); // Thu A, Fri B, Sat none
});

test('a 3-letter cycle and custom school days (Mon–Sat)', () => {
  const abc = { ...ab, length: 3, schoolDays: [1, 2, 3, 4, 5, 6] };
  assert.equal(letters(abc, week), 'ABCABC-A');
  assert.equal(letters({ ...ab, startIndex: 1 }, week.slice(0, 3)), 'BAB'); // "today is Day B"
});

test('a paused break bumps the rotation; a break that keeps going does not', () => {
  const paused = [{ start: '2026-11-03', end: '2026-11-03', pause: true }];
  const kept = [{ start: '2026-11-03', end: '2026-11-03', pause: false }];
  assert.equal(letters(ab, week.slice(0, 5), paused), 'A-BAB'); // Tue skipped, Wed resumes with B
  assert.equal(letters(ab, week.slice(0, 5), kept), 'ABABA');
});

const wk = { type: 'weeks', length: 2, startDate: '2026-11-02', startIndex: 0, schoolDays: [1, 2, 3, 4, 5], weekStart: 1 };
test('a week cycle moves each week (Week 1, Week 2, ...), backwards too', () => {
  assert.deepEqual(['2026-11-02', '2026-11-08', '2026-11-09', '2026-11-16', '2026-10-30'].map((k) => rotationIndexOn(wk, k)), [0, 0, 1, 0, 1]);
});

test('a week fully covered by a paused break does not count; a partly covered one does', () => {
  const fullWeek = [{ start: '2026-11-09', end: '2026-11-13', pause: true }];
  const partWeek = [{ start: '2026-11-09', end: '2026-11-11', pause: true }];
  assert.equal(rotationIndexOn(wk, '2026-11-16', fullWeek), 1); // the break week is skipped
  assert.equal(rotationIndexOn(wk, '2026-11-16', partWeek), 0);
});

const base = { teacher: '', date: null, range: 'none', rangeStart: null, rangeEnd: null, mode: 'inPerson', location: '', link: '', notes: '', start: '09:00', end: '10:00' };
const dayA = { ...base, id: 'r', title: 'Chemistry', repeat: 'rotation', days: [], rotationDays: [0] };

test('a rotation class meets on its letters only, and never without a rotation', () => {
  assert.deepEqual(week.slice(0, 5).map((k) => occursOn(dayA, k, null, [], ab)), [true, false, true, false, true]);
  assert.equal(occursOn(dayA, '2026-11-02', null, [], null), false);
  assert.equal(occursOn(dayA, '2026-11-02', null, [{ start: '2026-11-02', end: '2026-11-02', pause: true }], ab), false);
  assert.equal(nextSessionDate(dayA, '2026-11-02', null, [], 120, ab), '2026-11-04');
});

test('a weekly class limited to Week 1 skips Week 2; without a week cycle it runs every week', () => {
  const mondays = { ...base, id: 'w', title: 'Lab', repeat: 'weekly', days: [1], rotationWeeks: [0] };
  assert.deepEqual(['2026-11-02', '2026-11-09', '2026-11-16'].map((k) => occursOn(mondays, k, null, [], wk)), [true, false, true]);
  assert.deepEqual(['2026-11-02', '2026-11-09'].map((k) => occursOn(mondays, k, null, [], null)), [true, true]);
});

test('the timetable groups rotation classes by letter; a rotation class needs a letter', () => {
  const both = { ...dayA, id: 's', title: 'Art', rotationDays: [0, 1] };
  const t = timetable([dayA, both], '2026-11-02', null, 1, ab);
  assert.deepEqual(t.cycle.map((g) => [rotationLetter(g.index), g.classes.map((c) => c.title)]), [['A', ['Art', 'Chemistry']], ['B', ['Art']]]);
  assert.equal(validateClass({ ...dayA, rotationDays: [] }, null), 'classes.errors.rotationDays');
  assert.equal(validateClass(dayA, null), null);
});

console.log(`\n${pass} passed`);
