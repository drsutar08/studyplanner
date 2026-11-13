// Unit tests for task steps (subtasks). Pure logic, no browser: `npm run test:subtasks`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'subtasks-'));
fs.writeFileSync(path.join(tmp, 'subtasks.mjs'), fs.readFileSync(new URL('../src/subtasks.js', import.meta.url), 'utf8'));
const { addStep, toggleStep, renameStep, removeStep, stepProgress, freshSteps, cleanSteps, MAX_STEPS, MAX_STEP_LENGTH } = await import(
  pathToFileURL(path.join(tmp, 'subtasks.mjs')).href
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

const three = [
  { id: 'a', title: 'Read chapter', done: true },
  { id: 'b', title: 'Write outline', done: false },
  { id: 'c', title: 'Draft essay', done: false },
];

test('adding a step trims it and appends it unticked; blanks are ignored', () => {
  const s = addStep([], '  Make notes  ', 'x');
  assert.deepEqual(s, [{ id: 'x', title: 'Make notes', done: false }]);
  assert.equal(addStep(s, '   '), s);
  assert.equal(addStep(s, ''), s);
});

test('a step is capped in length, and the list in size', () => {
  assert.equal(addStep([], 'x'.repeat(200), 'y')[0].title.length, MAX_STEP_LENGTH);
  const full = Array.from({ length: MAX_STEPS }, (_, i) => ({ id: String(i), title: `s${i}`, done: false }));
  assert.equal(addStep(full, 'one more'), full);
});

test('toggle, rename and remove act on one step only', () => {
  assert.deepEqual(toggleStep(three, 'b').map((s) => s.done), [true, true, false]);
  assert.equal(renameStep(three, 'c', ' Final draft ')[2].title, 'Final draft');
  assert.equal(renameStep(three, 'c', '  ')[2].title, 'Draft essay'); // blank rename keeps the old title
  assert.deepEqual(removeStep(three, 'a').map((s) => s.id), ['b', 'c']);
});

test('progress counts done steps and points at the next one', () => {
  assert.deepEqual(stepProgress(three), { done: 1, total: 3, next: three[1] });
  assert.deepEqual(stepProgress(three.map((s) => ({ ...s, done: true }))), { done: 3, total: 3, next: null });
  assert.deepEqual(stepProgress(undefined), { done: 0, total: 0, next: null });
});

test('a repeating copy gets the same steps, unticked, with new ids', () => {
  const f = freshSteps(three);
  assert.deepEqual(f.map((s) => [s.title, s.done]), [['Read chapter', false], ['Write outline', false], ['Draft essay', false]]);
  assert.ok(f.every((s, i) => s.id !== three[i].id));
  assert.equal(new Set(f.map((s) => s.id)).size, 3);
});

test('steps from a backup are cleaned: bad ones dropped, ids and flags fixed', () => {
  const c = cleanSteps([{ title: ' Ok ', done: 1 }, { title: '' }, null, 'text', { id: 'k', title: 'Keep' }]);
  assert.deepEqual(c, [{ id: 'st0', title: 'Ok', done: true }, { id: 'k', title: 'Keep', done: false }]);
  assert.deepEqual(cleanSteps(undefined), []);
});

console.log(`\n${pass} passed`);
