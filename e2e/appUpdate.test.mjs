// Unit tests for the update check (src/appUpdate.js). Pure logic: `node e2e/appUpdate.test.mjs`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'appUpdate-'));
fs.writeFileSync(path.join(tmp, 'appUpdate.mjs'), fs.readFileSync(new URL('../src/appUpdate.js', import.meta.url), 'utf8'));
const { updateState, offeredBuild, storeLinks } = await import(pathToFileURL(path.join(tmp, 'appUpdate.mjs')).href);

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

const cfg = { android: { min_build: 6, latest_build: 8 }, ios: { min_build: 0, latest_build: 0 } };

test('a build older than min_build is blocked', () => {
  assert.equal(updateState(cfg, 'android', '5'), 'force');
  assert.equal(updateState(cfg, 'android', 1), 'force');
});
test('between min_build and latest_build gets the optional prompt', () => {
  assert.equal(updateState(cfg, 'android', '6'), 'suggest');
  assert.equal(updateState(cfg, 'android', '7'), 'suggest');
});
test('the latest build (or newer) is left alone', () => {
  assert.equal(updateState(cfg, 'android', '8'), 'none');
  assert.equal(updateState(cfg, 'android', '9'), 'none');
});
test('0 turns the checks off', () => {
  assert.equal(updateState(cfg, 'ios', '1'), 'none');
});
test('never blocks without a config, platform or build number', () => {
  assert.equal(updateState(null, 'android', '1'), 'none');
  assert.equal(updateState({}, 'android', '1'), 'none');
  assert.equal(updateState(cfg, 'web', '1'), 'none');
  assert.equal(updateState(cfg, 'android', null), 'none');
  assert.equal(updateState(cfg, 'android', 'abc'), 'none');
  assert.equal(updateState({ android: { min_build: 'x' } }, 'android', '3'), 'none');
});
test('offeredBuild is the newest known build', () => {
  assert.equal(offeredBuild(cfg, 'android'), 8);
  assert.equal(offeredBuild({ android: { min_build: 9, latest_build: 0 } }, 'android'), 9);
  assert.equal(offeredBuild(null, 'android'), 0);
});
test('store links: Play Store app, then the web page; store_url wins', () => {
  assert.deepEqual(storeLinks(cfg, 'android', 'com.x'), ['market://details?id=com.x', 'https://play.google.com/store/apps/details?id=com.x']);
  assert.deepEqual(storeLinks({ ios: { store_url: 'https://apps.apple.com/app/id1' } }, 'ios', 'com.x'), ['https://apps.apple.com/app/id1']);
  assert.deepEqual(storeLinks(cfg, 'ios', 'com.x'), []);
  assert.deepEqual(storeLinks(cfg, 'android', null), []);
});

console.log(`\n${pass} passed${process.exitCode ? ', some FAILED' : ''}`);
