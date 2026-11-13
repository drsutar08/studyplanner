// Unit tests for smart reminders. Pure logic: `npm run test:smart`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-'));
fs.writeFileSync(
  path.join(tmp, 'dates.mjs'),
  `const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const key = (d) => \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')}\`;
export const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return key(d); };`
);
fs.writeFileSync(path.join(tmp, 'smart.mjs'), fs.readFileSync(new URL('../src/smartReminders.js', import.meta.url), 'utf8').replace("'./dates'", "'./dates.mjs'"));
const { usualStudyTime, nudgeFor, nextNudge, nudgeNow } = await import(pathToFileURL(path.join(tmp, 'smart.mjs')).href);

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
const s = (date, at) => ({ date, at, minutes: 25 });
const sessions = [s('2026-10-26', '18:10'), s('2026-10-27', '18:40'), s('2026-10-28', '09:15'), s('2026-10-29', '18:05'), s('2026-10-30', '21:00'), s('2026-10-31', '09:30')];
const data = {
  sessions,
  tasks: [
    { id: 1, due: '2026-11-03', done: false },
    { id: 2, due: '2026-11-03', done: false },
    { id: 3, due: '2026-11-03', done: true },
    { id: 4, due: '2026-11-02', done: false },
  ],
  exams: [{ title: 'Physics mid-term', date: '2026-11-05' }, { title: 'Later', date: '2026-11-20' }],
};

test('the usual study time: the hour most sessions started in', () => {
  assert.equal(usualStudyTime(sessions, '2026-11-02'), '18:00');
  assert.equal(usualStudyTime(sessions.slice(0, 2), '2026-11-02'), null); // too few
  assert.equal(usualStudyTime([s('2026-10-26', '08:00'), s('2026-10-27', '12:00'), s('2026-10-28', '20:00')], '2026-11-02'), null); // no habit
  assert.equal(usualStudyTime(sessions, '2026-12-31'), null); // all too long ago
  assert.equal(usualStudyTime([s('2026-10-26', '09:00'), s('2026-10-27', '09:10'), s('2026-10-28', '19:00'), s('2026-10-29', '19:20')], '2026-11-02'), '19:00'); // a tie: the later
});

test('what a nudge says: due that day and the next, the nearest exam within 3 days; nothing on a free day', () => {
  assert.deepEqual(nudgeFor(data, '2026-11-02'), { day: '2026-11-02', today: 1, tomorrow: 2, exam: { title: 'Physics mid-term', date: '2026-11-05' } });
  assert.equal(nudgeFor(data, '2026-11-10'), null);
});

test('the next nudge: at the usual time today, or tomorrow once it has passed or a session has started', () => {
  const at = (h, m) => new Date(2026, 10, 2, h, m);
  const n = nextNudge(data, at(10, 0));
  assert.equal(n.at.getTime(), new Date(2026, 10, 2, 18, 0).getTime());
  assert.equal(n.tomorrow, 2);
  assert.equal(nextNudge(data, at(19, 0)).at.getDate(), 3); // passed: tomorrow
  const studied = { ...data, sessions: [...sessions, s('2026-11-02', '17:20')] };
  assert.equal(nextNudge(studied, at(17, 30)).at.getDate(), 3);
  assert.equal(nextNudge({ ...data, tasks: [], exams: [] }, at(10, 0)), null);
});

test('in the app: from half an hour before to 90 minutes after, unless a session has started', () => {
  const at = (h, m) => new Date(2026, 10, 2, h, m);
  assert.equal(nudgeNow(data, at(17, 20)), null);
  assert.equal(nudgeNow(data, at(17, 40)).time, '18:00');
  assert.equal(nudgeNow(data, at(19, 25)).today, 1);
  assert.equal(nudgeNow(data, at(19, 40)), null);
  assert.equal(nudgeNow({ ...data, sessions: [...sessions, s('2026-11-02', '17:45')] }, at(18, 10)), null);
});

console.log(`smartReminders: ${pass} passed`);
