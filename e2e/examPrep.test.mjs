// Unit tests for exam prep plans. Pure logic: `npm run test:examprep`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'examprep-'));
// the two date helpers it uses, without the rest of dates.js (which needs the app's translations)
fs.writeFileSync(
  path.join(tmp, 'dates.mjs'),
  `const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const key = (d) => \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')}\`;
export const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return key(d); };
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);`
);
fs.writeFileSync(path.join(tmp, 'examPrep.mjs'), fs.readFileSync(new URL('../src/examPrep.js', import.meta.url), 'utf8').replace("'./dates'", "'./dates.mjs'"));
const { prepPlan, prepDays, suggestedSessions, parseTopics, planTasks } = await import(pathToFileURL(path.join(tmp, 'examPrep.mjs')).href);

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
const exam = { id: 'x', title: 'Physics final', date: '2026-11-12' };
const today = '2026-11-02';

test('revision days run from today to the day before the exam', () => {
  const d = prepDays(exam, today);
  assert.equal(d.length, 10);
  assert.equal(d[0], today);
  assert.equal(d[9], '2026-11-11');
  assert.deepEqual(prepDays({ date: today }, today), []);
  assert.deepEqual(prepDays({ date: '2026-11-01' }, today), []);
});

test('a suggested number of sessions: every day when close, about every other day further out, at most 8', () => {
  assert.deepEqual([1, 2, 3, 4, 10, 30].map(suggestedSessions), [1, 2, 3, 3, 6, 8]);
});

test('the plan is spread out, ends the day before, with a practice test and a final review', () => {
  const p = prepPlan({ exam, today });
  assert.equal(p.length, 6);
  assert.equal(p[p.length - 1].due, '2026-11-11');
  assert.deepEqual(p.map((s) => s.kind), ['session', 'session', 'session', 'session', 'practice', 'final']);
  assert.ok(p.every((s, i) => i === 0 || s.due > p[i - 1].due), 'one session a day, in order');
  assert.ok(p.every((s) => s.of === 6 && s.estimate >= 45));
  assert.equal(p[4].estimate, 60); // a practice test takes at least an hour
});

test('topics get a session each, in order; topics that do not fit go into the last study session', () => {
  const p = prepPlan({ exam, today, count: 5, topics: ['Optics', 'Waves', 'Mechanics', 'Heat', 'Circuits'] });
  assert.deepEqual(p.map((s) => s.kind), ['topic', 'topic', 'topic', 'practice', 'final']);
  assert.deepEqual(p.slice(0, 3).map((s) => s.topic), ['Optics', 'Waves', 'Mechanics']);
  assert.deepEqual(p[2].rest, ['Heat', 'Circuits']);
  const few = prepPlan({ exam, today, count: 6, topics: ['Optics', 'Waves'] });
  assert.deepEqual(few.slice(0, 4).map((s) => s.topic), ['Optics', 'Waves', 'Optics', 'Waves']); // round again
});

test('never more sessions than days, and short plans skip the practice test', () => {
  const soon = { ...exam, date: '2026-11-04' };
  assert.equal(prepPlan({ exam: soon, today, count: 9 }).length, 2);
  assert.deepEqual(prepPlan({ exam: soon, today }).map((s) => s.kind), ['session', 'final']);
  assert.deepEqual(prepPlan({ exam: { ...exam, date: '2026-11-03' }, today }).map((s) => s.kind), ['final']);
  assert.deepEqual(prepPlan({ exam: { ...exam, date: today }, today }), []);
});

test('topics typed in a list: lines or commas, no blanks or repeats', () => {
  assert.deepEqual(parseTopics('Optics, waves\n\nOPTICS;  Heat '), ['Optics', 'waves', 'Heat']);
  assert.deepEqual(parseTopics(''), []);
});

test("an exam's plan is the tasks made for it", () => {
  const tasks = [{ id: 1, prepFor: 'x' }, { id: 2 }, { id: 3, prepFor: 'y' }, { id: 4, prepFor: 'x', done: true }];
  assert.deepEqual(planTasks(tasks, 'x').map((t) => t.id), [1, 4]);
});

test('planTasks also counts tasks linked to the exam by hand (examId)', () => {
  const tasks = [{ id: 1, prepFor: 'x' }, { id: 2, examId: 'x' }, { id: 3, examId: 'y' }, { id: 4 }];
  assert.deepEqual(planTasks(tasks, 'x').map((t) => t.id), [1, 2]);
});

console.log(`examPrep: ${pass} passed`);
