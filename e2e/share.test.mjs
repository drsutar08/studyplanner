// Unit tests for study-group share links. Pure logic, no browser: `npm run test:share`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'share-'));
fs.writeFileSync(path.join(tmp, 'classes.mjs'), fs.readFileSync(new URL('../src/classes.js', import.meta.url), 'utf8'));
fs.writeFileSync(path.join(tmp, 'share.mjs'), fs.readFileSync(new URL('../src/share.js', import.meta.url), 'utf8').replace("'./classes'", "'./classes.mjs'").replace("from 'pako'", `from '${new URL('../node_modules/pako/dist/pako.mjs', import.meta.url).href}'`));
const { toBase64Url, fromBase64Url, shareable, buildShare, shareCode, shareLink, readShare, joinPlan, groupEntry, withoutGroup } = await import(pathToFileURL(path.join(tmp, 'share.mjs')).href);

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

const TODAY = '2026-10-31';
const state = {
  subjects: [
    { id: 's1', name: 'Physics', color: '#2E86DE' },
    { id: 's2', name: 'हिन्दी', color: '#E4572E' },
  ],
  term: { start: '2026-09-01', end: '2026-12-18' },
  rotation: null,
  classes: [
    { id: 'c1', title: 'Physics lab', subjectId: 's1', repeat: 'weekly', days: [1, 3], start: '09:00', end: '10:30', range: 'term', mode: 'inPerson', location: 'Lab 2', teacher: 'Dr Rao', attendance: { '2026-10-26': 'missed' }, notes: 'private' },
    { id: 'c2', title: 'Hindi', subjectId: 's2', repeat: 'weekly', days: [2], start: '11:00', end: '12:00', range: 'none', mode: 'online', link: 'https://meet.x/abc' },
    { id: 'c3', title: 'Old talk', repeat: 'once', date: '2026-10-01', start: '14:00' },
    { id: 'c4', title: 'Football', kind: 'activity', repeat: 'weekly', days: [5], start: '17:00' },
    { id: 'c5', title: 'Guest lecture', repeat: 'once', date: '2026-11-12', start: '15:00', end: '16:00' },
  ],
  exams: [
    { id: 'e1', title: 'Optics quiz', subjectId: 's1', kind: 'Quiz', date: '2026-11-05', time: '10:00', duration: 30, building: 'Hall B', room: '2', score: 18, outOf: 20, notes: 'secret' },
    { id: 'e2', title: 'Past test', date: '2026-10-01' },
  ],
  vacations: [
    { id: 'v1', title: 'Diwali break', start: '2026-11-09', end: '2026-11-13', pause: true },
    { id: 'v2', title: 'Old break', start: '2026-08-01', end: '2026-08-05' },
  ],
  tasks: [{ id: 't1', title: 'Homework' }],
};

test('base64url round-trips any text, including Hindi and emoji', () => {
  for (const s of ['', 'a', 'ab', 'abc', 'Physics, lab', 'हिन्दी परीक्षा', 'ଓଡ଼ିଆ', '📚 study 🙂', 'ñandú']) assert.equal(fromBase64Url(toBase64Url(s)), s);
  assert.ok(/^[A-Za-z0-9_-]*$/.test(toBase64Url('हिन्दी 📚')), 'url-safe characters only');
});

test('only what is still to come can be shared, and no activities', () => {
  const s = shareable(state, TODAY);
  assert.deepEqual(s.classes.map((c) => c.id), ['c1', 'c2', 'c5']);
  assert.deepEqual(s.exams.map((e) => e.id), ['e1']);
  assert.deepEqual(s.vacations.map((v) => v.id), ['v1']);
});

const share = buildShare(state, { id: 'g1', name: 'Physics group', from: 'Asha', today: TODAY });

test('a share leaves out private things: attendance, scores, notes, tasks', () => {
  const text = JSON.stringify(share);
  for (const secret of ['missed', 'private', 'secret', 'Homework', '"18"', 'score']) assert.ok(!text.includes(secret), secret);
  assert.equal(share.n, 'Physics group');
  assert.equal(share.f, 'Asha');
  assert.equal(share.s.length, 2, 'only the subjects used');
});

test('"for the term" becomes the sharer’s term dates', () => {
  const lab = share.c.find((c) => c.t === 'Physics lab');
  assert.deepEqual([lab.g, lab.gs, lab.ge], ['manual', '2026-09-01', '2026-12-18']);
});

test('include flags leave whole kinds out', () => {
  const only = buildShare(state, { id: 'g', name: 'x', from: 'y', today: TODAY, include: { classes: false, exams: true, vacations: false } });
  assert.deepEqual([only.c.length, only.e.length, only.h.length], [0, 1, 0]);
});

test('links: web page hash, the app link, and reading either (or the bare code) back', () => {
  const web = shareLink(share, 'https://planner.example/app#old');
  assert.ok(web.startsWith('https://planner.example/app#share='));
  const app = shareLink(share, 'studyplanner://share');
  assert.ok(app.startsWith('studyplanner://share?d='));
  for (const text of [web, app, shareCode(share), `  Join my group: ${web}  `]) assert.deepEqual(readShare(text).share, share);
});

test('codes are compressed (short enough for a QR code); the first, uncompressed links still read', () => {
  const code = shareCode(share);
  const plain = toBase64Url(JSON.stringify(share));
  assert.ok(code.startsWith('Z'));
  assert.ok(code.length < plain.length * 0.6, `${code.length} vs ${plain.length}`);
  assert.deepEqual(readShare(`https://x.org/#share=${plain}`).share, share, 'a link made before compression');
  assert.equal(readShare(`Z${code.slice(1, 20)}`).error, 'notShare', 'a cut-off code');
  assert.equal(readShare('ZZZZ').error, 'notShare');
});

test('reading bad input says why', () => {
  assert.equal(readShare('').error, 'empty');
  assert.equal(readShare('hello there').error, 'notShare');
  assert.equal(readShare('https://x.org/#share=@@@').error, 'notShare');
  assert.equal(readShare(toBase64Url('{"nope":1}')).error, 'notShare');
  assert.equal(readShare(toBase64Url(JSON.stringify({ ...share, v: 99 }))).error, 'newer');
});

test('joining: subjects matched by name (any case) or created; ids carry the batch', () => {
  const plan = joinPlan(readShare(shareCode(share)).share, { subjects: [{ id: 'mine', name: 'physics', color: '#000000' }] }, 'grp1');
  assert.deepEqual(plan.subjects.map((s) => [s.id, s.name, s.color]), [['grp1-s2', 'हिन्दी', '#E4572E']]);
  const lab = plan.classes.find((c) => c.title === 'Physics lab');
  assert.equal(lab.subjectId, 'mine');
  assert.deepEqual([lab.repeat, lab.days, lab.start, lab.end, lab.location, lab.teacher, lab.notes], ['weekly', [1, 3], '09:00', '10:30', 'Lab 2', 'Dr Rao', '']);
  assert.ok(!('attendance' in lab));
  const hindi = plan.classes.find((c) => c.title === 'Hindi');
  assert.deepEqual([hindi.subjectId, hindi.mode, hindi.link, hindi.location], ['grp1-s2', 'online', 'https://meet.x/abc', '']);
  const quiz = plan.exams[0];
  assert.deepEqual([quiz.kind, quiz.time, quiz.duration, quiz.building], ['Quiz', '10:00', 30, 'Hall B, 2']);
  assert.ok(!('score' in quiz));
  assert.deepEqual(plan.vacations.map((v) => [v.title, v.start, v.end, v.pause]), [['Diwali break', '2026-11-09', '2026-11-13', true]]);
  assert.ok([...plan.classes, ...plan.exams, ...plan.vacations].every((r) => r.id.startsWith('grp1-')));
});

test('joining skips what is already in the joiner’s calendar', () => {
  const plan = joinPlan(share, { subjects: [], classes: [{ title: 'physics lab', repeat: 'weekly', days: [1, 3], start: '09:00' }], exams: [{ title: 'Optics quiz', date: '2026-11-05', time: '10:00' }], vacations: [] }, 'b');
  assert.equal(plan.skipped, 2);
  assert.deepEqual(plan.classes.map((c) => c.title), ['Hindi', 'Guest lecture']);
  assert.equal(plan.exams.length, 0);
});

test('a rotation comes along only when the joiner has none; rotation classes need one', () => {
  const rot = { type: 'days', length: 2, startDate: '2026-09-01', schoolDays: [1, 2, 3, 4, 5] };
  const withRot = buildShare({ ...state, rotation: rot, classes: [...state.classes, { id: 'r1', title: 'Art', repeat: 'rotation', rotationDays: [1], start: '13:00' }] }, { id: 'g', name: 'n', from: 'f', today: TODAY });
  assert.deepEqual(withRot.ro, rot);
  const fresh = joinPlan(withRot, {}, 'b');
  assert.deepEqual(fresh.rotation, rot);
  assert.ok(fresh.classes.some((c) => c.title === 'Art'));
  const hasOwn = joinPlan(withRot, { rotation: { type: 'weeks', length: 2, startDate: '2026-09-07' } }, 'b');
  assert.equal(hasOwn.rotation, null, 'their own rotation is kept');
  assert.ok(hasOwn.classes.some((c) => c.title === 'Art'), 'and the class follows it');
  const noRot = joinPlan({ ...withRot, ro: undefined }, {}, 'b');
  assert.ok(!noRot.classes.some((c) => c.title === 'Art'), 'without any rotation the class is left out');
});

test('a tampered share is cleaned: bad dates, days and colours are dropped', () => {
  const bad = { v: 1, id: 'x', s: [{ n: 'Evil', c: 'red;background:url(x)' }], c: [{ t: 'A', r: 'weekly', w: [9, -1] }, { t: 'B', r: 'once', d: 'tomorrow' }, { t: '', r: 'once', d: '2026-11-01' }], e: [{ t: 'E', d: '2026-13-45x' }], h: [{ t: 'H', a: '2026-11-10', b: '2026-11-01' }] };
  const plan = joinPlan(bad, {}, 'b');
  assert.deepEqual([plan.classes.length, plan.exams.length, plan.vacations.length], [0, 0, 0]);
  assert.equal(plan.subjects[0].color, '#3B4CCA');
});

test('joining again from a newer link: its own earlier copies are not "already there"', () => {
  const first = joinPlan(share, {}, 'grpA');
  const joined = { subjects: first.subjects, classes: first.classes, exams: first.exams, vacations: first.vacations, groups: [{ id: 'g1', batch: 'grpA' }] };
  assert.equal(joinPlan(share, joined, 'grpB').classes.length, 0, 'without the fix everything looks like a duplicate');
  const again = joinPlan(share, withoutGroup(joined, 'g1'), 'grpB');
  assert.deepEqual([again.classes.length, again.exams.length, again.vacations.length, again.skipped], [3, 1, 1, 0]);
  assert.equal(withoutGroup(joined, 'other'), joined, 'another group id changes nothing');
});

test('the remembered group', () => {
  const plan = joinPlan(share, {}, 'grp9');
  assert.deepEqual(groupEntry(share, plan, 'grp9', '2026-11-01'), { id: 'g1', name: 'Physics group', from: 'Asha', batch: 'grp9', joinedAt: '2026-11-01', sharedAt: TODAY, counts: { classes: 3, exams: 1, vacations: 1, subjects: 2 } });
});

console.log(`share: ${pass} passed`);
