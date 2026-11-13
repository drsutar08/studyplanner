// Unit tests for cloud sync (rows, changes, merging). Pure logic, no server: `npm run test:sync`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-'));
fs.writeFileSync(path.join(tmp, 'sync.mjs'), fs.readFileSync(new URL('../src/cloud/sync.js', import.meta.url), 'utf8'));
const { stableJson, fingerprint, toRecords, diffRecords, applyRows, fromRows, baseAfterPush, dataAfterPush, merge3, DELETED, cloudShape } = await import(pathToFileURL(path.join(tmp, 'sync.mjs')).href);

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

const data = () => ({
  subjects: [{ id: 's1', name: 'Physics', color: '#00f' }],
  tasks: [
    { id: 't1', title: 'Essay', due: '2026-11-02', done: false },
    { id: 't2', title: 'Quiz prep', due: '2026-11-03', done: false },
  ],
  sessions: [],
  exams: [{ id: 'e1', title: 'Mid-term', date: '2026-11-10' }],
  recurring: [],
  classes: [],
  vacations: [],
  groups: [],
  archive: [],
  term: { start: '2026-09-01', end: '2026-12-18' },
  rotation: null,
});
const settings = { theme: 'dark', dailyGoal: 90, pushEnabled: true };
// a device that has synced everything
const synced = (d, s) => baseAfterPush({}, diffRecords({}, toRecords(d, s)));
const row = (kind, id, rowData, deleted = false) => ({ kind, id, data: deleted ? null : rowData, deleted });

test('the same data in any key order has the same fingerprint', () => {
  assert.equal(stableJson({ b: 1, a: [1, { d: 2, c: 3 }] }), '{"a":[1,{"c":3,"d":2}],"b":1}');
  assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
  assert.equal(fingerprint({ a: 1, x: undefined }), fingerprint({ a: 1 }), 'undefined fields don’t count');
});

test('data as rows: one per list item, the term and rotation, and the account’s settings without device ones', () => {
  const m = toRecords(data(), settings);
  assert.deepEqual([...m.keys()].sort(), ['exam:e1', 'singleton:settings', 'singleton:term', 'subject:s1', 'task:t1', 'task:t2']);
  assert.deepEqual(m.get('singleton:settings'), { theme: 'dark', dailyGoal: 90 }, 'pushEnabled stays on the device');
});

test('first sync sends everything; after that, only what changed', () => {
  const d = data();
  const first = diffRecords({}, toRecords(d, settings));
  assert.equal(first.upserts.length, 6, 'no row for the empty rotation');
  const base = baseAfterPush({}, first);
  assert.deepEqual(diffRecords(base, toRecords(d, settings)), { upserts: [], deletes: [] });
  const changed = { ...d, tasks: [{ ...d.tasks[0], done: true }, d.tasks[1]] };
  const diff = diffRecords(base, toRecords(changed, settings));
  assert.deepEqual(diff.upserts.map((u) => u.key), ['task:t1']);
  assert.equal(diff.deletes.length, 0);
});

test('a deleted item is sent once as a deletion', () => {
  const d = data();
  const base = synced(d, settings);
  const gone = { ...d, tasks: [d.tasks[1]] };
  const diff = diffRecords(base, toRecords(gone, settings));
  assert.deepEqual(diff.deletes.map((x) => x.key), ['task:t1']);
  const after = baseAfterPush(base, diff);
  assert.equal(after['task:t1'], DELETED);
  assert.deepEqual(diffRecords(after, toRecords(gone, settings)).deletes, [], 'not sent again');
});

test('a device-only setting changing sends nothing', () => {
  const d = data();
  const base = synced(d, settings);
  assert.equal(diffRecords(base, toRecords(d, { ...settings, pushEnabled: false })).upserts.length, 0);
});

test('rows from another device: added, changed and deleted items, term and settings', () => {
  const d = data();
  const base = synced(d, settings);
  const res = applyRows(d, [
    row('task', 't3', { id: 't3', title: 'New from laptop', due: '2026-11-04', done: false }),
    row('task', 't2', { id: 't2', title: 'Quiz prep', due: '2026-11-03', done: true }),
    row('exam', 'e1', null, true),
    row('singleton', 'term', { start: '2026-09-07', end: '2026-12-18' }),
    row('singleton', 'settings', { theme: 'light', dailyGoal: 90 }),
  ], base, settings);
  assert.deepEqual(res.data.tasks.map((x) => [x.id, x.done]), [['t1', false], ['t2', true], ['t3', false]]);
  assert.deepEqual(res.data.exams, []);
  assert.equal(res.data.term.start, '2026-09-07');
  assert.deepEqual(res.settings, { theme: 'light', dailyGoal: 90 });
  // what came in is now the base: nothing to send back
  const after = diffRecords(res.base, toRecords(res.data, { ...res.settings, pushEnabled: true }));
  assert.deepEqual([after.upserts.length, after.deletes.length], [0, 0]);
});

test('a local change not sent yet wins over the server’s older copy', () => {
  const d = data();
  const base = synced(d, settings);
  const local = { ...d, tasks: [{ ...d.tasks[0], title: 'Essay (edited here)' }, d.tasks[1]] };
  const res = applyRows(local, [row('task', 't1', { id: 't1', title: 'Essay (edited there)', due: '2026-11-02', done: false })], base, settings);
  assert.equal(res.data.tasks[0].title, 'Essay (edited here)');
  assert.deepEqual(diffRecords(res.base, toRecords(res.data, settings)).upserts.map((u) => u.key), ['task:t1'], 'and still goes up');
});

test('deleted here but changed there: stays deleted (and the deletion goes up)', () => {
  const d = data();
  const base = synced(d, settings);
  const local = { ...d, tasks: [d.tasks[1]] };
  const res = applyRows(local, [row('task', 't1', { id: 't1', title: 'Essay v2', due: '2026-11-02', done: false })], base, settings);
  assert.equal(res.data.tasks.length, 1);
  assert.deepEqual(diffRecords(res.base, toRecords(res.data, settings)).deletes.map((x) => x.key), ['task:t1']);
});

test('the same change on both sides is no conflict', () => {
  const d = data();
  const base = synced(d, settings);
  const same = { ...d.tasks[0], done: true };
  const local = { ...d, tasks: [same, d.tasks[1]] };
  const res = applyRows(local, [row('task', 't1', same)], base, settings);
  assert.deepEqual(diffRecords(res.base, toRecords(res.data, settings)).upserts, [], 'nothing left to send');
});

test('clearing the term goes up as a deletion, and comes down as an empty term', () => {
  const d = data();
  const base = synced(d, settings);
  const diff = diffRecords(base, toRecords({ ...d, term: null }, settings));
  assert.deepEqual(diff.deletes.map((x) => x.key), ['singleton:term']);
  const res = applyRows(d, [row('singleton', 'term', null, true)], base, settings);
  assert.equal(res.data.term, null);
});

test('merge3: fields changed on different sides both survive; the same field changed on both, this device wins', () => {
  const base = { id: 't', title: 'Essay', due: '2026-11-02', time: null, priority: 'med' };
  const mine = { ...base, time: '09:00', priority: 'high' };
  const theirs = { ...base, due: '2026-11-03', priority: 'low' };
  assert.deepEqual(merge3(base, mine, theirs), { id: 't', title: 'Essay', due: '2026-11-03', time: '09:00', priority: 'high' });
});

test('merge3: subtasks merge one by one (added on each side, ticked on each side, removed on one)', () => {
  const s = (id, title, done = false) => ({ id, title, done });
  const base = { id: 't', subtasks: [s('a', 'Read'), s('b', 'Notes'), s('c', 'Quiz')] };
  const mine = { id: 't', subtasks: [s('a', 'Read', true), s('b', 'Notes'), s('m', 'Mine')] }; // ticked a, removed c, added m
  const theirs = { id: 't', subtasks: [s('a', 'Read'), s('b', 'Notes', true), s('c', 'Quiz'), s('x', 'Theirs')] }; // ticked b, added x
  assert.deepEqual(merge3(base, mine, theirs).subtasks, [s('a', 'Read', true), s('b', 'Notes', true), s('m', 'Mine'), s('x', 'Theirs')]);
});

test('merge3: a field removed on one side, and a removed subtask the other side changed, are handled', () => {
  assert.deepEqual(merge3({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 2 }), { a: 1 }, 'removed here, untouched there: gone');
  const base = { subtasks: [{ id: 'a', title: 'Read', done: false }] };
  const mine = { subtasks: [] };
  const theirs = { subtasks: [{ id: 'a', title: 'Read', done: true }] };
  assert.deepEqual(merge3(base, mine, theirs).subtasks, [{ id: 'a', title: 'Read', done: true }], 'changed there since: kept');
});

test('two devices edit one task: the incoming row merges with the unsent local edit, and the merge goes up', () => {
  const d = data();
  const first = diffRecords({}, toRecords(d, settings));
  const base = baseAfterPush({}, first);
  const baseData = dataAfterPush({}, first);
  const local = { ...d, tasks: [{ ...d.tasks[0], time: '09:00' }, d.tasks[1]] }; // here: a time
  const theirs = { ...d.tasks[0], done: true }; // there: ticked done
  const res = applyRows(local, [row('task', 't1', theirs)], base, settings, baseData);
  assert.deepEqual([res.data.tasks[0].time, res.data.tasks[0].done], ['09:00', true]);
  const up = diffRecords(res.base, toRecords(res.data, settings)).upserts;
  assert.deepEqual(up.map((u) => [u.key, u.data.time, u.data.done]), [['task:t1', '09:00', true]]);
  // without the starting version (an older device), the local edit still wins as before
  const old = applyRows(local, [row('task', 't1', theirs)], base, settings, {});
  assert.deepEqual([old.data.tasks[0].time, old.data.tasks[0].done], ['09:00', false]);
});

test('a new device: all rows make the whole data; deletion markers are skipped; unknown kinds ignored', () => {
  const { data: d, settings: s } = fromRows([
    row('subject', 's1', { id: 's1', name: 'Physics', color: '#00f' }),
    row('task', 't1', { id: 't1', title: 'Essay' }),
    row('task', 't9', null, true),
    row('singleton', 'rotation', { type: 'days', length: 2, startDate: '2026-09-01' }),
    row('singleton', 'settings', { theme: 'dark' }),
    row('widget', 'w1', { id: 'w1' }),
  ]);
  assert.deepEqual([d.subjects.length, d.tasks.map((x) => x.id), d.exams, d.rotation.type, d.term], [1, ['t1'], [], 'days', null]);
  assert.deepEqual(s, { theme: 'dark' });
});

test('photos: the cloud gets only uploaded ones, as a path; this device keeps its pictures and waiting photos', () => {
  const pic = 'data:image/jpeg;base64,AAAA';
  const task = { id: 't1', title: 'Sheet', attachments: [{ id: 'l', kind: 'link', url: 'https://x.org', name: 'x.org' }, { id: 'p1', kind: 'photo', url: pic, path: 'u/p1.jpg', name: '' }, { id: 'p2', kind: 'photo', url: pic, name: '' }] };
  assert.deepEqual(cloudShape('task', task).attachments, [{ id: 'l', kind: 'link', url: 'https://x.org', name: 'x.org' }, { id: 'p1', kind: 'photo', path: 'u/p1.jpg', name: '' }]);
  const d = { ...data(), tasks: [task] };
  const base = synced(d, settings);
  // the photo's upload finishing changes nothing the cloud sees until it has its path
  assert.equal(diffRecords(base, toRecords(d, settings)).upserts.length, 0);
  // another device ticks the task done: the pictures and the waiting photo stay here
  const incoming = { ...cloudShape('task', task), done: true };
  const res = applyRows(d, [row('task', 't1', incoming)], base, settings);
  const got = res.data.tasks[0];
  assert.equal(got.done, true);
  assert.deepEqual(got.attachments.map((a) => [a.id, !!a.url, a.path || null]), [['l', true, null], ['p1', true, 'u/p1.jpg'], ['p2', true, null]]);
});

test('many rows at once: updates, deletions and new items, in order, the deleted one coming back', () => {
  const tasks = Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, title: `T${i}` }));
  const data = { tasks, subjects: [], sessions: [], exams: [], recurring: [], classes: [], vacations: [], groups: [], archive: [], term: null, rotation: null };
  const base = Object.fromEntries([...toRecords(data)].map(([k, v]) => [k, fingerprint(v)]));
  const rows = [
    { kind: 'task', id: 't1', data: null, deleted: true },
    { kind: 'task', id: 't3', data: { id: 't3', title: 'T3 edited' }, deleted: false },
    { kind: 'task', id: 't9', data: { id: 't9', title: 'New' }, deleted: false },
    { kind: 'task', id: 't4', data: null, deleted: true },
    { kind: 'task', id: 't1', data: { id: 't1', title: 'T1 back' }, deleted: false },
  ];
  const res = applyRows(data, rows, base, undefined);
  assert.deepEqual(res.data.tasks.map((t) => t.title), ['T0', 'T2', 'T3 edited', 'New', 'T1 back']);
  assert.equal(data.tasks.length, 5); // the data passed in is left alone
});

test('a record’s fingerprint is remembered, and a changed copy gets its own', () => {
  const r = { id: 'a', title: 'x' };
  assert.equal(fingerprint(r), fingerprint(r));
  assert.notEqual(fingerprint({ ...r, title: 'y' }), fingerprint(r));
  assert.equal(fingerprint({ title: 'x', id: 'a' }), fingerprint(r));
});

console.log(`sync: ${pass} passed`);
