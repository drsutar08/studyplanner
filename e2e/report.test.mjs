// Unit tests for the weekly report and subject goals. Pure logic, no browser: `npm run test:report`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'report-'));
const copy = (src, name) =>
  fs.writeFileSync(
    path.join(tmp, name),
    fs.readFileSync(new URL(`../src/${src}`, import.meta.url), 'utf8').replace("'./grades'", "'./grades.mjs'").replace("'./attendance'", "'./attendance.mjs'").replace("'./classes'", "'./classes.mjs'")
  );
copy('classes.js', 'classes.mjs');
copy('grades.js', 'grades.mjs');
copy('attendance.js', 'attendance.mjs');
copy('report.js', 'report.mjs');
const { weeklyReport, goalProgress, weekElapsed, GOAL_OPTIONS, reportNotice } = await import(pathToFileURL(path.join(tmp, 'report.mjs')).href);

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

// week of Sun 2026-10-25 .. Sat 2026-10-31; today Thu 2026-10-29
const START = '2026-10-25';
const TODAY = '2026-10-29';
const subjects = [
  { id: 'm', name: 'Maths', color: '#f00', weeklyGoal: 180 },
  { id: 'p', name: 'Physics', color: '#0f0', weeklyGoal: 60 },
  { id: 'h', name: 'History', color: '#00f' },
];
const s = (date, subjectId, minutes) => ({ id: `${date}${subjectId}${minutes}`, date, subjectId, minutes });
const sessions = [s('2026-10-26', 'm', 30), s('2026-10-27', 'm', 20), s('2026-10-26', 'p', 50), s('2026-10-28', 'p', 25), s('2026-10-20', 'h', 120), s('2026-10-21', 'h', 60), s('2026-10-27', 'h', 30), s('2026-10-24', 'm', 999)];
const tasks = [
  { id: 't1', subjectId: 'm', due: '2026-10-27', done: true, completedAt: '2026-10-27' },
  { id: 't2', subjectId: 'm', due: '2026-10-28', done: false },
  { id: 't3', subjectId: 'p', due: '2026-11-02', done: false },
  { id: 't4', subjectId: 'h', due: '2026-10-20', done: true, completedAt: '2026-10-21' },
];
const exams = [
  { id: 'e1', subjectId: 'p', title: 'Optics quiz', date: '2026-11-05' },
  { id: 'e2', subjectId: 'h', title: 'Essay', date: '2026-10-10', score: 11, outOf: 20 },
  { id: 'e3', subjectId: 'm', title: 'Mid-term', date: '2026-11-30' },
];
const classes = [{ id: 'c1', subjectId: 'h', repeat: 'weekly', days: [1], attendance: { '2026-10-05': 'attended', '2026-10-12': 'missed', '2026-10-19': 'missed', '2026-10-26': 'excused' } }];
const data = { subjects, tasks, sessions, exams, classes };

test('goal options start with "no goal"', () => assert.equal(GOAL_OPTIONS[0], 0));

test('week elapsed: past week 1, future 0, mid-week by days with today half done', () => {
  assert.equal(weekElapsed(START, '2026-11-05'), 1);
  assert.equal(weekElapsed(START, '2026-10-20'), 0);
  assert.equal(weekElapsed(START, TODAY), 4.5 / 7);
});

test('goal progress: minutes this week only, pct, left and on track', () => {
  const m = goalProgress(subjects[0], sessions, START, TODAY);
  assert.deepEqual(m, { goal: 180, minutes: 50, pct: 28, left: 130, onTrack: false });
  const p = goalProgress(subjects[1], sessions, START, TODAY);
  assert.equal(p.minutes, 75);
  assert.equal(p.pct, 125);
  assert.equal(p.left, 0);
  assert.equal(p.onTrack, true);
  assert.equal(goalProgress(subjects[2], sessions, START, TODAY), null);
});

const r = weeklyReport(data, START, { today: TODAY });

test('totals for the week and the week before', () => {
  assert.equal(r.start, START);
  assert.equal(r.end, '2026-10-31');
  assert.equal(r.total, 155);
  assert.equal(r.prevTotal, 180 + 999);
  assert.equal(r.done, 1, 'only tasks finished this week');
  assert.equal(r.overdue, 1);
});

test('per subject rows, most focus time first', () => {
  assert.deepEqual(r.subjects.map((x) => [x.name, x.minutes, x.prevMinutes]), [['Physics', 75, 0], ['Maths', 50, 999], ['History', 30, 180]]);
  const h = r.subjects.find((x) => x.id === 'h');
  assert.equal(h.average, 55);
  assert.equal(Math.round(h.attendance), 33, 'excused sessions do not count');
  const p = r.subjects.find((x) => x.id === 'p');
  assert.equal(p.nextExam.title, 'Optics quiz');
  assert.equal(p.daysToExam, 7);
});

test('falling behind: goal pace, low grade, attendance, overdue; an on-track subject is fine', () => {
  const by = Object.fromEntries(r.subjects.map((x) => [x.id, x.reasons]));
  assert.deepEqual(by.m, ['goal', 'overdue']);
  assert.deepEqual(by.p, [], 'on track for its goal, and more than an hour before the quiz');
  assert.deepEqual(by.h, ['lowGrade', 'attendance'], 'no "drop" until the week is over');
  assert.deepEqual(r.behind.map((x) => x.id), ['m', 'h']);
});

test('a finished week: a big drop against last week is flagged; an exam soon with little study is flagged', () => {
  const done = weeklyReport(data, START, { today: '2026-11-02' });
  const by = Object.fromEntries(done.subjects.map((x) => [x.id, x.reasons]));
  assert.ok(by.h.includes('drop'));
  assert.ok(by.m.includes('drop'));
  const soon = weeklyReport({ ...data, sessions: sessions.filter((x) => x.subjectId !== 'p') }, START, { today: TODAY });
  assert.ok(soon.subjects.find((x) => x.id === 'p').reasons.includes('examSoon'));
  assert.ok(soon.subjects.find((x) => x.id === 'p').reasons.includes('goal'));
  const pastWeek = weeklyReport({ ...data, sessions: sessions.filter((x) => x.subjectId !== 'p') }, START, { today: '2026-11-02' });
  assert.ok(!pastWeek.subjects.find((x) => x.id === 'p').reasons.includes('examSoon'), 'a finished week is not flagged for an exam still to come');
});

test('attendance target is a setting; nothing at all gives an empty report', () => {
  const strict = weeklyReport(data, START, { today: TODAY, attendanceTarget: 20 });
  assert.ok(!strict.subjects.find((x) => x.id === 'h').reasons.includes('attendance'));
  const empty = weeklyReport({}, START, { today: TODAY });
  assert.deepEqual([empty.total, empty.subjects, empty.behind], [0, [], []]);
});

test('the weekly report notice: 7 PM on the week’s last day, next week once it has passed', () => {
  // Thu 29 Oct 2026, weeks from Sunday: Sat 31 Oct 19:00
  let n = reportNotice(data, { now: new Date(2026, 9, 29, 10, 0) });
  assert.deepEqual([n.at.getFullYear(), n.at.getMonth(), n.at.getDate(), n.at.getHours()], [2026, 9, 31, 19]);
  assert.equal(n.report.start, START);
  assert.equal(n.report.total, 155);
  const behind = n.report.behind.map((x) => x.id);
  assert.ok(behind.includes('m') && behind.includes('h') && !behind.includes('p'), 'read as at the end of the week: ' + behind);
  // weeks from Monday: Sun 1 Nov
  n = reportNotice(data, { now: new Date(2026, 9, 29, 10, 0), weekStart: 1 });
  assert.equal(n.at.getDate(), 1);
  // Saturday after 7 PM: the next Saturday
  n = reportNotice(data, { now: new Date(2026, 9, 31, 20, 0) });
  assert.deepEqual([n.at.getMonth(), n.at.getDate()], [10, 7]);
  assert.equal(n.report.start, '2026-11-01');
  // Saturday before 7 PM: tonight
  assert.equal(reportNotice(data, { now: new Date(2026, 9, 31, 18, 59) }).at.getDate(), 31);
});

console.log(`report: ${pass} passed`);
