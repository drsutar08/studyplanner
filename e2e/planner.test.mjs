// Unit tests for the daily planner. Pure logic, no browser needed: `npm run test:planner`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The app uses extension-less imports (Metro style); copy the files to a temp folder as .mjs so plain Node can load them.
// dates.js imports ./i18n (Expo-only dependencies), so it gets a tiny stub that echoes keys.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-'));
const src = new URL('../src/', import.meta.url);
fs.writeFileSync(path.join(tmp, 'locale.mjs'), fs.readFileSync(new URL('locale.js', src), 'utf8'));
fs.writeFileSync(path.join(tmp, 'i18n.mjs'), 'export const t = (key) => key;\nexport const weekdayName = (day) => String(day);\nexport const getLanguage = () => \'en\';\n');
fs.writeFileSync(path.join(tmp, 'dates.mjs'), fs.readFileSync(new URL('dates.js', src), 'utf8').replace("'./locale'", "'./locale.mjs'").replace("'./i18n'", "'./i18n.mjs'"));
fs.writeFileSync(path.join(tmp, 'planner.mjs'), fs.readFileSync(new URL('planner.js', src), 'utf8').replace("'./dates'", "'./dates.mjs'"));
const { buildPlan, scoreTask, defaultBudget } = await import(pathToFileURL(path.join(tmp, 'planner.mjs')).href);
const { addDays } = await import(pathToFileURL(path.join(tmp, 'dates.mjs')).href);

const today = '2026-10-28';
const t = (id, over = {}) => ({ id, title: id, subjectId: null, due: today, estimate: 30, priority: 'med', done: false, ...over });
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

test('overdue outranks due today, which outranks due tomorrow', () => {
  const plan = buildPlan({ tasks: [t('tomorrow', { due: addDays(today, 1) }), t('today'), t('overdue', { due: addDays(today, -2) })], budget: 240, today });
  assert.deepEqual(plan.items.map((i) => i.task.id), ['overdue', 'today', 'tomorrow']);
});

test('high priority beats medium on the same day', () => {
  const plan = buildPlan({ tasks: [t('med'), t('high', { priority: 'high' }), t('low', { priority: 'low' })], budget: 240, today });
  assert.deepEqual(plan.items.map((i) => i.task.id), ['high', 'med', 'low']);
});

test('an exam in the same subject lifts a task above an otherwise equal one', () => {
  const exams = [{ id: 'e1', subjectId: 's1', date: addDays(today, 2) }];
  const plan = buildPlan({ tasks: [t('plain'), t('examy', { subjectId: 's1' })], exams, budget: 240, today });
  assert.equal(plan.items[0].task.id, 'examy');
  assert.ok(plan.items[0].reasons.some((r) => r.key === 'exam'));
});

test('reasons carry translation keys and params, not English text', () => {
  const exams = [{ id: 'e1', subjectId: 's1', date: addDays(today, 5) }];
  const { reasons } = scoreTask(t('x', { subjectId: 's1', due: addDays(today, -3), priority: 'high' }), exams, today);
  assert.deepEqual(reasons.map((r) => [r.key, r.label, r.params]), [
    ['overdue', 'plan.reason.overdue', { days: 3 }],
    ['high', 'plan.reason.high', {}],
    ['exam', 'plan.reason.examIn', { days: 5 }],
  ]);
  assert.equal(scoreTask(t('a'), [], today).reasons[0].label, 'plan.reason.today');
  assert.equal(scoreTask(t('b', { due: addDays(today, 1) }), [], today).reasons[0].label, 'plan.reason.tomorrow');
});

test('exam today and tomorrow get their own keys', () => {
  const r0 = scoreTask(t('x', { subjectId: 's1', due: addDays(today, 3) }), [{ subjectId: 's1', date: today }], today).reasons;
  const r1 = scoreTask(t('x', { subjectId: 's1', due: addDays(today, 3) }), [{ subjectId: 's1', date: addDays(today, 1) }], today).reasons;
  assert.equal(r0.find((r) => r.key === 'exam').label, 'plan.reason.examToday');
  assert.equal(r1.find((r) => r.key === 'exam').label, 'plan.reason.examTomorrow');
});

test('a task linked to an exam gets a bigger boost than one only sharing its subject', () => {
  const exams = [{ id: 'e1', subjectId: 's1', date: addDays(today, 2) }];
  const same = scoreTask(t('a', { subjectId: 's1' }), exams, today).score;
  assert.equal(scoreTask(t('b', { subjectId: 's1', examId: 'e1' }), exams, today).score, same + 15);
  assert.equal(scoreTask(t('c', { subjectId: 's1', prepFor: 'e1' }), exams, today).score, same + 15);
});

test('a linked task counts its own exam, even in another subject or 3 weeks out', () => {
  const exams = [{ id: 'e1', subjectId: 's2', date: addDays(today, 20) }];
  const { reasons } = scoreTask(t('x', { subjectId: 's1', examId: 'e1' }), exams, today);
  assert.deepEqual(reasons.find((r) => r.key === 'exam').params, { days: 20 });
  // an unlinked task in that subject would not feel an exam this far out
  assert.ok(!scoreTask(t('y', { subjectId: 's2' }), exams, today).reasons.some((r) => r.key === 'exam'));
});

test('a linked exam that is past or deleted falls back to the subject rule', () => {
  const exams = [{ id: 'old', subjectId: 's1', date: addDays(today, -2) }, { id: 'e2', subjectId: 's1', date: addDays(today, 5) }];
  const past = scoreTask(t('x', { subjectId: 's1', examId: 'old' }), exams, today);
  assert.equal(past.reasons.find((r) => r.key === 'exam').params.days, 5);
  assert.equal(past.score, scoreTask(t('y', { subjectId: 's1' }), exams, today).score);
  assert.equal(scoreTask(t('z', { subjectId: 's1', examId: 'gone' }), exams, today).score, past.score);
});

test('exam in another subject or in the past has no effect', () => {
  const exams = [{ id: 'e1', subjectId: 's2', date: addDays(today, 2) }, { id: 'e2', subjectId: 's1', date: addDays(today, -1) }];
  const { reasons } = scoreTask(t('x', { subjectId: 's1' }), exams, today);
  assert.ok(!reasons.some((r) => r.key === 'exam'));
});

test('plan fits the time budget and reports what was skipped', () => {
  const plan = buildPlan({ tasks: [t('a', { estimate: 60, priority: 'high' }), t('b', { estimate: 60 }), t('c', { estimate: 60, priority: 'low' })], budget: 120, today });
  assert.equal(plan.items.length, 2);
  assert.equal(plan.totalMinutes, 120);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.overBudget, false);
});

test('a smaller lower-ranked task can still fill the gap', () => {
  const plan = buildPlan({ tasks: [t('big1', { estimate: 90, priority: 'high' }), t('big2', { estimate: 90 }), t('small', { estimate: 20, priority: 'low' })], budget: 120, today });
  assert.deepEqual(plan.items.map((i) => i.task.id), ['big1', 'small']);
});

test('the top task is always planned, even if longer than the budget', () => {
  const plan = buildPlan({ tasks: [t('long', { estimate: 120 })], budget: 30, today });
  assert.equal(plan.items.length, 1);
  assert.equal(plan.overBudget, true);
});

test('finished tasks and tasks due beyond a week are left out', () => {
  const plan = buildPlan({ tasks: [t('done', { done: true }), t('far', { due: addDays(today, 20) }), t('ok')], budget: 240, today });
  assert.deepEqual(plan.items.map((i) => i.task.id), ['ok']);
});

test('items carry running start/end minutes', () => {
  const plan = buildPlan({ tasks: [t('a', { estimate: 25, priority: 'high' }), t('b', { estimate: 45 })], budget: 240, today });
  assert.deepEqual(plan.items.map((i) => [i.startMin, i.endMin]), [[0, 25], [25, 70]]);
});

test('empty input gives an empty plan', () => {
  const plan = buildPlan({ tasks: [], budget: 60, today });
  assert.equal(plan.items.length, 0);
  assert.equal(plan.totalMinutes, 0);
});

test('default budget = goal minus focused time, rounded to 15, minimum 30', () => {
  assert.equal(defaultBudget(60, 0), 60);
  assert.equal(defaultBudget(60, 20), 45);
  assert.equal(defaultBudget(60, 59), 30);
  assert.equal(defaultBudget(120, 200), 30);
});

console.log(`\n${pass} passed`);
