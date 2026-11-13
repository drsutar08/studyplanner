// Unit tests for the progress report. Pure logic: `npm run test:report-share`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-report-'));
const src = (f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
fs.writeFileSync(
  path.join(tmp, 'dates.mjs'),
  `const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const key = (d) => \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')}\`;
export const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return key(d); };
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);`
);
fs.writeFileSync(path.join(tmp, 'grades.mjs'), src('grades.js'));
fs.writeFileSync(path.join(tmp, 'stats.mjs'), src('stats.js').replace(/from '\.\/(\w+)'/g, "from './$1.mjs'"));
fs.writeFileSync(path.join(tmp, 'classes.mjs'), 'export const occursOn = () => false;\n');
fs.writeFileSync(path.join(tmp, 'attendance.mjs'), src('attendance.js').replace(/from '\.\/(\w+)'/g, "from './$1.mjs'"));
fs.writeFileSync(path.join(tmp, 'report.mjs'), src('progressReport.js').replace(/from '\.\/(\w+)'/g, "from './$1.mjs'"));
const { buildReport, periodRange } = await import(pathToFileURL(path.join(tmp, 'report.mjs')).href);

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
const today = '2026-11-04';
const state = {
  subjects: [{ id: 'm', name: 'Maths', color: '#E4572E' }, { id: 'p', name: 'Physics', color: '#2E86DE' }],
  sessions: [
    { date: '2026-11-02', minutes: 45, subjectId: 'm' },
    { date: '2026-11-03', minutes: 30, subjectId: 'p' },
    { date: '2026-11-03', minutes: 25, subjectId: 'm' },
    { date: '2026-11-04', minutes: 20, subjectId: 'm' },
    { date: '2026-10-20', minutes: 60, subjectId: 'm' }, // before the week
  ],
  tasks: [
    { id: 1, due: '2026-11-02', done: true, completedAt: '2026-11-02' }, // on time
    { id: 2, due: '2026-11-03', done: true, completedAt: '2026-11-04T09:00:00Z' }, // late
    { id: 3, due: '2026-11-03', done: false }, // overdue
    { id: 4, due: '2026-11-09', done: false },
    { id: 5, due: '2026-10-25', done: true, completedAt: '2026-11-01' }, // done this week, due before
  ],
  classes: [
    { id: 'c1', subjectId: 'm', attendance: { '2026-10-27': 'attended', '2026-10-29': 'attended', '2026-11-03': 'missed', '2026-11-02': 'excused' } },
    { id: 'c2', subjectId: 'p', attendance: { '2026-10-28': 'attended' } },
    { id: 'a1', kind: 'activity', subjectId: null, attendance: { '2026-10-28': 'missed' } },
  ],
  exams: [
    { id: 'x1', subjectId: 'm', date: '2026-10-10', score: 80, outOf: 100 },
    { id: 'x2', subjectId: 'p', date: '2026-10-12', score: 18, outOf: 20 },
    { id: 'x3', subjectId: 'p', title: 'Physics mid-term', date: '2026-11-11' },
    { id: 'x4', subjectId: 'm', title: 'Later', date: '2026-12-01' },
  ],
  cards: [{ reps: 3 }, { reps: 1 }, { reps: 0 }],
  term: { start: '2026-09-01', end: '2026-12-20' },
};

test('the period: this week, the last 4 weeks, or the term so far', () => {
  assert.deepEqual(periodRange('week', today, { weekStart: '2026-11-01' }), { from: '2026-11-01', to: today });
  assert.deepEqual(periodRange('month', today), { from: '2026-10-08', to: today });
  assert.deepEqual(periodRange('term', today, { term: state.term }), { from: '2026-09-01', to: today });
  assert.deepEqual(periodRange('term', today, {}), { from: '2026-08-07', to: today });
});

test('focus: minutes, sessions and days in the period, per subject, and the streak', () => {
  const r = buildReport(state, { period: 'week', today, weekStart: '2026-11-01', profile: { name: 'Asha', school: 'City College' } });
  assert.deepEqual([r.focus.minutes, r.focus.sessions, r.focus.activeDays, r.focus.streak, r.days], [120, 4, 3, 3, 4]);
  assert.deepEqual(r.focus.bySubject.map((s) => [s.name, s.minutes]), [['Maths', 90], ['Physics', 30]]);
  assert.deepEqual([r.student.name, r.student.school], ['Asha', 'City College']);
});

test('tasks: done in the period, on time, and overdue now', () => {
  const r = buildReport(state, { period: 'week', today, weekStart: '2026-11-01' });
  assert.deepEqual(r.tasks, { done: 3, due: 3, onTime: 1, overdue: 1 });
});

test('attendance per subject (classes only, excused not counted), lowest first', () => {
  const r = buildReport(state, { period: 'week', today, weekStart: '2026-11-01' });
  assert.equal(r.attendance.pct, 75);
  assert.deepEqual(r.attendance.bySubject.map((a) => [a.name, a.pct, a.attended, a.total]), [['Maths', 67, 2, 3], ['Physics', 100, 1, 1]]);
});

test('grades, flashcards learnt, and exams in the next two weeks', () => {
  const r = buildReport(state, { period: 'week', today, weekStart: '2026-11-01' });
  assert.equal(r.grades.average, 85);
  assert.deepEqual(r.grades.bySubject.map((g) => [g.name, g.average]), [['Physics', 90], ['Maths', 80]]);
  assert.deepEqual(r.cards, { total: 3, learnt: 1 });
  assert.deepEqual(r.upcoming, [{ title: 'Physics mid-term', date: '2026-11-11', subject: 'Physics', days: 7 }]);
});

test('an empty account gives a report of zeros and nothing to show, not an error', () => {
  const r = buildReport({ subjects: [] }, { period: 'month', today });
  assert.deepEqual([r.focus.minutes, r.tasks.done, r.attendance.pct, r.grades.average, r.upcoming.length], [0, 0, null, null, 0]);
});

console.log(`progressReport: ${pass} passed`);
