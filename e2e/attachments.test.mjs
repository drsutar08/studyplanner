// Unit tests for task attachments. Pure logic, no browser: `npm run test:attachments`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'attachments-'));
fs.writeFileSync(path.join(tmp, 'attachments.mjs'), fs.readFileSync(new URL('../src/attachments.js', import.meta.url), 'utf8'));
const { parseLink, linkName, cannotAdd, addAttachment, cleanAttachments, MAX_ATTACHMENTS, MAX_PHOTOS, MAX_PHOTO_CHARS } = await import(pathToFileURL(path.join(tmp, 'attachments.mjs')).href);

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

const photo = 'data:image/jpeg;base64,' + 'A'.repeat(100);

test('a typed address becomes an https link with a short name', () => {
  assert.deepEqual(parseLink('khanacademy.org/math'), { url: 'https://khanacademy.org/math', name: 'khanacademy.org/math' });
  assert.deepEqual(parseLink('  https://www.example.com/  '), { url: 'https://www.example.com/', name: 'example.com' });
  assert.equal(parseLink('http://a.io/x?y=1').url, 'http://a.io/x?y=1');
});

test('things that are not web addresses are refused', () => {
  for (const bad of ['', 'hello', 'two words.com', 'javascript:alert(1)', 'mailto:a@b.co', 'ftp://x.org', 'https://nodot']) assert.equal(parseLink(bad), null, bad);
});

test('long link names are cut', () => {
  const n = linkName('https://example.com/' + 'x'.repeat(80));
  assert.equal(n.length, 40);
  assert.ok(n.endsWith('…'));
});

test('limits: 5 in all, 3 photos', () => {
  let list = [];
  for (let i = 0; i < MAX_PHOTOS; i++) list = addAttachment(list, { kind: 'photo', url: photo });
  assert.equal(cannotAdd(list, 'photo'), 'photos');
  assert.equal(addAttachment(list, { kind: 'photo', url: photo }).length, 3);
  list = addAttachment(list, { kind: 'link', url: 'https://a.com' });
  list = addAttachment(list, { kind: 'link', url: 'https://a.com' });
  assert.equal(list.length, 4, 'the same link twice is added once');
  list = addAttachment(list, { kind: 'link', url: 'https://b.com' });
  assert.equal(list.length, MAX_ATTACHMENTS);
  assert.equal(cannotAdd(list, 'link'), 'full');
  assert.equal(new Set(list.map((a) => a.id)).size, 5, 'each gets its own id');
  assert.equal(list[3].name, 'a.com');
});

test('cleaning a backup keeps good attachments only', () => {
  const big = 'data:image/jpeg;base64,' + 'A'.repeat(MAX_PHOTO_CHARS);
  const out = cleanAttachments([
    { id: 'x', kind: 'link', url: 'https://ok.org/sheet', name: 'Sheet' },
    { kind: 'link', url: 'javascript:alert(1)' },
    { kind: 'photo', url: photo },
    { kind: 'photo', url: big },
    { kind: 'photo', url: 'data:text/html;base64,AAAA' },
    { kind: 'file', url: 'https://ok.org' },
    null,
  ]);
  assert.deepEqual(out.map((a) => [a.kind, a.id === 'x' ? 'x' : typeof a.id]), [['link', 'x'], ['photo', 'string']]);
  assert.equal(out[0].name, 'Sheet');
  assert.deepEqual(cleanAttachments('nope'), []);
});

test('a photo kept in cloud Storage (only its path) is kept; a bad path is dropped', () => {
  const uid = '0b9a3c1e-1111-4a2b-9c3d-123456789abc';
  const out = cleanAttachments([
    { id: 'p1', kind: 'photo', path: uid + '/p1.jpg', name: '' },
    { id: 'p2', kind: 'photo', path: '../../etc/passwd' },
    { id: 'p3', kind: 'photo', url: photo, path: uid + '/p3.jpg' },
  ]);
  assert.deepEqual(out.map((a) => [a.id, a.path || null, !!a.url]), [['p1', uid + '/p1.jpg', false], ['p3', uid + '/p3.jpg', true]]);
});

console.log(`attachments: ${pass} passed`);
