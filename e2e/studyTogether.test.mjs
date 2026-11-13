// Unit tests for study together (who's studying now in your groups). Pure logic: `node e2e/studyTogether.test.mjs`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studyTogether-'));
fs.writeFileSync(path.join(tmp, 'studyTogether.mjs'), fs.readFileSync(new URL('../src/studyTogether.js', import.meta.url), 'utf8'));
const { studyingNow, canJoin, joinPlan, myStatus, JOIN_MIN_MS } = await import(pathToFileURL(path.join(tmp, 'studyTogether.mjs')).href);

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
const now = 1_800_000_000_000;
const min = 60 * 1000;
const focus = (left, extra = {}) => ({ phase: 'focus', paused: false, endAt: now + left, minutes: 25, subject: 'Physics', color: '#2F80ED', ...extra });

test('lists the others studying, not me, once each, with every group they share', () => {
  const groups = [
    { id: 'g1', name: 'Physics', presence: { me: [{ name: 'Me', status: focus(10 * min) }], u1: [{ name: 'Priya', status: focus(20 * min) }] } },
    { id: 'g2', name: 'Maths', presence: { u1: [{ name: 'Priya', status: focus(20 * min) }], u2: [{ name: 'Arjun', status: focus(5 * min) }] } },
  ];
  const list = studyingNow(groups, 'me', now);
  assert.deepEqual(list.map((p) => p.name), ['Arjun', 'Priya']); // ending soonest first
  assert.deepEqual(list.find((p) => p.name === 'Priya').groups, ['Physics', 'Maths']);
});

test('focus sessions come before paused ones and breaks; ended and idle ones are left out', () => {
  const groups = [
    {
      id: 'g1',
      name: 'G',
      presence: {
        a: [{ name: 'On a break', status: { phase: 'break', paused: false, endAt: now + 3 * min, minutes: 5 } }],
        b: [{ name: 'Paused', status: focus(0, { paused: true, endAt: null, remainingMs: 12 * min }) }],
        c: [{ name: 'Focusing', status: focus(30 * min) }],
        d: [{ name: 'Ended', status: focus(-1000) }],
        e: [{ name: 'Idle', status: null }],
      },
    },
  ];
  assert.deepEqual(studyingNow(groups, 'me', now).map((p) => p.name), ['Focusing', 'Paused', 'On a break']);
});

test('a running focus session can be joined until 2 minutes before its end, at its end time', () => {
  const [p] = studyingNow([{ id: 'g', name: 'G', presence: { u: [{ name: 'P', status: focus(14.6 * min) }] } }], 'me', now);
  assert.equal(canJoin(p, now), true);
  assert.deepEqual(joinPlan(p, now), { endAt: now + 14.6 * min, minutes: 15 });
  assert.equal(canJoin({ ...p, endAt: now + JOIN_MIN_MS - 1 }, now), false);
  assert.equal(canJoin({ ...p, paused: true }, now), false);
  assert.equal(canJoin({ ...p, phase: 'break' }, now), false);
});

test('what this device shares: the subject, never the task, and nothing when idle', () => {
  assert.equal(myStatus({ underWay: false }), null);
  const s = myStatus({ underWay: true, running: true, phase: 'focus', endAt: now + 25 * min, remaining: 25 * min, minutes: 25, subject: { name: 'Biology', color: '#16A085' } });
  assert.deepEqual(s, { phase: 'focus', paused: false, endAt: now + 25 * min, remainingMs: null, minutes: 25, subject: 'Biology', color: '#16A085' });
  assert.equal(myStatus({ underWay: true, running: false, phase: 'focus', endAt: 0, remaining: 61234.5, minutes: 25, subject: null }).remainingMs, 61235);
});

console.log(`\n${pass} passed`);
