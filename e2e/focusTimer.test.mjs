// Unit tests for the Focus timer rules: breaks, rounds, restoring a session. Pure: `npm run test:focus`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'focus-'));
fs.writeFileSync(path.join(tmp, 'focusTimer.mjs'), fs.readFileSync(new URL('../src/focusTimer.js', import.meta.url), 'utf8'));
const { breakAfter, roundPosition, restoreTimer, minutesFocused, ROUND, focusRules } = await import(pathToFileURL(path.join(tmp, 'focusTimer.mjs')).href);

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

test('short breaks, and a long one after every 4th session', () => {
  assert.equal(ROUND, 4);
  assert.deepEqual([1, 2, 3, 4, 5, 8].map((n) => breakAfter(n).minutes), [5, 5, 5, 15, 5, 15]);
  assert.equal(breakAfter(4).long, true);
  assert.equal(breakAfter(0).long, false);
});

test('the round position of the next session', () => {
  assert.deepEqual([0, 1, 3, 4, 6].map((n) => roundPosition(n).n), [1, 2, 4, 1, 3]);
  assert.equal(roundPosition(2).of, 4);
});

test('a running session comes back with the time left, or as finished if it ran out', () => {
  const now = 1_000_000;
  const running = { phase: 'focus', status: 'running', minutes: 25, endAt: now + 10 * 60000, taskId: 't1', chosen: true };
  assert.deepEqual(restoreTimer(running, now), { phase: 'focus', minutes: 25, taskId: 't1', chosen: true, done: null, status: 'running', endAt: now + 600000, remainingMs: 600000 });
  const r = restoreTimer({ ...running, endAt: now - 5000 }, now);
  assert.equal(r.status, 'finished');
  assert.equal(r.endedAt, now - 5000);
  // a break comes back as a break
  assert.equal(restoreTimer({ ...running, phase: 'break', minutes: 5, endAt: now + 60000 }, now).phase, 'break');
  // an end time further away than the session length (clock changed) is not trusted
  assert.equal(restoreTimer({ ...running, endAt: now + 60 * 60000 }, now).status, 'idle');
});

test('a paused session keeps its time; anything odd starts idle; junk is ignored', () => {
  assert.deepEqual(restoreTimer({ phase: 'focus', status: 'paused', minutes: 45, remainingMs: 120000, taskId: null }, 0), {
    phase: 'focus', minutes: 45, taskId: null, chosen: false, done: null, status: 'paused', remainingMs: 120000,
  });
  assert.equal(restoreTimer({ status: 'paused', minutes: 25, remainingMs: 99 * 60000 }, 0).status, 'idle');
  assert.equal(restoreTimer({ status: 'idle', minutes: 25, taskId: 'x', chosen: true }, 0).taskId, 'x');
  assert.equal(restoreTimer(null, 0), null);
  assert.equal(restoreTimer({ status: 'running' }, 0), null);
  assert.equal(restoreTimer('nope', 0), null);
});

test('an open "session complete" panel comes back the same day only', () => {
  const idle = { status: 'idle', minutes: 25, done: { kind: 'focus', minutes: 25 }, day: '2026-10-30' };
  assert.deepEqual(restoreTimer(idle, 0, '2026-10-30').done, { kind: 'focus', minutes: 25 });
  assert.equal(restoreTimer(idle, 0, '2026-10-31').done, null);
  assert.equal(restoreTimer({ ...idle, done: { kind: 'focus', minutes: 0 } }, 0, '2026-10-30').done, null);
  assert.deepEqual(restoreTimer({ ...idle, done: { kind: 'break' } }, 0, '2026-10-30').done, { kind: 'break' });
});

test('break lengths and the round come from the settings, with defaults for anything unset or odd', () => {
  assert.deepEqual(focusRules({}), { round: 4, shortBreak: 5, longBreak: 15 });
  assert.deepEqual(focusRules({ focusRound: 3, shortBreak: 10, longBreak: 30 }), { round: 3, shortBreak: 10, longBreak: 30 });
  assert.deepEqual(focusRules({ focusRound: 99, shortBreak: 7, longBreak: 'x' }), { round: 4, shortBreak: 5, longBreak: 15 });
  const r = focusRules({ focusRound: 3, shortBreak: 3, longBreak: 20 });
  assert.deepEqual([1, 2, 3, 6].map((n) => breakAfter(n, r).minutes), [3, 3, 20, 20]);
  assert.deepEqual(roundPosition(4, r), { n: 2, of: 3 });
});

test('minutes saved for a session stopped early', () => {
  assert.equal(minutesFocused(95000), 2);
  assert.equal(minutesFocused(20000), 0);
  assert.equal(minutesFocused(-5), 0);
});

console.log(`\n${pass} passed`);
