// Unit tests for shared group tasks and the board's order. Pure logic: `npm run test:grouptasks`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grouptasks-'));
fs.writeFileSync(path.join(tmp, 'groupTasks.mjs'), fs.readFileSync(new URL('../src/groupTasks.js', import.meta.url), 'utf8'));
const { reconcileGroupTasks, boardNotes, boardTasks } = await import(pathToFileURL(path.join(tmp, 'groupTasks.mjs')).href);

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
const post = (id, over = {}) => ({ id, group_id: 'g', kind: 'task', title: `Task ${id}`, body: '', due: '2026-11-10', estimate: 45, ...over });
const group = { id: 'g', name: 'Physics' };

test('a new shared task becomes a copy of the member’s own', () => {
  const r = reconcileGroupTasks({ tasks: [], group, posts: [post('a'), { id: 'n', group_id: 'g', kind: 'note', body: 'hi' }, post('x', { group_id: 'other' })] });
  assert.equal(r.add.length, 1);
  assert.deepEqual({ ...r.add[0] }, { id: 'gt-a', title: 'Task a', subjectId: null, due: '2026-11-10', time: null, notes: '', estimate: 45, priority: 'med', done: false, completedAt: null, groupTaskId: 'a', fromGroup: 'g' });
  assert.deepEqual(r.copied, ['a']);
});

test('nothing to do when the copies match', () => {
  const copy = { id: 'gt-a', title: 'Task a', due: '2026-11-10', notes: '', estimate: 45, done: false, groupTaskId: 'a', fromGroup: 'g' };
  assert.equal(reconcileGroupTasks({ tasks: [copy], group: { ...group, copied: ['a'] }, posts: [post('a')] }), null);
});

test('the owner’s edits reach copies not done yet; done ones stay as they were', () => {
  const open = { id: 'gt-a', title: 'Task a', due: '2026-11-10', notes: '', estimate: 45, done: false, groupTaskId: 'a', fromGroup: 'g' };
  const done = { id: 'gt-b', title: 'Task b', due: '2026-11-10', notes: '', estimate: 45, done: true, groupTaskId: 'b', fromGroup: 'g' };
  const r = reconcileGroupTasks({ tasks: [open, done], group: { ...group, copied: ['a', 'b'] }, posts: [post('a', { due: '2026-11-12', body: 'Chapter 3' }), post('b', { title: 'Renamed' })] });
  assert.deepEqual(r.update, [{ id: 'gt-a', patch: { due: '2026-11-12', notes: 'Chapter 3' } }]);
  assert.deepEqual(r.add, []);
});

test('a copy the member deleted is not made again', () => {
  assert.equal(reconcileGroupTasks({ tasks: [], group: { ...group, copied: ['a'] }, posts: [post('a')] }), null);
});

test('a task taken off the board goes from the members’ lists unless they did it', () => {
  const open = { id: 'gt-a', done: false, groupTaskId: 'a', fromGroup: 'g' };
  const done = { id: 'gt-b', done: true, groupTaskId: 'b', fromGroup: 'g' };
  const r = reconcileGroupTasks({ tasks: [open, done, { id: 'mine' }], group: { ...group, copied: ['a', 'b'] }, posts: [] });
  assert.deepEqual(r.remove, ['gt-a']);
  assert.deepEqual(r.copied, []);
});

test('the board’s order: pinned notes first, then newest; tasks by due date', () => {
  const posts = [
    { id: 1, kind: 'note', pinned: false, created_at: '2026-11-01T10:00' },
    { id: 2, kind: 'note', pinned: true, created_at: '2026-10-20T10:00' },
    { id: 3, kind: 'note', pinned: false, created_at: '2026-11-02T10:00' },
    { id: 4, kind: 'task', due: '2026-11-09', created_at: '2026-11-01' },
    { id: 5, kind: 'task', due: '2026-11-05', created_at: '2026-11-02' },
  ];
  assert.deepEqual(boardNotes(posts).map((p) => p.id), [2, 3, 1]);
  assert.deepEqual(boardTasks(posts).map((p) => p.id), [5, 4]);
});

console.log(`groupTasks: ${pass} passed`);
