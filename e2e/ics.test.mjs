// Unit tests for calendar files (.ics). Pure logic, no browser: `npm run test:ics`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ics-'));
const copy = (src, name) =>
  fs.writeFileSync(path.join(tmp, name), fs.readFileSync(new URL(`../src/${src}`, import.meta.url), 'utf8').replace("'./classes'", "'./classes.mjs'"));
copy('classes.js', 'classes.mjs');
copy('ics.js', 'ics.mjs');
const { buildIcs, parseIcs, importPlan } = await import(pathToFileURL(path.join(tmp, 'ics.mjs')).href);

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

// 2026-10-26 is a Monday
const physics = { id: 'c1', title: 'Physics, lab', repeat: 'weekly', days: [1, 3], start: '09:00', end: '10:30', range: 'none', mode: 'inPerson', location: 'Room 4', subjectId: 's1', teacher: 'Dr Rao' };
const football = { id: 'a1', kind: 'activity', category: 'sport', title: 'Football', repeat: 'weekly', days: [5], start: '17:00', end: '18:00', range: 'none' };
const exam = { id: 'e1', title: 'Calculus mid-term', kind: 'Mid-term', date: '2026-11-04', time: '10:00', duration: 90, building: 'Hall B', room: '2', subjectId: 's2' };
const untimedExam = { id: 'e2', title: 'Essay due', kind: 'Test', date: '2026-11-06', time: null };
const pastExam = { id: 'e3', title: 'Old quiz', date: '2026-09-01', time: '09:00' };
const brk = { id: 'v1', title: 'Diwali break', start: '2026-11-09', end: '2026-11-13', pause: true };
const data = { classes: [physics, football], exams: [exam, untimedExam, pastExam], vacations: [brk], subjects: [{ id: 's1', name: 'Physics' }, { id: 's2', name: 'Maths' }] };

const text = buildIcs(data, { fromKey: '2026-10-26', days: 27 });
const events = parseIcs(text);

test('the file is a valid calendar with CRLF line ends', () => {
  assert.ok(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(text.trimEnd().endsWith('END:VCALENDAR'));
  assert.ok(!/[^\r]\n/.test(text), 'every newline is CRLF');
  assert.ok(text.split('\r\n').every((l) => l.length <= 75), 'lines are folded');
});

test('class sessions are written one by one and skip the break', () => {
  const phys = events.filter((e) => e.title === 'Physics, lab');
  // Mon/Wed from 26 Oct to 22 Nov = 8 sessions, minus Mon 9 + Wed 11 Nov in the break
  assert.equal(phys.length, 6);
  assert.deepEqual(phys[0].start, { date: '2026-10-26', time: '09:00' });
  assert.deepEqual(phys[0].end, { date: '2026-10-26', time: '10:30' });
  assert.equal(phys[0].location, 'Room 4');
  assert.equal(phys[0].description, 'Physics · Dr Rao');
  assert.ok(!phys.some((e) => e.start.date >= '2026-11-09' && e.start.date <= '2026-11-13'));
  assert.equal(new Set(phys.map((e) => e.uid)).size, 6, 'stable unique UIDs');
});

test('activities are tagged, exams are timed or all-day, past exams are left out', () => {
  assert.equal(events.find((e) => e.title === 'Football').categories, 'ACTIVITY,SPORT');
  const ex = events.find((e) => e.title.startsWith('Calculus'));
  assert.equal(ex.title, 'Calculus mid-term', 'kind already in the title is not repeated');
  assert.deepEqual(ex.end, { date: '2026-11-04', time: '11:30' });
  assert.equal(ex.location, 'Hall B, 2');
  const essay = events.find((e) => e.title.startsWith('Essay'));
  assert.equal(essay.title, 'Essay due (Test)');
  assert.deepEqual(essay.start, { date: '2026-11-06', time: null });
  assert.ok(!events.some((e) => e.title === 'Old quiz'));
});

test('breaks are all-day with an exclusive end', () => {
  const v = events.find((e) => e.title === 'Diwali break');
  assert.deepEqual(v.start, { date: '2026-11-09', time: null });
  assert.deepEqual(v.end, { date: '2026-11-14', time: null });
  assert.equal(v.categories, 'BREAK');
});

test('text with commas, semicolons and new lines round-trips', () => {
  const t = buildIcs({ classes: [], exams: [{ id: 'x', title: 'A; B, C', date: '2026-11-01', time: '09:00', notes: 'line 1\nline 2' }], vacations: [] }, { fromKey: '2026-10-26' });
  assert.ok(t.includes('SUMMARY:A\\; B\\, C'));
  const [e] = parseIcs(t);
  assert.equal(e.title, 'A; B, C');
  assert.equal(e.description, 'line 1\nline 2');
});

test('a long line is folded and unfolded back', () => {
  const long = 'x'.repeat(200);
  const [e] = parseIcs(buildIcs({ exams: [{ id: 'x', title: 'Quiz', date: '2026-11-01', time: null, notes: long }] }, { fromKey: '2026-10-26' }));
  assert.equal(e.description, long);
});

test('parse: VALUE=DATE, TZID and UTC times, RRULE, LF-only files', () => {
  const src = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:Chemistry',
    'DTSTART;TZID=Asia/Kolkata:20260907T110000',
    'DTEND;TZID=Asia/Kolkata:20260907T120000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,TH;UNTIL=20261218T235959Z',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:Sports day',
    'DTSTART;VALUE=DATE:20261120',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:Utc meeting',
    'DTSTART:20261120T090000Z',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART:20261120T090000',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');
  const ev = parseIcs(src);
  assert.equal(ev.length, 3, 'an event without a title is skipped');
  assert.deepEqual(ev[0].start, { date: '2026-09-07', time: '11:00' });
  assert.deepEqual(ev[0].rrule, { FREQ: 'WEEKLY', BYDAY: 'MO,TH', UNTIL: '20261218T235959Z' });
  assert.deepEqual(ev[1].start, { date: '2026-11-20', time: null });
  const d = new Date(Date.UTC(2026, 10, 20, 9, 0));
  assert.equal(ev[2].start.time, `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
});

test('import: an exported file folds back into weekly classes, an exam and a break', () => {
  const plan = importPlan(events, {}, { today: '2026-10-26' });
  const phys = plan.classes.find((c) => c.title === 'Physics, lab');
  assert.deepEqual(phys.days, [1, 3]);
  assert.equal(phys.repeat, 'weekly');
  assert.equal(phys.start, '09:00');
  assert.equal(phys.end, '10:30');
  assert.equal(phys.range, 'manual');
  assert.equal(phys.rangeStart, '2026-10-26');
  const foot = plan.classes.find((c) => c.title === 'Football');
  assert.equal(foot.kind, 'activity');
  assert.deepEqual(foot.days, [5]);
  assert.deepEqual(plan.exams.map((e) => [e.title, e.date, e.time, e.duration]), [
    ['Calculus mid-term', '2026-11-04', '10:00', 90],
    ['Essay due', '2026-11-06', null, 60],
  ]);
  assert.deepEqual(plan.vacations.map((v) => [v.title, v.start, v.end]), [['Diwali break', '2026-11-09', '2026-11-13']]);
  assert.equal(plan.classes.length, 2);
});

test('import: RRULE weekly, holidays by name, one-off events, past one-offs dropped', () => {
  const ev = parseIcs(
    [
      'BEGIN:VEVENT', 'SUMMARY:Chemistry', 'DTSTART:20260907T110000', 'DTEND:20260907T120000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TH;UNTIL=20261218', 'END:VEVENT',
      'BEGIN:VEVENT', 'SUMMARY:Teachers holiday', 'DTSTART;VALUE=DATE:20261120', 'DTEND;VALUE=DATE:20261121', 'END:VEVENT',
      'BEGIN:VEVENT', 'SUMMARY:Birthday', 'DTSTART;VALUE=DATE:20261122', 'END:VEVENT',
      'BEGIN:VEVENT', 'SUMMARY:Guest lecture', 'DTSTART:20261125T140000', 'DTEND:20261125T150000', 'END:VEVENT',
      'BEGIN:VEVENT', 'SUMMARY:Old talk', 'DTSTART:20260901T140000', 'END:VEVENT',
      'BEGIN:VEVENT', 'SUMMARY:Physics quiz', 'DTSTART:20261201T090000', 'DTEND:20261201T093000', 'END:VEVENT',
    ].join('\r\n'),
  );
  const plan = importPlan(ev, {}, { today: '2026-10-26' });
  assert.deepEqual(plan.classes.map((c) => [c.title, c.repeat, c.days, c.rangeEnd || c.date]), [
    ['Chemistry', 'weekly', [1, 4], '2026-12-18'],
    ['Guest lecture', 'once', [], '2026-11-25'],
  ]);
  assert.deepEqual(plan.vacations.map((v) => [v.title, v.start, v.end]), [['Teachers holiday', '2026-11-20', '2026-11-20']]);
  assert.deepEqual(plan.exams.map((e) => [e.title, e.duration]), [['Physics quiz', 30]]);
});

test('import: what the app already has is skipped', () => {
  const plan = importPlan(events, { classes: [{ title: 'Physics, lab', repeat: 'weekly', days: [1, 3], start: '09:00' }], exams: [exam], vacations: [brk] }, { today: '2026-10-26' });
  assert.deepEqual(plan.classes.map((c) => c.title), ['Football']);
  assert.deepEqual(plan.exams.map((e) => e.title), ['Essay due']);
  assert.equal(plan.vacations.length, 0);
  assert.equal(plan.skipped, 3);
});

test('import: subject, teacher, notes, category and online link come back from our own file', () => {
  const online = { id: 'c9', title: 'Maths tutorial', repeat: 'weekly', days: [2], start: '19:00', end: '20:00', range: 'none', mode: 'online', link: 'https://meet.example/x', subjectId: 's2', notes: 'Bring, homework' };
  const t2 = buildIcs({ ...data, classes: [physics, football, online] }, { fromKey: '2026-10-26', days: 27 });
  const plan = importPlan(parseIcs(t2), { subjects: [{ id: 'p1', name: 'physics' }, { id: 'm1', name: 'Maths' }] }, { today: '2026-10-26' });
  const phys = plan.classes.find((c) => c.title === 'Physics, lab');
  assert.equal(phys.subjectId, 'p1', 'matched by name, any case');
  assert.equal(phys.teacher, 'Dr Rao');
  assert.equal(phys.notes, '', 'the readable DESCRIPTION is not copied into notes');
  assert.equal(phys.location, 'Room 4');
  assert.equal(plan.classes.find((c) => c.title === 'Football').category, 'sport');
  const tut = plan.classes.find((c) => c.title === 'Maths tutorial');
  assert.deepEqual([tut.mode, tut.link, tut.location, tut.notes, tut.subjectId], ['online', 'https://meet.example/x', '', 'Bring, homework', 'm1']);
  const ex = plan.exams.find((e) => e.title === 'Calculus mid-term');
  assert.deepEqual([ex.kind, ex.subjectId, ex.building], ['Mid-term', 'm1', 'Hall B, 2']);
  assert.equal(plan.exams.find((e) => e.title === 'Essay due').kind, 'Test');
});

test('import: a file from another app keeps its description as notes', () => {
  const src = ['BEGIN:VEVENT', 'SUMMARY:Art', 'DTSTART:20261102T100000', 'RRULE:FREQ=WEEKLY', 'DESCRIPTION:Bring paints', 'END:VEVENT'].join('\n');
  const [c] = importPlan(parseIcs(src), {}).classes;
  assert.deepEqual([c.notes, c.days, c.end, c.subjectId], ['Bring paints', [1], null, null]);
});

test('garbage in gives nothing', () => {
  assert.deepEqual(parseIcs('hello'), []);
  assert.deepEqual(parseIcs(''), []);
  assert.deepEqual(importPlan([], {}), { classes: [], exams: [], vacations: [], skipped: 0 });
});

console.log(`ics: ${pass} passed`);
