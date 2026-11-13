// Sample records for live study groups and error reports (docs/reliability.md), through the app's own API: no
// secret key. Three demo accounts on @example.com (no welcome emails), password DemoPass123!:
//   Priya Sharma  demo.priya@example.com   owns two live groups, with her timetable
//   Arjun Mehta   demo.arjun@example.com   member of both
//   Meera Iyer    demo.meera@example.com   member of the physics group
// plus a mix of error reports. Safe to run again (the groups are made afresh).
//   node scripts/seed-demo.mjs            add or refresh
//   node scripts/seed-demo.mjs --remove   delete the demo accounts (and with them their data and groups)
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs
    .readFileSync(new URL('../.env.development.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const PASSWORD = 'DemoPass123!';
const PEOPLE = {
  priya: { name: 'Priya Sharma', email: 'demo.priya@example.com' },
  arjun: { name: 'Arjun Mehta', email: 'demo.arjun@example.com' },
  meera: { name: 'Meera Iyer', email: 'demo.meera@example.com' },
};
const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const pad = (n) => String(n).padStart(2, '0');
const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// signed in as this person (made the first time)
async function as(who) {
  const p = PEOPLE[who];
  const sb = client();
  let { error } = await sb.auth.signInWithPassword({ email: p.email, password: PASSWORD });
  if (error) {
    const up = await sb.auth.signUp({ email: p.email, password: PASSWORD, options: { data: { name: p.name, language: 'en' } } });
    if (up.error) throw new Error(`${p.email}: ${up.error.message}`);
    ({ error } = await sb.auth.signInWithPassword({ email: p.email, password: PASSWORD }));
    if (error) throw new Error(`${p.email}: ${error.message}`);
    console.log(`  made ${p.email}`);
  }
  return sb;
}

if (process.argv.includes('--remove')) {
  for (const who of Object.keys(PEOPLE)) {
    const sb = client();
    const { error } = await sb.auth.signInWithPassword({ email: PEOPLE[who].email, password: PASSWORD });
    if (error) {
      console.log(`  ${PEOPLE[who].email}: not there`);
      continue;
    }
    const del = await sb.rpc('delete_my_account');
    console.log(`  ${PEOPLE[who].email}: ${del.error ? del.error.message : 'deleted, with its data and groups'}`);
  }
  console.log('Their error reports stay (without an account) until the nightly tidy removes them after 30 days.');
  process.exit(0);
}

// ---------- Priya's timetable (the records her app syncs) ----------
const subjects = [
  { id: 'demo-phys', name: 'Physics', color: '#2E86DE', weeklyGoal: 120 },
  { id: 'demo-math', name: 'Mathematics', color: '#E4572E', weeklyGoal: 180 },
  { id: 'demo-chem', name: 'Chemistry', color: '#17A398' },
];
const cls = (over) => ({ teacher: '', repeat: 'weekly', date: null, range: 'none', rangeStart: null, rangeEnd: null, mode: 'inPerson', location: '', link: '', notes: '', createdAt: day(-30), ...over });
const classes = [
  cls({ id: 'demo-c-mech', title: 'Mechanics', subjectId: 'demo-phys', teacher: 'Dr. Iyer', days: [1, 3], start: '09:00', end: '10:30', location: 'Room 101' }),
  cls({ id: 'demo-c-plab', title: 'Physics lab', subjectId: 'demo-phys', teacher: 'Dr. Iyer', days: [4], start: '14:00', end: '16:00', location: 'Lab 2' }),
  cls({ id: 'demo-c-calc', title: 'Calculus', subjectId: 'demo-math', teacher: 'Prof. Rao', days: [2, 5], start: '11:00', end: '12:00', location: 'Room 204' }),
  cls({ id: 'demo-c-org', title: 'Organic chemistry', subjectId: 'demo-chem', teacher: 'Ms. Das', days: [3], start: '13:00', end: '14:00', mode: 'online', link: 'https://meet.example.com/organic' }),
];
const exam = (over) => ({ kind: 'Exam', time: '10:00', duration: 60, mode: 'inPerson', building: 'Exam hall', room: '', link: '', notes: '', ...over });
const exams = [
  exam({ id: 'demo-x-pmid', title: 'Physics mid-term', subjectId: 'demo-phys', date: day(9), duration: 90, building: 'Hall A' }),
  exam({ id: 'demo-x-mq', title: 'Calculus quiz 3', subjectId: 'demo-math', kind: 'Quiz', date: day(4), time: '11:00', duration: 30, building: 'Room 204' }),
  exam({ id: 'demo-x-mfin', title: 'Mathematics final', subjectId: 'demo-math', date: day(35), duration: 180, building: 'Hall B' }),
  exam({ id: 'demo-x-chem', title: 'Chemistry practical', subjectId: 'demo-chem', kind: 'Practical', date: day(16), time: '14:00', duration: 120, building: 'Lab 1' }),
];
const vacations = [{ id: 'demo-v-break', title: 'Winter break', start: day(45), end: day(58), pause: true, notes: '' }];
const tasks = [
  { id: 'demo-t-1', title: 'Problem sheet: projectile motion', subjectId: 'demo-phys', due: day(1), time: null, estimate: 45, priority: 'high', notes: '', done: false, completedAt: null },
  { id: 'demo-t-2', title: 'Revise integration by parts', subjectId: 'demo-math', due: day(3), time: null, estimate: 30, priority: 'med', notes: '', done: false, completedAt: null },
];

// the group's timetable, as the app shares it (src/share.js)
const share = (group, include) => {
  const used = [];
  const s = (sid) => {
    let i = used.indexOf(sid);
    if (i < 0) i = used.push(sid) - 1;
    return i;
  };
  const c = include.classes ? classes.map((x) => ({ t: x.title, s: s(x.subjectId), r: 'weekly', w: x.days, a: x.start, b: x.end, ...(x.mode === 'online' ? { o: 1, l: x.link } : { l: x.location }), tc: x.teacher })) : [];
  const e = include.exams ? exams.map((x) => ({ t: x.title, s: s(x.subjectId), ...(x.kind !== 'Exam' ? { k: x.kind } : {}), d: x.date, a: x.time, ...(x.duration !== 60 ? { du: x.duration } : {}), l: x.building })) : [];
  const h = include.vacations ? vacations.map((v) => ({ t: v.title, a: v.start, b: v.end })) : [];
  return { v: 1, id: group.id, n: group.name, f: PEOPLE.priya.name, at: day(0), s: used.map((id) => subjects.find((x) => x.id === id)).map((x) => ({ n: x.name, c: x.color })), c, e, h };
};

console.log('Accounts');
const priya = await as('priya');
const arjun = await as('arjun');
const meera = await as('meera');

console.log("Priya's timetable");
const rows = [
  ...subjects.map((d) => ({ kind: 'subject', id: d.id, data: d })),
  ...classes.map((d) => ({ kind: 'class', id: d.id, data: d })),
  ...exams.map((d) => ({ kind: 'exam', id: d.id, data: d })),
  ...vacations.map((d) => ({ kind: 'vacation', id: d.id, data: d })),
  ...tasks.map((d) => ({ kind: 'task', id: d.id, data: d })),
].map((r) => ({ ...r, deleted: false }));
const up = await priya.from('records').upsert(rows, { onConflict: 'user_id,kind,id' });
if (up.error) throw up.error;
console.log(`  ${rows.length} records (3 subjects, 4 classes, 4 exams, a break, 2 tasks)`);

console.log('Live groups');
const old = await priya.from('study_groups').select('id').in('name', ['Physics study group', 'Maths revision']);
if (old.data && old.data.length) await priya.from('study_groups').delete().in('id', old.data.map((g) => g.id));
const make = async (name, include) => {
  const { data, error } = await priya.from('study_groups').insert({ name, owner_name: PEOPLE.priya.name, include }).select().single();
  if (error) throw error;
  const set = await priya.from('study_groups').update({ payload: share(data, include) }).eq('id', data.id).select().single();
  if (set.error) throw set.error;
  return set.data;
};
const physics = await make('Physics study group', { classes: true, exams: true, vacations: true });
const maths = await make('Maths revision', { classes: false, exams: true, vacations: false });
for (const [sb, g, who] of [[arjun, physics, 'Arjun'], [meera, physics, 'Meera'], [arjun, maths, 'Arjun']]) {
  const { error } = await sb.rpc('join_study_group', { gid: g.id, code: g.join_code });
  if (error) throw error;
  console.log(`  ${who} joined ${g.name}`);
}
// the Physics board: a pinned note and a shared task (the board screenshots show them)
for (const post of [
  { group_id: physics.id, kind: 'note', body: 'Test moved to Friday: bring a calculator', pinned: true },
  { group_id: physics.id, kind: 'task', title: 'Optics worksheet', body: 'Questions 1 to 8 from chapter 9', due: day(4), estimate: 50 },
]) {
  const { error } = await priya.from('study_group_posts').insert(post);
  if (error) throw error;
}
console.log('  Physics board: a pinned note and a shared task');
const app = 'http://localhost:8081/';
console.log(`  Physics study group (2 members): ${app}#group=${physics.id}.${physics.join_code}`);
console.log(`  Maths revision (1 member):       ${app}#group=${maths.id}.${maths.join_code}`);
// the screenshot scripts open the Physics group's link: written where they read it
fs.writeFileSync(new URL('../scripts/.demo-group-link', import.meta.url), `${physics.id}.${physics.join_code}\n`);

console.log('Error reports');
const reports = [
  [priya, { context: 'render: at TaskRow', message: "TypeError: Cannot read properties of undefined (reading 'title')", stack: 'TypeError: Cannot read properties of undefined (reading \'title\')\n    at TaskRow (index.bundle:61422:32)\n    at renderWithHooks (index.bundle:24011:18)', platform: 'web', app_version: '1.0.0' }],
  [priya, { context: 'sync', message: 'FetchError: request to /rest/v1/records timed out after 30000 ms', stack: '', platform: 'android', app_version: '1.0.0' }],
  [priya, { context: 'unhandled promise', message: 'Error: Notification permission was not granted', stack: 'Error: Notification permission was not granted\n    at scheduleReminder (notifications.js:88:11)', platform: 'android', app_version: '1.0.0' }],
  [arjun, { context: 'render: at MonthGrid', message: 'RangeError: Invalid time value', stack: 'RangeError: Invalid time value\n    at Date.toISOString (<anonymous>)\n    at MonthGrid (index.bundle:70213:9)', platform: 'ios', app_version: '1.0.0' }],
  [arjun, { context: 'sync', message: 'duplicate key value violates unique constraint "records_pkey"', stack: '', platform: 'ios', app_version: '1.0.0' }],
  [meera, { context: 'uncaught', message: 'QuotaExceededError: The quota has been exceeded (localStorage)', stack: "QuotaExceededError: Failed to execute 'setItem' on 'Storage'", platform: 'web', app_version: '1.0.0' }],
  [client(), { context: 'fatal', message: 'Invariant Violation: "main" has not been registered', stack: '', platform: 'android', app_version: '0.9.2' }],
  [client(), { context: 'uncaught', message: 'ChunkLoadError: Loading chunk 3 failed', stack: '', platform: 'web', app_version: '1.0.0' }],
];
for (const [sb, r] of reports) {
  const { error } = await sb.from('client_errors').insert({ ...r, message: `[demo] ${r.message}` });
  if (error) throw error;
}
console.log(`  ${reports.length} reports (marked [demo]): 6 from the demo accounts, 2 from signed-out devices`);

for (const sb of [priya, arjun, meera]) await sb.auth.signOut({ scope: 'local' });
console.log(`
Done. Sign in as ${PEOPLE.priya.email} / ${PASSWORD} and open Settings -> Share my timetable to see the groups.
To put these records in tonight's backup now, run in the SQL Editor:  select backup.take();`);
