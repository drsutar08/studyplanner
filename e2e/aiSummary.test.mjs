// Unit tests for what the AI helper is told about a student. Pure logic: `npm run test:aisummary`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-summary-'));
const src = (f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const local = (s) => s.replace(/from '\.\/(\w+)'/g, "from './$1.mjs'");
fs.writeFileSync(
  path.join(tmp, 'dates.mjs'),
  `const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const key = (d) => \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')}\`;
export const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return key(d); };`
);
fs.writeFileSync(path.join(tmp, 'grades.mjs'), src('grades.js'));
fs.writeFileSync(path.join(tmp, 'classes.mjs'), 'export const occursOn = () => false;\n');
fs.writeFileSync(path.join(tmp, 'attendance.mjs'), local(src('attendance.js')));
fs.writeFileSync(path.join(tmp, 'flashcards.mjs'), local(src('flashcards.js')));
fs.writeFileSync(path.join(tmp, 'aiSummary.mjs'), local(src('aiSummary.js')));
const { adviceSummary } = await import(pathToFileURL(path.join(tmp, 'aiSummary.mjs')).href);

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
const today = '2026-11-02';
const state = {
  subjects: [{ id: 'm', name: 'Maths' }, { id: 'h', name: 'History' }],
  tasks: [
    { id: 1, title: 'Problem set 5', subjectId: 'm', due: '2026-10-31', estimate: 60, priority: 'high', notes: 'SECRET NOTE' },
    { id: 2, title: 'Read chapter 4', subjectId: 'h', due: today, estimate: 30 },
    { id: 3, title: 'Essay plan', subjectId: 'h', due: '2026-11-04' },
    { id: 4, title: 'Far away', subjectId: 'm', due: '2026-12-01' },
    { id: 5, title: 'Done one', subjectId: 'm', due: today, done: true },
  ],
  exams: [
    { id: 'x', title: 'Maths mid-term', subjectId: 'm', date: '2026-11-09' },
    { id: 'g', title: 'History quiz', subjectId: 'h', date: '2026-10-01', score: 12, outOf: 20 },
  ],
  classes: [{ id: 'c', subjectId: 'h', attendance: { '2026-10-20': 'missed', '2026-10-21': 'attended', '2026-10-22': 'missed' } }],
  sessions: [{ date: '2026-11-01', minutes: 45, subjectId: 'm' }, { date: '2026-10-10', minutes: 90, subjectId: 'h' }],
  cards: [{ reps: 0, due: today, createdAt: today }],
};

test('what is due, coming, weak and done lately, in plain words', () => {
  const s = adviceSummary(state, today);
  assert.match(s, /Overdue tasks:\n- Problem set 5 \(Maths, 60 min, high priority, due 2026-10-31\)/);
  assert.match(s, /Due today:\n- Read chapter 4 \(History, 30 min, due 2026-11-02\)/);
  assert.match(s, /Due in the next 3 days:\n- Essay plan/);
  assert.match(s, /Exams in the next 3 weeks:\n- Maths mid-term \(Maths\) on 2026-11-09/);
  assert.match(s, /low grade average:\n- History: 60%/);
  assert.match(s, /attendance under 75%:\n- History: 33%/);
  assert.match(s, /last 7 days:\n- Maths: 45 min\n- History: 0 min/);
  assert.match(s, /Flashcards due for review: 1/);
});

test('nothing private (notes) and nothing finished or far off goes in', () => {
  const s = adviceSummary(state, today);
  assert.ok(!s.includes('SECRET NOTE'));
  assert.ok(!s.includes('Done one'));
  assert.ok(!s.includes('Far away'));
});

test('an empty account says so', () => {
  assert.equal(adviceSummary({}, today), 'Nothing is due and no exams are coming up.');
});

console.log(`aiSummary: ${pass} passed`);
