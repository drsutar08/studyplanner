// Unit tests for classrooms (src/classrooms.js). Pure logic: `node e2e/classrooms.test.mjs`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'classrooms-'));
fs.writeFileSync(path.join(tmp, 'classrooms.mjs'), fs.readFileSync(new URL('../src/classrooms.js', import.meta.url), 'utf8'));
const c = await import(pathToFileURL(path.join(tmp, 'classrooms.mjs')).href);

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

test('codes: typed any way, read the same', () => {
  assert.equal(c.cleanCode(' abcd-efgh '), 'ABCDEFGH');
  assert.equal(c.cleanCode('ab cd ef gh ij'), 'ABCDEFGH');
  assert.equal(c.formatCode('ABCDEFGH'), 'ABCD-EFGH');
  assert.equal(c.formatCode('abc'), 'ABC');
  assert.equal(c.codeComplete('abcd-efgh'), true);
  assert.equal(c.codeComplete('abcd-efg'), false);
  assert.equal(c.cleanCode(null), '');
});
test('file types: the picker type, or the name when the phone says octet-stream', () => {
  assert.equal(c.fileKind('application/pdf', 'a.pdf'), 'pdf');
  assert.equal(c.fileKind('application/octet-stream', 'Notes.DOCX'), 'doc');
  assert.equal(c.fileKind(undefined, 'deck.pptx'), 'slides');
  assert.equal(c.fileKind('image/heic', 'photo.heic'), null);
  assert.equal(c.fileKind('application/zip', 'x.zip'), null);
  assert.equal(c.mimeFor('', 'board.JPG'), 'image/jpeg');
  assert.ok(c.PICKER_TYPES.includes('application/vnd.ms-excel'));
});
test('file problems: wrong type or over 20 MB', () => {
  assert.equal(c.fileProblem({ mimeType: 'application/pdf', name: 'a.pdf', size: 1000 }), null);
  assert.equal(c.fileProblem({ mimeType: 'application/pdf', name: 'a.pdf', size: 21 * 1024 * 1024 }), 'tooBig');
  assert.equal(c.fileProblem({ mimeType: 'video/mp4', name: 'a.mp4', size: 10 }), 'type');
  assert.equal(c.fileProblem({ mimeType: 'application/pdf', name: 'a.pdf' }), null);
});
test('file paths live in the classroom folder', () => {
  assert.equal(c.materialPath('cid', 'mid', 'Chapter 3.PDF', 'application/pdf'), 'cid/mid.pdf');
  assert.equal(c.materialPath('cid', 'mid', 'noext', 'image/png'), 'cid/mid.png');
  assert.equal(c.materialPath('cid', 'mid', 'noext', 'x/y'), 'cid/mid.bin');
});
test('sizes read well', () => {
  assert.equal(c.formatSize(500), '1 KB');
  assert.equal(c.formatSize(350 * 1024), '350 KB');
  assert.equal(c.formatSize(1.25 * 1024 * 1024), '1.3 MB');
  assert.equal(c.formatSize(5 * 1024 * 1024 * 1024), '5.0 GB');
});
test('links: a scheme is added; anything that is not a web address is refused', () => {
  assert.equal(c.cleanUrl('khanacademy.org/physics'), 'https://khanacademy.org/physics');
  assert.equal(c.cleanUrl('https://youtu.be/abc'), 'https://youtu.be/abc');
  assert.equal(c.cleanUrl('http://example.com:8080/x'), 'http://example.com:8080/x');
  assert.equal(c.cleanUrl('javascript:alert(1)'), null);
  assert.equal(c.cleanUrl('mailto:a@b.com'), null);
  assert.equal(c.cleanUrl('not a link'), null);
  assert.equal(c.cleanUrl('localhost'), null);
  assert.equal(c.cleanUrl(''), null);
  assert.equal(c.linkHost('https://www.YouTube.com/watch?v=1'), 'youtube.com');
});
test('materials: pinned first, then newest', () => {
  const list = [
    { id: 'a', pinned: false, created_at: '2026-11-01T00:00:00Z' },
    { id: 'b', pinned: true, created_at: '2026-10-01T00:00:00Z' },
    { id: 'c', pinned: false, created_at: '2026-11-05T00:00:00Z' },
  ];
  assert.deepEqual(c.sortMaterials(list).map((m) => m.id), ['b', 'c', 'a']);
  assert.deepEqual(c.sortMaterials(null), []);
});
test('"New" is what came after the student last looked', () => {
  const m = { created_at: '2026-11-05T10:00:00Z' };
  assert.equal(c.isNew(m, null), true);
  assert.equal(c.isNew(m, '2026-11-05T09:00:00Z'), true);
  assert.equal(c.isNew(m, '2026-11-05T11:00:00Z'), false);
  const room = { role: 'student', status: 'approved', latest: '2026-11-05T10:00:00Z' };
  assert.equal(c.hasNew(room, '2026-11-04T00:00:00Z'), true);
  assert.equal(c.hasNew(room, '2026-11-06T00:00:00Z'), false);
  assert.equal(c.hasNew({ ...room, status: 'pending' }, null), false);
  assert.equal(c.hasNew({ ...room, role: 'teacher' }, null), false);
  assert.equal(c.hasNew({ ...room, latest: null }, null), false);
});
test('server errors map to messages', () => {
  assert.equal(c.classroomErrorKind({ message: 'classroom_limit' }), 'limit');
  assert.equal(c.classroomErrorKind({ message: 'classroom_full' }), 'full');
  assert.equal(c.classroomErrorKind({ message: 'own_classroom' }), 'own');
  assert.equal(c.classroomErrorKind({ message: 'materials_full' }), 'materialsFull');
  assert.equal(c.classroomErrorKind({ message: 'new row violates row-level security policy' }), 'storage');
  assert.equal(c.classroomErrorKind({ message: 'The object exceeded the maximum allowed size' }), 'tooBig');
  assert.equal(c.classroomErrorKind({ message: 'mime type application/zip is not supported' }), 'type');
  assert.equal(c.classroomErrorKind(new Error('Network request failed')), 'offline');
  assert.equal(c.classroomErrorKind(null), 'offline');
});
test('summary for the Settings row', () => {
  const s = c.summary([
    { role: 'teacher', pending: 2 },
    { role: 'teacher', pending: 1 },
    { role: 'student', pending: null },
  ]);
  assert.deepEqual(s, { teaching: 2, joined: 1, waiting: 3 });
  assert.deepEqual(c.summary(null), { teaching: 0, joined: 0, waiting: 0 });
});

console.log(`\n${pass} passed${process.exitCode ? ', some FAILED' : ''}`);
