// Unit tests for grades and GPA. Pure logic, no browser: `npm run test:grades`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grades-'));
fs.writeFileSync(path.join(tmp, 'grades.mjs'), fs.readFileSync(new URL('../src/grades.js', import.meta.url), 'utf8'));
const { isGraded, percentOf, average, subjectAverages, overallAverage, letterOf, gpa4Of, gpa10Of, overallGpa, needsScore, validateResult, gradeTrend } = await import(
  pathToFileURL(path.join(tmp, 'grades.mjs')).href
);

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
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

const ex = (o) => ({ id: Math.random().toString(36), title: 'x', subjectId: 'math', date: '2026-10-01', ...o });
const exams = [
  ex({ score: 45, outOf: 50 }), // 90%
  ex({ score: 70, outOf: 100, weight: 2, date: '2026-10-20' }), // 70% counted twice
  ex({ subjectId: 'bio', score: 80 }), // 80% (out of 100 by default)
  ex({ subjectId: 'bio' }), // not graded
];

test('an exam is graded once it has a score; percent uses "out of" (default 100)', () => {
  assert.equal(isGraded(exams[3]), false);
  assert.equal(percentOf(exams[0]), 90);
  assert.equal(percentOf(exams[2]), 80);
  assert.equal(percentOf(exams[3]), null);
  assert.equal(isGraded(ex({ score: 5, outOf: 0 })), false);
});

test('a weighted average counts a 2× exam twice', () => {
  near(average(exams.filter((e) => e.subjectId === 'math')), (90 + 70 * 2) / 3);
  assert.equal(average([exams[3]]), null);
});

test('per-subject averages, best first, with counts and newest exam first', () => {
  const s = subjectAverages(exams);
  assert.deepEqual(s.map((x) => [x.subjectId, Math.round(x.average), x.count]), [['bio', 80, 1], ['math', 77, 2]]);
  assert.equal(s[1].exams[0].date, '2026-10-20');
});

test('overall: every subject counts the same', () => {
  near(overallAverage(exams), (80 + (90 + 140) / 3) / 2);
  assert.equal(overallAverage([exams[3]]), null);
});

test('letter grades and GPA scales', () => {
  assert.deepEqual([95, 91, 88, 84, 81, 78, 74, 71, 68, 64, 61, 40].map(letterOf), ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']);
  assert.equal(gpa4Of(93), 4.0);
  assert.equal(gpa4Of(85), 3.0);
  near(gpa10Of(76), 8);
  assert.equal(gpa10Of(100), 10);
  near(overallGpa(exams, 'gpa4'), (gpa4Of(80) + gpa4Of((90 + 140) / 3)) / 2);
  assert.equal(overallGpa([], 'gpa10'), null);
});

test('past exams without a score are listed as needing one, newest first', () => {
  const list = needsScore([ex({ date: '2026-10-05' }), ex({ date: '2026-10-25' }), ex({ date: '2026-11-05' }), ex({ date: '2026-10-10', score: 50 })], '2026-10-30');
  assert.deepEqual(list.map((e) => e.date), ['2026-10-25', '2026-10-05']);
});

test('an exam marked missed, excused or cancelled no longer needs a score; one marked sat still does', () => {
  const list = needsScore(
    [
      ex({ date: '2026-10-05', attendance: 'missed' }),
      ex({ date: '2026-10-06', attendance: 'excused' }),
      ex({ date: '2026-10-07', attendance: 'cancelled' }),
      ex({ date: '2026-10-08', attendance: 'attended' }),
    ],
    '2026-10-30'
  );
  assert.deepEqual(list.map((e) => e.date), ['2026-10-08']);
});

test('result fields: blank is fine, bad numbers are not', () => {
  assert.equal(validateResult('', ''), null);
  assert.equal(validateResult('42', '50'), null);
  assert.equal(validateResult('8,5', '10'), null); // decimal comma
  assert.equal(validateResult('abc', ''), 'grades.errors.score');
  assert.equal(validateResult('-1', ''), 'grades.errors.score');
  assert.equal(validateResult('5', '0'), 'grades.errors.outOf');
  assert.equal(validateResult('500', '100'), 'grades.errors.tooHigh');
});

test('grade trend: scores oldest first and the change from first to last', () => {
  const tr = gradeTrend([
    { id: 'c', date: '2026-10-20', score: 18, outOf: 20 },
    { id: 'a', date: '2026-09-01', score: 60, outOf: 100 },
    { id: 'x', date: '2026-09-15' },
    { id: 'b', date: '2026-10-01', score: 35, outOf: 50 },
  ]);
  assert.deepEqual(tr.points.map((p) => [p.id, Math.round(p.pct)]), [['a', 60], ['b', 70], ['c', 90]]);
  assert.equal(Math.round(tr.change), 30);
  assert.equal(gradeTrend([{ id: 'a', date: '2026-09-01', score: 5, outOf: 10 }]).change, null);
  assert.deepEqual(gradeTrend([]), { points: [], change: null });
});

console.log(`\n${pass} passed`);
