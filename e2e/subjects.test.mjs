// Unit tests for subject names and the subject card's numbers. Pure: `npm run test:subjects`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'subjects-'));
fs.writeFileSync(path.join(tmp, 'subjects.mjs'), fs.readFileSync(new URL('../src/subjects.js', import.meta.url), 'utf8'));
const { validateSubjectName, subjectSummary } = await import(pathToFileURL(path.join(tmp, 'subjects.mjs')).href);

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

const subjects = [{ id: 's1', name: 'Mathematics' }, { id: 's2', name: 'Biology' }];

test('a subject needs a name that is not already taken (case and spaces ignored)', () => {
  assert.equal(validateSubjectName('  ', subjects), 'subjects.errors.name');
  assert.equal(validateSubjectName('physics', subjects), null);
  assert.equal(validateSubjectName(' biology ', subjects), 'subjects.errors.duplicate');
  // renaming a subject may keep its own name, or change its case
  assert.equal(validateSubjectName('mathematics', subjects, 's1'), null);
  assert.equal(validateSubjectName('Biology', subjects, 's1'), 'subjects.errors.duplicate');
});

test("a subject's card: counts, focus this week, next task and exam, weekly classes", () => {
  const data = {
    tasks: [
      { id: 'a', subjectId: 's1', due: '2026-11-02', done: false },
      { id: 'b', subjectId: 's1', due: '2026-10-30', done: false, time: '17:00' },
      { id: 'c', subjectId: 's1', due: '2026-10-30', done: false, time: '09:00' },
      { id: 'd', subjectId: 's1', due: '2026-10-20', done: true },
      { id: 'e', subjectId: 's2', due: '2026-10-30', done: false },
    ],
    sessions: [
      { subjectId: 's1', date: '2026-10-29', minutes: 25 },
      { subjectId: 's1', date: '2026-10-01', minutes: 60 }, // not this week
      { subjectId: 's2', date: '2026-10-29', minutes: 30 },
    ],
    exams: [
      { id: 'x1', subjectId: 's1', date: '2026-10-01' }, // past
      { id: 'x2', subjectId: 's1', date: '2026-11-09' },
      { id: 'x3', subjectId: 's1', date: '2026-11-02' },
    ],
    classes: [
      { id: 'k1', subjectId: 's1', repeat: 'weekly', days: [1, 3] },
      { id: 'k2', subjectId: 's1', repeat: 'once', days: [] },
      { id: 'k3', subjectId: 's1', repeat: 'weekly', days: [5], kind: 'activity' },
    ],
  };
  const week = new Set(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
  const s = subjectSummary({ id: 's1' }, data, '2026-10-30', week);
  assert.equal(s.total, 4);
  assert.equal(s.done, 1);
  assert.equal(s.open, 3);
  assert.equal(s.nextTask.id, 'c'); // due today, the earlier time
  assert.equal(s.nextExam.id, 'x3');
  assert.equal(s.classesPerWeek, 2);
  assert.equal(s.weekMinutes, 25);
  const empty = subjectSummary({ id: 's9' }, data, '2026-10-30', week);
  assert.deepEqual([empty.total, empty.nextTask, empty.nextExam, empty.classesPerWeek], [0, null, null, 0]);
});

console.log(`\n${pass} passed`);
