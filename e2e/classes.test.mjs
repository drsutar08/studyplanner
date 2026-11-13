// Unit tests for the class timetable rules. Pure logic, no browser: `npm run test:classes`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'classes-'));
fs.writeFileSync(path.join(tmp, 'classes.mjs'), fs.readFileSync(new URL('../src/classes.js', import.meta.url), 'utf8'));
const { occursOn, classesOn, classAlerts, validateClass, validateTerm, describeDays, addMinutes, isPastClass, timetable, classStatus, sessionsInMonth } = await import(
  pathToFileURL(path.join(tmp, 'classes.mjs')).href
);
fs.writeFileSync(path.join(tmp, 'calendar.mjs'), fs.readFileSync(new URL('../src/i18n/en/calendar.js', import.meta.url), 'utf8'));
const { default: strings } = await import(pathToFileURL(path.join(tmp, 'calendar.mjs')).href);

// The module returns translation keys; render them with the English strings (same rules as src/i18n: {name}
// placeholders, { one, other } plurals) so the tests still check the text people see.
const en = (key, params) => {
  let v = key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), strings);
  assert.ok(v !== undefined, `missing English text for ${key}`);
  if (typeof v === 'object') v = params && params.count === 1 ? v.one : v.other;
  return params ? v.replace(/\{(\w+)\}/g, (m, n) => (params[n] !== undefined ? String(params[n]) : m)) : v;
};

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

// 2026-11-02 is a Monday
const MON = '2026-11-02';
const TUE = '2026-11-03';
const WED = '2026-11-04';
const term = { start: '2026-09-01', end: '2026-12-18' };

const once = { id: 'c1', title: 'Guest lecture', repeat: 'once', date: TUE, days: [], start: '14:00', end: '15:00', range: 'none' };
const weekly = { id: 'c2', title: 'Calculus II', repeat: 'weekly', date: null, days: [1, 3], start: '09:00', end: '10:30', range: 'none' };

test('a one-off class happens only on its date', () => {
  assert.equal(occursOn(once, TUE, null), true);
  assert.equal(occursOn(once, MON, null), false);
});

test('a weekly class happens on its weekdays only', () => {
  assert.equal(occursOn(weekly, MON, null), true);
  assert.equal(occursOn(weekly, WED, null), true);
  assert.equal(occursOn(weekly, TUE, null), false);
  assert.equal(occursOn(weekly, '2027-06-07', null), true); // no end date
});

test('a "term" class follows the shared term dates', () => {
  const c = { ...weekly, range: 'term' };
  assert.equal(occursOn(c, MON, term), true);
  assert.equal(occursOn(c, '2026-12-21', term), false); // Monday after the term
  assert.equal(occursOn(c, '2026-08-31', term), false); // Monday before it
  assert.equal(occursOn(c, '2026-12-21', { start: '2026-09-01', end: '2027-01-31' }), true); // moving the term moves the class
});

test('a "manual" class follows its own first and last day, inclusive', () => {
  const c = { ...weekly, range: 'manual', rangeStart: MON, rangeEnd: '2026-11-09' };
  assert.equal(occursOn(c, MON, null), true);
  assert.equal(occursOn(c, '2026-11-09', null), true);
  assert.equal(occursOn(c, '2026-11-16', null), false);
  assert.equal(occursOn(c, '2026-10-26', null), false);
});

test('classes on a day are sorted by start time, untimed ones last', () => {
  const late = { ...weekly, id: 'c3', title: 'Lab', start: '16:00', end: null };
  const untimed = { ...weekly, id: 'c4', title: 'Office hours', start: null, end: null };
  const early = { ...weekly, id: 'c5', title: 'Seminar', start: '08:00', end: '08:50' };
  assert.deepEqual(classesOn([late, untimed, weekly, early], MON, null).map((c) => c.title), ['Seminar', 'Calculus II', 'Lab', 'Office hours']);
});

test('validation: name, date or days, end after start', () => {
  assert.equal(validateClass({ ...once, title: '  ' }, null), 'classes.errors.name');
  assert.equal(en(validateClass({ ...once, title: '  ' }, null)), 'Enter a class name to continue');
  assert.equal(en(validateClass({ ...once, date: null }, null)), 'Pick a date to continue');
  assert.equal(en(validateClass({ ...weekly, days: [] }, null)), 'Pick at least one day');
  assert.equal(en(validateClass({ ...weekly, end: '09:00' }, null)), 'The class must end after it starts');
  assert.equal(validateClass(weekly, null), null);
  assert.equal(validateClass({ ...once, start: null, end: null }, null), null); // times are optional
});

test('validation: term and manual ranges need valid dates', () => {
  assert.equal(en(validateClass({ ...weekly, range: 'term' }, null)), 'Set your term dates to continue');
  assert.equal(validateClass({ ...weekly, range: 'term' }, term), null);
  assert.equal(en(validateClass({ ...weekly, range: 'manual', rangeStart: MON }, null)), 'Pick the first and last day of the class');
  assert.equal(en(validateClass({ ...weekly, range: 'manual', rangeStart: WED, rangeEnd: MON }, null)), 'The last day must be after the first day');
  assert.equal(en(validateTerm({ start: '2026-12-01', end: '2026-11-01' })), 'The term must end after it starts');
  assert.equal(en(validateTerm({ start: '2026-12-01' })), 'Pick the first and last day of the term');
  assert.equal(validateTerm(term), null);
});

test('reminders: 10 min before each timed class in the next week, soonest first', () => {
  const now = new Date(2026, 10, 2, 9, 5); // Monday 09:05, Calculus already started
  const alerts = classAlerts([weekly, once, { ...weekly, id: 'x', start: null }], null, now);
  assert.deepEqual(
    alerts.map((a) => `${a.date} ${a.cls.title} ${a.at.getHours()}:${String(a.at.getMinutes()).padStart(2, '0')}`),
    ['2026-11-03 Guest lecture 13:50', '2026-11-04 Calculus II 8:50']
  );
  // Monday 08:00: this Monday and Wednesday; next Monday is outside the 7-day window
  assert.equal(classAlerts([weekly], null, new Date(2026, 10, 2, 8, 0)).length, 2);
});

test('describeDays and addMinutes helpers', () => {
  assert.deepEqual(describeDays([3, 1]), { days: [1, 3] }); // sorted; the UI shows 'Mon, Wed'
  assert.deepEqual(describeDays([1, 2, 3, 4, 5]), { key: 'classes.days.weekdays' });
  assert.equal(en(describeDays([5, 4, 3, 2, 1]).key), 'Weekdays');
  assert.equal(en(describeDays([0, 1, 2, 3, 4, 5, 6]).key), 'Every day');
  assert.deepEqual(describeDays([0, 6]), { days: [0, 6] }); // the weekend is not "Weekdays"
  assert.equal(addMinutes('09:30', 60), '10:30');
  assert.equal(addMinutes('23:30', 60), '00:30');
});

test('a pausing vacation skips weekly classes; one-offs and "don’t pause" breaks do not', () => {
  const pause = [{ start: MON, end: TUE, pause: true }];
  assert.equal(occursOn(weekly, MON, null, pause), false);
  assert.equal(occursOn(weekly, WED, null, pause), true); // the day after the break
  assert.equal(occursOn(once, TUE, null, pause), true); // a one-off set on purpose still happens
  assert.equal(occursOn(weekly, MON, null, [{ start: MON, end: MON, pause: false }]), true);
  assert.equal(sessionsInMonth([weekly], '2026-11', null, pause), 8); // 9 sessions minus the paused Monday
  const now = new Date(2026, 10, 2, 7, 0);
  assert.deepEqual(classAlerts([weekly], null, now, { vacations: pause }).map((a) => a.date), [WED]);
});

test('a class is past once its last day is before today', () => {
  assert.equal(isPastClass(once, WED, null), true);
  assert.equal(isPastClass(once, TUE, null), false); // still today
  assert.equal(isPastClass(weekly, '2030-01-01', null), false); // open-ended
  assert.equal(isPastClass({ ...weekly, range: 'term' }, '2026-12-19', term), true);
  assert.equal(isPastClass({ ...weekly, range: 'manual', rangeStart: MON, rangeEnd: WED }, WED, null), false);
});

test('timetable groups weekly classes by weekday in week order, then one-offs, then past', () => {
  const lab = { ...weekly, id: 'c6', title: 'Lab', days: [0, 1], start: '08:00', end: '09:00' };
  const ended = { ...weekly, id: 'c7', title: 'Old seminar', range: 'manual', rangeStart: '2026-01-05', rangeEnd: '2026-03-30' };
  const later = { ...once, id: 'c8', title: 'Field trip', date: '2026-11-20' };
  const t = timetable([weekly, lab, ended, once, later], MON, null, 1); // week starts Monday
  assert.deepEqual(t.weeks.map((g) => [g.day, g.classes.map((c) => c.title)]), [
    [1, ['Lab', 'Calculus II']],
    [3, ['Calculus II']],
    [0, ['Lab']], // Sunday last when the week starts on Monday
  ]);
  assert.deepEqual(t.oneOffs.map((c) => c.title), ['Guest lecture', 'Field trip']);
  assert.deepEqual(t.past.map((c) => c.title), ['Old seminar']);
  assert.deepEqual(timetable([lab], MON, null, 0).weeks.map((g) => g.day), [0, 1]); // Sunday first
});

test('class status: done after it ends, now while it runs', () => {
  assert.equal(classStatus(weekly, '08:00'), null);
  assert.equal(classStatus(weekly, '09:30'), 'now');
  assert.equal(classStatus(weekly, '10:30'), 'done');
  assert.equal(classStatus({ ...weekly, start: null, end: null }, '23:00'), null);
});

test('sessions in a month count every occurrence', () => {
  // November 2026: 5 Mondays + 4 Wednesdays, plus the one-off on the 3rd
  assert.equal(sessionsInMonth([weekly, once], '2026-11', null), 10);
  assert.equal(sessionsInMonth([{ ...weekly, range: 'manual', rangeStart: MON, rangeEnd: '2026-11-09' }], '2026-11', null), 3);
});

console.log(`\n${pass} passed`);
