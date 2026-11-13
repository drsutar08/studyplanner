// "Not synced" demo: opens a browser window per demo account (scripts/seed-demo.mjs), signs in, then cuts the window
// off from Supabase (the app itself still loads) and adds a task, a class, a break, an exam and a subject on that
// device only. The app shows them with the orange "not synced" dot and, in Settings, how many are waiting. After
// --minutes (default 10) the windows reconnect and you can watch them sync and the dot go.
//   node scripts/demo-unsynced.mjs [--minutes 10] [--who priya,arjun,meera]
// Needs the web app running (npx expo start --web). Close a window any time to end it early.
import { chromium } from 'playwright-core';

const APP = process.env.APP_URL || 'http://localhost:8081';
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const MINUTES = Number(arg('minutes', '10'));
const WHO = arg('who', 'priya,arjun,meera').split(',');
const PASSWORD = 'DemoPass123!';
const PEOPLE = {
  priya: { name: 'Priya', email: 'demo.priya@example.com', subject: 'demo-phys' },
  arjun: { name: 'Arjun', email: 'demo.arjun@example.com', subject: null },
  meera: { name: 'Meera', email: 'demo.meera@example.com', subject: null },
};

const pad = (n) => String(n).padStart(2, '0');
const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// what this device adds while it can't reach the cloud
const offlineRecords = (who) => {
  const tag = `${who}-${Date.now().toString(36)}`;
  const subjectId = `unsynced-subj-${tag}`;
  return {
    subject: { id: subjectId, name: `Biology (${PEOPLE[who].name}, not synced)`, color: '#7A5CFA' },
    task: { id: `unsynced-task-${tag}`, title: `Read chapter 7 (${PEOPLE[who].name}, not synced)`, subjectId, due: day(0), time: '18:00', estimate: 40, priority: 'high', notes: 'Added while offline', done: false, completedAt: null },
    class: { id: `unsynced-class-${tag}`, title: `Biology tutorial (not synced)`, subjectId, teacher: 'Dr. Sen', repeat: 'weekly', date: null, days: [2, 4], start: '16:00', end: '17:00', range: 'none', rangeStart: null, rangeEnd: null, mode: 'inPerson', location: 'Room 12', link: '', notes: '', createdAt: day(0) },
    vacation: { id: `unsynced-break-${tag}`, title: `Field trip (not synced)`, start: day(12), end: day(13), pause: true, notes: '' },
    exam: { id: `unsynced-exam-${tag}`, title: `Biology quiz (not synced)`, subjectId, kind: 'Quiz', date: day(6), time: '09:30', duration: 30, mode: 'inPerson', building: 'Room 12', room: '', link: '', notes: '' },
  };
};

async function open(browser, who, i) {
  const p = PEOPLE[who];
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(APP, { waitUntil: 'load', timeout: 120000 });
  try {
    await page.getByText('Skip', { exact: true }).first().click({ timeout: 30000 });
  } catch {
    /* no intro */
  }
  await page.getByPlaceholder('you@example.com').first().fill(p.email);
  await page.getByPlaceholder('Your password').first().fill(PASSWORD);
  await page.getByText('Sign in', { exact: true }).last().click();
  await page.getByText('QUOTE OF THE DAY').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(4000); // the first sync finishes

  // no more cloud for this window (Supabase's REST, auth and storage); the app still loads from the dev server
  await ctx.route(/\.supabase\.co\//, (route) => route.abort('internetdisconnected'));
  const added = offlineRecords(who);
  await page.evaluate((r) => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('studyplanner:v1:'));
    const d = JSON.parse(localStorage.getItem(k));
    d.subjects.push(r.subject);
    d.tasks.push(r.task);
    d.classes.push(r.class);
    d.vacations.push(r.vacation);
    d.exams.push(r.exam);
    localStorage.setItem(k, JSON.stringify(d));
  }, added);
  await page.reload({ waitUntil: 'load' });
  await page.getByText('QUOTE OF THE DAY').first().waitFor({ timeout: 60000 });
  await page.locator('[data-testid="unsynced-dot"]').first().waitFor({ timeout: 30000 });
  console.log(`  ${p.email}: offline with 5 records not synced (task, class, break, exam, subject)`);
  return { ctx, page, who };
}

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge', headless: false });
console.log(`Opening ${WHO.length} window(s)…`);
const windows = [];
for (const [i, who] of WHO.entries()) {
  if (!PEOPLE[who]) throw new Error(`unknown account ${who} (priya, arjun or meera)`);
  windows.push(await open(browser, who, i));
}
console.log(`\nLook for the orange dot on the account button (top right), and Settings -> Cloud sync.
They reconnect in ${MINUTES} minute(s). Close a window to end it early.`);

await new Promise((resolve) => {
  const timer = setTimeout(resolve, MINUTES * 60000);
  browser.on('disconnected', () => {
    clearTimeout(timer);
    resolve();
  });
});
if (browser.isConnected()) {
  console.log('\nReconnecting…');
  for (const w of windows) {
    if (w.page.isClosed()) continue;
    await w.ctx.unroute(/\.supabase\.co\//);
    await w.page.evaluate(() => window.dispatchEvent(new Event('online'))); // the app syncs when it's back online
  }
  for (const w of windows) {
    if (w.page.isClosed()) continue;
    await w.page.locator('[data-testid="unsynced-dot"]').waitFor({ state: 'detached', timeout: 60000 }).catch(() => {});
    console.log(`  ${PEOPLE[w.who].email}: ${(await w.page.locator('[data-testid="unsynced-dot"]').count()) ? 'still waiting' : 'synced: the dot is gone'}`);
  }
  console.log('\nThe windows stay open for 2 more minutes, then close.');
  await new Promise((r) => setTimeout(r, 120000));
  await browser.close().catch(() => {});
}
