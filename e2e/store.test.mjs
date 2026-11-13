// Unit tests for the data reducer (src/reducer.js). Pure logic, no browser: `npm run test:store`
// dates.js and clock.js are swapped for small stand-ins (they pull in translations / React); everything else is real.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'store-'));
const src = (f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const rewrite = (s) => s.replace(/from '\.\/([\w/]+)'/g, "from './$1.mjs'");
fs.mkdirSync(path.join(tmp, 'cloud'));
fs.writeFileSync(path.join(tmp, 'cloud', 'sync.mjs'), src('cloud/sync.js'));
for (const f of ['classes', 'attendance', 'vacations', 'subtasks', 'attachments', 'flashcards']) fs.writeFileSync(path.join(tmp, `${f}.mjs`), rewrite(src(`${f}.js`)));
fs.writeFileSync(
  path.join(tmp, 'dates.mjs'),
  `const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d = new Date()) => \`\${d.getFullYear()}-\${pad(d.getMonth() + 1)}-\${pad(d.getDate())}\`;
const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (key, n) => { const d = parse(key); d.setDate(d.getDate() + n); return dateKey(d); };
export const weekday = (key) => parse(key).getDay();
`
);
fs.writeFileSync(path.join(tmp, 'clock.mjs'), "export const hhmmNow = () => '12:00';\n");
fs.writeFileSync(path.join(tmp, 'reducer.mjs'), rewrite(src('reducer.js')));
const { reducer, initial } = await import(pathToFileURL(path.join(tmp, 'reducer.mjs')).href);
const { dateKey, addDays, weekday } = await import(pathToFileURL(path.join(tmp, 'dates.mjs')).href);

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

const today = dateKey();
const empty = { ...initial, ready: true };
const run = (state, ...actions) => actions.reduce((s, a) => reducer(s, a), state);
const withTask = (over = {}) => run(empty, { type: 'ADD_TASK', title: 'Essay', subjectId: null, due: today, estimate: 30, ...over });

test('ADD_TASK fills defaults; empty subtasks and attachments are left off', () => {
  const [tk] = withTask().tasks;
  assert.equal(tk.title, 'Essay');
  assert.equal(tk.priority, 'med');
  assert.equal(tk.done, false);
  assert.equal(tk.time, null);
  assert.ok(!('subtasks' in tk) && !('attachments' in tk));
  const [withAtt] = withTask({ attachments: [{ id: 'a', kind: 'link', url: 'https://x.org', name: 'x.org' }] }).tasks;
  assert.equal(withAtt.attachments.length, 1);
});

test('TOGGLE_TASK sets and clears completedAt', () => {
  let s = withTask();
  const id = s.tasks[0].id;
  s = reducer(s, { type: 'TOGGLE_TASK', id });
  assert.equal(s.tasks[0].done, true);
  assert.equal(s.tasks[0].completedAt, today);
  s = reducer(s, { type: 'TOGGLE_TASK', id });
  assert.equal(s.tasks[0].completedAt, null);
});

test('UPDATE_TASK keeps attachments and subtasks unless they are given', () => {
  let s = withTask({ attachments: [{ id: 'a', kind: 'link', url: 'https://x.org', name: 'x.org' }] });
  const id = s.tasks[0].id;
  s = reducer(s, { type: 'UPDATE_TASK', id, title: 'Essay v2', due: today, estimate: 45 });
  assert.equal(s.tasks[0].title, 'Essay v2');
  assert.equal(s.tasks[0].attachments.length, 1);
  s = reducer(s, { type: 'UPDATE_TASK', id, title: 'Essay v2', due: today, estimate: 45, attachments: [] });
  assert.deepEqual(s.tasks[0].attachments, []);
});

test('exam links: ADD_TASK / UPDATE_TASK / SET_TASK_EXAM set and clear examId; a prep plan link is dropped on change; deleting the exam unlinks', () => {
  let s = withTask({ examId: 'e1' });
  const id = s.tasks[0].id;
  assert.equal(s.tasks[0].examId, 'e1');
  assert.ok(!('examId' in withTask().tasks[0]));
  // an edit that doesn't send examId leaves the link; sending null clears it
  s = reducer(s, { type: 'UPDATE_TASK', id, title: 'Essay', due: today, estimate: 30 });
  assert.equal(s.tasks[0].examId, 'e1');
  s = reducer(s, { type: 'UPDATE_TASK', id, title: 'Essay', due: today, estimate: 30, examId: null });
  assert.equal(s.tasks[0].examId, undefined);
  // from the exam's side
  s = reducer(s, { type: 'SET_TASK_EXAM', ids: [id], examId: 'e2' });
  assert.equal(s.tasks[0].examId, 'e2');
  // a task made by a prep plan: moving it to another exam (or none) drops the plan's link; keeping the same exam keeps it
  s = { ...s, tasks: [{ ...s.tasks[0], examId: undefined, prepFor: 'e1' }] };
  assert.equal(reducer(s, { type: 'UPDATE_TASK', id, title: 'Essay', due: today, estimate: 30, examId: 'e1' }).tasks[0].prepFor, 'e1');
  assert.equal(reducer(s, { type: 'SET_TASK_EXAM', ids: [id], examId: 'e2' }).tasks[0].prepFor, undefined);
  assert.equal(reducer(s, { type: 'SET_TASK_EXAM', ids: [id], examId: null }).tasks[0].prepFor, undefined);
  // deleting the exam keeps the task, unlinked
  let d = { ...withTask({ examId: 'e1' }), exams: [{ id: 'e1', title: 'X', date: today }] };
  d = reducer(d, { type: 'DELETE_EXAM', id: 'e1' });
  assert.equal(d.tasks.length, 1);
  assert.equal(d.tasks[0].examId, undefined);
});

test('MOVE_TASK changes the day, keeps the time unless one is given', () => {
  let s = withTask({ time: '09:00' });
  const id = s.tasks[0].id;
  s = reducer(s, { type: 'MOVE_TASK', id, due: addDays(today, 2) });
  assert.deepEqual([s.tasks[0].due, s.tasks[0].time], [addDays(today, 2), '09:00']);
  s = reducer(s, { type: 'MOVE_TASK', id, due: addDays(today, 3), time: '14:30' });
  assert.deepEqual([s.tasks[0].due, s.tasks[0].time], [addDays(today, 3), '14:30']);
  assert.ok(!('movedFrom' in s.tasks[0]), 'only repeat copies remember where they came from');
});

test('a moved copy of a repeating task is not made again on its old day', () => {
  let s = run(empty, { type: 'ADD_RECURRING', title: 'Flashcards', subjectId: null, estimate: 20, days: [0, 1, 2, 3, 4, 5, 6], startDate: today });
  const copies = () => s.tasks.filter((x) => x.recurId === s.recurring[0].id);
  assert.equal(copies().length, 14, 'two weeks of copies');
  const tomorrow = copies().find((x) => x.due === addDays(today, 1));
  s = reducer(s, { type: 'MOVE_TASK', id: tomorrow.id, due: addDays(today, 3) });
  assert.equal(s.tasks.find((x) => x.id === tomorrow.id).movedFrom, addDays(today, 1));
  // re-planning (a break added and removed) regenerates copies: the old day must stay free
  s = run(s, { type: 'ADD_VACATION', title: 'Off', start: addDays(today, 20), end: addDays(today, 21) });
  s = reducer(s, { type: 'MATERIALIZE' });
  assert.equal(copies().filter((x) => x.due === addDays(today, 1)).length, 0, 'no new copy on the day it was moved from');
  assert.equal(copies().filter((x) => x.due === addDays(today, 3)).length, 2, 'the moved one plus that day’s own copy');
});

test('repeating copies skip paused break days, and a new break removes copies on its days', () => {
  let s = run(empty, { type: 'ADD_RECURRING', title: 'Reading', subjectId: null, estimate: 20, days: [0, 1, 2, 3, 4, 5, 6], startDate: today });
  const n = () => s.tasks.filter((x) => x.recurId).length;
  assert.equal(n(), 14);
  s = reducer(s, { type: 'ADD_VACATION', title: 'Break', start: addDays(today, 2), end: addDays(today, 4) });
  assert.equal(n(), 11);
  assert.ok(!s.tasks.some((x) => x.recurId && x.due >= addDays(today, 2) && x.due <= addDays(today, 4)));
  const vid = s.vacations[0].id;
  s = reducer(s, { type: 'DELETE_VACATION', id: vid });
  assert.equal(n(), 14, 'deleting the break brings them back');
});

test('several tasks at once: complete, move (repeat copies remember their day), delete, and undo', () => {
  let s = run(
    empty,
    { type: 'ADD_TASK', title: 'A', subjectId: null, due: today, estimate: 10 },
    { type: 'ADD_TASK', title: 'B', subjectId: null, due: today, estimate: 10 },
    { type: 'ADD_TASK', title: 'C', subjectId: null, due: today, estimate: 10 },
    { type: 'ADD_RECURRING', title: 'R', subjectId: null, estimate: 10, days: [0, 1, 2, 3, 4, 5, 6], startDate: today }
  );
  const [a, b, c] = s.tasks;
  const rCopy = s.tasks.find((x) => x.recurId && x.due === addDays(today, 1));
  s = reducer(s, { type: 'COMPLETE_TASKS', ids: [a.id, b.id] });
  assert.deepEqual(s.tasks.slice(0, 3).map((x) => [x.done, x.completedAt]), [[true, today], [true, today], [false, null]]);
  const doneAgain = reducer(s, { type: 'COMPLETE_TASKS', ids: [a.id] });
  assert.equal(doneAgain.tasks[0], s.tasks[0], 'a done task stays as it was (not toggled back)');
  const before = s.tasks;
  s = reducer(s, { type: 'MOVE_TASKS', ids: [c.id, rCopy.id], due: addDays(today, 5) });
  assert.equal(s.tasks.find((x) => x.id === c.id).due, addDays(today, 5));
  assert.equal(s.tasks.find((x) => x.id === rCopy.id).movedFrom, addDays(today, 1));
  s = reducer(s, { type: 'RESTORE_LISTS', lists: { tasks: before } });
  assert.equal(s.tasks.find((x) => x.id === c.id).due, today, 'undo puts them back');
  s = reducer(s, { type: 'DELETE_TASKS', ids: [a.id, c.id] });
  assert.deepEqual(s.tasks.filter((x) => !x.recurId).map((x) => x.title), ['B']);
});

test('archive: old done tasks leave the lists in short form; restore brings them back to stay; clear empties it', () => {
  const longAgo = addDays(today, -90);
  let s = { ...empty, tasks: [
    { id: 'old', title: 'Old essay', subjectId: 's1', due: longAgo, done: true, completedAt: longAgo, estimate: 30, priority: 'high', notes: 'long notes', subtasks: [{ id: 'x', title: 'a', done: true }], attachments: [{ id: 'p', kind: 'photo', url: 'data:image/jpeg;base64,AAAA' }] },
    { id: 'recent', title: 'Recent', subjectId: null, due: addDays(today, -5), done: true, completedAt: addDays(today, -5), estimate: 20, priority: 'med' },
    { id: 'open', title: 'Still open', subjectId: null, due: longAgo, done: false, completedAt: null, estimate: 20, priority: 'med' },
  ] };
  s = reducer(s, { type: 'ARCHIVE_DONE', before: addDays(today, -60) });
  assert.deepEqual(s.tasks.map((x) => x.id), ['recent', 'open'], 'an open overdue task is never archived');
  assert.deepEqual(s.archive, [{ id: 'old', title: 'Old essay', subjectId: 's1', due: longAgo, completedAt: longAgo, estimate: 30, priority: 'high' }]);
  assert.equal(reducer(s, { type: 'ARCHIVE_DONE', before: addDays(today, -60) }), s, 'nothing more to move: same state');
  s = reducer(s, { type: 'RESTORE_ARCHIVED', all: true });
  assert.equal(s.archive.length, 0);
  const back = s.tasks.find((x) => x.id === 'old');
  assert.deepEqual([back.done, back.kept, back.title], [true, true, 'Old essay']);
  assert.equal(reducer(s, { type: 'ARCHIVE_DONE', before: addDays(today, -60) }).tasks.length, 3, 'a restored task is not archived again');
  s = { ...s, archive: [{ id: 'z', title: 'Z', due: longAgo, completedAt: longAgo }] };
  const before = s.archive;
  s = reducer(s, { type: 'CLEAR_ARCHIVE' });
  assert.deepEqual(s.archive, []);
  assert.deepEqual(reducer(s, { type: 'RESTORE_LISTS', lists: { archive: before } }).archive, before, 'undo of clearing');
});

test('cloud: rows from another device merge in; the same rows again change nothing (same state)', () => {
  let s = withTask();
  const [mine] = s.tasks;
  const base = { [`task:${mine.id}`]: 'x-old' }; // synced long ago, changed here since: pending
  s = reducer(s, {
    type: 'APPLY_REMOTE',
    base,
    rows: [
      { kind: 'task', id: 'laptop1', data: { id: 'laptop1', title: 'From laptop', subjectId: null, due: today, estimate: 15, done: false }, deleted: false },
      { kind: 'task', id: mine.id, data: { ...mine, title: 'Older copy' }, deleted: false },
      { kind: 'singleton', id: 'term', data: { start: '2026-09-01', end: '2026-12-18' }, deleted: false },
    ],
  });
  assert.deepEqual(s.tasks.map((x) => x.title), ['Essay', 'From laptop'], 'the local change is kept');
  assert.equal(s.term.start, '2026-09-01');
  const again = reducer(s, { type: 'APPLY_REMOTE', base: {}, rows: [{ kind: 'task', id: 'laptop1', data: s.tasks[1], deleted: false }] });
  assert.equal(again, s, 'nothing new: the same state object');
});

test('repeating-task copies get the same id on every device (template @ day)', () => {
  const s = run(empty, { type: 'ADD_RECURRING', title: 'Flashcards', subjectId: null, estimate: 20, days: [0, 1, 2, 3, 4, 5, 6], startDate: today });
  const r = s.recurring[0];
  assert.ok(s.tasks.every((x) => x.id === `${r.id}@${x.due}`));
});

test('MOVE_EXAM and MOVE_CLASS (one-off only; weekly classes stay put)', () => {
  let s = run(
    empty,
    { type: 'ADD_EXAM', title: 'Quiz', date: today, time: '10:00', duration: 30 },
    { type: 'ADD_CLASS', title: 'Talk', repeat: 'once', date: today, start: '15:00', end: '16:00' },
    { type: 'ADD_CLASS', title: 'Maths', repeat: 'weekly', days: [weekday(today)], start: '09:00', end: '10:00' }
  );
  const [ex] = s.exams;
  const [talk, maths] = s.classes;
  s = run(s, { type: 'MOVE_EXAM', id: ex.id, date: addDays(today, 1) }, { type: 'MOVE_CLASS', id: talk.id, date: addDays(today, 2), start: '17:00', end: '18:00' }, { type: 'MOVE_CLASS', id: maths.id, date: addDays(today, 2) });
  assert.deepEqual([s.exams[0].date, s.exams[0].time], [addDays(today, 1), '10:00']);
  assert.deepEqual([s.classes[0].date, s.classes[0].start, s.classes[0].end], [addDays(today, 2), '17:00', '18:00']);
  assert.equal(s.classes[1].date, null, 'a weekly class has no single date to move');
});

test('IMPORT_RECORDS adds a batch with its own ids; UNDO_IMPORT takes exactly that batch out', () => {
  let s = run(empty, { type: 'ADD_EXAM', title: 'Mine', date: today });
  s = reducer(s, {
    type: 'IMPORT_RECORDS',
    batch: 'ics1',
    classes: [{ title: 'Chem', repeat: 'weekly', days: [1, 4], start: '11:00', end: '12:00', range: 'none' }],
    exams: [{ title: 'Final', date: addDays(today, 30), time: null }],
    vacations: [{ title: 'Winter', start: addDays(today, 40), end: addDays(today, 45) }],
  });
  assert.deepEqual([s.classes.length, s.exams.length, s.vacations.length], [1, 2, 1]);
  assert.deepEqual([s.classes[0].id, s.exams[1].id, s.vacations[0].id], ['ics1-1', 'ics1-2', 'ics1-3']);
  assert.equal(s.classes[0].mode, 'inPerson', 'imported classes go through the same field rules');
  s = reducer(s, { type: 'UNDO_IMPORT', batch: 'ics1' });
  assert.deepEqual([s.classes.length, s.exams.length, s.vacations.length], [0, 1, 0]);
  assert.equal(s.exams[0].title, 'Mine');
});

test('study groups: join adds the records and remembers the group; a newer link replaces them; leave removes them', () => {
  const plan = (batch, title) => ({
    subjects: [{ id: `${batch}-s1`, name: 'Chemistry', color: '#123456' }],
    classes: [{ id: `${batch}-c1`, title, subjectId: `${batch}-s1`, repeat: 'weekly', days: [2], start: '10:00', end: '11:00', range: 'none' }],
    exams: [{ id: `${batch}-e2`, title: 'Chem quiz', subjectId: `${batch}-s1`, date: addDays(today, 9) }],
    vacations: [],
    rotation: { type: 'days', length: 2, startDate: today, schoolDays: [1, 2, 3, 4, 5] },
  });
  let s = run(empty, { type: 'ADD_SUBJECT', name: 'Mine', color: '#000' });
  s = reducer(s, { type: 'JOIN_GROUP', group: { id: 'g1', name: 'Chem group', batch: 'grpA' }, plan: plan('grpA', 'Chem') });
  assert.deepEqual([s.subjects.length, s.classes.length, s.exams.length, s.groups.length], [2, 1, 1, 1]);
  assert.equal(s.classes[0].subjectId, 'grpA-s1', 'the class points at the subject that came with it');
  assert.equal(s.rotation.type, 'days', 'adopted: there was none');
  // my own task on the group's subject
  s = reducer(s, { type: 'ADD_TASK', title: 'Revise', subjectId: 'grpA-s1', due: today, estimate: 20 });
  // a newer link from the same group
  s = reducer(s, { type: 'JOIN_GROUP', group: { id: 'g1', name: 'Chem group', batch: 'grpB' }, plan: { ...plan('grpB', 'Chem v2'), rotation: { type: 'weeks', length: 2, startDate: today } } });
  assert.deepEqual(s.classes.map((c) => c.title), ['Chem v2']);
  assert.deepEqual([s.groups.length, s.groups[0].batch], [1, 'grpB']);
  assert.equal(s.rotation.type, 'days', 'an existing rotation is kept');
  assert.equal(s.tasks[0].subjectId, null, 'a task on a removed subject keeps going without it');
  const before = s;
  s = reducer(s, { type: 'LEAVE_GROUP', id: 'g1' });
  assert.deepEqual([s.subjects.map((x) => x.name), s.classes.length, s.exams.length, s.groups.length], [['Mine'], 0, 0, 0]);
  // Undo puts the lists back as they were
  s = reducer(s, { type: 'RESTORE_LISTS', lists: { subjects: before.subjects, classes: before.classes, exams: before.exams, vacations: before.vacations, groups: before.groups } });
  assert.deepEqual([s.classes.length, s.groups[0].name], [1, 'Chem group']);
  assert.equal(reducer(s, { type: 'LEAVE_GROUP', id: 'nope' }), s);
});

test('UPDATE_SUBJECT sets and clears the weekly goal, keeping name and colour', () => {
  let s = run(empty, { type: 'ADD_SUBJECT', name: 'Physics', color: '#00f', weeklyGoal: 120 });
  const id = s.subjects[0].id;
  assert.equal(s.subjects[0].weeklyGoal, 120);
  s = reducer(s, { type: 'UPDATE_SUBJECT', id, name: 'Physics II' });
  assert.deepEqual([s.subjects[0].name, s.subjects[0].color, s.subjects[0].weeklyGoal], ['Physics II', '#00f', 120]);
  s = reducer(s, { type: 'UPDATE_SUBJECT', id, weeklyGoal: 0 });
  assert.ok(!('weeklyGoal' in s.subjects[0]));
});

test('DELETE_SUBJECT unlinks its tasks and classes', () => {
  let s = run(empty, { type: 'ADD_SUBJECT', name: 'Art', color: '#f0f' });
  const sid = s.subjects[0].id;
  s = run(s, { type: 'ADD_TASK', title: 'Sketch', subjectId: sid, due: today, estimate: 30 }, { type: 'ADD_CLASS', title: 'Art', subjectId: sid, repeat: 'once', date: today });
  s = reducer(s, { type: 'DELETE_SUBJECT', id: sid });
  assert.deepEqual([s.subjects.length, s.tasks[0].subjectId, s.classes[0].subjectId], [0, null, null]);
});

test('attendance: one session, then many at once and undone', () => {
  let s = run(empty, { type: 'ADD_CLASS', title: 'Bio', repeat: 'weekly', days: [1], start: '09:00', end: '10:00' });
  const id = s.classes[0].id;
  s = reducer(s, { type: 'MARK_ATTENDANCE', id, date: '2026-10-26', status: 'attended' });
  assert.equal(s.classes[0].attendance['2026-10-26'], 'attended');
  s = reducer(s, { type: 'MARK_ATTENDANCE', id, date: '2026-10-26', status: 'attended' });
  assert.ok(!s.classes[0].attendance['2026-10-26'], 'the same status again clears it');
  const items = [{ id, date: '2026-10-19' }, { id, date: '2026-10-12' }];
  s = reducer(s, { type: 'SET_ATTENDANCE_MANY', items, status: 'attended' });
  assert.equal(Object.keys(s.classes[0].attendance).length, 2);
  s = reducer(s, { type: 'SET_ATTENDANCE_MANY', items, status: null });
  assert.equal(Object.keys(s.classes[0].attendance).length, 0);
});

test('a scored exam counts as attended; exam attendance toggles', () => {
  let s = run(empty, { type: 'ADD_EXAM', title: 'Test', date: '2026-10-01', score: 18, outOf: 20 });
  assert.equal(s.exams[0].attendance, 'attended');
  s = run(empty, { type: 'ADD_EXAM', title: 'Test', date: '2026-10-01' });
  const id = s.exams[0].id;
  s = reducer(s, { type: 'MARK_EXAM_ATTENDANCE', id, status: 'missed' });
  assert.equal(s.exams[0].attendance, 'missed');
  s = reducer(s, { type: 'MARK_EXAM_ATTENDANCE', id, status: 'missed' });
  assert.ok(!('attendance' in s.exams[0]));
});

test('sessions: log (with a given day), delete and restore', () => {
  let s = run(empty, { type: 'LOG_SESSION', minutes: 25, subjectId: null, date: '2026-10-20', at: '08:15' });
  const [sess] = s.sessions;
  assert.deepEqual([sess.date, sess.minutes, sess.at], ['2026-10-20', 25, '08:15']);
  s = reducer(s, { type: 'DELETE_SESSION', id: sess.id });
  assert.equal(s.sessions.length, 0);
  s = reducer(s, { type: 'RESTORE_SESSION', session: sess });
  s = reducer(s, { type: 'RESTORE_SESSION', session: sess });
  assert.equal(s.sessions.length, 1, 'restoring twice does not duplicate');
});

test('REPLACE_DATA swaps everything in, with missing lists as empty', () => {
  const s = reducer(withTask(), { type: 'REPLACE_DATA', data: { subjects: [], tasks: [], sessions: [] } });
  assert.deepEqual([s.tasks.length, s.exams, s.classes, s.term, s.rotation], [0, [], [], null, null]);
});

test('an unknown action leaves the state as it was', () => {
  const s = withTask();
  assert.equal(reducer(s, { type: 'NOPE' }), s);
});

test('flashcards: added, reviewed on a schedule, edited, deleted and restored', () => {
  const card = { id: 'k1', subjectId: 'm', front: 'Q', back: 'A', due: '2026-11-02', interval: 0, ease: 2.5, reps: 0, lapses: 0, createdAt: '2026-11-02', reviewedAt: null };
  let s = reducer(empty, { type: 'ADD_CARDS', cards: [card] });
  s = reducer(s, { type: 'REVIEW_CARD', id: 'k1', grade: 'good', today: '2026-11-02' });
  assert.deepEqual([s.cards[0].reps, s.cards[0].interval, s.cards[0].due, s.cards[0].reviewedAt], [1, 1, '2026-11-03', '2026-11-02']);
  s = reducer(s, { type: 'UPDATE_CARD', id: 'k1', patch: { back: 'A, better' } });
  assert.equal(s.cards[0].back, 'A, better');
  const gone = reducer(s, { type: 'DELETE_CARD', id: 'k1' });
  assert.equal(gone.cards.length, 0);
  assert.equal(reducer(gone, { type: 'RESTORE_CARD', card: s.cards[0] }).cards[0].back, 'A, better');
});

test('deleting a subject keeps its flashcards, without the subject', () => {
  const s = { ...empty, subjects: [{ id: 'm', name: 'Maths' }], cards: [{ id: 'k1', subjectId: 'm', front: 'Q', back: 'A', due: '2026-11-02' }] };
  assert.equal(reducer(s, { type: 'DELETE_SUBJECT', id: 'm' }).cards[0].subjectId, null);
});

console.log(`store: ${pass} passed`);
