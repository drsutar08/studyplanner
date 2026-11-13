// Unit tests for the grade "what-if" calculator. Pure logic, no browser: `npm run test:whatif`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'whatif-'));
fs.writeFileSync(path.join(tmp, 'grades.mjs'), fs.readFileSync(new URL('../src/grades.js', import.meta.url), 'utf8'));
fs.writeFileSync(path.join(tmp, 'whatIf.mjs'), fs.readFileSync(new URL('../src/whatIf.js', import.meta.url), 'utf8').replace("'./grades'", "'./grades.mjs'"));
const { neededScore, projectedAverage, projectedOverall, TARGETS } = await import(pathToFileURL(path.join(tmp, 'whatIf.mjs')).href);

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
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

// 70% and 80% so far (each weight 1): average 75
const graded = [
  { id: 'a', subjectId: 'm', score: 70, outOf: 100, date: '2026-09-01' },
  { id: 'b', subjectId: 'm', score: 16, outOf: 20, date: '2026-10-01' },
];

test('targets start at a pass mark', () => assert.deepEqual(TARGETS, [50, 60, 70, 75, 80, 90]));

test('one normal exam to go: the score that lifts the average to the target', () => {
  const r = neededScore({ graded, upcoming: [1], target: 80 });
  close(r.needed, 90); // (70 + 80 + x) / 3 = 80
  assert.equal(r.status, 'possible');
  close(r.current, 75);
  close(r.best, (150 + 100) / 3);
  close(r.worst, 50);
});

test('a final that counts double needs less', () => {
  close(neededScore({ graded, upcoming: [2], target: 80 }).needed, 85); // (150 + 2x) / 4 = 80
});

test('several exams to go share the work', () => {
  close(neededScore({ graded, upcoming: [1, 1], target: 80 }).needed, 85); // (150 + 2x) / 4
});

test('already there, or out of reach', () => {
  const low = neededScore({ graded, upcoming: [1], target: 50 });
  assert.equal(low.status, 'reached');
  assert.equal(low.needed, 0);
  const high = neededScore({ graded, upcoming: [1], target: 95 });
  assert.equal(high.status, 'impossible');
  close(high.needed, 135);
});

test('with nothing graded yet, the target itself is needed', () => {
  const r = neededScore({ graded: [], upcoming: [1], target: 75 });
  close(r.needed, 75);
  assert.equal(r.current, null);
});

test('weights on graded exams count, and ungraded exams are ignored', () => {
  const g = [...graded, { id: 'c', subjectId: 'm', score: 50, outOf: 100, weight: 2, date: '2026-10-10' }, { id: 'd', subjectId: 'm', date: '2026-11-10' }];
  // points 70 + 80 + 100 = 250, weight 4; (250 + x) / 5 = 60 -> x = 50
  close(neededScore({ graded: g, upcoming: [1], target: 60 }).needed, 50);
});

test('projected subject average for a given score', () => {
  close(projectedAverage({ graded, upcoming: [1], score: 90 }), 80);
  close(projectedAverage({ graded, upcoming: [2], score: 60 }), 67.5);
  assert.equal(projectedAverage({ graded: [], upcoming: [], score: 50 }), null);
});

test('projected overall: the subject’s new average replaces its old one', () => {
  const all = [...graded, { id: 'h', subjectId: 'h', score: 60, outOf: 100, date: '2026-10-02' }];
  close(projectedOverall(all, 'm', 80), 70); // (80 + 60) / 2
  close(projectedOverall(all, 'new', 90), (75 + 60 + 90) / 3);
});

console.log(`whatif: ${pass} passed`);
