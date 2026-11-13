// Unit tests for activities (clubs, sports, work) stored with the classes. Pure logic: `npm run test:activities`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'activities-'));
fs.writeFileSync(path.join(tmp, 'classes.mjs'), fs.readFileSync(new URL('../src/classes.js', import.meta.url), 'utf8'));
const { isActivity, onlyClasses, onlyActivities, activityList, occursOn, classesOn, ACTIVITY_CATEGORIES, sessionMinutes, weekStartOf, activityHours, overLimit } = await import(
  pathToFileURL(path.join(tmp, 'classes.mjs')).href
);

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

const base = { repeat: 'weekly', date: null, range: 'none', rangeStart: null, rangeEnd: null };
const cls = (id, over = {}) => ({ ...base, id, title: id, days: [1], start: '09:00', end: '10:00', ...over });
const act = (id, over = {}) => cls(id, { kind: 'activity', category: 'sport', ...over });

test('activities are told apart from classes', () => {
  const list = [cls('Maths'), act('Football'), act('Cafe shift', { category: 'work' })];
  assert.equal(isActivity(list[0]), false);
  assert.equal(isActivity(list[1]), true);
  assert.equal(isActivity(null), false);
  assert.deepEqual(onlyClasses(list).map((c) => c.id), ['Maths']);
  assert.deepEqual(onlyActivities(list).map((c) => c.id), ['Football', 'Cafe shift']);
  assert.ok(ACTIVITY_CATEGORIES.includes('work') && ACTIVITY_CATEGORIES.includes('other'));
});

test('activities follow the same schedule rules: days, breaks, date range', () => {
  const a = act('Football', { days: [2, 4], range: 'manual', rangeStart: '2026-10-01', rangeEnd: '2026-11-30' });
  assert.equal(occursOn(a, '2026-10-27', null), true); // Tuesday
  assert.equal(occursOn(a, '2026-10-26', null), false); // Monday
  assert.equal(occursOn(a, '2026-12-01', null), false); // after the range
  const breaks = [{ id: 'v', start: '2026-10-27', end: '2026-10-27', pause: true }];
  assert.equal(occursOn(a, '2026-10-27', null, breaks), false);
  // and sit in the day list with the classes, by start time
  const day = classesOn([cls('Maths', { days: [2], start: '18:00', end: '19:00' }), act('Football', { days: [2], start: '16:00', end: '17:30' })], '2026-10-27', null);
  assert.deepEqual(day.map((c) => c.id), ['Football', 'Maths']);
});

test('the Activities list: weekly in week order, then rotation, then upcoming one-offs; finished ones apart', () => {
  const today = '2026-10-28';
  const list = [
    cls('Maths', { days: [0] }), // a class: left out
    act('Cafe', { days: [6], start: '10:00' }),
    act('Choir', { days: [3], start: '17:00' }),
    act('Football', { days: [1, 4], start: '16:00' }),
    act('Robotics', { repeat: 'rotation', days: [], rotationDays: [0] }),
    act('Concert', { repeat: 'once', date: '2026-11-12', days: [] }),
    act('Open day', { repeat: 'once', date: '2026-11-02', days: [] }),
    act('Old fair', { repeat: 'once', date: '2026-10-01', days: [] }),
  ];
  const { current, past } = activityList(list, today, null, 1); // weeks start on Monday
  assert.deepEqual(current.map((c) => c.id), ['Football', 'Choir', 'Cafe', 'Robotics', 'Open day', 'Concert']);
  assert.deepEqual(past.map((c) => c.id), ['Old fair']);
  // a Sunday-first week moves nothing here but Sunday ones would come first
  const sun = activityList([act('Hike', { days: [0] }), act('Football', { days: [1] })], today, null, 0).current;
  assert.deepEqual(sun.map((c) => c.id), ['Hike', 'Football']);
});

test('session length and the start of a week', () => {
  assert.equal(sessionMinutes({ start: '16:00', end: '17:30' }), 90);
  assert.equal(sessionMinutes({ start: '16:00', end: null }), 0);
  assert.equal(sessionMinutes({ start: null, end: null }), 0);
  // 2026-10-28 is a Wednesday
  assert.equal(weekStartOf('2026-10-28', 0), '2026-10-25');
  assert.equal(weekStartOf('2026-10-28', 1), '2026-10-26');
  assert.equal(weekStartOf('2026-10-26', 1), '2026-10-26');
});

test('activity hours for a week: per activity, per type, classes and untimed sessions left out', () => {
  const list = [
    cls('Maths', { days: [1, 2, 3, 4, 5] }), // a class: not counted
    act('Cafe shift', { category: 'work', days: [2, 4, 6], start: '17:00', end: '21:00' }), // 3 x 4 h
    act('Football', { days: [3], start: '16:00', end: '17:30' }), // 1.5 h
    act('Chess', { category: 'club', days: [5], start: null, end: null }), // untimed
    act('Open day', { category: 'other', repeat: 'once', date: '2026-10-31', days: [], start: '10:00', end: '12:00' }),
  ];
  const h = activityHours(list, '2026-10-25', null);
  assert.equal(h.byId['Cafe shift'], 12 * 60);
  assert.deepEqual(h.byCategory, { work: 720, sport: 90, other: 120 });
  assert.equal(h.total, 720 + 90 + 120);
  assert.equal(h.sessions, 5);
  assert.equal(h.untimed, 1);
  // the next week has no "Open day"
  assert.equal(activityHours(list, '2026-11-01', null).byCategory.other, undefined);
  // a paused break takes its sessions out
  const breaks = [{ id: 'v', start: '2026-10-27', end: '2026-10-29', pause: true }];
  assert.equal(activityHours(list, '2026-10-25', null, breaks).byId['Cafe shift'], 4 * 60); // Tue and Thu gone, Sat left
});

test('over a weekly work limit', () => {
  assert.equal(overLimit(22 * 60, 20), 120);
  assert.equal(overLimit(18 * 60, 20), 0);
  assert.equal(overLimit(30 * 60, null), 0);
});

console.log(`\n${pass} passed`);
