// Unit tests for vacation (break) rules. Pure logic, no browser: `npm run test:vacations`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vacations-'));
fs.writeFileSync(path.join(tmp, 'vacations.mjs'), fs.readFileSync(new URL('../src/vacations.js', import.meta.url), 'utf8'));
const { PRESETS, vacationLength, presetEnd, presetOf, lengthLabel, vacationOn, pausedOn, validateVacation, breakStatus } = await import(
  pathToFileURL(path.join(tmp, 'vacations.mjs')).href
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

const winter = { id: 'v1', title: 'Winter break', start: '2026-12-19', end: '2027-01-03', pause: true };
const trip = { id: 'v2', title: 'Field trip', start: '2026-11-10', end: '2026-11-10', pause: false };

test('length counts both the first and last day, across months and years', () => {
  assert.equal(vacationLength('2026-10-29', '2026-10-29'), 1);
  assert.equal(vacationLength(winter.start, winter.end), 16);
});

test('presets: 1 day, 1 week and 2 weeks end on the right day', () => {
  assert.equal(presetEnd('2026-10-29', 'day'), '2026-10-29');
  assert.equal(presetEnd('2026-10-29', 'week'), '2026-11-04');
  assert.equal(presetEnd('2026-10-29', 'twoWeeks'), '2026-11-11');
  assert.equal(presetEnd('2026-10-29', 'custom'), null);
});

test('a start/end pair is recognised as its preset, otherwise custom', () => {
  assert.equal(presetOf('2026-10-29', '2026-11-04'), 'week');
  assert.equal(presetOf('2026-10-29', '2026-11-01'), 'custom');
});

test('length label reads naturally', () => {
  const label = (s, e) => {
    const { key, params } = lengthLabel(s, e);
    return en(key, params);
  };
  assert.deepEqual(lengthLabel('2026-10-29', '2026-11-11'), { key: 'vacations.length.weeks', params: { count: 2 } });
  assert.equal(label('2026-10-29', '2026-10-29'), '1 day');
  assert.equal(label('2026-10-29', '2026-11-01'), '4 days');
  assert.equal(label('2026-10-29', '2026-11-04'), '1 week');
  assert.equal(label('2026-10-29', '2026-11-11'), '2 weeks');
  assert.equal(label(winter.start, winter.end), '16 days'); // 16 is not a whole number of weeks
});

test('preset labels are translation keys with English text', () => {
  assert.deepEqual(PRESETS.map(([, key]) => en(key)), ['1 day', '1 week', '2 weeks', 'Custom']);
});

test('vacationOn / pausedOn: only a pausing break pauses', () => {
  assert.equal(vacationOn([winter, trip], '2027-01-01').id, 'v1');
  assert.equal(vacationOn([winter, trip], '2026-11-11'), null);
  assert.equal(pausedOn([winter, trip], '2026-12-19'), true);
  assert.equal(pausedOn([winter, trip], '2026-11-10'), false); // "Don't pause"
  assert.equal(pausedOn([], '2026-12-25'), false);
});

test('validation: name and a forward date range', () => {
  assert.equal(validateVacation({ title: ' ', start: '2026-11-01', end: '2026-11-02' }), 'vacations.errors.name');
  assert.equal(en(validateVacation({ title: ' ', start: '2026-11-01', end: '2026-11-02' })), 'Enter a name to continue');
  assert.equal(en(validateVacation({ title: 'X', start: '2026-11-01', end: null })), 'Pick the first and last day');
  assert.equal(en(validateVacation({ title: 'X', start: '2026-11-03', end: '2026-11-02' })), 'The last day must be on or after the first day');
  assert.equal(validateVacation({ title: 'X', start: '2026-11-02', end: '2026-11-02' }), null);
});

test('break status: on a break now, or counting down to the next one', () => {
  const during = breakStatus([trip, winter], '2027-01-02');
  assert.equal(during.current.id, 'v1');
  assert.equal(during.daysLeft, 2); // today and tomorrow
  const before = breakStatus([winter, trip], '2026-11-01');
  assert.equal(before.current, null);
  assert.equal(before.next.id, 'v2');
  assert.equal(before.daysUntil, 9);
});

console.log(`\n${pass} passed`);
