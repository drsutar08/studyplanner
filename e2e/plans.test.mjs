// Unit tests for Free and Premium (the app's side of the limits). Pure logic: `node e2e/plans.test.mjs`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plans-'));
fs.writeFileSync(path.join(tmp, 'plans.mjs'), fs.readFileSync(new URL('../src/plans.js', import.meta.url), 'utf8'));
const { readPlan, limited, aiLocked, roomFor, premiumOnly, photoCount, NO_LIMITS, FREE } = await import(pathToFileURL(path.join(tmp, 'plans.mjs')).href);

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
const free = readPlan({ plan: 'free', enforced: true, limits: { ai: 0, ai_period: 'day', cards: 200, photos: 50, groups: 1 } });
const premium = readPlan({ plan: 'premium', enforced: true, expires_at: '2027-02-01T00:00:00Z', source: 'gift', limits: { ai: 30, ai_period: 'day', cards: 1000000, photos: 2000, groups: 10 } });

test('no answer from the server (offline, signed out, not set up) means no limits', () => {
  assert.deepEqual(readPlan(null), NO_LIMITS);
  assert.equal(limited(readPlan(undefined)), false);
  assert.equal(roomFor(readPlan(null), 'cards', 5000), Infinity);
});

test('before the switch is on, a free account has no limits', () => {
  const p = readPlan({ plan: 'free', enforced: false, limits: { ai: 30, ai_period: 'day', cards: 1000000, photos: 2000, groups: 10 } });
  assert.equal(limited(p), false);
  assert.equal(premiumOnly(p, 'reportPdf'), false);
});

test('a free account once the limits are on: room left, and the Premium-only report', () => {
  assert.equal(limited(free), true);
  assert.equal(roomFor(free, 'cards', 190), 10);
  assert.equal(roomFor(free, 'cards', 250), 0);
  assert.equal(roomFor(free, 'groups', 0), FREE.groups);
  assert.equal(free.limits.ai, 0); // 0 is kept, not turned into the default
  assert.equal(free.limits.aiPeriod, 'day');
  assert.equal(premiumOnly(free, 'reportPeriods'), true);
  assert.equal(premiumOnly(free, 'reportPdf'), true);
});

test('Premium (bought or a gift) has no app-side limits', () => {
  assert.equal(limited(premium), false);
  assert.equal(roomFor(premium, 'photos', 1999), Infinity);
  assert.equal(premium.expiresAt, '2027-02-01T00:00:00Z');
  assert.equal(premium.source, 'gift');
});

test('the AI helper is Premium only: locked for a known Free account, switch on or off, never before the plan is known', () => {
  assert.equal(aiLocked(free), true);
  assert.equal(aiLocked(readPlan({ plan: 'free', enforced: false, limits: { ai: 0 } })), true);
  assert.equal(aiLocked(premium), false);
  assert.equal(aiLocked(NO_LIMITS), false);
  assert.equal(aiLocked(readPlan(null)), false);
  assert.equal(readPlan({ plan: 'premium', limits: { ai: 30 } }).limits.ai, 30);
});

test('ads come only from the server, with the rewards left today', () => {
  assert.equal(readPlan(null).ads, false);
  assert.equal(readPlan({ plan: 'free', enforced: true, ads: 'yes' }).ads, false); // only a real true
  const p = readPlan({ plan: 'free', enforced: true, ads: true, ad_rewards_left: 2 });
  assert.equal(p.ads, true);
  assert.equal(p.adRewardsLeft, 2);
  assert.equal(readPlan({ ads: true, ad_rewards_left: -4 }).adRewardsLeft, 0);
});

test('the age group picks the kind of ads; anything unclear counts as unknown', () => {
  assert.equal(readPlan({ age: 'adult' }).age, 'adult');
  assert.equal(readPlan({ age: 'minor' }).age, 'minor');
  assert.equal(readPlan({ age: 'child' }).age, 'unknown');
  assert.equal(readPlan(null).age, 'unknown');
});

test('photos are counted on every task, archived ones too', () => {
  const tasks = [{ attachments: [{ kind: 'photo' }, { kind: 'link' }] }, { attachments: [] }, {}];
  assert.equal(photoCount(tasks, [{ attachments: [{ kind: 'photo' }, { kind: 'photo' }] }]), 3);
  assert.equal(photoCount(), 0);
});

console.log(`\n${pass} passed`);
