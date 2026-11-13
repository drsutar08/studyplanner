// Unit tests for the Dashboard's "Coming up" folding. Pure logic: `npm run test:comingup`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'comingup-'));
fs.writeFileSync(path.join(tmp, 'comingUp.mjs'), fs.readFileSync(new URL('../src/comingUp.js', import.meta.url), 'utf8'));
const { foldRepeats, startsDay } = await import(pathToFileURL(path.join(tmp, 'comingUp.mjs')).href);

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

const day = (n) => `2026-11-0${n}`;
const list = [
  { id: 'f1', recurId: 'flash', due: day(1) },
  { id: 'e1', due: day(1) },
  { id: 'f2', recurId: 'flash', due: day(2) },
  { id: 'w1', recurId: 'weekly', due: day(2) },
  { id: 'f3', recurId: 'flash', due: day(3) },
  { id: 'p1', due: day(4) },
];

test('a repeat keeps only its next copy, with how many more there are', () => {
  const out = foldRepeats(list);
  assert.deepEqual(out.map((t) => [t.id, t.moreCopies || 0]), [['f1', 2], ['e1', 0], ['w1', 0], ['p1', 0]]);
});

test('the order stays soonest first, and the input is not changed', () => {
  foldRepeats(list);
  assert.equal(list[0].moreCopies, undefined);
  assert.deepEqual(foldRepeats([]), []);
});

test('a day label goes before the first task of each day', () => {
  const out = foldRepeats(list);
  assert.deepEqual(out.map((_, i) => startsDay(out, i)), [true, false, true, true]);
});

console.log(`comingUp: ${pass} passed`);
