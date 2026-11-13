// Unit tests for bringing data from the older (on-device accounts) version into a cloud account: `npm run test:legacy`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-'));
fs.writeFileSync(path.join(tmp, 'legacyImport.mjs'), fs.readFileSync(new URL('../src/legacyImport.js', import.meta.url), 'utf8'));
const { mergeLegacy, legacyCounts } = await import(pathToFileURL(path.join(tmp, 'legacyImport.mjs')).href);

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

// both start from the same starter data (ids s1, t1…): the old one has more
const current = {
  subjects: [{ id: 's1', name: 'Mathematics', color: '#f00' }],
  tasks: [{ id: 't1', title: 'Problem set 4', subjectId: 's1', due: '2026-10-31' }],
  sessions: [], exams: [], recurring: [], classes: [], vacations: [], archive: [], groups: [{ id: 'g' }],
  term: null, rotation: null,
};
const old = {
  subjects: [{ id: 's1', name: 'mathematics', color: '#0f0' }, { id: 's2', name: 'Biology', color: '#0ff' }],
  tasks: [
    { id: 't1', title: 'Problem set 4', subjectId: 's1', due: '2026-10-31' },
    { id: 't2', title: 'Lab report', subjectId: 's2', due: '2026-11-02', classId: 'c1' },
    { id: 't9', title: 'Flashcards', subjectId: 's2', due: '2026-11-03', recurId: 'r1' },
  ],
  sessions: [{ id: 'x1', date: '2026-10-20', minutes: 25, subjectId: 's2', taskId: 't2' }, { id: 'x2', date: '2026-10-21', minutes: 30, subjectId: 's1', taskId: 't1' }],
  exams: [{ id: 'e1', title: 'Bio test', subjectId: 's2', date: '2026-11-10' }],
  recurring: [{ id: 'r1', title: 'Flashcards', subjectId: 's2', days: [1, 3], generatedUntil: '2026-11-10' }],
  classes: [{ id: 'c1', title: 'Biology', subjectId: 's2', repeat: 'weekly', days: [2] }],
  vacations: [{ id: 'v1', title: 'Break', start: '2026-12-20', end: '2026-12-31' }],
  term: { start: '2026-09-01', end: '2026-12-18' },
};
const { data, added } = mergeLegacy(current, old);

test('subjects with the same name become one; new ones come in with their own id', () => {
  assert.deepEqual(data.subjects.map((s) => [s.id, s.name]), [['s1', 'Mathematics'], ['old-s2', 'Biology']]);
});

test('a task already here is skipped; the others keep their links under new ids', () => {
  assert.deepEqual(data.tasks.map((t) => t.id), ['t1', 'old-t2', 'old-t9']);
  const lab = data.tasks.find((t) => t.id === 'old-t2');
  assert.deepEqual([lab.subjectId, lab.classId], ['old-s2', 'old-c1']);
  assert.equal(data.tasks.find((t) => t.id === 'old-t9').recurId, 'old-r1');
  assert.equal(data.recurring[0].generatedUntil, null, 'the repeat plans its copies again');
});

test('sessions follow their tasks, including one that was already here', () => {
  assert.deepEqual(data.sessions.map((s) => [s.id, s.taskId, s.subjectId]), [['old-x1', 'old-t2', 'old-s2'], ['old-x2', 't1', 's1']]);
});

test('exams, classes and breaks come in; the term is taken when there is none; groups stay', () => {
  assert.deepEqual([data.exams[0].id, data.exams[0].subjectId, data.classes[0].id, data.vacations[0].id], ['old-e1', 'old-s2', 'old-c1', 'old-v1']);
  assert.equal(data.term.start, '2026-09-01');
  assert.deepEqual(data.groups, [{ id: 'g' }]);
  assert.equal(added, 9);
  assert.equal(mergeLegacy({ ...current, term: { start: 'a', end: 'b' } }, old).data.term.start, 'a', 'an existing term is kept');
});

test('nothing in the current data is changed or lost', () => {
  assert.deepEqual(data.tasks[0], current.tasks[0]);
  assert.equal(current.tasks.length, 1, 'the input is not changed');
  assert.deepEqual(legacyCounts(old), { tasks: 3, exams: 1, classes: 1, sessions: 2 });
});

console.log(`legacyImport: ${pass} passed`);
