// Unit tests for achievements. Pure logic: `npm run test:achievements`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'achievements-'));
const src = (f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
fs.writeFileSync(path.join(tmp, 'stats.mjs'), src('stats.js'));
fs.writeFileSync(path.join(tmp, 'achievements.mjs'), src('achievements.js').replace("'./stats'", "'./stats.mjs'"));
const { badges, badgeValues, newlyEarned, nextUp, BADGE_STEPS } = await import(pathToFileURL(path.join(tmp, 'achievements.mjs')).href);

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
const days = (n) => Array.from({ length: n }, (_, i) => {
  const d = new Date(2026, 10, 2 - i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});
const state = {
  sessions: days(8).map((date) => ({ date, minutes: 90 })), // 8 days in a row, 12 hours
  tasks: [
    ...Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, done: true })),
    { id: 'p1', prepFor: 'x1', done: true },
    { id: 'p2', prepFor: 'x1', done: true },
    { id: 'p3', prepFor: 'x2', done: false },
  ],
  archive: [{ id: 'old' }],
  exams: [{ id: 'x1' }, { id: 'x2' }],
  cards: [{ reps: 3 }, { reps: 4 }, { reps: 1 }],
  achievements: [{ id: 'streak-3', earnedAt: '2026-10-28' }],
};

test('how far along: the best streak, hours, sessions, tasks (with the archive), finished prep plans, cards learnt', () => {
  assert.deepEqual(badgeValues(state, today), { streak: 8, hours: 12, sessions: 8, tasks: 12, prep: 1, cards: 2 });
});

test('a badge per step, earned once its target is reached, with the date it was first earned', () => {
  const list = badges(state, today);
  assert.equal(list.length, Object.values(BADGE_STEPS).flat().length);
  const by = Object.fromEntries(list.map((b) => [b.id, b]));
  assert.deepEqual([by['streak-3'].earned, by['streak-3'].earnedAt], [true, '2026-10-28']);
  assert.deepEqual([by['streak-7'].earned, by['streak-7'].earnedAt], [true, null]); // earned, not recorded yet
  assert.deepEqual([by['streak-14'].earned, by['streak-14'].value], [false, 8]);
  assert.equal(by['tasks-10'].earned, true);
  assert.equal(by['prep-1'].earned, true);
  assert.equal(by['cards-10'].earned, false);
});

test('newly earned: earned and not yet recorded, dated today', () => {
  const ids = newlyEarned(badges(state, today), today).map((b) => b.id);
  assert.deepEqual(ids, ['streak-7', 'hours-1', 'hours-10', 'sessions-1', 'tasks-10', 'prep-1']);
  assert.ok(newlyEarned(badges(state, today), today).every((b) => b.earnedAt === today));
});

test('next up: the next badge in each group, closest to done first', () => {
  const next = nextUp(badges(state, today));
  assert.equal(next[0].id, 'streak-14'); // 8 of 14
  assert.deepEqual(next.map((b) => b.group).sort(), ['cards', 'hours', 'prep', 'sessions', 'streak', 'tasks']);
});

test('nothing done: nothing earned', () => {
  assert.deepEqual(newlyEarned(badges({}, today), today), []);
});

console.log(`achievements: ${pass} passed`);
