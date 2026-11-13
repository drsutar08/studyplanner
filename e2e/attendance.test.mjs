// Unit tests for class attendance. Pure logic, no browser: `npm run test:attendance`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'attendance-'));
const copy = (src, name) =>
  fs.writeFileSync(path.join(tmp, name), fs.readFileSync(new URL(`../src/${src}`, import.meta.url), 'utf8').replace("'./classes'", "'./classes.mjs'"));
copy('classes.js', 'classes.mjs');
copy('attendance.js', 'attendance.mjs');
const { statusOn, markSession, attendanceOf, standing, attendanceSummary, sessionOver, unmarkedSessions, examStatus, examAttendance, attendanceNudge } = await import(
  pathToFileURL(path.join(tmp, 'attendance.mjs')).href
);

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

// 2026-10-26 is a Monday
const weekly = (over = {}) => ({ id: 'c1', title: 'Physics', repeat: 'weekly', days: [1, 3], start: '09:00', end: '10:00', range: 'none', ...over });

test('marking a session sets it, marking it again or with null clears it', () => {
  let a = markSession(undefined, '2026-10-26', 'attended');
  assert.deepEqual(a, { '2026-10-26': 'attended' });
  a = markSession(a, '2026-10-28', 'missed');
  a = markSession(a, '2026-10-26', 'missed'); // switch
  assert.deepEqual(a, { '2026-10-26': 'missed', '2026-10-28': 'missed' });
  a = markSession(a, '2026-10-26', 'missed'); // same again: clear
  assert.deepEqual(a, { '2026-10-28': 'missed' });
  assert.deepEqual(markSession(a, '2026-10-28', null), {});
  assert.deepEqual(markSession(a, '2026-10-30', 'bogus'), { '2026-10-28': 'missed' });
});

test('statusOn ignores unknown values', () => {
  const c = weekly({ attendance: { '2026-10-26': 'attended', '2026-10-28': 'late' } });
  assert.equal(statusOn(c, '2026-10-26'), 'attended');
  assert.equal(statusOn(c, '2026-10-28'), null);
  assert.equal(statusOn(weekly(), '2026-10-26'), null);
});

test('attendanceOf counts attended / missed and the percentage', () => {
  assert.deepEqual(attendanceOf(weekly()), { attended: 0, missed: 0, total: 0, pct: null, excused: 0, cancelled: 0 });
  const c = weekly({ attendance: { a: 'attended', b: 'attended', c: 'attended', d: 'missed' } });
  assert.deepEqual(attendanceOf(c), { attended: 3, missed: 1, total: 4, pct: 75, excused: 0, cancelled: 0 });
});

test('excused and cancelled sessions are kept but left out of the percentage', () => {
  let a = markSession({}, '2026-10-26', 'excused');
  a = markSession(a, '2026-10-28', 'cancelled');
  a = markSession(a, '2026-10-21', 'attended');
  a = markSession(a, '2026-10-19', 'missed');
  const c = weekly({ attendance: a });
  assert.equal(statusOn(c, '2026-10-26'), 'excused');
  assert.deepEqual(attendanceOf(c), { attended: 1, missed: 1, total: 2, pct: 50, excused: 1, cancelled: 1 });
  // only excused: no percentage yet, and not listed in the summary
  assert.equal(attendanceOf(weekly({ attendance: { x: 'excused' } })).pct, null);
  assert.equal(attendanceSummary([weekly({ attendance: { x: 'cancelled' } })]).rows.length, 0);
  // they count as marked, so they leave the "to mark" list
  const m = weekly({ createdAt: '2026-10-19', attendance: { '2026-10-26': 'cancelled', '2026-10-21': 'excused' } });
  assert.deepEqual(unmarkedSessions([m], '2026-10-28', '09:30').map((s) => s.date), ['2026-10-19']);
});

test('standing: how many more can be missed above the minimum', () => {
  assert.deepEqual(standing({ attended: 0, missed: 0 }, 75), { ok: true, canMiss: 0, needed: 0 });
  // 9/10 = 90%; at 75%: 9/(10+k) >= .75 -> k <= 2
  assert.deepEqual(standing({ attended: 9, missed: 1 }, 75), { ok: true, canMiss: 2, needed: 0 });
  // exactly on the line, none to spare
  assert.deepEqual(standing({ attended: 3, missed: 1 }, 75), { ok: true, canMiss: 0, needed: 0 });
  assert.equal(standing({ attended: 10, missed: 0 }, 100).canMiss, 0);
});

test('standing: how many in a row to get back above the minimum', () => {
  // 5/10 = 50%; (5+k)/(10+k) >= .75 -> k >= 10
  assert.deepEqual(standing({ attended: 5, missed: 5 }, 75), { ok: false, canMiss: 0, needed: 10 });
  // 2/3 at 70%: (2+k)/(3+k) >= .7 -> k >= 0.33 -> 1
  assert.deepEqual(standing({ attended: 2, missed: 1 }, 70), { ok: false, canMiss: 0, needed: 1 });
  assert.equal(standing({ attended: 4, missed: 1 }, 100).needed, Infinity);
});

test('summary: classes with marks only, lowest first, overall counts every session once', () => {
  const s = attendanceSummary([
    weekly({ id: 'a', title: 'Physics', attendance: { 1: 'attended', 2: 'attended', 3: 'attended', 4: 'attended' } }),
    weekly({ id: 'b', title: 'Art' }),
    weekly({ id: 'c', title: 'Chemistry', attendance: { 1: 'attended', 2: 'missed' } }),
  ]);
  assert.deepEqual(s.rows.map((r) => [r.cls.title, r.pct]), [['Chemistry', 50], ['Physics', 100]]);
  assert.equal(s.total, 6);
  assert.equal(s.missed, 1);
  assert.equal(Math.round(s.pct), 83);
  assert.equal(attendanceSummary([]).pct, null);
});

test('a session is over: earlier days, or today once the class has ended', () => {
  const c = weekly();
  assert.equal(sessionOver(c, '2026-10-26', '2026-10-28', '08:00'), true);
  assert.equal(sessionOver(c, '2026-10-28', '2026-10-28', '09:30'), false);
  assert.equal(sessionOver(c, '2026-10-28', '2026-10-28', '10:00'), true);
  assert.equal(sessionOver(c, '2026-10-29', '2026-10-28', '23:00'), false);
  assert.equal(sessionOver(weekly({ start: null, end: null }), '2026-10-28', '2026-10-28', '23:00'), false);
  assert.equal(sessionOver(weekly({ end: null }), '2026-10-28', '2026-10-28', '09:00'), true);
});

test('unmarked sessions: recent, over, not marked, not before the class was added, newest first', () => {
  const today = '2026-10-28'; // Wednesday
  const c = weekly({ createdAt: '2026-10-19', attendance: { '2026-10-21': 'attended' } });
  // Mon 19, Wed 21 (marked), Mon 26, Wed 28 (today, not over at 09:30)
  assert.deepEqual(unmarkedSessions([c], today, '09:30').map((s) => s.date), ['2026-10-26', '2026-10-19']);
  assert.deepEqual(unmarkedSessions([c], today, '10:30').map((s) => s.date), ['2026-10-28', '2026-10-26', '2026-10-19']);
  // no createdAt: only the last week
  assert.deepEqual(unmarkedSessions([weekly()], today, '09:30').map((s) => s.date), ['2026-10-26', '2026-10-21']);
  // the 14-day window
  const old = weekly({ createdAt: '2026-01-01' });
  assert.equal(unmarkedSessions([old], today, '09:30').at(-1).date, '2026-10-14');
  // a paused break hides its sessions
  const breaks = [{ id: 'v', start: '2026-10-26', end: '2026-10-26', pause: true }];
  assert.deepEqual(unmarkedSessions([c], today, '09:30', null, breaks).map((s) => s.date), ['2026-10-19']);
  // a one-off class
  const once = { id: 'o', title: 'Field trip', repeat: 'once', date: '2026-10-27', days: [], start: null, end: null, range: 'none' };
  assert.deepEqual(unmarkedSessions([once], today, '09:30').map((s) => s.date), ['2026-10-27']);
});

test('exams: a score means sat; otherwise the mark, ignoring unknown values', () => {
  assert.equal(examStatus({ date: '2026-10-01', score: 40 }), 'attended');
  assert.equal(examStatus({ date: '2026-10-01', score: 40, attendance: 'missed' }), 'attended');
  assert.equal(examStatus({ date: '2026-10-01', attendance: 'excused' }), 'excused');
  assert.equal(examStatus({ date: '2026-10-01', attendance: 'late' }), null);
  assert.equal(examStatus({ date: '2026-10-01' }), null);
});

test('exam attendance counts past and today only; excused / cancelled are left out', () => {
  const s = examAttendance(
    [
      { date: '2026-10-01', score: 70 },
      { date: '2026-10-05', attendance: 'attended' },
      { date: '2026-10-08', attendance: 'missed' },
      { date: '2026-10-12', attendance: 'excused' },
      { date: '2026-10-15', attendance: 'cancelled' },
      { date: '2026-10-20' }, // not marked
      { date: '2026-11-20', attendance: 'missed' }, // future: ignored
    ],
    '2026-10-30'
  );
  assert.deepEqual(s, { attended: 2, missed: 1, excused: 1, cancelled: 1, total: 3, pct: (2 / 3) * 100 });
  assert.equal(examAttendance([], '2026-10-30').pct, null);
});

test('end-of-day nudge: unmarked classes today, 30 min after the last ends, between 6 and 10 PM', () => {
  const today = '2026-10-28'; // Wednesday
  const a = weekly({ id: 'a', title: 'Physics', days: [3], start: '09:00', end: '10:00' });
  const b = weekly({ id: 'b', title: 'Chemistry', days: [3], start: '19:00', end: '20:15' });
  const footy = weekly({ id: 'f', title: 'Football', days: [3], start: '21:00', end: '22:30', kind: 'activity' });
  assert.deepEqual(attendanceNudge([a], today), { at: '18:00', count: 1, titles: ['Physics'] }); // ended early: 6 PM
  assert.deepEqual(attendanceNudge([a, b, footy], today), { at: '20:45', count: 2, titles: ['Physics', 'Chemistry'] }); // activities ignored
  assert.equal(attendanceNudge([weekly({ ...b, end: '23:00' })], today).at, '22:00'); // never after 10 PM
  assert.equal(attendanceNudge([weekly({ ...a, attendance: { [today]: 'attended' } })], today), null); // all marked
  assert.equal(attendanceNudge([a], '2026-10-29'), null); // no class that day
});

console.log(`\n${pass} passed`);
