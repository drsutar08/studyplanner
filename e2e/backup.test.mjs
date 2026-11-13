// Unit tests for backup / restore parsing. Pure logic, no browser: `npm run test:backup`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-'));
fs.writeFileSync(path.join(tmp, 'attachments.mjs'), fs.readFileSync(new URL('../src/attachments.js', import.meta.url), 'utf8'));
fs.writeFileSync(path.join(tmp, 'backup.mjs'), fs.readFileSync(new URL('../src/backup.js', import.meta.url), 'utf8').replace("'./attachments'", "'./attachments.mjs'"));
const { buildBackup, parseBackup, backupFileName, BACKUP_ERRORS } = await import(pathToFileURL(path.join(tmp, 'backup.mjs')).href);
fs.writeFileSync(path.join(tmp, 'sampleData.mjs'), fs.readFileSync(new URL('../src/sampleData.js', import.meta.url), 'utf8'));
const { sampleData } = await import(pathToFileURL(path.join(tmp, 'sampleData.mjs')).href);

// Errors come back as { code, params? }; the UI turns them into text via `backup.errors.<code>`.
const errCode = (res) => res.error && res.error.code;

let pass = 0;
const test = (name, fn) => {
  try {
    fn();
    pass += 1;
    console.log('  PASS', name);
  } catch (e) {
    console.log('  FAIL', name, '\n      ', e.message.split('\n')[0]);
    process.exitCode = 1;
  }
};

const sample = {
  subjects: [{ id: 's1', name: 'Math', color: '#E4572E' }],
  tasks: [
    { id: 't1', title: 'Integrals', subjectId: 's1', due: '2026-10-28', estimate: 60, priority: 'high', done: false, completedAt: null },
    { id: 't2', title: 'Essay', subjectId: 's1', due: '2026-10-29', estimate: 30, priority: 'med', done: true, completedAt: '2026-10-28', recurId: 'r1' },
  ],
  sessions: [{ id: 'x1', date: '2026-10-28', minutes: 25, subjectId: 's1', taskId: 't1' }],
  exams: [{ id: 'e1', title: 'Final', date: '2026-11-20', subjectId: 's1' }],
  recurring: [{ id: 'r1', title: 'Essay', subjectId: 's1', estimate: 30, priority: 'med', days: [1, 3], startDate: '2026-10-26', generatedUntil: '2026-11-09' }],
};

test('a backup round-trips with nothing lost', () => {
  const res = parseBackup(buildBackup(sample, { email: 'a@b.co' }));
  assert.ok(!res.error, res.error);
  assert.deepEqual(res.counts, { subjects: 1, tasks: 2, sessions: 1, exams: 1, recurring: 1, classes: 0, vacations: 0 });
  assert.equal(res.data.tasks[1].recurId, 'r1');
  assert.equal(res.data.recurring[0].generatedUntil, '2026-11-09');
});

test('backup text records the app, version and who exported it', () => {
  const j = JSON.parse(buildBackup(sample, { email: 'a@b.co' }));
  assert.equal(j.app, 'StudyPlanner');
  assert.equal(j.version, 1);
  assert.equal(j.exportedBy, 'a@b.co');
});

test('plain text that is not JSON is rejected with a helpful message', () => {
  assert.equal(errCode(parseBackup('hello there')), BACKUP_ERRORS.notJson);
  assert.equal(errCode(parseBackup('')), 'notJson');
  assert.ok(!parseBackup('hello there').data);
});

test('JSON from some other app is rejected', () => {
  assert.equal(errCode(parseBackup(JSON.stringify({ tasks: [] }))), 'notOurs');
  assert.equal(errCode(parseBackup(JSON.stringify({ app: 'Other', data: {} }))), 'notOurs');
  assert.equal(errCode(parseBackup('null')), 'notOurs');
});

test('a backup from a newer version is refused', () => {
  const j = JSON.parse(buildBackup(sample));
  j.version = 99;
  assert.equal(errCode(parseBackup(JSON.stringify(j))), 'tooNew');
});

test('missing required lists are reported, naming the list', () => {
  const j = JSON.parse(buildBackup(sample));
  delete j.data.tasks;
  assert.deepEqual(parseBackup(JSON.stringify(j)).error, { code: 'missingList', params: { list: 'tasks' } });
  const k = JSON.parse(buildBackup(sample));
  k.data.sessions = 'nope';
  assert.deepEqual(parseBackup(JSON.stringify(k)).error, { code: 'missingList', params: { list: 'sessions' } });
});

test('huge text is refused before parsing', () => {
  assert.equal(errCode(parseBackup('x'.repeat(5 * 1024 * 1024 + 1))), 'tooLarge');
});

test('every error code is a known one', () => {
  const codes = new Set(Object.values(BACKUP_ERRORS));
  for (const text of ['', 'nope', '{}', JSON.stringify({ app: 'StudyPlanner', version: 99, data: {} }), JSON.stringify({ app: 'StudyPlanner', version: 1, data: {} })]) {
    const res = parseBackup(text);
    assert.ok(res.error && codes.has(res.error.code), `${text} -> ${JSON.stringify(res.error)}`);
  }
});

test('bad records are dropped instead of breaking the restore', () => {
  const j = JSON.parse(buildBackup(sample));
  j.data.tasks.push({ id: 'bad', title: 'No date' }, null, { title: 'No id', due: '2026-10-28' });
  j.data.sessions.push({ date: 'nope', minutes: 10 }, { date: '2026-10-28', minutes: -5 });
  const res = parseBackup(JSON.stringify(j));
  assert.equal(res.counts.tasks, 2);
  assert.equal(res.counts.sessions, 1);
  assert.ok(res.skipped >= 3);
});

test('links to subjects that do not exist are cleared', () => {
  const j = JSON.parse(buildBackup(sample));
  j.data.tasks[0].subjectId = 'ghost';
  j.data.exams[0].subjectId = 'ghost';
  const res = parseBackup(JSON.stringify(j));
  assert.equal(res.data.tasks[0].subjectId, null);
  assert.equal(res.data.exams[0].subjectId, null);
});

test('old backups without exams or repeats still restore', () => {
  const j = JSON.parse(buildBackup(sample));
  delete j.data.exams;
  delete j.data.recurring;
  const res = parseBackup(JSON.stringify(j));
  assert.ok(!res.error);
  assert.deepEqual(res.data.exams, []);
  assert.deepEqual(res.data.recurring, []);
});

test('invalid values get safe defaults', () => {
  const j = JSON.parse(buildBackup(sample));
  j.data.tasks[0].priority = 'urgent!!';
  j.data.tasks[0].estimate = 'lots';
  const res = parseBackup(JSON.stringify(j));
  assert.equal(res.data.tasks[0].priority, 'med');
  assert.equal(res.data.tasks[0].estimate, 30);
});

test('repeat days outside 0-6 are removed; empty repeats are dropped', () => {
  const j = JSON.parse(buildBackup(sample));
  j.data.recurring[0].days = [1, 9, -2, 'x'];
  j.data.recurring.push({ id: 'r2', title: 'Empty', days: [8] });
  const res = parseBackup(JSON.stringify(j));
  assert.deepEqual(res.data.recurring[0].days, [1]);
  assert.equal(res.data.recurring.length, 1);
});

test('classes and the term round-trip; old backups without them restore with none', () => {
  const cls = {
    id: 'c1', title: 'Calculus II', subjectId: 's1', teacher: 'Prof. T', repeat: 'weekly', date: null, days: [1, 3],
    start: '09:00', end: '10:30', range: 'term', rangeStart: null, rangeEnd: null, mode: 'inPerson', location: 'Room 204', link: '', notes: '',
  };
  const term = { start: '2026-09-01', end: '2026-12-18' };
  const res = parseBackup(buildBackup({ ...sample, classes: [cls], term }));
  assert.deepEqual(res.data.classes, [cls]);
  assert.deepEqual(res.data.term, term);
  assert.equal(res.counts.classes, 1);
  const old = parseBackup(buildBackup(sample));
  assert.deepEqual(old.data.classes, []);
  assert.equal(old.data.term, null);
});

test('activities round-trip as activities; an unknown category becomes "other" and a subject is dropped', () => {
  const act = {
    id: 'a1', title: 'Football practice', subjectId: null, teacher: 'Coach Rao', repeat: 'weekly', date: null, days: [2, 4],
    start: '16:00', end: '17:30', range: 'none', rangeStart: null, rangeEnd: null, mode: 'inPerson', location: 'Field 2', link: '', notes: '',
    kind: 'activity', category: 'sport',
  };
  assert.deepEqual(parseBackup(buildBackup({ ...sample, classes: [act] })).data.classes, [act]);
  const [odd] = parseBackup(buildBackup({ ...sample, classes: [{ ...act, category: 'juggling', subjectId: sample.subjects[0].id }] })).data.classes;
  assert.equal(odd.category, 'other');
  assert.equal(odd.subjectId, null);
});

test('exam attendance round-trips; unknown values are dropped', () => {
  const j = JSON.parse(buildBackup(sample));
  const base = j.data.exams[0];
  j.data.exams = [{ ...base, id: 'x1', attendance: 'excused' }, { ...base, id: 'x2', attendance: 'sick' }];
  const [a, b] = parseBackup(JSON.stringify(j)).data.exams;
  assert.equal(a.attendance, 'excused');
  assert.equal(b.attendance, undefined);
});

test('class attendance and createdAt round-trip; bad attendance entries are dropped', () => {
  const cls = {
    id: 'c1', title: 'Calculus II', subjectId: 's1', teacher: '', repeat: 'weekly', date: null, days: [1, 3],
    start: '09:00', end: '10:30', range: 'none', rangeStart: null, rangeEnd: null, mode: 'inPerson', location: '', link: '', notes: '',
    createdAt: '2026-09-01', attendance: { '2026-09-07': 'attended', '2026-09-09': 'missed', '2026-09-14': 'excused', '2026-09-16': 'cancelled' },
  };
  assert.deepEqual(parseBackup(buildBackup({ ...sample, classes: [cls] })).data.classes, [cls]);
  const j = JSON.parse(buildBackup({ ...sample, classes: [{ ...cls, createdAt: 'soon', attendance: { '2026-09-07': 'attended', '2026-09-09': 'late', nope: 'missed' } }] }));
  const [back] = parseBackup(JSON.stringify(j)).data.classes;
  assert.equal(back.createdAt, undefined);
  assert.deepEqual(back.attendance, { '2026-09-07': 'attended' });
});

test('bad class records are dropped or repaired', () => {
  const j = JSON.parse(buildBackup(sample));
  j.data.classes = [
    { id: 'a', title: 'No days', repeat: 'weekly', days: [9] }, // dropped: no valid day
    { id: 'b', title: 'No date', repeat: 'once' }, // dropped: one-off without a date
    { id: 'c', title: 'Fixable', repeat: 'weekly', days: [2, 2, 'x'], start: '25:00', end: '10:00', range: 'term', mode: 'carrier pigeon', subjectId: 'gone' },
  ];
  const res = parseBackup(JSON.stringify(j));
  assert.equal(res.data.classes.length, 1);
  const c = res.data.classes[0];
  assert.deepEqual(c.days, [2]);
  assert.equal(c.start, null);
  assert.equal(c.end, null); // an end time needs a valid start before it
  assert.equal(c.range, 'none'); // "term" without term dates in the backup
  assert.equal(c.mode, 'inPerson');
  assert.equal(c.subjectId, null);
});

test('vacations round-trip; bad ones are dropped', () => {
  const v = { id: 'v1', title: 'Winter break', start: '2026-12-19', end: '2027-01-03', pause: false, notes: 'Campus closed' };
  const res = parseBackup(buildBackup({ ...sample, vacations: [v] }));
  assert.deepEqual(res.data.vacations, [v]);
  assert.equal(res.counts.vacations, 1);
  const j = JSON.parse(buildBackup(sample));
  j.data.vacations = [{ id: 'a', title: 'Backwards', start: '2026-12-10', end: '2026-12-01' }, { id: 'b', title: 'No end', start: '2026-12-10' }, { id: 'c', title: 'Ok', start: '2026-12-10', end: '2026-12-10' }];
  const bad = parseBackup(JSON.stringify(j));
  assert.deepEqual(bad.data.vacations.map((x) => [x.id, x.pause]), [['c', true]]); // pause defaults on
  assert.deepEqual(parseBackup(buildBackup(sample)).data.vacations, []);
});

// The English strings file is plain data, so it can be loaded the same way.
fs.writeFileSync(path.join(tmp, 'manage.mjs'), fs.readFileSync(new URL('../src/i18n/en/manage.js', import.meta.url), 'utf8'));
const { default: manageEn } = await import(pathToFileURL(path.join(tmp, 'manage.mjs')).href);

test('every error code has an English message, with the original wording', () => {
  for (const code of Object.values(BACKUP_ERRORS)) assert.equal(typeof manageEn.backup.errors[code], 'string', code);
  assert.match(manageEn.backup.errors.notJson, /not valid backup text/i);
  assert.match(manageEn.backup.errors.notOurs, /does not look like a StudyPlanner backup/i);
  assert.match(manageEn.backup.errors.missingList, /missing its \{list\} list/);
  for (const list of ['subjects', 'tasks', 'sessions']) assert.equal(typeof manageEn.backup.lists[list], 'string', list);
});

test('task steps round-trip; bad steps are dropped or repaired', () => {
  const j = JSON.parse(buildBackup(sample));
  j.data.tasks[0].subtasks = [{ id: 's1', title: 'Outline', done: true }, { title: '  Draft  ' }, { title: '' }, null];
  const res = parseBackup(JSON.stringify(j));
  assert.deepEqual(res.data.tasks[0].subtasks, [
    { id: 's1', title: 'Outline', done: true },
    { id: 'st1', title: 'Draft', done: false },
  ]);
  assert.equal(res.data.tasks[1].subtasks, undefined); // tasks without steps stay as they were
});

test('the rotation and rotation classes round-trip; bad values are repaired', () => {
  const rotation = { type: 'days', length: 2, startDate: '2026-11-02', startIndex: 1, schoolDays: [1, 2, 3, 4, 5], weekStart: 1 };
  const base = { subjectId: 's1', teacher: '', date: null, start: '09:00', end: '10:00', range: 'none', rangeStart: null, rangeEnd: null, mode: 'inPerson', location: '', link: '', notes: '' };
  const cls = [
    { ...base, id: 'r1', title: 'Chemistry', repeat: 'rotation', days: [], rotationDays: [0, 9, 1, 1] },
    { ...base, id: 'w1', title: 'Lab', repeat: 'weekly', days: [1], rotationWeeks: [0] },
    { ...base, id: 'r2', title: 'No letters', repeat: 'rotation', days: [], rotationDays: [] },
  ];
  const res = parseBackup(buildBackup({ ...sample, rotation, classes: cls }));
  assert.deepEqual(res.data.rotation, rotation);
  assert.deepEqual(res.data.classes.map((c) => [c.id, c.repeat, c.rotationDays || c.rotationWeeks]), [['r1', 'rotation', [0, 1]], ['w1', 'weekly', [0]]]);
  const bad = parseBackup(buildBackup({ ...sample, rotation: { type: 'days', length: 12, startDate: '2026-11-02' } }));
  assert.equal(bad.data.rotation, null);
});

test('file name carries the date', () => {
  assert.equal(backupFileName(new Date(2026, 9, 5)), 'studyplanner-backup-2026-10-05.json');
});

test('the sample data restores in full and is dated around the given day', () => {
  const data = sampleData(new Date(2026, 9, 30));
  const back = parseBackup(buildBackup(data));
  for (const k of ['subjects', 'tasks', 'sessions', 'exams', 'recurring', 'classes', 'vacations']) {
    assert.ok(data[k].length > 0, k + ' is empty');
    assert.equal(back.data[k].length, data[k].length, k);
  }
  assert.ok(data.tasks.some((t) => t.due === '2026-10-30'), 'a task due that day');
  assert.ok(data.exams.some((e) => e.date > '2026-10-30') && data.exams.some((e) => typeof e.score === 'number'), 'upcoming and graded exams');
  assert.ok(data.classes.some((c) => c.kind === 'activity') && data.classes.some((c) => Object.keys(c.attendance || {}).length), 'activities and attendance');
  // another day moves everything with it
  assert.ok(sampleData(new Date(2027, 0, 15)).tasks.some((t) => t.due === '2027-01-15'));
});

test('a subject keeps its weekly goal; a bad goal is dropped', () => {
  const backup = JSON.parse(buildBackup(sample, { email: 'a@b.co' }));
  backup.data.subjects = [{ id: 'g1', name: 'Goals', color: '#123456', weeklyGoal: 180 }, { id: 'g2', name: 'Bad', color: '#123456', weeklyGoal: 'lots' }];
  const res = parseBackup(JSON.stringify(backup));
  assert.equal(res.data.subjects[0].weeklyGoal, 180);
  assert.ok(!('weeklyGoal' in res.data.subjects[1]));
});

test('task attachments are kept when well formed, bad ones dropped', () => {
  const backup = JSON.parse(buildBackup(sample, { email: 'a@b.co' }));
  backup.data.tasks[0].attachments = [
    { id: 'l1', kind: 'link', url: 'https://example.com/sheet', name: 'Sheet' },
    { id: 'p1', kind: 'photo', url: 'data:image/jpeg;base64,AAAA', name: '' },
    { id: 'x1', kind: 'link', url: 'javascript:alert(1)', name: 'bad' },
  ];
  const res = parseBackup(JSON.stringify(backup));
  assert.deepEqual(res.data.tasks[0].attachments.map((a) => a.id), ['l1', 'p1']);
  assert.ok(!('attachments' in res.data.tasks[1]), 'no empty list added to other tasks');
});

test('joined study groups are kept; a broken one is dropped', () => {
  const backup = JSON.parse(buildBackup({ ...sample, groups: [{ id: 'g1', name: 'Chem group', from: 'Asha', batch: 'grp1', joinedAt: '2026-10-30', sharedAt: '2026-10-29', counts: { classes: 2, exams: 1 } }, { name: 'no id' }] }, { email: 'a@b.co' }));
  const res = parseBackup(JSON.stringify(backup));
  assert.deepEqual(res.data.groups, [{ id: 'g1', name: 'Chem group', from: 'Asha', batch: 'grp1', joinedAt: '2026-10-30', sharedAt: '2026-10-29', counts: { classes: 2, exams: 1, vacations: 0, subjects: 0 } }]);
  assert.deepEqual(parseBackup(buildBackup(sample, null)).data.groups, []);
});

test('archived tasks are kept in a backup; a broken one is dropped', () => {
  const backup = JSON.parse(buildBackup({ ...sample, archive: [{ id: 'a1', title: 'Old', subjectId: 'nope', due: '2026-01-02', completedAt: '2026-01-03', estimate: 20, priority: 'low' }, { id: 'a2', title: 'No dates' }] }, null));
  const res = parseBackup(JSON.stringify(backup));
  assert.deepEqual(res.data.archive, [{ id: 'a1', title: 'Old', subjectId: null, due: '2026-01-02', completedAt: '2026-01-03', estimate: 20, priority: 'low' }]);
});

console.log(`\n${pass} passed`);
