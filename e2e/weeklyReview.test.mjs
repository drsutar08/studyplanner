// Unit tests for the weekly review. Pure logic: `npm run test:review`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-'));
fs.writeFileSync(
  path.join(tmp, 'dates.mjs'),
  `const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const key = (d) => \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')}\`;
export const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return key(d); };`
);
fs.writeFileSync(path.join(tmp, 'weeklyReview.mjs'), fs.readFileSync(new URL('../src/weeklyReview.js', import.meta.url), 'utf8').replace("'./dates'", "'./dates.mjs'"));
const { weeklyReview, spreadOut } = await import(pathToFileURL(path.join(tmp, 'weeklyReview.mjs')).href);

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

const start = '2026-11-01'; // a Sunday
const today = '2026-11-04';
const data = {
  subjects: [{ id: 'm', name: 'Maths', color: '#E4572E' }, { id: 'p', name: 'Physics', color: '#2E86DE' }, { id: 'h', name: 'History', color: '#7A5CFA' }],
  tasks: [
    { id: 'a', subjectId: 'm', due: '2026-11-02', done: true, completedAt: '2026-11-02' },
    { id: 'b', subjectId: 'p', due: '2026-11-01', done: true, completedAt: '2026-11-03T18:20:00.000Z' },
    { id: 'c', subjectId: 'm', due: '2026-10-28', done: true, completedAt: '2026-10-30' }, // last week
    { id: 'd', subjectId: 'm', due: '2026-11-03', done: false, priority: 'low' },
    { id: 'e', subjectId: 'p', due: '2026-10-30', done: false, priority: 'high' },
    { id: 'f', subjectId: 'p', due: '2026-11-03', done: false, priority: 'high' },
    { id: 'g', subjectId: 'm', due: '2026-11-04', done: false }, // due today: not slipped
    { id: 'h', subjectId: 'm', due: '2026-11-09', done: false },
    { id: 'i', subjectId: 'm', due: '2026-11-20', done: false },
  ],
  sessions: [
    { date: '2026-11-02', minutes: 45, subjectId: 'm' },
    { date: '2026-11-03', minutes: 30, subjectId: 'p' },
    { date: '2026-10-29', minutes: 25, subjectId: 'm' },
  ],
  exams: [{ date: '2026-11-08' }, { date: '2026-12-01' }],
};

test('done this week: by when it was finished, not when it was due', () => {
  const r = weeklyReview(data, start, today);
  assert.equal(r.end, '2026-11-07');
  assert.deepEqual(r.done.map((t) => t.id).sort(), ['a', 'b']);
});

test('slipped: not done and due before today, oldest first, then by priority', () => {
  assert.deepEqual(weeklyReview(data, start, today).slipped.map((t) => t.id), ['e', 'f', 'd']);
});

test('focus time against the week before, per subject, and the coming week', () => {
  const r = weeklyReview(data, start, today);
  assert.equal(r.focus, 75);
  assert.equal(r.focusBefore, 25);
  assert.deepEqual(r.bySubject.map((s) => [s.name, s.done, s.minutes]), [['Maths', 1, 45], ['Physics', 1, 30]]);
  assert.deepEqual(r.next, { tasks: 2, exams: 1 });
});

test('slipped tasks spread over the coming days: urgent first, at most so many a day', () => {
  const slipped = weeklyReview(data, start, today).slipped;
  assert.deepEqual(spreadOut(slipped, today, 2), [{ due: '2026-11-04', ids: ['e', 'f'] }, { due: '2026-11-05', ids: ['d'] }]);
  assert.deepEqual(spreadOut([], today), []);
});

console.log(`weeklyReview: ${pass} passed`);
