// Screenshots of every feature, for docs/feature-guide (the Word guide). Needs the web app running and the demo
// accounts (scripts/seed-demo.mjs). Makes one more, demo.showcase@example.com, with the app's sample data.
//   node scripts/feature-screenshots.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// the sign-up form's consent (18 or older, and the terms agreed), by data-testid so it works in any language
const giveConsent = async (p) => {
  await p.locator('[data-testid="consent-adult"]').first().click();
  const agree = p.locator('[data-testid="consent-agree"]').first();
  if ((await agree.getAttribute('aria-checked')) !== 'true') await agree.click();
};

const APP = process.env.APP_URL || 'http://localhost:8081/';
// the Physics group's link (id.code), written by scripts/seed-demo.mjs when it makes the demo groups
const DEMO_GROUP = fs.existsSync(new URL('./.demo-group-link', import.meta.url)) ? fs.readFileSync(new URL('./.demo-group-link', import.meta.url), 'utf8').trim() : '';
const OUT = new URL('../docs/feature-guide/screenshots/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const PW = 'DemoPass123!';
// notes for the AI flashcards shot
const AI_NOTES = 'Photosynthesis happens in chloroplasts. The light reactions in the thylakoid membranes use light to split water, releasing oxygen and making ATP and NADPH. The Calvin cycle in the stroma uses that ATP and NADPH to fix carbon dioxide into sugar; the enzyme RuBisCO does the fixing. Chlorophyll absorbs red and blue light and reflects green.';
const done = [];
const failed = [];

// The showcase account as it should be: English, Light, and without the task the offline shot adds. Run before the
// shots (an earlier run may have stopped half way) and after them.
async function resetShowcase() {
  const env = Object.fromEntries(
    fs
      .readFileSync(new URL('../.env.development.local', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
  );
  const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email: 'demo.showcase@example.com', password: PW });
  const r = await sb.from('records').select('data').eq('kind', 'singleton').eq('id', 'settings').single();
  if (r.data) await sb.from('records').upsert([{ kind: 'singleton', id: 'settings', deleted: false, data: { ...r.data.data, language: 'system', theme: 'light' } }], { onConflict: 'user_id,kind,id' });
  const { data: rows } = await sb.from('records').select('id,data').eq('kind', 'task').eq('deleted', false);
  const extra = (rows || []).filter((t) => t.data && t.data.title === 'Added while offline');
  if (extra.length) await sb.from('records').upsert(extra.map((t) => ({ kind: 'task', id: t.id, deleted: true, data: null })), { onConflict: 'user_id,kind,id' });
}
await resetShowcase();

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge', headless: true });

async function session({ email, name, signup = false, viewport = { width: 1280, height: 860 }, scheme = 'light', url = APP }) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  return { ctx, page, signin: () => signin(page, { email, name, signup }) };
}
async function signin(page, { email, name, signup }) {
  try {
    await page.getByText('Skip', { exact: true }).first().click({ timeout: 60000 });
  } catch {
    /* no intro */
  }
  await page.getByPlaceholder('you@example.com').first().fill(email);
  await page.getByPlaceholder('Your password').first().fill(PW);
  await page.getByText('Sign in', { exact: true }).last().click();
  const ok = await page.getByText('QUOTE OF THE DAY').first().waitFor({ timeout: 20000 }).then(() => true, () => false);
  if (ok || !signup) return;
  // first time: make the account, with the sample data
  await page.getByText('Create account', { exact: true }).first().click();
  await page.getByPlaceholder('Your name').first().fill(name);
  await page.getByPlaceholder('you@example.com').first().fill(email);
  await page.getByPlaceholder('At least 6 characters').first().fill(PW);
  await page.getByPlaceholder('Re-enter password').first().fill(PW);
  await giveConsent(page);
  const box = page.locator('[aria-label="Start with sample data"]').first();
  if ((await box.getAttribute('aria-checked')) !== 'true') await box.click();
  await page.getByText('Create account', { exact: true }).last().click();
  await page.getByText('QUOTE OF THE DAY').first().waitFor({ timeout: 30000 });
}

async function shot(page, file, title, steps) {
  if (process.env.ONLY_MISSING && fs.existsSync(fileURLToPath(new URL(file, OUT)))) return done.push({ file, title });
  try {
    if (steps) await steps();
    await page.waitForTimeout(900);
    await page.screenshot({ path: fileURLToPath(new URL(file, OUT)) });
    done.push({ file, title });
    console.log(`  ✓ ${file}  ${title}`);
  } catch (e) {
    failed.push({ file, title, why: String(e.message).split('\n')[0] });
    console.log(`  ✗ ${file}  ${title}: ${String(e.message).split('\n')[0]}`);
  }
}
const closeSheets = async (page) => {
  for (let i = 0; i < 3; i++) {
    const c = page.locator('[aria-label="Close sheet"]');
    if (!(await c.count())) break;
    await c.last().click().catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.keyboard.press('Escape').catch(() => {});
};
// a menu entry (its label can carry a count: "Dashboard 3, 3 alerts"); a step that fails is reported, not fatal
const nav = (page, label) =>
  page
    .locator(`[aria-label^="${label}"]`)
    .first()
    .click({ timeout: 10000 })
    .catch((e) => console.log(`  ! couldn't open ${label}: ${String(e.message).split('\n')[0]}`));

// ---------- before signing in ----------
{
  const { ctx, page } = await session({ email: '' });
  await shot(page, '01-intro.png', 'Welcome slides', () => page.getByText('Skip', { exact: true }).first().waitFor({ timeout: 60000 }));
  await page.getByText('Skip', { exact: true }).first().click();
  await shot(page, '02-sign-in.png', 'Sign in', () => page.getByPlaceholder('you@example.com').first().waitFor());
  await shot(page, '03-create-account.png', 'Create account (password strength, sample data)', async () => {
    await page.getByText('Create account', { exact: true }).first().click();
    await page.getByPlaceholder('Your name').first().fill('Asha Patel');
    await page.getByPlaceholder('you@example.com').first().fill('asha@example.com');
    await page.getByPlaceholder('At least 6 characters').first().fill('Study2026!');
  });
  await ctx.close();
}

// ---------- the sample-data account: most features ----------
{
  const s = await session({ email: 'demo.showcase@example.com', name: 'Asha Patel', signup: true });
  const { page } = s;
  await s.signin();
  // the default theme (Light), whatever an earlier run left
  await page.locator('[aria-label="Settings"]').first().click();
  await page.getByText('Light', { exact: true }).first().click();
  await nav(page, 'Dashboard');
  await page.waitForTimeout(3000);
  await shot(page, '04-dashboard.png', 'Dashboard');
  await shot(page, '05-smart-plan.png', 'Smart plan for today', () => page.getByText('Smart plan for today').first().scrollIntoViewIfNeeded());
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, '46-quick-add.png', 'Quick add: a task from one line', () => page.locator('[aria-label="Quick add a task"]').first().fill('Physics worksheet fri 45 min 5pm !'));
  await page.locator('[aria-label="Quick add a task"]').first().fill('');
  // these two ask Claude (2 of the account's 30 a day); ONLY_MISSING=1 keeps them once taken
  await shot(page, '42-ai-advice.png', 'AI study helper: what to study now', async () => {
    await page.getByText('What should I study now?', { exact: true }).first().click();
    await page.getByRole('button', { name: 'What should I study now?' }).last().click();
    await page.getByText('Ask again', { exact: true }).last().waitFor({ timeout: 90000 });
  });
  await shot(page, '43-ai-cards.png', 'AI study helper: flashcards from notes', async () => {
    await page.getByRole('tab', { name: 'Flashcards' }).last().click();
    await page.locator('[aria-label="Your notes"]').last().fill(AI_NOTES);
    await page.getByRole('button', { name: 'Make flashcards' }).last().click();
    await page.getByText(/cards? made\. Untick/).last().waitFor({ timeout: 90000 });
  });
  await closeSheets(page);
  await shot(page, '06-new-task.png', 'New task sheet', async () => {
    await page.locator('[aria-label="New task from menu"]').first().click();
    await page.getByPlaceholder('What do you need to study?').first().fill('Revise chapter 6: thermodynamics');
  });
  await closeSheets(page);
  await shot(page, '07-edit-task-steps.png', 'A task with steps and a link', () => page.locator('[aria-label="Edit task Problem set 5: series"]').first().click());
  await closeSheets(page);
  await shot(page, '08-multi-select.png', 'Select several tasks at once', () => page.getByText('Select', { exact: true }).first().click());
  await page.keyboard.press('Escape');
  await page.reload({ waitUntil: 'load' });
  await page.getByText('QUOTE OF THE DAY').first().waitFor({ timeout: 60000 });
  await shot(page, '09-search.png', 'Search', async () => {
    await page.getByPlaceholder('Search tasks, exams, classes…').first().fill('cal');
  });
  await page.getByPlaceholder('Search tasks, exams, classes…').first().fill('');
  await page.keyboard.press('Escape');
  await shot(page, '10-notifications.png', 'Notifications bell', () => page.locator('[aria-label="Notifications"]').first().click());
  await page.keyboard.press('Escape');
  await page.mouse.click(640, 400);

  await nav(page, 'Calendar page');
  await shot(page, '11-calendar-month.png', 'Calendar: month', () => page.getByText('Month', { exact: true }).first().click());
  await shot(page, '12-calendar-week.png', 'Calendar: week', () => page.getByText('Week', { exact: true }).first().click());
  await page.getByText('Month', { exact: true }).first().click();
  await shot(page, '13-upcoming-exams.png', 'Upcoming exams', async () => {
    await page.getByRole('tab', { name: /Upcoming exams/ }).first().click();
    await page.getByRole('tab', { name: /Upcoming exams/ }).first().scrollIntoViewIfNeeded();
  });
  await shot(page, '14-exam-prep.png', 'Exam prep plan', async () => {
    await page.locator('[aria-label^="Make a prep plan for"]').first().click();
    await page.locator('[aria-label="Topics (optional)"]').last().fill('Limits, Derivatives, Integrals');
  });
  await closeSheets(page);
  await shot(page, '14b-task-exam-link.png', 'Linking a task to an exam', async () => {
    await page.locator('[aria-label="New task from menu"]').first().click();
    await page.getByPlaceholder('What do you need to study?').first().fill('Revise chapter 4 for the exam');
    const pick = page.locator('[aria-label^="Link to exam"]').first();
    await pick.scrollIntoViewIfNeeded();
    await pick.click();
  });
  // link two tasks from the exam's side (undone afterwards, so the account stays as it was)
  await shot(page, '14c-exam-link-tasks.png', 'Linking tasks from an exam', async () => {
    await page.getByRole('tab', { name: /Upcoming exams/ }).first().click();
    await page.locator('[aria-label^="Link tasks to"]').first().click();
    const rows = page.locator('[aria-label^="Link "][aria-label$=" to this exam"]');
    await rows.first().waitFor();
    await rows.first().click();
    await rows.first().click();
  });
  await closeSheets(page);
  await nav(page, 'Dashboard');
  await shot(page, '14d-task-exam-badge.png', 'A task showing the exam it is for', async () => {
    const badge = page.getByText(/^For .+ · /).first();
    await badge.waitFor({ timeout: 15000 });
    await badge.scrollIntoViewIfNeeded();
  });
  // put the account back: unlink them again
  await nav(page, 'Calendar page');
  await page.getByRole('tab', { name: /Upcoming exams/ }).first().click();
  await page.locator('[aria-label^="Link tasks to"]').first().click();
  for (let i = 0; i < 4 && (await page.locator('[aria-label^="Unlink "]').count()); i++) await page.locator('[aria-label^="Unlink "]').first().click();
  await closeSheets(page);
  await shot(page, '15-timetable.png', 'Weekly timetable and attendance', async () => {
    await page.getByRole('tab', { name: /Weekly timetable/ }).first().click();
    await page.getByRole('tab', { name: /Weekly timetable/ }).first().scrollIntoViewIfNeeded();
  });
  await shot(page, '16-add-class.png', 'Add a class', () => page.locator('[aria-label="Add class"]').first().click());
  await closeSheets(page);
  await shot(page, '17-vacations.png', 'Vacations and breaks', async () => {
    await page.getByRole('tab', { name: /Vacations/ }).first().click();
    await page.getByRole('tab', { name: /Vacations/ }).first().scrollIntoViewIfNeeded();
  });

  await nav(page, 'Focus Timer page');
  await shot(page, '18-focus-timer.png', 'Focus timer');
  await nav(page, 'Subjects page');
  await shot(page, '19-subjects.png', 'Subjects');
  await nav(page, 'Flashcards page');
  await shot(page, '37-flashcards.png', 'Flashcards');
  await shot(page, '38-flashcard-review.png', 'Reviewing flashcards', async () => {
    await page.getByText(/^Review \d+ cards?$/).first().click();
    await page.getByText('Show answer', { exact: true }).last().click();
  });
  await closeSheets(page);
  await shot(page, '39-add-cards.png', 'Paste many flashcards at once', async () => {
    await page.getByText('Add cards', { exact: true }).first().click();
    await page.getByText('Paste many', { exact: true }).last().click();
    await page.locator('[aria-label="One card per line: question | answer"]').last().fill('Unit of force | newton (N)\nSpeed of light | about 300,000 km per second\nFirst law of thermodynamics | energy is conserved');
  });
  await closeSheets(page);
  await nav(page, 'Progress page');
  await shot(page, '20-progress.png', 'Progress');
  await shot(page, '21-weekly-review.png', 'Weekly review', () => page.locator('[aria-label^="Weekly review:"]').first().click());
  await closeSheets(page);
  await shot(page, '40-progress-report.png', 'Progress report for parents and teachers', () => page.locator('[aria-label="Progress report: share it as a PDF or a message"]').first().click());
  await closeSheets(page);
  await shot(page, '41-achievements.png', 'Achievements and streak protection', () => page.getByText('Achievements', { exact: true }).first().scrollIntoViewIfNeeded());
  await shot(page, '22-grades.png', 'Grades and GPA', () => page.getByText('Grades', { exact: true }).first().scrollIntoViewIfNeeded());
  await shot(page, '23-what-if.png', 'What score do I need? (what-if)', async () => {
    const open = page.locator('[aria-label="What do I need? Try a target grade"]').first();
    await open.scrollIntoViewIfNeeded();
    await open.click();
    await page.locator('[aria-label="Target 90%"]').last().click();
  });
  await closeSheets(page);
  await shot(page, '24-attendance.png', 'Attendance', () => page.getByText(/^Attendance/).first().scrollIntoViewIfNeeded());

  await page.locator('[aria-label="Settings"]').first().click();
  await shot(page, '25-settings.png', 'Settings');
  await shot(page, '26-settings-sync.png', 'Cloud sync, smart reminders and data', () => page.getByText('Cloud sync', { exact: true }).first().scrollIntoViewIfNeeded());
  await shot(page, '47-reading.png', 'Text size and the easier-to-read font', () => page.getByText('Text size', { exact: true }).first().scrollIntoViewIfNeeded());
  await shot(page, '48-privacy.png', 'Privacy & data', () => page.getByText('Privacy & data', { exact: true }).first().click());
  await closeSheets(page);
  await shot(page, '49-premium.png', 'Study Planner Premium', () => page.getByText('Study Planner Premium', { exact: true }).first().click());
  await closeSheets(page);
  await shot(page, '27-profile.png', 'Profile', () => page.getByText('View profile', { exact: true }).first().click());
  await shot(page, '28-shortcuts.png', 'Keyboard shortcuts', async () => {
    await page.mouse.click(700, 500);
    await page.keyboard.press('Shift+Slash');
  });
  await closeSheets(page);

  await s.ctx.close();
}

// ---------- dark mode (chosen in Settings, then back to Light), another language, and offline ----------
{
  const s = await session({ email: 'demo.showcase@example.com' });
  const { page } = s;
  await s.signin();
  await page.locator('[aria-label="Settings"]').first().click();
  await page.getByText('Dark', { exact: true }).first().click();
  await nav(page, 'Dashboard');
  await shot(page, '29-dark-mode.png', 'Dark mode', () => page.waitForTimeout(2000));
  await page.locator('[aria-label="Settings"]').first().click();
  await page.getByText('Light', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await s.ctx.close();
}
{
  const s = await session({ email: 'demo.showcase@example.com' });
  const { page } = s;
  await s.signin();
  // offline first (in English), then another language last: the account is put back at the end of the script
  await s.ctx.route(/\.supabase\.co\/rest\//, (r) => r.abort('internetdisconnected'));
  await page.locator('[aria-label="New task from menu"]').first().click();
  await page.getByPlaceholder('What do you need to study?').first().fill('Added while offline');
  await page.getByText('Add task', { exact: true }).last().click();
  await shot(page, '31-not-synced-dot.png', 'The "not synced" dot (offline)', () => page.locator('[data-testid="unsynced-dot"]').first().waitFor({ timeout: 20000 }));
  await s.ctx.unroute(/\.supabase\.co\/rest\//);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(4000);
  await page.locator('[aria-label="Settings"]').first().click();
  await page.getByText('हिन्दी', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await shot(page, '30-hindi.png', 'Four languages (Hindi shown)', () => page.locator('[aria-label^="डैशबोर्ड"]').first().click());
  await s.ctx.close();
}

await resetShowcase(); // back to English after the Hindi shot

// ---------- phone size ----------
{
  const s = await session({ email: 'demo.showcase@example.com', viewport: { width: 390, height: 844 } });
  await s.signin();
  await shot(s.page, '32-phone.png', 'On a phone', () => s.page.waitForTimeout(2000));
  await s.ctx.close();
}

// ---------- study groups (Priya owns them) ----------
{
  const s = await session({ email: 'demo.priya@example.com' });
  const { page } = s;
  await s.signin();
  await page.locator('[aria-label="Settings"]').first().click();
  await shot(page, '33-share-live-group.png', 'Share a live study group (link and QR code)', async () => {
    await page.getByText('Share my timetable', { exact: true }).first().click();
    await page.locator('[aria-label="Show the link for Physics study group"]').first().click();
    await page.locator('[aria-label="Show QR code"]').last().click();
  });
  await shot(page, '34-group-board-owner.png', 'Group board: notes and shared tasks', async () => {
    await page.locator('[aria-label="Open the board for Physics study group"]').first().click();
    await page.getByText('Physics study group: board').last().waitFor();
  });
  await s.ctx.close();
}
{
  const s = await session({ email: 'demo.arjun@example.com' });
  const { page } = s;
  await s.signin();
  await page.locator('[aria-label="Settings"]').first().click();
  await shot(page, '35-group-member.png', 'A member’s view of the board', async () => {
    await page.locator('[aria-label="Open the board for Physics study group"]').first().click();
    await page.getByText('Physics study group: board').last().waitFor();
  });
  await s.ctx.close();
}
{
  const s = await session({ email: 'demo.meera@example.com', url: `${APP}#group=${DEMO_GROUP}` });
  await s.signin();
  await shot(s.page, '36-join-group.png', 'Joining a group from a link', () => s.page.getByText('Join a study group').first().waitFor({ timeout: 30000 }));
  await s.ctx.close();
}

// ---------- study together and replies: Priya focuses while Arjun looks (both left as they were) ----------
{
  const p = await session({ email: 'demo.priya@example.com' });
  await p.signin();
  await nav(p.page, 'Focus Timer page');
  await p.page.locator('[aria-label="Start timer"]').first().click();
  const a = await session({ email: 'demo.arjun@example.com' });
  const { page } = a;
  await a.signin();
  await nav(page, 'Focus Timer page');
  await shot(page, '44-studying-now.png', 'Study together: who’s studying now, with Join', () => page.getByText('Priya Sharma', { exact: true }).first().waitFor({ timeout: 20000 }));
  await page.locator('[aria-label="Settings"]').first().click();
  await shot(page, '45-board-replies.png', 'Replies on the group board', async () => {
    await page.locator('[aria-label="Open the board for Physics study group"]').first().click();
    await page.getByRole('button', { name: /^Reply$|^Show \d+ repl/ }).first().click();
    await page.locator('[aria-label="Your reply"]').last().fill('Is it chapters 4 and 5?');
    await page.locator('[aria-label="Send reply"]').last().click();
    await page.getByText('Is it chapters 4 and 5?', { exact: true }).first().waitFor({ timeout: 10000 });
  });
  await page.locator('[aria-label="Delete the reply from You"]').first().click().catch(() => {});
  await page.waitForTimeout(1000);
  await p.page.locator('[aria-label="Pause timer"]').first().click().catch(() => {});
  await p.page.waitForTimeout(1000);
  await a.ctx.close();
  await p.ctx.close();
}

await browser.close();
await resetShowcase();
fs.writeFileSync(fileURLToPath(new URL('index.json', OUT)), JSON.stringify({ done, failed }, null, 2));
console.log(`\n${done.length} screenshots, ${failed.length} failed`);
