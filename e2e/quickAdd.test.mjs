// Unit tests for quick add (a task from one line). Pure logic: `node e2e/quickAdd.test.mjs`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'quickAdd-'));
fs.writeFileSync(path.join(tmp, 'quickAdd.mjs'), fs.readFileSync(new URL('../src/quickAdd.js', import.meta.url), 'utf8'));
const { parseQuickAdd } = await import(pathToFileURL(path.join(tmp, 'quickAdd.mjs')).href);
// the words from each language's i18n quickAdd block
const lang = async (code) => {
  const f = path.join(tmp, `manage-${code}.mjs`);
  fs.writeFileSync(f, fs.readFileSync(new URL(`../src/i18n/${code}/manage.js`, import.meta.url), 'utf8'));
  const q = (await import(pathToFileURL(f).href)).default.quickAdd;
  const list = (s) => s.split('|').map((x) => x.trim().toLowerCase()).filter(Boolean);
  return { today: list(q.wToday), tomorrow: list(q.wTomorrow), weekdays: q.wWeekdays.split(';').map(list), minutes: list(q.wMinutes), hours: list(q.wHours), before: list(q.wBefore), at: list(q.wAt) };
};

let pass = 0;
const test = async (name, fn) => {
  try {
    await fn();
    pass += 1;
    console.log('  PASS', name);
  } catch (e) {
    console.log('  FAIL', name, '\n      ', e.message);
    process.exitCode = 1;
  }
};
const today = '2026-11-02'; // a Monday
const subjects = [
  { id: 'phy', name: 'Physics' },
  { id: 'math', name: 'Mathematics' },
  { id: 'cs', name: 'Computer Science' },
];
const en = await lang('en');
const p = (text, words = en) => parseQuickAdd(text, { today, subjects, words, defaultMinutes: 25 });

await test('a plain title is due today, with the default length and no subject', () => {
  assert.deepEqual(p('Read chapter 4'), { title: 'Read chapter 4', due: today, time: null, estimate: 25, priority: 'med', subjectId: null, found: {} });
});

await test('day, length and priority come out of the title; a named subject stays in it', () => {
  const r = p('Physics worksheet tomorrow 45 min !');
  assert.equal(r.title, 'Physics worksheet');
  assert.equal(r.due, '2026-11-03');
  assert.equal(r.estimate, 45);
  assert.equal(r.priority, 'high');
  assert.equal(r.subjectId, 'phy');
});

await test('weekdays mean the coming one (today included), with "on"/"by" taken too', () => {
  assert.equal(p('Essay draft by fri').due, '2026-11-06');
  assert.equal(p('Essay draft by fri').title, 'Essay draft');
  assert.equal(p('Lab report on Sunday').due, '2026-11-08');
  assert.equal(p('Revise monday').due, today);
});

await test('times and hours: "5pm", "at 17:30", "1.5 h"', () => {
  assert.equal(p('Group call 5pm').time, '17:00');
  const r = p('Mock test at 17:30 1.5 h');
  assert.equal(r.time, '17:30');
  assert.equal(r.estimate, 90);
  assert.equal(r.title, 'Mock test');
  const v = p('Call grandma at 6 p.m. tomorrow'); // as speech recognition writes it
  assert.equal(v.time, '18:00');
  assert.equal(v.title, 'Call grandma');
});

await test('#tag picks a subject by the start of its name and leaves the title', () => {
  const r = p('Past paper #math');
  assert.equal(r.subjectId, 'math');
  assert.equal(r.title, 'Past paper');
  assert.equal(p('Project #computer').subjectId, 'cs');
  assert.equal(p('Tweet about #hashtags').title, 'Tweet about #hashtags'); // no such subject: left alone
});

await test('a word only counts on its own: "Monday notes" yes, "Todays" no, numbers in titles stay', () => {
  assert.equal(p('Todays plan').due, today);
  assert.equal(p('Todays plan').title, 'Todays plan');
  assert.equal(p('Chapter 12 questions').title, 'Chapter 12 questions');
  assert.equal(p('Chapter 12 questions').estimate, 25);
});

await test('lengths are kept between 5 minutes and 10 hours', () => {
  assert.equal(p('Quick look 2 min').estimate, 5);
  assert.equal(p('Marathon 20 h').estimate, 600);
});

await test('other languages: Hindi and Spanish words', async () => {
  const hi = await lang('hi');
  const r = parseQuickAdd('भौतिकी अभ्यास कल 30 मिनट', { today, subjects: [{ id: 'b', name: 'भौतिकी' }], words: hi });
  assert.equal(r.due, '2026-11-03');
  assert.equal(r.estimate, 30);
  assert.equal(r.subjectId, 'b');
  assert.equal(r.title, 'भौतिकी अभ्यास');
  const es = await lang('es');
  const s = parseQuickAdd('Ensayo de historia mañana 1 h', { today, subjects, words: es });
  assert.equal(s.due, '2026-11-03');
  assert.equal(s.estimate, 60);
  assert.equal(s.title, 'Ensayo de historia');
  assert.equal(parseQuickAdd('Repasar el viernes', { today, subjects, words: es }).due, '2026-11-06');
});

console.log(`\n${pass} passed`);
