// Unit tests for the long-press shortcuts on the app icon (their links). Pure logic: `node e2e/appShortcuts.test.mjs`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'appShortcuts-'));
fs.writeFileSync(path.join(tmp, 'links.mjs'), fs.readFileSync(new URL('../src/appShortcutLinks.js', import.meta.url), 'utf8'));
const { SHORTCUTS, shortcutUrl, shortcutFromUrl, shortcutItems } = await import(pathToFileURL(path.join(tmp, 'links.mjs')).href);

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

test('each shortcut has a link that leads back to it', () => {
  for (const s of SHORTCUTS) assert.equal(shortcutFromUrl(shortcutUrl(s.id)), s.id);
  assert.equal(shortcutFromUrl('studyplanner://do/focus/'), 'focus');
  assert.equal(shortcutFromUrl('studyplanner://do/cards?x=1'), 'cards');
});

test('the Development app scheme works the same way', () => {
  assert.equal(shortcutUrl('focus', 'studyplanner-dev'), 'studyplanner-dev://do/focus');
  assert.equal(shortcutFromUrl('studyplanner-dev://do/cards'), 'cards');
  assert.equal(shortcutItems((k) => k, 'studyplanner-dev')[0].url, 'studyplanner-dev://do/new-task');
});

test('other links are not shortcuts', () => {
  for (const url of [null, '', 'studyplanner://share?d=abc', 'studyplanner://do/delete-everything', 'https://example.com/do/focus', 'studyplanner://do/focus/extra', 'otherapp://do/focus']) assert.equal(shortcutFromUrl(url), null, String(url));
});

test('the items for the native side carry translated titles, links and icons (at most 4)', () => {
  const items = shortcutItems((k) => `T:${k}`);
  assert.ok(items.length <= 4);
  assert.deepEqual(items[0], { id: 'new-task', title: 'T:appShortcuts.newTask', url: 'studyplanner://do/new-task', symbol: 'plus' });
});

console.log(`\n${pass} passed`);
