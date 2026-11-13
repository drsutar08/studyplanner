import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// the sign-up form's consent (18 or older, and the terms agreed), by data-testid so it works in any language
const giveConsent = async (p) => {
  await p.locator('[data-testid="consent-adult"]').first().click();
  const agree = p.locator('[data-testid="consent-agree"]').first();
  if ((await agree.getAttribute('aria-checked')) !== 'true') await agree.click();
};

const APP = process.env.APP_URL || 'http://localhost:8081';
const OUT = new URL('./shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const allDialogs = []; // every browser alert/confirm that appeared in any test (there should be none)
// Accounts are Supabase accounts: every one a test signs up is noted (from the app's own requests) and deleted at
// the end, so test runs don't pile up users in the project. Password changes are followed.
// (.env.development.local here: the Development project; in CI the same names come as environment variables)
const envFile = new URL('../.env.development.local', import.meta.url);
const env = fs.existsSync(envFile)
  ? Object.fromEntries(
      fs
        .readFileSync(envFile, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
    )
  : process.env;
const created = new Map(); // email -> password
const watchAccounts = (page) =>
  page.on('request', (req) => {
    if (req.method() !== 'POST' && req.method() !== 'PUT') return;
    const url = req.url();
    let body;
    try {
      body = JSON.parse(req.postData() || '{}');
    } catch {
      return;
    }
    if (url.includes('/auth/v1/signup') && body.email) created.set(body.email, body.password);
    else if (url.includes('/auth/v1/user') && body.password) {
      // a password change: the signed-in user's email is in supabase-js's stored session
      page
        .evaluate(() => {
          for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) return JSON.parse(localStorage.getItem(k)).user.email;
        })
        .then((email) => email && created.has(email) && created.set(email, body.password))
        .catch(() => {});
    }
  });
// Signed in as each test account in turn, delete it (and its rows)
async function deleteTestAccounts() {
  const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let gone = 0;
  // real accounts that must never be removed, whatever a test does
  const KEEP = new Set(['drsutar08@gmail.com']);
  for (const [email, password] of created) {
    if (KEEP.has(email.toLowerCase())) continue;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) continue; // already deleted by a test, or a password we didn't see change
    if (!(await sb.rpc('delete_my_account')).error) gone += 1;
    await sb.auth.signOut({ scope: 'local' }).catch(() => {});
  }
  console.log(`\nTest accounts deleted: ${gone} of ${created.size}`);
}
let currentSuite = '';
// Run only some suites: SUITES=B or SUITES=B,H (letters from the SUITE headers below). Default: all of them.
const ONLY = (process.env.SUITES || '').toUpperCase().split(/[\s,]+/).filter(Boolean);
const want = (letter) => !ONLY.length || ONLY.includes(letter);
if (ONLY.length) console.log(`Suites: ${ONLY.join(', ')}`);

async function step(page, id, name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ suite: currentSuite, id, name, ok: true, ms: Date.now() - t0 });
    console.log(`  PASS ${id} ${name}`);
  } catch (e) {
    const lines = String(e.message || e).split('\n');
    const waitingFor = lines.find((l) => /waiting for/.test(l)); // which locator timed out
    const msg = (lines[0] + (waitingFor ? ` [${waitingFor.replace(/\x1b\[[0-9;]*m/g, '').trim()}]` : '')).slice(0, 320);
    const shot = `${OUT}/FAIL-${id}.png`;
    await page.screenshot({ path: shot }).catch(() => {});
    results.push({ suite: currentSuite, id, name, ok: false, err: msg, ms: Date.now() - t0 });
    console.log(`  FAIL ${id} ${name}\n       ${msg}`);
  }
}

const expectVisible = (page, text, opts = {}) =>
  page.getByText(text, { exact: opts.exact ?? false }).first().waitFor({ state: 'visible', timeout: opts.timeout ?? 6000 });
const expectGone = (page, text, opts = {}) =>
  page.getByText(text, { exact: opts.exact ?? false }).first().waitFor({ state: 'hidden', timeout: opts.timeout ?? 6000 });
const tap = (page, text, exact = true) => page.getByText(text, { exact }).first().click();
const label = (page, l) => page.locator(`[aria-label="${l}"]`).first();
const ph = (page, p) => page.getByPlaceholder(p).first();
const bodyText = (page) => page.evaluate(() => document.body.innerText);
// the Focus timer's "MM:SS" (not the time of day in the top bar, which can look the same)
const focusClock = (page) => page.locator('[data-testid="focus-time"]').last().innerText();

async function newPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  watchAccounts(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => {
    // "Failed to load resource" is the browser noting an HTTP error answer (a wrong password is a 400), not a script error
    if (m.type() === 'error' && !/DevTools|favicon|shadow\*|pointerEvents|useNativeDriver|Failed to load resource/i.test(m.text())) errors.push(m.text());
  });
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); allDialogs.push(d.message()); d.accept(); });
  return { ctx, page, errors, dialogs };
}

const USER = { name: 'Test Student', email: `qa${Date.now()}@example.com`, pw: 'Secret123!' };

async function signupFlow(page) {
  await tap(page, 'Create account'); // toggle
  await ph(page, 'Your name').fill(USER.name);
  await ph(page, 'you@example.com').fill(USER.email);
  await ph(page, 'At least 6 characters').fill(USER.pw);
  await ph(page, 'Re-enter password').fill(USER.pw);
  await giveConsent(page);
  await page.getByText('Create account', { exact: true }).last().click();
}

async function loginFlow(page, email, pw) {
  await ph(page, 'you@example.com').fill(email);
  await ph(page, 'Your password').fill(pw);
  await page.getByText('Sign in', { exact: true }).last().click();
}

// Subjects is no longer a bottom tab; on a phone it is reached from the drawer on the Home screen.
async function openSubjectsMobile(page) {
  await page.getByText('Home', { exact: true }).last().click();
  await page.locator('[aria-label="Open menu"]').first().click();
  await page.getByText('Subjects', { exact: true }).first().click();
}

async function skipIntro(page) {
  const skip = page.getByText('Skip', { exact: true }).first();
  try { await skip.waitFor({ state: 'visible', timeout: 90000 }); await skip.click(); } catch { /* intro already seen */ }
}

// in CI, Playwright's own Chromium (Edge isn't there)
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge', headless: true });

/* ============================ SUITE A: phone ============================ */
currentSuite = 'Mobile (390x844)';
if (want('A')) console.log(`\n== ${currentSuite} ==`);
if (want('A')) {
  const { ctx, page, errors } = await newPage(browser, { width: 390, height: 844 });
  await page.clock.install({ time: Date.now() });
  await page.goto(APP, { waitUntil: 'load', timeout: 120000 });

  await step(page, 'A01', 'App boots: splash, intro, then login screen', async () => {
    await skipIntro(page);
    await expectVisible(page, 'Welcome back', { timeout: 90000 });
    await expectVisible(page, 'Sign in');
  });

  await step(page, 'A02', 'Login rejects unknown credentials', async () => {
    await loginFlow(page, 'nobody@example.com', 'whatever1');
    await expectVisible(page, 'Incorrect email or password.');
  });

  await step(page, 'A03', 'Login with empty fields shows a message', async () => {
    await ph(page, 'you@example.com').fill('');
    await ph(page, 'Your password').fill('');
    await page.getByText('Sign in', { exact: true }).last().click();
    await expectVisible(page, 'Enter your email and password.');
  });

  await step(page, 'A04', 'Switch to signup screen', async () => {
    await tap(page, 'Create account');
    await expectVisible(page, 'Create your account');
  });

  await step(page, 'A05', 'Signup validates name', async () => {
    await page.getByText('Create account', { exact: true }).last().click();
    await expectVisible(page, 'Please enter your full name.');
  });

  await step(page, 'A06', 'Signup validates email format', async () => {
    await ph(page, 'Your name').fill(USER.name);
    await ph(page, 'you@example.com').fill('not-an-email');
    await ph(page, 'At least 6 characters').fill(USER.pw);
    await ph(page, 'Re-enter password').fill(USER.pw);
    await giveConsent(page);
    await page.getByText('Create account', { exact: true }).last().click();
    await expectVisible(page, 'Enter a valid email address.');
  });

  await step(page, 'A07', 'Signup validates password length', async () => {
    await ph(page, 'you@example.com').fill(USER.email);
    await ph(page, 'At least 6 characters').fill('abc');
    await ph(page, 'Re-enter password').fill('abc');
    await giveConsent(page);
    await page.getByText('Create account', { exact: true }).last().click();
    await expectVisible(page, 'Password must be at least 6 characters.');
  });

  await step(page, 'A08', 'Signup flags mismatched passwords', async () => {
    await ph(page, 'At least 6 characters').fill(USER.pw);
    await ph(page, 'Re-enter password').fill('different1');
    await giveConsent(page);
    await expectVisible(page, 'Passwords do not match');
    await page.getByText('Create account', { exact: true }).last().click();
    await expectVisible(page, 'Passwords do not match.');
  });

  await step(page, 'A09', 'Password strength meter reacts', async () => {
    await ph(page, 'At least 6 characters').fill('Abcdef1!xyz');
    await expectVisible(page, 'Strong');
  });

  await step(page, 'A09b', 'Signup needs consent: a guardian under 18, and the terms agreed', async () => {
    await ph(page, 'Re-enter password').fill('Abcdef1!xyz');
    await page.locator('[data-testid="consent-minor"]').first().click();
    await page.getByText('Create account', { exact: true }).last().click();
    await expectVisible(page, 'Under 18, a parent or guardian needs to agree first');
    await page.locator('[data-testid="consent-guardian"]').first().click();
    await page.locator('[data-testid="consent-agree"]').first().click(); // ticked by A08: now off
    await page.getByText('Create account', { exact: true }).last().click();
    await expectVisible(page, 'Please agree to the Terms of use and the Privacy policy');
  });

  await step(page, 'A10', 'Valid signup lands on the dashboard', async () => {
    await ph(page, 'Re-enter password').fill('Abcdef1!xyz');
    await giveConsent(page);
    USER.pw = 'Abcdef1!xyz';
    await page.getByText('Create account', { exact: true }).last().click();
    await expectVisible(page, `, ${USER.name.split(' ')[0]}`, { timeout: 15000 });
  });

  await step(page, 'A11', 'Duplicate email is rejected (signup in a second context)', async () => {
    const second = await newPage(browser, { width: 390, height: 844 });
    // Separate storage, so seed the same users list to simulate the same device
    const users = await page.evaluate(() => localStorage.getItem('studyplanner:auth:users'));
    await second.page.addInitScript((u) => localStorage.setItem('studyplanner:auth:users', u), users);
    await second.page.goto(APP, { waitUntil: 'load' });
    await skipIntro(second.page);
    await expectVisible(second.page, 'Welcome back', { timeout: 60000 });
    await signupFlow(second.page);
    await expectVisible(second.page, 'An account with this email already exists.');
    await second.ctx.close();
  });

  await step(page, 'A12', 'Dashboard shows greeting, quote of the day and seeded tasks', async () => {
    await expectVisible(page, 'Problem set 4: integrals');
    await expectVisible(page, 'Read chapter 7: cell division');
    await expectVisible(page, 'QUOTE OF THE DAY');
    await expectVisible(page, 'Due today');
    await expectVisible(page, 'Upcoming');
  });

  await step(page, 'A13', 'Hamburger visible on Home, no back button', async () => {
    await label(page, 'Open menu').waitFor({ timeout: 4000 });
    if (await label(page, 'Go back').count()) throw new Error('back button visible on Home');
  });

  await step(page, 'A14', 'Add task: sheet opens from centre button', async () => {
    await label(page, 'Add task').click();
    await page.waitForTimeout(900);
    await expectVisible(page, 'New task');
    await expectVisible(page, 'Priority');
    await page.waitForTimeout(900); // sheet slide-in animation
  });

  await step(page, 'A15', 'Add task: empty title does not save', async () => {
    await page.getByText('Add task', { exact: true }).last().click({ force: true });
    await expectVisible(page, 'New task'); // sheet still open
    await expectVisible(page, 'Enter a title to continue');
  });

  await step(page, 'A16', 'Add task: saves with subject, priority and estimate', async () => {
    await ph(page, 'What do you need to study?').fill('E2E: revise organic chemistry');
    await tap(page, 'High');
    await page.getByText('Add task', { exact: true }).last().click();
    await expectGone(page, 'New task');
    await expectVisible(page, 'E2E: revise organic chemistry');
  });

  await step(page, 'A17', 'New high-priority task shows a High tag', async () => {
    await expectVisible(page, 'High', { exact: true });
  });

  await step(page, 'A18', 'Add a task due tomorrow shows under Coming up', async () => {
    await label(page, 'Add task').click();
    await page.waitForTimeout(900);
    await ph(page, 'What do you need to study?').fill('E2E: future reading');
    await page.getByText('Tomorrow', { exact: true }).first().waitFor({ timeout: 2000 }).catch(() => {});
    await page.getByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/).first().click();
    await page.getByText('Add task', { exact: true }).last().click();
    await expectVisible(page, 'E2E: future reading');
  });

  await step(page, 'A19', 'Complete a task updates the progress on the Due today tile', async () => {
    const before = await bodyText(page);
    const m = before.match(/(\d+) of (\d+) done\b/);
    if (!m) throw new Error('progress text missing');
    // the task card in the list (the Smart plan below it shows the same title)
    const row = page.locator('[aria-label="Edit task E2E: revise organic chemistry"]').first();
    await row.locator('[role="checkbox"]').first().click(); // the tick circle (the card has other buttons too)
    await page.waitForTimeout(300);
    const after = await bodyText(page);
    const m2 = after.match(/(\d+) of (\d+) done\b/);
    if (!m2 || Number(m2[1]) !== Number(m[1]) + 1) throw new Error(`before ${m[0]} after ${m2 && m2[0]}`);
  });

  await step(page, 'A19b', 'Tapping the Due today tile shows only today\'s tasks; tapping again shows all', async () => {
    const tile = page.locator('[role="button"]', { hasText: 'Due today' }).last();
    await tile.click();
    await page.waitForTimeout(400);
    // task cards in the list (the Smart plan may show the same titles)
    const card = page.locator('[aria-label="Edit task E2E: future reading"]');
    if (await card.count()) throw new Error('upcoming task still listed');
    await tile.click();
    await card.first().waitFor({ timeout: 4000 });
  });

  await step(page, 'A20', 'Notification bell lists due/overdue tasks', async () => {
    await label(page, 'Notifications').click();
    await expectVisible(page, 'Notifications', { exact: true });
    await expectVisible(page, /Due today|Overdue/.source ? 'Due today' : '');
    await page.keyboard.press('Escape');
    await page.mouse.click(200, 700);
  });

  await step(page, 'A21', 'Bottom tabs: Focus, Subjects, Progress, Home', async () => {
    for (const [tabName, marker] of [
      ['Focus', 'FOCUS SESSION'],
      ['Calendar', 'Upcoming exams'],
      ['Progress', 'LAST 7 DAYS'],
      ['Home', 'QUOTE OF THE DAY'],
    ]) {
      await page.getByText(tabName, { exact: true }).last().click();
      await expectVisible(page, marker);
    }
  });

  await step(page, 'A22', 'Back button shows (and hamburger hides) off Home; back returns', async () => {
    await page.getByText('Focus', { exact: true }).last().click();
    await label(page, 'Go back').waitFor({ timeout: 4000 });
    if (await label(page, 'Open menu').count()) throw new Error('hamburger visible with back button');
    await label(page, 'Go back').click();
    await expectVisible(page, 'QUOTE OF THE DAY');
  });

  await step(page, 'A23', 'Quote card: refresh shows a different quote', async () => {
    const read = async () => {
      const t = await bodyText(page);
      const a = Math.max(t.indexOf("QUOTE OF THE DAY"), t.indexOf("MORE INSPIRATION"));
      const b = t.indexOf("Today", a + 20);
      if (a < 0 || b < 0) throw new Error("quote card text not found");
      return t.slice(a + 16, b);
    };
    const q1 = await read();
    await label(page, 'New quote').click();
    await expectVisible(page, 'MORE INSPIRATION');
    const q2 = await read();
    if (q1 === q2) throw new Error('quote did not change');
    await label(page, 'Share quote').waitFor({ timeout: 2000 });
  });

  await step(page, 'A24', 'Focus: start, pause, save partial session, then the session-complete panel', async () => {
    await page.getByText('Focus', { exact: true }).last().click();
    await page.getByText('No task', { exact: true }).last().click(); // a task due today is picked for you; use a free session
    await expectVisible(page, '25:00');
    await label(page, 'Start timer').click();
    await page.clock.fastForward(95_000);
    await page.waitForTimeout(600);
    await label(page, 'Pause timer').click();
    const shown = await focusClock(page);
    if (shown === '25:00') throw new Error('timer did not advance: ' + shown);
    await label(page, 'Save session').click();
    await expectVisible(page, '25:00');
    await expectVisible(page, 'Session complete!');
    await expectVisible(page, 'Start a 5-min break');
  });

  await step(page, 'A24b', 'Focus: the saved session is in Today’s sessions; deleting it can be undone', async () => {
    const row = page.locator('[aria-label^="Delete the 2 minute session"]');
    await row.first().waitFor({ timeout: 4000 });
    await row.first().click();
    await expectVisible(page, 'Session deleted');
    if (await row.count()) throw new Error('session still listed');
    await label(page, 'Undo').click();
    await row.first().waitFor({ timeout: 4000 });
  });

  await step(page, 'A25', 'Focus: picking a task is reflected in header', async () => {
    await page.getByText('Problem set 4: integrals', { exact: true }).last().click();
    await expectVisible(page, 'Problem set 4: integrals');
  });

  await step(page, 'A26', 'Focus: duration pills change the clock', async () => {
    // the Focus length buttons by their label: task cards also show estimates like '45 min'
    await label(page, '45 min focus session').click();
    await expectVisible(page, '45:00');
    await label(page, '25 min focus session').click();
    await expectVisible(page, '25:00');
  });

  await step(page, 'A27', 'Subjects: add a subject', async () => {
    await openSubjectsMobile(page);
    await tap(page, 'New subject');
    await ph(page, 'Subject name, e.g. Physics').fill('E2E Physics');
    await page.getByText('Add subject', { exact: true }).click();
    await expectVisible(page, 'E2E Physics');
  });

  await step(page, 'A28', 'Subjects: hero counters update', async () => {
    await expectVisible(page, '4 subjects');
  });

  await step(page, 'A28b', 'Subjects: edit renames and recolours; a duplicate name is refused', async () => {
    await label(page, 'Edit E2E Physics').click();
    await expectVisible(page, 'Edit subject');
    const name = ph(page, 'Subject name, e.g. Physics');
    await name.fill('Biology');
    await expectVisible(page, 'You already have a subject called “Biology”');
    await name.fill('E2E Physics II');
    await label(page, 'Colour 4').click();
    await page.getByText('Save changes', { exact: true }).last().click();
    await expectVisible(page, 'E2E Physics II', { exact: true });
    const s = await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) return JSON.parse(localStorage.getItem(k)).subjects.find((x) => x.name === 'E2E Physics II');
    });
    if (!s || s.color !== '#7A5CFA') throw new Error('not saved: ' + JSON.stringify(s));
  });

  await step(page, 'A29', 'Subjects: delete a subject', async () => {
    await label(page, 'Delete E2E Physics II').click();
    await expectGone(page, 'E2E Physics II', { exact: true }); // exact: the undo bar also mentions the name
    await expectVisible(page, '3 subjects');
  });

  await step(page, 'A30', 'Progress: shows the saved session and no NaN', async () => {
    await page.getByText('Progress', { exact: true }).last().click();
    await expectVisible(page, 'LAST 7 DAYS');
    const t = await bodyText(page);
    if (/NaN|undefined|Infinity/.test(t)) throw new Error('bad number rendered: ' + t.match(/.{0,20}(NaN|undefined|Infinity).{0,20}/)[0]);
    await expectVisible(page, 'By subject');
    await expectVisible(page, '60 min goal');
  });

  await step(page, 'A31', 'Drawer opens from Home and navigates to Settings', async () => {
    await page.getByText('Home', { exact: true }).last().click();
    await label(page, 'Open menu').click();
    await expectVisible(page, 'MENU');
    await expectVisible(page, 'Dashboard');
    await expectVisible(page, "Today's goal");
    await page.getByText('View profile', { exact: true }).waitFor({ timeout: 3000 });
  });

  await step(page, 'A32', 'Drawer: subjects section collapses/expands', async () => {
    await expectVisible(page, 'MY SUBJECTS');
    await tap(page, 'MY SUBJECTS');
    await expectVisible(page, 'Manage subjects');
    await tap(page, 'MY SUBJECTS');
  });

  await step(page, 'A33', 'Drawer -> Profile', async () => {
    await tap(page, 'View profile');
    await expectVisible(page, USER.email);
    await expectVisible(page, 'Personal info');
  });

  await step(page, 'A34', 'Profile: edit name updates greeting', async () => {
    const f = page.locator('input[aria-label="Full name"]').last(); // other screens stay mounted and have inputs too
    await f.fill('Renamed Student');
    await tap(page, 'Save changes');
    await expectVisible(page, 'Profile updated.');
    await page.getByText('Renamed Student', { exact: true }).first().waitFor({ timeout: 4000 });
  });

  await step(page, 'A34b', 'Profile: school, course and year are saved and shown under the name', async () => {
    await page.locator('input[aria-label="School or college"]').last().fill('E2E College');
    await page.locator('input[aria-label="Course"]').last().fill('B.Sc. Physics');
    await tap(page, 'Save changes');
    await expectVisible(page, 'E2E College · B.Sc. Physics');
    const s = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:settings:')) return JSON.parse(localStorage.getItem(k)); });
    if (s.school !== 'E2E College' || s.course !== 'B.Sc. Physics') throw new Error('not saved: ' + JSON.stringify(s));
    if (await page.getByText('Save changes', { exact: true }).count()) throw new Error('Save shown with nothing to save');
  });

  await step(page, 'A35', 'Profile: change password rejects wrong current password', async () => {
    await page.getByText('Change password', { exact: true }).last().click(); // the card opens on tap
    const inputs = page.locator('input[type="password"]');
    await inputs.nth(0).fill('wrongpass1');
    await inputs.nth(1).fill('NewSecret123');
    await tap(page, 'Update password');
    await expectVisible(page, 'Current password is incorrect.');
  });

  await step(page, 'A36', 'Profile: change password succeeds', async () => {
    const inputs = page.locator('input[type="password"]');
    await inputs.nth(0).fill(USER.pw);
    await inputs.nth(1).fill('NewSecret123');
    await tap(page, 'Update password');
    await expectVisible(page, 'Password changed.');
    USER.pw = 'NewSecret123';
  });

  await step(page, 'A37', 'Session survives a full page load', async () => {
    await page.goto(APP, { waitUntil: 'load' });
    await expectVisible(page, 'Renamed', { timeout: 60000 });
  });

  await step(page, 'A38', 'Session survives a reload', async () => {
    await page.reload({ waitUntil: 'load' });
    await expectVisible(page, 'Renamed', { timeout: 60000 });
  });

  await step(page, 'A39', 'No uncaught JS errors during the run', async () => {
    const real = errors.filter((e) => !/Download the React DevTools/.test(e));
    if (real.length) throw new Error(`${real.length} console/page errors, first: ${real[0].slice(0, 160)}`);
  });

  await step(page, 'A40', 'Sign out lands on login', async () => {
    await label(page, 'Open menu').click();
    await tap(page, 'View profile');
    await tap(page, 'Sign out');
    await expectVisible(page, 'Welcome back', { timeout: 8000 });
  });

  await step(page, 'A41', 'Old password no longer works, new password does', async () => {
    await loginFlow(page, USER.email, 'Abcdef1!xyz');
    await expectVisible(page, 'Incorrect email or password.');
    await loginFlow(page, USER.email, USER.pw);
    await expectVisible(page, 'Renamed', { timeout: 15000 });
  });

  await step(page, 'A42', 'Reset study data clears tasks', async () => {
    await label(page, 'Open menu').click();
    // open settings via gear (second pressable in the user row)
    const row = page.getByText('View profile', { exact: true }).locator('xpath=ancestor::*[@tabindex="0"][1]/..');
    await row.locator('[tabindex="0"]').nth(1).click();
    await expectVisible(page, 'Study goals');
    await tap(page, 'Reset study data');
    await page.waitForTimeout(500);
    await page.getByText('Home', { exact: true }).last().click();
    await expectVisible(page, 'Nothing planned yet');
  });

  await step(page, 'A43', 'Settings: daily goal stepper changes Progress goal label', async () => {
    await label(page, 'Open menu').click();
    const row = page.getByText('View profile', { exact: true }).locator('xpath=ancestor::*[@tabindex="0"][1]/..');
    await row.locator('[tabindex="0"]').nth(1).click();
    await expectVisible(page, 'Daily focus goal');
    await expectVisible(page, '60 min', { exact: true });
    // plus button = focusable right after the "60 min" text
    const val = page.getByText('60 min', { exact: true }).last();
    await val.locator('xpath=following::*[@tabindex="0"][1]').click();
    await expectVisible(page, '75 min', { exact: true });
    await page.getByText('Progress', { exact: true }).last().click();
    await expectVisible(page, '75 min goal');
  });

  await step(page, 'A44', 'Delete account returns to login and blocks re-login', async () => {
    await label(page, 'Open menu').count();
    await page.getByText('Home', { exact: true }).last().click();
    await label(page, 'Open menu').click();
    const row = page.getByText('View profile', { exact: true }).locator('xpath=ancestor::*[@tabindex="0"][1]/..');
    await row.locator('[tabindex="0"]').nth(1).click();
    await tap(page, 'Delete account');
    // a 6-second countdown (Undo), then the cloud deletes the account
    await expectVisible(page, 'Welcome back', { timeout: 15000 });
    await loginFlow(page, USER.email, USER.pw);
    await expectVisible(page, 'Incorrect email or password.');
  });

  await page.screenshot({ path: `${OUT}/mobile-final.png` });
  await ctx.close();
}

/* ============================ SUITE B: desktop ============================ */
currentSuite = 'Desktop (1280x800)';
if (want('B')) console.log(`\n== ${currentSuite} ==`);
if (want('B')) {
  const { ctx, page } = await newPage(browser, { width: 1280, height: 800 });
  const U2 = { name: 'Desk Top', email: `desk${Date.now()}@example.com`, pw: 'Deskpass1!' };
  await page.goto(APP, { waitUntil: 'load', timeout: 120000 });

  await step(page, 'B01', 'Split-screen login layout with feature panel', async () => {
    await skipIntro(page);
    await expectVisible(page, 'Study smarter,', { timeout: 90000 });
    await expectVisible(page, 'Plan your day');
    await expectVisible(page, 'Welcome back');
    await page.screenshot({ path: `${OUT}/desktop-login.png` });
  });

  await step(page, 'B02', 'Signup on desktop works', async () => {
    await tap(page, 'Create account');
    await ph(page, 'Your name').fill(U2.name);
    await ph(page, 'you@example.com').fill(U2.email);
    await ph(page, 'At least 6 characters').fill(U2.pw);
    await ph(page, 'Re-enter password').fill(U2.pw);
    await giveConsent(page);
    await page.getByText('Create account', { exact: true }).last().click();
    await expectVisible(page, ', Desk', { timeout: 15000 });
  });

  await step(page, 'B03', 'Sidebar persistent, hamburger absent', async () => {
    await expectVisible(page, 'MENU');
    await expectVisible(page, 'Focus Timer');
    if (await label(page, 'Open menu').count()) throw new Error('hamburger shown on desktop');
    await page.screenshot({ path: `${OUT}/desktop-dashboard.png` });
  });

  await step(page, 'B04', 'Sidebar navigation switches screens and active state', async () => {
    await tap(page, 'Focus Timer');
    await expectVisible(page, 'FOCUS SESSION');
    await tap(page, 'Progress');
    await expectVisible(page, 'LAST 7 DAYS');
    await tap(page, 'Dashboard');
    await expectVisible(page, 'QUOTE OF THE DAY');
  });

  await step(page, 'B05', 'Search finds a task and a subject', async () => {
    await ph(page, 'Search tasks, exams, classes…').fill('integrals');
    await expectVisible(page, 'Problem set 4: integrals');
    await ph(page, 'Search tasks, exams, classes…').fill('Biology');
    await page.waitForTimeout(300);
    const t = await bodyText(page);
    if (!/Subject/.test(t)) throw new Error('subject hit label missing');
    await ph(page, 'Search tasks, exams, classes…').fill('zzzzqq');
    await expectVisible(page, 'No results for');
    await ph(page, 'Search tasks, exams, classes…').fill('');
  });

  await step(page, 'B06', 'Avatar menu opens Profile', async () => {
    await page.locator('[aria-label^="Account menu"]').first().click();
    await expectVisible(page, 'Sign out');
    await tap(page, 'Profile');
    await expectVisible(page, 'Personal info');
  });

  await step(page, 'B07', 'Add task from the sidebar on desktop (no bottom bar next to the sidebar)', async () => {
    if (await page.locator('[aria-label="Add task"]').count()) throw new Error('bottom bar shown next to the sidebar');
    await label(page, 'New task from menu').click();
    await page.waitForTimeout(900);
    await ph(page, 'What do you need to study?').fill('Desktop task');
    await page.getByText('Add task', { exact: true }).last().click();
    await tap(page, 'Dashboard');
    await expectVisible(page, 'Desktop task');
  });

  await step(page, 'B08', 'Browser back/forward does not blank the app', async () => {
    await tap(page, 'Subjects');
    await expectVisible(page, 'YOUR COURSES');
    await label(page, 'Go back').click();
    await expectVisible(page, 'QUOTE OF THE DAY');
  });

  await step(page, 'B09', 'Calendar, Progress and Subjects put their content side by side on desktop', async () => {
    const box = async (loc) => {
      const el = loc.last();
      await el.waitFor({ timeout: 6000 });
      return el.boundingBox();
    };
    // Calendar: a month board with each day's items, the selected day's agenda to its right, planner tabs below
    await tap(page, 'Calendar');
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const cell = await box(page.locator(`[aria-label="Day ${todayKey}"]`));
    const agenda = await box(page.getByText(/^Today · \d+ tasks?/));
    if (!(agenda.x > cell.x + cell.width)) throw new Error(`agenda not beside the board: ${JSON.stringify({ cell, agenda })}`);
    if (cell.height < 90) throw new Error('month board cells too small to list items: ' + cell.height);
    // the day's tasks are the first planner tab, under the board, like exams and vacations
    const tab = await box(page.locator('[role="tab"]').filter({ hasText: 'Tasks · Today' }));
    if (!(tab.y > cell.y)) throw new Error('planner tabs not under the board');
    await page.getByText('Problem set 4: integrals', { exact: true }).last().waitFor({ timeout: 4000 }); // listed in the open Tasks tab
    // Progress: Attendance to the right of "Minutes per day"
    await tap(page, 'Progress');
    const chart = await box(page.getByText('Minutes per day', { exact: true }));
    const attendance = await box(page.getByText('Attendance', { exact: true }));
    if (!(attendance.x > chart.x + 200)) throw new Error('progress not side by side');
    // Subjects: two subject cards on the same row
    await tap(page, 'Subjects');
    const math = await box(page.locator('[aria-label="Delete Mathematics"]'));
    const bio = await box(page.locator('[aria-label="Delete Biology"]'));
    if (Math.abs(math.y - bio.y) > 4 || bio.x <= math.x) throw new Error('subjects not in two columns');
  });

  await step(page, 'B10', 'Dashboard: hovering a task shows "+ Subtask"; pointing at it and clicking opens the subtask input', async () => {
    await tap(page, 'Dashboard');
    // .first(): the Dashboard comes first in the page; the Calendar (visited in B09) has the same task, always with its chip
    const card = page.locator('[aria-label="Edit task Problem set 4: integrals"]').first();
    await card.scrollIntoViewIfNeeded();
    const chip = page.locator('[aria-label="Add a subtask to Problem set 4: integrals"]').first();
    const opacity = () => chip.evaluate((el) => getComputedStyle(el).opacity);
    await page.mouse.move(5, 5);
    if ((await opacity()) !== '0') throw new Error('chip shown without hover');
    const box = await card.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);
    const c = await chip.boundingBox();
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 10 }); // slide onto the chip
    if ((await opacity()) !== '1') throw new Error('chip hid while pointing at it');
    await page.mouse.down();
    await page.mouse.up();
    await page.locator('[aria-label="New subtask"]').first().waitFor({ timeout: 4000 });
    if (await page.getByText('Edit task', { exact: true }).count()) throw new Error('the edit sheet opened too');
    await page.keyboard.press('Escape');
  });

  await step(page, 'B11', 'Calendar: dragging a task to another day on the month board moves it, and Undo puts it back', async () => {
    const tasks = () => page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) return JSON.parse(localStorage.getItem(k)).tasks; });
    await tap(page, 'Calendar');
    const task = (await tasks()).find((x) => x.title === 'Problem set 4: integrals');
    const chip = page.locator(`[data-drag="t:${task.id}"]`).first();
    await chip.waitFor({ timeout: 6000 });
    if ((await chip.getAttribute('draggable')) !== 'true') throw new Error('task chip is not draggable');
    // the next day, or the day before when the next one is off the board
    const keys = await page.locator('[data-daykey]').evaluateAll((els) => els.map((e) => e.getAttribute('data-daykey')));
    const [y, m, d] = task.due.split('-').map(Number);
    const near = (n) => { const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    const target = keys.includes(near(1)) ? near(1) : near(-1);
    // move the pointer in steps, like a person does (a single jump to the target can miss the dragover)
    const cellLoc = page.locator(`[data-daykey="${target}"]`).first();
    // both on screen before the button goes down: scrolling while it is held cancels the drag
    await cellLoc.scrollIntoViewIfNeeded();
    await chip.hover();
    await page.mouse.down();
    await cellLoc.hover({ position: { x: 40, y: 60 } });
    await cellLoc.hover({ position: { x: 50, y: 70 } });
    await page.mouse.up();
    await page.getByText(/^Problem set 4: integrals moved to /).first().waitFor({ timeout: 4000 });
    if ((await tasks()).find((x) => x.id === task.id).due !== target) throw new Error('task not moved to ' + target);
    await label(page, 'Undo').click();
    await page.waitForTimeout(300);
    if ((await tasks()).find((x) => x.id === task.id).due !== task.due) throw new Error('undo did not move it back');
  });

  await step(page, 'B12', 'Keyboard shortcuts: number keys switch screens, arrows change the month, N adds a task (not while typing), ? lists them', async () => {
    const month = () => page.evaluate(() => (document.body.innerText.match(/(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/) || ['-'])[0]);
    await page.mouse.click(700, 600); // nothing focused
    await page.keyboard.press('5');
    await expectVisible(page, 'LAST 7 DAYS');
    await page.keyboard.press('2');
    await page.waitForTimeout(500);
    await page.keyboard.press('t'); // start from this month whatever the last step left open
    await page.waitForTimeout(300);
    const m0 = await month();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    if ((await month()) === m0) throw new Error('→ did not change the month');
    await page.keyboard.press('t');
    await page.waitForTimeout(300);
    if ((await month()) !== m0) throw new Error('T did not go back to this month');
    await page.keyboard.press('n');
    const field = ph(page, 'What do you need to study?').last();
    await field.waitFor({ timeout: 4000 });
    await page.waitForTimeout(800); // the sheet takes Escape once it has slid in
    await field.type('n1');
    if ((await field.inputValue()) !== 'n1') throw new Error('typing in a field was taken as shortcuts');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.mouse.click(700, 600);
    await page.keyboard.press('Shift+Slash');
    await expectVisible(page, 'Keyboard shortcuts');
    await page.waitForTimeout(800); // takes Escape once it has faded in
    await page.keyboard.press('Escape');
    await expectGone(page, 'Keyboard shortcuts');
  });

  await step(page, 'B13', 'Weekly goals: a 2h goal set on a subject shows on its card and the Dashboard; Progress has the weekly report', async () => {
    await tap(page, 'Subjects');
    await label(page, 'Edit Mathematics').click();
    await page.waitForTimeout(800);
    await label(page, 'Goal 2h a week').click();
    await page.getByText('Save changes', { exact: true }).last().click();
    await page.getByText(/ of 2h this week$/).first().waitFor({ timeout: 4000 });
    await tap(page, 'Dashboard');
    await expectVisible(page, 'Weekly goals');
    await tap(page, 'Progress');
    await expectVisible(page, 'Weekly report');
    await page.getByText('Last week', { exact: true }).first().click();
    await expectVisible(page, 'Weekly report');
  });

  await step(page, 'B14', 'Attachments: a link added to a task is saved, shows a paperclip on its card, and a bad address is refused', async () => {
    await tap(page, 'Dashboard');
    await label(page, 'Edit task Problem set 4: integrals').first().click();
    await page.waitForTimeout(900);
    await page.getByText('Add link', { exact: true }).last().click();
    const box = page.locator('[aria-label="Web address"]').last();
    await box.fill('not a link');
    await label(page, 'Add this link').last().click();
    await expectVisible(page, 'That isn’t a web address.');
    await box.fill('example.com/worksheet');
    await label(page, 'Add this link').last().click();
    await page.locator('[aria-label="Open example.com/worksheet"]').last().waitFor({ timeout: 4000 });
    await page.getByText('Save changes', { exact: true }).last().click();
    await page.locator('[aria-label="1 attachment"]').first().waitFor({ timeout: 4000 });
    const tasks = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) return JSON.parse(localStorage.getItem(k)).tasks; });
    const att = tasks.find((x) => x.title === 'Problem set 4: integrals').attachments;
    if (!att || att.length !== 1 || att[0].url !== 'https://example.com/worksheet') throw new Error('attachment not saved: ' + JSON.stringify(att));
  });

  await step(page, 'B15', 'Dashboard "Coming up" lists 5, then "Show more" adds 5 and "Show less" folds back; the Upcoming tile shows all', async () => {
    // eight more tasks in the coming days, straight into the saved data, then reload
    const total = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('studyplanner:v1:'));
      const d = JSON.parse(localStorage.getItem(key));
      const pad = (n) => String(n).padStart(2, '0');
      for (let i = 1; i <= 8; i++) {
        const x = new Date();
        x.setDate(x.getDate() + 2 + i);
        d.tasks.push({ id: `cu${i}`, title: `CU task ${i}`, subjectId: null, due: `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`, estimate: 15, priority: 'med', done: false, completedAt: null });
      }
      localStorage.setItem(key, JSON.stringify(d));
      const today = new Date();
      const tk = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      return d.tasks.filter((t) => !t.done && t.due > tk).length;
    });
    await page.reload({ waitUntil: 'load' });
    await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 30000 });
    await page.getByText(`5 of ${total}`, { exact: true }).first().waitFor({ timeout: 6000 });
    if (await page.getByText('CU task 8', { exact: true }).count()) throw new Error('the 8th coming-up task should be folded away');
    await page.locator('[aria-label*="more upcoming task"]').first().click(); // 'Show 5 more', or fewer when that's all
    await page.getByText(`${Math.min(10, total)} of ${total}`, { exact: true }).first().waitFor({ timeout: 4000 });
    await label(page, 'Show less').first().click();
    await page.getByText(`5 of ${total}`, { exact: true }).first().waitFor({ timeout: 4000 });
    await page.getByText('Upcoming', { exact: true }).first().click();
    await page.getByText('CU task 8', { exact: true }).first().waitFor({ timeout: 4000 });
    if (await page.getByText(`5 of ${total}`, { exact: true }).count()) throw new Error('the Upcoming tile should show them all');
    await page.getByText('Upcoming', { exact: true }).first().click();
  });

  await step(page, 'B16', 'Select several tasks: two picked are marked done together, and Undo opens them again', async () => {
    const open = (title) => page.evaluate((tt) => { for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) return !JSON.parse(localStorage.getItem(k)).tasks.find((x) => x.title === tt).done; }, title);
    await label(page, 'Select several tasks').first().click();
    await label(page, 'Select Problem set 4: integrals').first().click();
    await label(page, 'Select Desktop task').first().click();
    await page.getByText('2 selected', { exact: true }).first().waitFor({ timeout: 3000 });
    await page.locator('[aria-label="Done (2)"]').first().click();
    await page.getByText('2 tasks done', { exact: true }).first().waitFor({ timeout: 4000 });
    if ((await open('Problem set 4: integrals')) || (await open('Desktop task'))) throw new Error('not marked done');
    await label(page, 'Undo').first().click();
    await page.waitForTimeout(300);
    if (!(await open('Problem set 4: integrals')) || !(await open('Desktop task'))) throw new Error('undo did not reopen them');
    if (!(await label(page, 'Select several tasks').count())) throw new Error('still selecting after the action');
  });

  await step(page, 'B17', 'Archive: a task done 90 days ago leaves the lists on launch and is listed under Settings → Archived tasks', async () => {
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('studyplanner:v1:'));
      const d = JSON.parse(localStorage.getItem(key));
      const x = new Date();
      x.setDate(x.getDate() - 90);
      const k = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      d.tasks.push({ id: 'arch1', title: 'E2E long done', subjectId: null, due: k, estimate: 30, priority: 'med', done: true, completedAt: k });
      localStorage.setItem(key, JSON.stringify(d));
    });
    await page.reload({ waitUntil: 'load' });
    await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 30000 });
    await page.waitForTimeout(600);
    const d = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) return JSON.parse(localStorage.getItem(k)); });
    if (d.tasks.some((x) => x.id === 'arch1') || !(d.archive || []).some((x) => x.id === 'arch1')) throw new Error('not archived');
    await page.locator('[aria-label^="Account menu"]').first().click();
    await tap(page, 'Settings');
    await page.getByText('Archived tasks', { exact: true }).first().click();
    await page.getByText('E2E long done', { exact: true }).first().waitFor({ timeout: 4000 });
    await label(page, 'Close sheet').last().click();
  });

  await step(page, 'B18', 'Calendar: select the day’s tasks and move them all to tomorrow; Undo puts them back', async () => {
    const dues = () => page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) return Object.fromEntries(JSON.parse(localStorage.getItem(k)).tasks.map((x) => [x.title, x.due])); });
    await tap(page, 'Calendar');
    await page.waitForTimeout(600);
    await label(page, 'Jump to this month').click().catch(() => {});
    const now = new Date();
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    await page.locator(`[aria-label="Day ${key(now)}"]`).first().click();
    const before = await dues();
    await page.locator('[aria-label="Select several tasks"]').last().click();
    await page.getByText('Select all', { exact: true }).last().click();
    await page.locator('[aria-label^="Move… ("]').last().click();
    await page.waitForTimeout(800);
    await label(page, 'Move to Tomorrow').last().click();
    await page.getByText(/tasks? moved to Tomorrow$/).first().waitFor({ timeout: 4000 });
    const after = await dues();
    for (const title of ['Problem set 4: integrals', 'Desktop task']) if (after[title] !== key(tomorrow)) throw new Error(`${title} not moved: ${after[title]}`);
    await label(page, 'Undo').first().click();
    await page.waitForTimeout(300);
    const back = await dues();
    for (const title of ['Problem set 4: integrals', 'Desktop task']) if (back[title] !== before[title]) throw new Error(`${title} not put back`);
  });

  await page.screenshot({ path: `${OUT}/desktop-final.png` });
  await ctx.close();
}

/* ============================ SUITE C: per-account data ============================ */
currentSuite = 'Accounts & data (1280x800)';
if (want('C')) console.log(`\n== ${currentSuite} ==`);
if (want('C')) {
  const { ctx, page } = await newPage(browser, { width: 1280, height: 800 });
  const stamp = Date.now();
  const A = { name: 'Alice Anders', email: `alice${stamp}@example.com`, pw: 'AlicePass1!' };
  const B = { name: 'Bob Brown', email: `bob${stamp}@example.com`, pw: 'BobPass123!' };
  // Data saved by the app before accounts existed (single global key)
  await page.addInitScript(() => {
    if (!localStorage.getItem('studyplanner:v1') && !localStorage.getItem('__seeded')) {
      localStorage.setItem('__seeded', '1');
      localStorage.setItem('studyplanner:v1', JSON.stringify({
        subjects: [{ id: 'sx', name: 'Legacy Subject', color: '#17A398' }],
        tasks: [{ id: 'tx', title: 'Legacy task from before accounts', subjectId: 'sx', due: new Date().toISOString().slice(0, 10), estimate: 30, done: false, completedAt: null }],
        sessions: [],
      }));
    }
  });
  await page.goto(APP, { waitUntil: 'load', timeout: 120000 });
  await skipIntro(page);

  const signup = async (u) => {
    await page.getByText('Create account', { exact: true }).first().click();
    await ph(page, 'Your name').fill(u.name);
    await ph(page, 'you@example.com').fill(u.email);
    await ph(page, 'At least 6 characters').fill(u.pw);
    await ph(page, 'Re-enter password').fill(u.pw);
    await giveConsent(page);
    await page.getByText('Create account', { exact: true }).last().click();
    await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 20000 });
  };
  const signOut = async () => {
    await page.locator('[aria-label^="Account menu"]').first().click();
    await tap(page, 'Sign out');
    await expectVisible(page, 'Welcome back', { timeout: 10000 });
  };

  await step(page, 'C01', 'First account adopts data saved before accounts existed', async () => {
    await expectVisible(page, 'Welcome back', { timeout: 60000 });
    await signup(A);
    await expectVisible(page, 'Legacy task from before accounts');
  });

  await step(page, 'C02', 'Account A adds a private task', async () => {
    await label(page, 'New task from menu').click(); // desktop: the sidebar's button (no bottom bar)
    await page.waitForTimeout(900);
    await ph(page, 'What do you need to study?').fill('Alice private task');
    await page.getByText('Add task', { exact: true }).last().click();
    await expectVisible(page, 'Alice private task');
  });

  await step(page, 'C03', 'Account B starts with a clean workspace, not A\u2019s tasks', async () => {
    await signOut();
    await signup(B);
    const t = await bodyText(page);
    if (/Alice private task|Legacy task/.test(t)) throw new Error('B can see A\u2019s data');
    await expectVisible(page, 'Problem set 4: integrals'); // fresh sample data
  });

  await step(page, 'C04', 'Account B changes do not leak back to A', async () => {
    await label(page, 'New task from menu').click();
    await page.waitForTimeout(900);
    await ph(page, 'What do you need to study?').fill('Bob private task');
    await page.getByText('Add task', { exact: true }).last().click();
    await expectVisible(page, 'Bob private task');
    await signOut();
    await loginFlow(page, A.email, A.pw);
    await expectVisible(page, 'Alice private task', { timeout: 20000 });
    const t = await bodyText(page);
    if (/Bob private task/.test(t)) throw new Error('A can see B\u2019s task');
  });

  await step(page, 'C05', 'A\u2019s data survives sign-out/sign-in and reload', async () => {
    await page.reload({ waitUntil: 'load' });
    await expectVisible(page, 'Alice private task', { timeout: 60000 });
    await expectVisible(page, 'Legacy task from before accounts');
  });

  await step(page, 'C06', 'Settings: phone notifications are marked mobile-only on web', async () => {
    await page.locator('[aria-label^="Account menu"]').first().click();
    await tap(page, 'Settings');
    await expectVisible(page, 'Phone notifications');
    await expectVisible(page, 'Available in the mobile app');
  });

  await step(page, 'C07', 'Deleting an account removes its data from the device', async () => {
    await tap(page, 'Delete account');
    await expectVisible(page, 'Welcome back', { timeout: 10000 });
    // nothing stays: this account's data went with it, and B's left the device when B signed out (it's in the cloud)
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /^studyplanner:(v1|settings|sync):/.test(k)));
    if (keys.length !== 0) throw new Error('account data left on the device: ' + keys.join(', '));
  });

  await ctx.close();
}

/* ============================ SUITE D: calendar, exams, repeating tasks ============================ */
currentSuite = 'Calendar, exams & repeats (390x844)';
if (want('D')) console.log(`\n== ${currentSuite} ==`);
if (want('D')) {
  const { ctx, page, errors } = await newPage(browser, { width: 390, height: 844 });
  const pad = (n) => String(n).padStart(2, '0');
  const keyIn = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const U = { name: 'Cal Tester', email: `cal${Date.now()}@example.com`, pw: 'CalPass123!' };
  await page.goto(APP, { waitUntil: 'load', timeout: 120000 });
  await skipIntro(page);
  await expectVisible(page, 'Welcome back', { timeout: 60000 });
  await tap(page, 'Create account');
  await ph(page, 'Your name').fill(U.name);
  await ph(page, 'you@example.com').fill(U.email);
  await ph(page, 'At least 6 characters').fill(U.pw);
  await ph(page, 'Re-enter password').fill(U.pw);
  await giveConsent(page);
  await page.getByText('Create account', { exact: true }).last().click();
  await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 20000 });
  const goTab = (name) => page.getByText(name, { exact: true }).last().click();

  await step(page, 'D01', 'Dashboard prompts to add an exam when there are none', async () => {
    await expectVisible(page, 'Add an exam');
  });

  await step(page, 'D02', 'Calendar tab shows the month grid with today selected', async () => {
    await goTab('Calendar');
    await expectVisible(page, 'Upcoming exams');
    const monthName = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    await expectVisible(page, monthName);
    await expectVisible(page, 'Today ·');
    await label(page, `Day ${keyIn(0)}`).waitFor({ timeout: 3000 });
  });

  await step(page, 'D03', 'Selecting tomorrow shows its seeded task', async () => {
    await label(page, `Day ${keyIn(1)}`).click();
    await expectVisible(page, 'Tomorrow ·');
    await expectVisible(page, 'Read chapter 7: cell division');
  });

  await step(page, 'D04', 'Month navigation and "this month" jump', async () => {
    await label(page, 'Jump to this month').click(); // D03 may have moved to next month (tomorrow is the 1st)
    await label(page, 'Next month').click();
    const next = new Date();
    next.setMonth(next.getMonth() + 1, 1);
    await expectVisible(page, next.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
    await label(page, 'Jump to this month').click();
    await expectVisible(page, new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
  });

  await step(page, 'D05', 'Add a task on the selected day from the calendar', async () => {
    await label(page, `Day ${keyIn(2)}`).click();
    await label(page, 'Add task on this day').click(); // the Tasks section's link
    await page.waitForTimeout(900);
    await ph(page, 'What do you need to study?').fill('E2E calendar task');
    await page.getByText('Add task', { exact: true }).last().click();
    await expectVisible(page, 'E2E calendar task');
  });

  await step(page, 'D06', 'Add an exam with a countdown', async () => {
    await label(page, 'Add exam').click();
    await page.waitForTimeout(900);
    await ph(page, 'e.g. Biology midterm').fill('E2E Chemistry final');
    await page.locator('input[type=time]').last().fill('09:00'); // start time is required
    await page.getByText('Add exam', { exact: true }).last().click();
    await expectGone(page, 'New exam');
    await expectVisible(page, 'E2E Chemistry final');
  });

  await step(page, 'D07', 'Exam shows on the dashboard countdown', async () => {
    await goTab('Home');
    await expectVisible(page, 'EXAM COUNTDOWN');
    await expectVisible(page, 'E2E Chemistry final');
    const t = await bodyText(page);
    if (!/EXAM COUNTDOWN[\s\S]*?\b\d+\b[\s\S]*?days/.test(t)) throw new Error('no day count shown');
  });

  await step(page, 'D08', 'An exam within 3 days appears in the notification bell', async () => {
    await goTab('Calendar');
    // D05 may have moved the grid to next month, where tomorrow is not shown at the end of a month
    if (await label(page, 'Go to today').count()) await label(page, 'Go to today').click();
    await label(page, `Day ${keyIn(1)}`).click();
    await label(page, 'Add exam').click();
    await page.waitForTimeout(900);
    await ph(page, 'e.g. Biology midterm').fill('E2E tomorrow quiz');
    await page.locator('input[type=time]').last().fill('09:00'); // start time is required
    await page.getByText('Add exam', { exact: true }).last().click();
    await expectVisible(page, 'E2E tomorrow quiz');
    await label(page, 'Notifications').click();
    await expectVisible(page, 'Exam tomorrow');
    await page.waitForTimeout(300); // let the panel settle; a tap in the same frame it opens can be missed
    await page.mouse.click(200, 450);
    await expectGone(page, 'Notifications', { exact: true });
  });

  await step(page, 'D09', 'Repeat: "Pick days" needs at least one day', async () => {
    await label(page, 'Add task').click();
    await page.waitForTimeout(900);
    await ph(page, 'What do you need to study?').fill('E2E custom repeat');
    await tap(page, 'Pick days');
    await expectVisible(page, 'Choose at least one day');
    await label(page, 'Repeat day 1').click();
    await expectGone(page, 'Choose at least one day');
    await tap(page, 'Never'); // switch back off
    await page.keyboard.press('Escape');
    await page.mouse.click(195, 60);
  });

  await step(page, 'D10', 'Create a daily repeating task', async () => {
    // make sure the sheet is closed, then open a fresh one
    if (await page.getByText('New task', { exact: true }).count()) await page.getByText('Close', { exact: true }).count();
    await page.reload({ waitUntil: 'load' });
    await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 60000 });
    await label(page, 'Add task').click();
    await page.waitForTimeout(900);
    await ph(page, 'What do you need to study?').fill('E2E daily habit');
    await tap(page, 'Every day');
    await page.getByText('Add task', { exact: true }).last().click();
    await expectGone(page, 'New task');
    await expectVisible(page, 'E2E daily habit');
  });

  await step(page, 'D11', 'Repeating task is generated for the coming days', async () => {
    await goTab('Calendar');
    await label(page, `Day ${keyIn(5)}`).click();
    await expectVisible(page, 'E2E daily habit');
    await label(page, `Day ${keyIn(12)}`).click();
    await expectVisible(page, 'E2E daily habit');
  });

  await step(page, 'D12', 'Repeating tasks are listed with their schedule', async () => {
    await expectVisible(page, 'Repeating tasks');
    await expectVisible(page, 'Every day · 30 min');
  });

  await step(page, 'D13', 'Calendar data survives a reload', async () => {
    await page.reload({ waitUntil: 'load' });
    await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 60000 });
    await goTab('Calendar');
    await expectVisible(page, 'E2E Chemistry final');
    await label(page, `Day ${keyIn(7)}`).click();
    await expectVisible(page, 'E2E daily habit');
  });

  await step(page, 'D14', 'Stopping a repeat removes the future copies', async () => {
    await label(page, 'Stop repeating E2E daily habit').click();
    await page.waitForTimeout(500);
    await expectGone(page, 'Every day · 30 min');
    await label(page, `Day ${keyIn(9)}`).click();
    await page.waitForTimeout(300);
    // the toast mentions the title, so look at the task rows rather than all page text
    const rows = await page.locator('[aria-label^="Edit task E2E daily habit"]').count();
    if (rows > 0) throw new Error('future copy still present');
  });

  await step(page, 'D15', 'Delete an exam', async () => {
    await label(page, 'Delete exam E2E tomorrow quiz').first().click();
    await page.waitForTimeout(400);
    const t = await bodyText(page);
    const listed = (t.match(/E2E tomorrow quiz/g) || []).length;
    if (listed > 1) throw new Error('exam still listed'); // the undo bar mentions the title once
  });

  // ---- classes ----
  // Day n days from today, starting from today's month (the grid only holds about six weeks)
  const pickDay = async (n) => {
    if (await label(page, 'Go to today').count()) await label(page, 'Go to today').click();
    // a day of last month isn't always on this month's grid (November 2026 starts on a Sunday)
    if (n < 0 && !(await page.locator(`[aria-label="Day ${keyIn(n)}"]`).count())) {
      await label(page, 'Previous month').click();
      await page.waitForTimeout(300);
    }
    await label(page, `Day ${keyIn(n)}`).click();
    await page.waitForTimeout(300);
  };
  const classSheet = async () => {
    await label(page, 'Add class').click();
    await page.waitForTimeout(900);
  };

  await step(page, 'DC1', 'Class: name is required, end must be after start', async () => {
    await goTab('Calendar');
    await pickDay(0);
    await classSheet();
    await expectVisible(page, 'Enter a class name to continue');
    await ph(page, 'e.g. Calculus II').fill('E2E Calculus II');
    await page.locator('input[type=time]').nth(0).fill('10:00');
    await page.locator('input[type=time]').nth(1).fill('09:00');
    await expectVisible(page, 'The class must end after it starts');
    await page.getByText('Save class', { exact: true }).last().click({ force: true });
    await expectVisible(page, 'New class'); // still open
  });

  await step(page, 'DC2', 'Class: a weekly class on today’s weekday shows on the day and in the timetable', async () => {
    await page.locator('input[type=time]').nth(1).fill('11:30');
    await ph(page, 'e.g. Prof. Thompson').fill('Prof. E2E');
    await page.getByText('Repeating', { exact: true }).first().click();
    await page.locator('[aria-label="Class location"]').fill('Room 204');
    await page.getByText('Save class', { exact: true }).last().click();
    await expectGone(page, 'New class');
    // one row in the selected day's list, one in the "Classes" timetable
    if ((await page.locator('[aria-label="Edit class E2E Calculus II"]').count()) !== 2) throw new Error('class not listed twice');
    await expectVisible(page, 'Room 204 · Prof. E2E');
  });

  await step(page, 'DC3', 'Class: weekly classes repeat a week later but not the next day', async () => {
    await pickDay(7);
    if ((await page.locator('[aria-label="Edit class E2E Calculus II"]').count()) !== 2) throw new Error('missing a week later');
    await pickDay(1);
    if ((await page.locator('[aria-label="Edit class E2E Calculus II"]').count()) !== 1) throw new Error('shown on the wrong day');
  });

  await step(page, 'DC4', 'Class: "Term" needs term dates before it can be saved', async () => {
    await classSheet();
    await ph(page, 'e.g. Calculus II').fill('E2E term class');
    await page.getByText('Repeating', { exact: true }).first().click();
    await page.getByText('Term', { exact: true }).first().click();
    await expectVisible(page, 'Set your term dates to continue');
    await label(page, 'Close sheet').last().click();
    await expectGone(page, 'New class');
  });

  await step(page, 'DC5', 'Class: shows on the dashboard and survives a reload', async () => {
    await page.reload({ waitUntil: 'load' });
    await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 60000 });
    await expectVisible(page, "TODAY'S CLASSES");
    await expectVisible(page, 'E2E Calculus II');
  });

  await step(page, 'DC6', 'Class: delete can be undone', async () => {
    await goTab('Calendar');
    await label(page, 'Delete class E2E Calculus II').first().click();
    await page.waitForTimeout(400);
    if (await page.locator('[aria-label="Edit class E2E Calculus II"]').count()) throw new Error('class still listed');
    await label(page, 'Undo').click();
    await page.waitForTimeout(400);
    if (!(await page.locator('[aria-label="Edit class E2E Calculus II"]').count())) throw new Error('undo did not bring it back');
  });

  // ---- vacations (the weekly class from DC2 runs on today's weekday) ----
  const classRowsToday = async () => {
    await pickDay(0);
    return page.locator('[aria-label="Edit class E2E Calculus II"]').count();
  };

  await step(page, 'DV1', 'Vacation: name required; "1 week" preset sets the end date', async () => {
    await label(page, 'Add vacation').click();
    await page.waitForTimeout(900);
    await expectVisible(page, 'Enter a name to continue');
    await ph(page, 'e.g. Winter break').fill('E2E autumn break');
    await page.getByText('1 week', { exact: true }).last().click();
    await expectVisible(page, '1 week');
    await page.getByText('Save vacation', { exact: true }).last().click();
    await expectGone(page, 'New vacation');
    await label(page, 'Edit vacation E2E autumn break').first().waitFor({ timeout: 4000 });
  });

  await step(page, 'DV2', 'Vacation: today shows the break and the weekly class is paused', async () => {
    await expectVisible(page, 'ON BREAK');
    // only the timetable row is left; today's list no longer has the class
    if ((await classRowsToday()) !== 1) throw new Error('class still on today during the break');
  });

  await step(page, 'DV3', 'Vacation: dashboard shows the break', async () => {
    await goTab('Home');
    await expectVisible(page, 'E2E autumn break');
    await expectVisible(page, 'Classes & repeats paused');
    await goTab('Calendar');
  });

  await step(page, 'DV4', 'Vacation: "Don’t pause" brings the class back', async () => {
    await label(page, 'Edit vacation E2E autumn break').first().click();
    await page.waitForTimeout(900);
    await page.getByText("Don't pause", { exact: true }).last().click();
    await page.getByText('Save changes', { exact: true }).last().click();
    await expectGone(page, 'Edit vacation', { exact: true });
    if ((await classRowsToday()) !== 2) throw new Error('class not back on today');
  });

  await step(page, 'DV5', 'Vacation: delete can be undone', async () => {
    await label(page, 'Delete vacation E2E autumn break').first().click();
    await page.waitForTimeout(400);
    if (await page.locator('[aria-label="Edit vacation E2E autumn break"]').count()) throw new Error('still listed');
    await label(page, 'Undo').click();
    await page.waitForTimeout(400);
    await label(page, 'Edit vacation E2E autumn break').first().waitFor({ timeout: 4000 });
  });

  // ---- week view and homework (the weekly class from DC2 runs 10:00–11:30 on today's weekday) ----
  await step(page, 'DW1', 'Week view: shows the week with the class as a block, and remembers the choice', async () => {
    await pickDay(0);
    await label(page, 'Show Week').click();
    await label(page, 'Previous week').waitFor({ timeout: 4000 });
    await page.locator('[aria-label^="Class E2E Calculus II at"]').first().waitFor({ timeout: 4000 });
    await label(page, 'Next week').click();
    await page.locator('[aria-label^="Class E2E Calculus II at"]').first().waitFor({ timeout: 4000 }); // weekly: next week too
    await label(page, 'Jump to this week').click();
    await goTab('Home');
    await goTab('Calendar');
    await label(page, 'Previous week').waitFor({ timeout: 4000 }); // still in week view
    await label(page, 'Show Month').click();
    await label(page, 'Previous month').waitFor({ timeout: 4000 });
  });

  await step(page, 'DH1', 'Homework from a class: subject picked and due at the next session', async () => {
    await pickDay(0);
    await page.locator('[aria-label="Add homework for E2E Calculus II"]').last().click();
    await page.waitForTimeout(900);
    await expectVisible(page, 'New homework');
    await expectVisible(page, 'due next class');
    await ph(page, 'What do you need to study?').fill('E2E homework');
    await page.getByText('Add task', { exact: true }).last().click();
    await expectGone(page, 'New homework');
    const hw = await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) return JSON.parse(localStorage.getItem(k)).tasks.find((x) => x.title === 'E2E homework');
    });
    if (!hw) throw new Error('homework not saved');
    if (hw.due !== keyIn(7)) throw new Error(`due ${hw.due}, expected the next session ${keyIn(7)}`);
    if (hw.classId === undefined) throw new Error('homework is not linked to its class');
  });

  await step(page, 'DH2', 'Homework shows under its class, expands, and can be ticked off', async () => {
    await pickDay(0);
    const line = page.locator('[aria-label="Homework for E2E Calculus II: 1 open"]').last();
    await line.waitFor({ timeout: 4000 });
    if (!/1 homework · next: E2E homework/.test(await line.innerText())) throw new Error('summary line: ' + (await line.innerText()));
    await line.click();
    await page.locator('[aria-label="Complete task: E2E homework"]').last().click();
    await page.waitForTimeout(400);
    if (await page.locator('[aria-label="Homework for E2E Calculus II: 1 open"]').count()) throw new Error('still listed after ticking it off');
    const done = await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) return JSON.parse(localStorage.getItem(k)).tasks.find((x) => x.title === 'E2E homework').done;
    });
    if (!done) throw new Error('not marked done');
  });

  await step(page, 'DH3', 'An existing task can be linked to a class from its edit sheet', async () => {
    await pickDay(2); // D05's 'E2E calendar task', which has no class
    // the dashboard stays mounted behind the Calendar with the same row, so take the Calendar's (last) one
    await page.locator('[aria-label="Edit task E2E calendar task"]').last().click();
    await page.waitForTimeout(900);
    await page.locator('[aria-label="Link to class E2E Calculus II"]').last().click();
    await page.getByText('Save changes', { exact: true }).last().click();
    await expectGone(page, 'Edit task', { exact: true });
    await pickDay(0);
    await page.locator('[aria-label="Homework for E2E Calculus II: 1 open"]').last().waitFor({ timeout: 4000 });
  });

  await step(page, 'DH4', 'Tapping a class opens its homework, with finished work and an Add homework link', async () => {
    await pickDay(0);
    await page.locator('[aria-label="Show homework for E2E Calculus II"]').last().click();
    await page.locator('[aria-label="Hide homework for E2E Calculus II"]').last().waitFor({ timeout: 4000 });
    await page.locator('[aria-label="Reopen task: E2E homework"]').last().waitFor({ timeout: 4000 }); // ticked off in DH2, still listed
    await page.locator('[aria-label="Complete task: E2E calendar task"]').last().waitFor({ timeout: 4000 }); // linked in DH3
    await expectVisible(page, 'Add homework', { exact: true });
    await page.locator('[aria-label="Hide homework for E2E Calculus II"]').last().click();
    await page.locator('[aria-label="Show homework for E2E Calculus II"]').last().waitFor({ timeout: 4000 });
  });

  await step(page, 'DH5', 'A one-off class shows its homework in the day list and in One-off classes', async () => {
    await pickDay(0);
    await classSheet();
    await ph(page, 'e.g. Calculus II').fill('E2E one-off');
    await page.getByText('Save class', { exact: true }).last().click(); // "Once" on the selected day by default
    await expectGone(page, 'New class');
    await page.locator('[aria-label="Add homework for E2E one-off"]').last().click();
    await page.waitForTimeout(900);
    await ph(page, 'What do you need to study?').fill('E2E one-off homework');
    await page.getByText('Add task', { exact: true }).last().click();
    await expectGone(page, 'New homework');
    await page.waitForTimeout(300);
    // the dashboard behind the Calendar has one too, so count only the Calendar's: day list + One-off classes
    const lines = await page.locator('[aria-label="Homework for E2E one-off: 1 open"]').count();
    if (lines < 3) throw new Error(`homework line shown ${lines} times, expected the day list, One-off classes and the dashboard`);
    // it's a child of the class: no separate row in the Calendar's day list (only the dashboard's task list has one)
    const rows = await page.locator('[aria-label="Edit task E2E one-off homework"]').count();
    if (rows !== 1) throw new Error(`homework has ${rows} task rows, expected only the dashboard's`);
    await page.locator('[aria-label="Show homework for E2E one-off"]').nth(1).click(); // day-list copy of the class
    await page.locator('[aria-label="Complete task: E2E one-off homework"]').last().waitFor({ timeout: 4000 }); // full task card inside
  });

  await step(page, 'DS1', 'Steps: added in the sheet, ticked on the card, and "Mark task done" when all are done', async () => {
    await pickDay(0);
    await label(page, 'Add task').click(); // the centre + adds on the selected day
    await page.waitForTimeout(900);
    await ph(page, 'What do you need to study?').fill('E2E essay with steps');
    const input = page.locator('[aria-label="New subtask"]').last();
    for (const s of ['Read sources', 'Write outline']) {
      await input.fill(s);
      await input.press('Enter');
    }
    await page.getByText('Add task', { exact: true }).last().click();
    await expectGone(page, 'New task');
    const head = page.locator('[aria-label^="Show subtasks for E2E essay with steps"]').last();
    await head.waitFor({ timeout: 4000 });
    if (!/0 of 2 subtasks · next: Read sources/.test(await head.innerText())) throw new Error('card line: ' + (await head.innerText()));
    await head.click();
    await page.locator('[aria-label="Tick subtask Read sources"]').last().click();
    await page.locator('[aria-label="Tick subtask Write outline"]').last().click();
    await expectVisible(page, 'All 2 subtasks done');
    await page.locator('[aria-label="All subtasks done: mark E2E essay with steps done"]').last().click();
    await page.waitForTimeout(400);
    const tk = await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) return JSON.parse(localStorage.getItem(k)).tasks.find((x) => x.title === 'E2E essay with steps');
    });
    if (!tk.done || tk.subtasks.filter((s) => s.done).length !== 2) throw new Error('not saved: ' + JSON.stringify(tk));
  });

  await step(page, 'DS2', 'A task without subtasks gets its first one from the "+ Subtask" chip on its card', async () => {
    await pickDay(0);
    const chip = page.locator('[aria-label="Add a subtask to Problem set 4: integrals"]').last();
    await chip.waitFor({ timeout: 4000 });
    await chip.click();
    const input = page.locator('[aria-label="New subtask"]').last();
    await input.fill('E2E first subtask');
    await input.press('Enter');
    await page.locator('[aria-label^="Hide subtasks for Problem set 4: integrals"]').last().waitFor({ timeout: 4000 });
    if (await page.locator('[aria-label="Add a subtask to Problem set 4: integrals"]').count()) throw new Error('chip still shown once the task has a subtask');
    const st = await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) return JSON.parse(localStorage.getItem(k)).tasks.find((x) => x.title === 'Problem set 4: integrals').subtasks;
    });
    if (!st || st.length !== 1 || st[0].title !== 'E2E first subtask') throw new Error('not saved: ' + JSON.stringify(st));
  });

  await step(page, 'DR1', 'Rotation: set up Day A / Day B and add a class that meets on Day A', async () => {
    await pickDay(0);
    await page.locator('[aria-label="Set up a rotating timetable"]').last().click();
    await page.waitForTimeout(700);
    await page.locator('[aria-label="Cycle: Lettered days"]').last().click();
    await page.locator('[aria-label="Today is Day A"]').last().click(); // or the next school day, on a weekend
    await page.getByText('Save rotation', { exact: true }).last().click();
    await page.locator('[aria-label="Change the rotating timetable"]').last().waitFor({ timeout: 4000 });
    await expectVisible(page, 'Day A / Day B');
    await classSheet();
    await ph(page, 'e.g. Calculus II').fill('E2E Day A class');
    await page.getByText('Rotation', { exact: true }).last().click();
    await page.getByText('Save class', { exact: true }).last().click();
    await expectGone(page, 'New class');
    const d = await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) { const j = JSON.parse(localStorage.getItem(k)); return { rotation: j.rotation, cls: j.classes.find((c) => c.title === 'E2E Day A class') }; }
    });
    if (!d.rotation || d.rotation.type !== 'days' || d.rotation.length !== 2) throw new Error('rotation not saved: ' + JSON.stringify(d.rotation));
    if (!d.cls || d.cls.repeat !== 'rotation' || JSON.stringify(d.cls.rotationDays) !== '[0]') throw new Error('class not saved: ' + JSON.stringify(d.cls));
    await page.locator('[aria-label="Edit class E2E Day A class"]').last().waitFor({ timeout: 4000 }); // listed under Day A
  });

  await step(page, 'DG1', 'Grades: add a score to a past exam from Progress and see the average', async () => {
    const past = keyIn(-4);
    await page.evaluate((date) => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) {
        const j = JSON.parse(localStorage.getItem(k));
        j.exams.push({ id: 'e2e-graded', title: 'E2E graded midterm', subjectId: j.subjects[0].id, kind: 'Midterm', date, time: '09:00', duration: 60, mode: 'inPerson', building: '', room: '', link: '', notes: '' });
        localStorage.setItem(k, JSON.stringify(j));
      }
    }, past);
    await page.reload({ waitUntil: 'load' });
    await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 60000 });
    await goTab('Progress');
    await page.locator('[aria-label="Add a score for E2E graded midterm"]').last().click();
    await page.waitForTimeout(700);
    await page.locator('input[aria-label="Score"]').last().fill('42');
    await page.locator('input[aria-label="Out of"]').last().fill('50');
    await expectVisible(page, '84% · B');
    await page.getByText('Save changes', { exact: true }).last().click();
    await page.locator('[aria-label="Overall 84%, grade B"]').last().waitFor({ timeout: 4000 });
    const e = await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) return JSON.parse(localStorage.getItem(k)).exams.find((x) => x.id === 'e2e-graded');
    });
    if (!e || e.score !== 42 || e.outOf !== 50 || e.weight !== 1) throw new Error('score not saved: ' + JSON.stringify(e));
  });

  await step(page, 'DA1', 'Attendance: mark a past session in the Calendar and see the % on Progress', async () => {
    await page.evaluate((created) => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) {
        const j = JSON.parse(localStorage.getItem(k));
        j.classes.push({ id: 'e2e-att', title: 'E2E roll call', subjectId: null, teacher: '', repeat: 'weekly', date: null, days: [0, 1, 2, 3, 4, 5, 6], start: '06:00', end: '06:30', range: 'none', rangeStart: null, rangeEnd: null, mode: 'inPerson', location: '', link: '', notes: '', createdAt: created });
        localStorage.setItem(k, JSON.stringify(j));
      }
    }, keyIn(-3));
    await page.reload({ waitUntil: 'load' });
    await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 60000 });
    await goTab('Calendar');
    await pickDay(-1);
    await page.locator('[aria-label="Mark E2E roll call as attended"]').last().click();
    await pickDay(-2);
    await page.locator('[aria-label="Mark E2E roll call as missed"]').last().click();
    // excused sits behind ⋯ and doesn't count
    await pickDay(-3);
    await page.locator('[aria-label="More options for E2E roll call: excused or cancelled"]').last().click();
    await page.locator('[aria-label^="Mark E2E roll call as excused"]').last().click();
    const rec = await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) return JSON.parse(localStorage.getItem(k)).classes.find((c) => c.id === 'e2e-att').attendance;
    });
    if (rec[keyIn(-1)] !== 'attended' || rec[keyIn(-2)] !== 'missed' || rec[keyIn(-3)] !== 'excused' || Object.keys(rec).length !== 3) throw new Error('not saved: ' + JSON.stringify(rec));
    await goTab('Progress');
    // 1 of 2 = 50%, below the 75% default: 2 in a row needed
    await page.locator('[aria-label^="E2E roll call: 50%, 1 of 2."]').last().waitFor({ timeout: 4000 });
    await expectVisible(page, 'Attend the next 2 in a row to get back to 75% · 1 excused');
  });

  await step(page, 'DA2', 'Exam attendance: a missed exam leaves "needs a score" and shows on Progress', async () => {
    // DG1 left one past exam with a score; add one without
    await page.evaluate((date) => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) {
        const j = JSON.parse(localStorage.getItem(k));
        j.exams.push({ id: 'e2e-skip', title: 'E2E skipped quiz', subjectId: j.subjects[0].id, kind: 'Quiz', date, time: '09:00', duration: 60, mode: 'inPerson', building: '', room: '', link: '', notes: '' });
        localStorage.setItem(k, JSON.stringify(j));
      }
    }, keyIn(-2));
    await page.reload({ waitUntil: 'load' });
    await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 60000 });
    await goTab('Progress');
    await page.locator('[aria-label="Add a score for E2E skipped quiz"]').last().waitFor({ timeout: 4000 });
    await goTab('Calendar');
    await pickDay(-2);
    await page.locator('[aria-label="Mark E2E skipped quiz as missed"]').last().click();
    await page.waitForTimeout(300);
    const e = await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) return JSON.parse(localStorage.getItem(k)).exams.find((x) => x.id === 'e2e-skip');
    });
    if (e.attendance !== 'missed') throw new Error('not saved: ' + JSON.stringify(e));
    await goTab('Progress');
    if (await page.locator('[aria-label="Add a score for E2E skipped quiz"]').count()) throw new Error('still asks for a score');
    // the graded DG1 midterm counts as sat
    await page.locator('[aria-label^="Exams: sat 1 of 2"]').last().waitFor({ timeout: 4000 });
  });

  await step(page, 'DT1', 'Activities: add one from the Activities tab; it shows in the day list without homework or attendance', async () => {
    await goTab('Calendar');
    await pickDay(0);
    await page.locator('[aria-label="Activities"]').last().click();
    await page.locator('[aria-label="Add activity"]').first().click();
    await page.waitForTimeout(800);
    await ph(page, 'e.g. Football practice').fill('E2E chess club');
    await page.locator('[aria-label="Type: Club"]').last().click();
    await page.locator('input[type=time]').nth(0).fill('19:00');
    await page.getByText('Save activity', { exact: true }).last().click();
    await expectGone(page, 'New activity');
    const a = await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) return JSON.parse(localStorage.getItem(k)).classes.find((c) => c.title === 'E2E chess club');
    });
    if (!a || a.kind !== 'activity' || a.category !== 'club' || a.subjectId !== null) throw new Error('not saved: ' + JSON.stringify(a));
    // listed on the Activities tab and in today's list, with no homework button or attendance strip
    if ((await page.locator('[aria-label="Edit activity E2E chess club"]').count()) < 2) throw new Error('not listed on the tab and the day');
    if (await page.locator('[aria-label="Add homework for E2E chess club"]').count()) throw new Error('homework button on an activity');
    if (await page.locator('[aria-label="Mark E2E chess club as attended"]').count()) throw new Error('attendance on an activity');
    // hours: picking 7 PM filled a one-hour slot, so the tab counts 1h this week
    await page.locator('[aria-label="1h of activities in 1 session"]').last().waitFor({ timeout: 4000 });
    await expectVisible(page, /^1h this week/);
    await page.locator('[aria-label="Classes"]').last().click();
  });

  await step(page, 'DA3', 'An exam today offers attendance on the dashboard and in Upcoming exams, not only in the day list', async () => {
    await page.evaluate((date) => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) {
        const j = JSON.parse(localStorage.getItem(k));
        j.exams.push({ id: 'e2e-today', title: 'E2E today quiz', subjectId: j.subjects[0].id, kind: 'Quiz', date, time: '00:01', duration: 30, mode: 'inPerson', building: '', room: '', link: '', notes: '' });
        localStorage.setItem(k, JSON.stringify(j));
      }
    }, keyIn(0));
    await page.reload({ waitUntil: 'load' });
    await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 60000 });
    // the dashboard's exam countdown
    await page.locator('[aria-label="Mark E2E today quiz as attended"]').first().click();
    const saved = () =>
      page.evaluate(() => {
        for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) return JSON.parse(localStorage.getItem(k)).exams.find((x) => x.id === 'e2e-today').attendance;
      });
    if ((await saved()) !== 'attended') throw new Error('not saved from the dashboard');
    // the Calendar's Upcoming exams, with another day selected (so it is not the day list)
    await goTab('Calendar');
    await pickDay(1);
    const strip = page.locator('[aria-label="Mark E2E today quiz as missed"]');
    await strip.last().waitFor({ timeout: 4000 });
    await strip.last().click();
    if ((await saved()) !== 'missed') throw new Error('not saved from Upcoming exams');
  });

  await step(page, 'DQ1', 'Search finds classes and exams; an exam opens the Calendar on its day', async () => {
    await goTab('Home');
    if (await label(page, 'Search').count()) await label(page, 'Search').click();
    await ph(page, 'Search tasks, exams, classes…').fill('roll call');
    await page.getByText(/^Class · /).first().waitFor({ timeout: 4000 });
    await ph(page, 'Search tasks, exams, classes…').fill('chemistry final');
    await page.getByText(/^Exam · /).first().click();
    // the exam is in that day's list as well as in Upcoming exams
    await page.waitForTimeout(600);
    if ((await page.locator('[aria-label="Delete exam E2E Chemistry final"]').count()) < 2) throw new Error('the Calendar did not open on the exam day');
  });

  await step(page, 'DG2', 'Grade what-if: the calculator says what score is needed for a target, and "what if I score" updates', async () => {
    if (await label(page, 'Close search').count()) await label(page, 'Close search').click();
    await goTab('Progress');
    const open = label(page, 'What do I need? Try a target grade').first();
    await open.scrollIntoViewIfNeeded();
    await open.click();
    await page.waitForTimeout(900);
    await label(page, 'Target 90%').last().click();
    await page.getByText(/^(You need|You’re already there|Out of reach)/).last().waitFor({ timeout: 4000 });
    const before = await page.locator('[aria-label^="Score "]').last().getAttribute('aria-label');
    await label(page, '5% lower').last().click();
    const after = await page.locator('[aria-label^="Score "]').last().getAttribute('aria-label');
    if (before === after) throw new Error('the "what if" score did not change: ' + before);
    await label(page, 'Close sheet').last().click();
  });

  await step(page, 'DJ1', 'Live study groups: a classmate joins by link, gets changes as they happen, nothing private; stop sharing', async () => {
    await goTab('Home'); // the menu button is on the Dashboard (other screens show Back)
    await page.locator('[aria-label="Open menu"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('[aria-label="Settings"]').first().click();
    await page.waitForTimeout(900);
    const openShare = async () => {
      await page.getByText('Share my timetable', { exact: true }).first().click();
      await page.waitForTimeout(900);
    };
    await openShare();
    await ph(page, 'e.g. Physics study group').last().fill('E2E group');
    await label(page, 'Create live link').last().click();
    const linkBox = page.locator('[aria-label="Share link"]').last();
    await linkBox.waitFor({ timeout: 15000 });
    const link = await linkBox.innerText();
    if (!/#group=[0-9a-f-]{36}\.[0-9a-f]{24}$/.test(link)) throw new Error('no live link: ' + link.slice(0, 100));
    await page.locator('[aria-label="Show QR code"]').last().click();
    await page.locator('[aria-label="QR code for E2E group"]').last().waitFor({ timeout: 4000 });
    await label(page, 'Close sheet').last().click();

    // a classmate, in another browser profile, opens the link and signs up
    const other = await newPage(browser, { width: 390, height: 844 });
    const joiner = `join${Date.now()}@example.com`;
    const theirData = () => other.page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('studyplanner:v1:')) return JSON.parse(localStorage.getItem(k)); });
    try {
      await other.page.goto(link, { waitUntil: 'load', timeout: 120000 });
      await skipIntro(other.page);
      await other.page.getByText('Create account', { exact: true }).first().click();
      await ph(other.page, 'Your name').fill('Group Joiner');
      await ph(other.page, 'you@example.com').fill(joiner);
      await ph(other.page, 'At least 6 characters').fill('JoinPass123!');
      await ph(other.page, 'Re-enter password').fill('JoinPass123!');
      await giveConsent(other.page);
      await other.page.getByText('Create account', { exact: true }).last().click();
      await other.page.getByText('Join a study group').first().waitFor({ timeout: 20000 });
      await other.page.getByText(/E2E group\s+Live/).first().waitFor({ timeout: 10000 });
      await other.page.locator('[aria-label="Join group"]').last().click();
      await other.page.getByText(/^Joined E2E group/).first().waitFor({ timeout: 10000 });
      const d = await theirData();
      if (!d.groups || d.groups.length !== 1 || !d.groups[0].live || d.groups[0].from !== 'Cal Tester') throw new Error('live group not remembered: ' + JSON.stringify(d.groups));
      if (!d.exams.some((e) => e.title === 'E2E Chemistry final')) throw new Error('shared exam missing');
      if (/"attendance"|"score"/.test(JSON.stringify([d.classes, d.exams]))) throw new Error('private data came along');

      // the owner deletes an exam: the classmate's copy follows by itself
      await goTab('Calendar');
      await page.locator('[aria-label="Delete exam E2E Chemistry final"]').first().click();
      await page.waitForTimeout(800);
      const deadline = Date.now() + 30000;
      for (;;) {
        const now = await theirData();
        if (!now.exams.some((e) => e.title === 'E2E Chemistry final')) break;
        if (Date.now() > deadline) throw new Error('the change did not reach the classmate within 30 s');
        await other.page.waitForTimeout(1000);
      }

      // the owner sees the member, then stops sharing: the group is gone from the server
      await goTab('Home');
      await page.locator('[aria-label="Open menu"]').first().click();
      await page.waitForTimeout(300);
      await page.locator('[aria-label="Settings"]').first().click();
      await page.waitForTimeout(900);
      await openShare();
      await page.getByText('Your live groups').last().waitFor({ timeout: 10000 });
      await page.getByText('1 member', { exact: true }).last().waitFor({ timeout: 10000 });
      await label(page, 'Stop sharing E2E group').last().click();
      await page.locator('[aria-label="Stop sharing E2E group"]').waitFor({ state: 'detached', timeout: 10000 });
      await label(page, 'Close sheet').last().click();
      const gid = link.match(/#group=([0-9a-f-]{36})/)[1];
      // as the classmate: the group can no longer be read
      const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error: signInError } = await sb.auth.signInWithPassword({ email: joiner, password: 'JoinPass123!' });
      if (signInError) throw signInError;
      const { data: rows, error: readError } = await sb.from('study_groups').select('id').eq('id', gid);
      await sb.auth.signOut({ scope: 'local' });
      if (readError) throw readError;
      if (rows.length) throw new Error('the group is still readable after stopping sharing');
    } finally {
      await other.ctx.close();
    }
  });

  await step(page, 'D16', 'No uncaught JS errors in this flow', async () => {
    const real = errors.filter((e) => !/Download the React DevTools/.test(e));
    if (real.length) throw new Error(`${real.length} errors, first: ${real[0].slice(0, 160)}`);
  });

  await ctx.close();
}

/* ============================ SUITE E: smart daily plan ============================ */
currentSuite = 'Smart daily plan (390x844)';
if (want('E')) console.log(`\n== ${currentSuite} ==`);
if (want('E')) {
  const { ctx, page, errors } = await newPage(browser, { width: 390, height: 844 });
  const pad = (n) => String(n).padStart(2, '0');
  const keyIn = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const U = { name: 'Plan Tester', email: `plan${Date.now()}@example.com`, pw: 'PlanPass123!' };
  await page.goto(APP, { waitUntil: 'load', timeout: 120000 });
  await skipIntro(page);
  await expectVisible(page, 'Welcome back', { timeout: 60000 });
  await tap(page, 'Create account');
  await ph(page, 'Your name').fill(U.name);
  await ph(page, 'you@example.com').fill(U.email);
  await ph(page, 'At least 6 characters').fill(U.pw);
  await ph(page, 'Re-enter password').fill(U.pw);
  await giveConsent(page);
  await page.getByText('Create account', { exact: true }).last().click();
  await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 20000 });
  const goTab = (name) => page.getByText(name, { exact: true }).last().click();
  const plus = () => label(page, 'More plan time').click();

  await step(page, 'E01', 'Plan fits the daily goal and says what did not fit', async () => {
    await expectVisible(page, 'Smart plan for today');
    await expectVisible(page, '1 task · 60 of 60 min');
    await expectVisible(page, 'Problem set 4: integrals');
    await expectVisible(page, '1 more task does not fit');
  });

  await step(page, 'E02', 'Adding time brings the next task into the plan', async () => {
    for (let i = 0; i < 3; i++) await plus();
    await expectVisible(page, '2 tasks · 105 of 105 min');
    await expectVisible(page, '105 min', { exact: true });
  });

  await step(page, 'E03', 'Each task explains why it was picked', async () => {
    await expectVisible(page, 'Due today', { exact: true });
    await expectVisible(page, 'Due tomorrow', { exact: true });
  });

  await step(page, 'E04', 'A high-priority task jumps to the top', async () => {
    await label(page, 'Add task').click();
    await page.waitForTimeout(900);
    await ph(page, 'What do you need to study?').fill('E2E urgent essay');
    await page.getByText('High', { exact: true }).first().click();
    await page.getByText('Add task', { exact: true }).last().click();
    await expectGone(page, 'New task');
    await expectVisible(page, 'High priority', { exact: true });
    const t = await bodyText(page);
    const iUrgent = t.indexOf('E2E urgent essay', t.indexOf('Smart plan for today'));
    const iProblem = t.indexOf('Problem set 4: integrals', t.indexOf('Smart plan for today'));
    if (iUrgent < 0 || iProblem < 0 || iUrgent > iProblem) throw new Error('urgent task is not first in the plan');
  });

  await step(page, 'E05', 'Marking a plan item done removes it and updates the plan', async () => {
    await label(page, 'Mark done: E2E urgent essay').click();
    await page.waitForTimeout(400);
    // each plan item has its own "Mark done" button; the done task's is gone
    if (await page.locator('[aria-label="Mark done: E2E urgent essay"]').count()) throw new Error('done task still in plan');
  });

  await step(page, 'E06', 'An exam in the same subject adds an exam reason', async () => {
    await goTab('Calendar');
    await label(page, 'Add exam').click();
    await page.waitForTimeout(900);
    await ph(page, 'e.g. Biology midterm').fill('E2E biology exam');
    await page.getByText('Biology', { exact: true }).last().click();
    await page.locator(`[aria-label="Day ${keyIn(2)}"]`).last().click();
    await page.locator('input[type=time]').last().fill('09:00'); // start time is required
    await page.getByText('Add exam', { exact: true }).last().click();
    await expectGone(page, 'New exam');
    await goTab('Home');
    await expectVisible(page, 'Exam in 2d', { exact: true });
  });

  await step(page, 'E07', 'Start plan opens Focus on the top task', async () => {
    await label(page, 'Start plan').click();
    await expectVisible(page, 'FOCUS SESSION');
    await expectVisible(page, 'Problem set 4: integrals');
  });

  await step(page, 'E08', 'Plan time does not reset when navigating away and back', async () => {
    await goTab('Home');
    await expectVisible(page, 'Smart plan for today');
    await expectVisible(page, 'min', { exact: false });
  });

  await step(page, 'E09', 'Empty state when nothing is pending', async () => {
    await label(page, 'Open menu').click();
    const row = page.getByText('View profile', { exact: true }).locator('xpath=ancestor::*[@tabindex="0"][1]/..');
    await row.locator('[tabindex="0"]').nth(1).click();
    await tap(page, 'Reset study data');
    await page.waitForTimeout(500);
    await goTab('Home');
    await expectVisible(page, 'You are all caught up');
  });

  await step(page, 'E10', 'No uncaught JS errors in this flow', async () => {
    const real = errors.filter((e) => !/Download the React DevTools/.test(e));
    if (real.length) throw new Error(`${real.length} errors, first: ${real[0].slice(0, 160)}`);
  });

  await ctx.close();
}

/* ============================ SUITE F: editing exams and repeating tasks ============================ */
currentSuite = 'Edit exams & repeats (390x844)';
if (want('F')) console.log(`\n== ${currentSuite} ==`);
if (want('F')) {
  const { ctx, page, errors } = await newPage(browser, { width: 390, height: 844 });
  const pad = (n) => String(n).padStart(2, '0');
  const keyIn = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  // the exam is added on the Calendar's selected day (today), so its sheet opens on this month. Its 6-week grid
  // always shows at least 5 days of the next month, so two days ahead is on it, and in the future, on any date.
  const sameMonthOffset = 2;
  const U = { name: 'Edit Tester', email: `edit${Date.now()}@example.com`, pw: 'EditPass123!' };
  await page.goto(APP, { waitUntil: 'load', timeout: 120000 });
  await skipIntro(page);
  await expectVisible(page, 'Welcome back', { timeout: 60000 });
  await tap(page, 'Create account');
  await ph(page, 'Your name').fill(U.name);
  await ph(page, 'you@example.com').fill(U.email);
  await ph(page, 'At least 6 characters').fill(U.pw);
  await ph(page, 'Re-enter password').fill(U.pw);
  await giveConsent(page);
  await page.getByText('Create account', { exact: true }).last().click();
  await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 20000 });
  const goTab = (name) => page.getByText(name, { exact: true }).last().click();
  const saved = async () => {
    await page.waitForTimeout(500);
    return page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('studyplanner:v1:'));
      return k ? JSON.parse(localStorage.getItem(k)) : null;
    });
  };

  await goTab('Calendar');
  await label(page, 'Add exam').click();
  await page.waitForTimeout(900);
  await ph(page, 'e.g. Biology midterm').fill('E2E original exam');
  await page.locator('input[type=time]').last().fill('09:00'); // start time is required
  await page.getByText('Add exam', { exact: true }).last().click();
  await expectVisible(page, 'E2E original exam');

  await step(page, 'F01', 'Edit exam opens prefilled with the current details', async () => {
    await label(page, 'Edit exam E2E original exam').first().click();
    await page.waitForTimeout(900);
    await expectVisible(page, 'Edit exam', { exact: true });
    await expectVisible(page, 'Save changes');
    const v = await ph(page, 'e.g. Biology midterm').inputValue();
    if (v !== 'E2E original exam') throw new Error('title not prefilled: ' + v);
  });

  await step(page, 'F02', 'Changing title, subject and date updates the exam', async () => {
    await ph(page, 'e.g. Biology midterm').fill('E2E renamed exam');
    await page.getByText('Biology', { exact: true }).last().click();
    await page.locator(`[aria-label="Day ${keyIn(sameMonthOffset)}"]`).last().click();
    await page.getByText('Save changes', { exact: true }).click();
    await expectGone(page, 'Edit exam', { exact: true });
    await expectVisible(page, 'E2E renamed exam');
    if (await page.getByText('E2E original exam').count()) throw new Error('old title still shown');
  });

  await step(page, 'F03', 'The edit is saved once (no duplicate) with the new values', async () => {
    const d = await saved();
    const exams = d.exams;
    if (exams.length !== 1) throw new Error('expected 1 exam, found ' + exams.length);
    if (exams[0].title !== 'E2E renamed exam') throw new Error('title ' + exams[0].title);
    if (exams[0].date !== keyIn(sameMonthOffset)) throw new Error('date ' + exams[0].date);
    if (exams[0].subjectId !== 's2') throw new Error('subject ' + exams[0].subjectId);
  });

  await step(page, 'F04', 'Dashboard countdown reflects the edited exam', async () => {
    await goTab('Home');
    await expectVisible(page, 'EXAM COUNTDOWN');
    await expectVisible(page, 'E2E renamed exam');
  });

  await step(page, 'F05', 'Cancelling an edit changes nothing', async () => {
    await goTab('Calendar');
    await label(page, 'Edit exam E2E renamed exam').first().click();
    await page.waitForTimeout(900);
    await ph(page, 'e.g. Biology midterm').fill('Should not be saved');
    await page.locator('xpath=//*[@aria-label="Edit exam E2E renamed exam"]').count();
    await page.keyboard.press('Escape');
    await page.mouse.click(195, 40); // tap the dimmed area above the sheet
    await expectGone(page, 'Edit exam', { exact: true });
    const d = await saved();
    if (d.exams[0].title !== 'E2E renamed exam') throw new Error('cancel still saved: ' + d.exams[0].title);
  });

  // ---- repeating tasks ----
  await goTab('Home');
  await label(page, 'Add task').click();
  await page.waitForTimeout(900);
  await ph(page, 'What do you need to study?').fill('E2E habit');
  await tap(page, 'Every day');
  await page.getByText('Add task', { exact: true }).last().click();
  await expectGone(page, 'New task');
  await expectVisible(page, 'E2E habit');
  const habitRow = page.getByText('E2E habit', { exact: true }).first().locator('xpath=ancestor::*[@tabindex="0"][1]');
  await habitRow.locator('[role="checkbox"]').first().click(); // finish today's copy before editing (its tick circle)
  await page.waitForTimeout(300);

  await step(page, 'F06', 'Edit repeating task opens prefilled, without a due date or "Never"', async () => {
    await goTab('Calendar');
    await label(page, 'Edit repeating task E2E habit').click();
    await page.waitForTimeout(900);
    await expectVisible(page, 'Edit repeating task', { exact: true });
    const v = await ph(page, 'What do you need to study?').inputValue();
    if (v !== 'E2E habit') throw new Error('title not prefilled: ' + v);
    if (await page.getByText('Due date', { exact: true }).count()) throw new Error('due date section should be hidden');
    if (await page.getByText('Never', { exact: true }).count()) throw new Error('"Never" should not be offered');
    await expectVisible(page, 'Upcoming copies are updated');
  });

  await step(page, 'F07', 'A repeat needs at least one day while editing', async () => {
    await tap(page, 'Pick days');
    const dots = [0, 1, 2, 3, 4, 5, 6];
    for (const d of dots) {
      const el = label(page, `Repeat day ${d}`);
      // days are pre-selected for "every day"; turn them all off
      await el.click();
    }
    await expectVisible(page, 'Choose at least one day');
  });

  await step(page, 'F08', 'Saving new title, weekdays and 45 min updates the repeat', async () => {
    await tap(page, 'Weekdays');
    await ph(page, 'What do you need to study?').fill('E2E habit v2');
    await page.getByText('45m', { exact: true }).click();
    await page.getByText('Save changes', { exact: true }).click();
    await expectGone(page, 'Edit repeating task', { exact: true });
    await expectVisible(page, 'E2E habit v2');
    await expectVisible(page, 'Weekdays · 45 min');
  });

  await step(page, 'F09', 'Upcoming copies were regenerated: new title, weekdays only, 45 min, no duplicates', async () => {
    const d = await saved();
    const today = keyIn(0);
    const copies = d.tasks.filter((t) => t.recurId);
    const future = copies.filter((t) => t.due >= today && !t.done);
    if (!future.length) throw new Error('no upcoming copies');
    for (const t of future) {
      const wd = new Date(`${t.due}T12:00:00`).getDay();
      if (wd === 0 || wd === 6) throw new Error('weekend copy ' + t.due);
      if (t.title !== 'E2E habit v2' || t.estimate !== 45) throw new Error(`stale copy ${t.title} ${t.estimate}`);
    }
    const seen = new Set();
    for (const t of copies) {
      const k = t.recurId + t.due;
      if (seen.has(k)) throw new Error('duplicate copy on ' + t.due);
      seen.add(k);
    }
  });

  await step(page, 'F10', 'The copy finished before the edit is kept (not duplicated or lost)', async () => {
    const d = await saved();
    const doneToday = d.tasks.filter((t) => t.recurId && t.done && t.due === keyIn(0));
    if (doneToday.length !== 1) throw new Error('expected 1 finished copy for today, found ' + doneToday.length);
    if (doneToday[0].title !== 'E2E habit') throw new Error('finished copy was rewritten: ' + doneToday[0].title);
  });

  await step(page, 'F11', 'Edits survive a reload', async () => {
    await page.reload({ waitUntil: 'load' });
    await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 60000 });
    await goTab('Calendar');
    await expectVisible(page, 'E2E habit v2');
    await expectVisible(page, 'E2E renamed exam');
  });

  await step(page, 'F12', 'No uncaught JS errors in this flow', async () => {
    const real = errors.filter((e) => !/Download the React DevTools/.test(e));
    if (real.length) throw new Error(`${real.length} errors, first: ${real[0].slice(0, 160)}`);
  });

  await ctx.close();
}

/* ============================ SUITE G: edit task and undo delete ============================ */
currentSuite = 'Edit task & undo (390x844)';
if (want('G')) console.log(`\n== ${currentSuite} ==`);
if (want('G')) {
  const { ctx, page, errors } = await newPage(browser, { width: 390, height: 844 });
  const pad = (n) => String(n).padStart(2, '0');
  const keyIn = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const U = { name: 'Undo Tester', email: `undo${Date.now()}@example.com`, pw: 'UndoPass123!' };
  await page.goto(APP, { waitUntil: 'load', timeout: 120000 });
  await skipIntro(page);
  await expectVisible(page, 'Welcome back', { timeout: 60000 });
  await tap(page, 'Create account');
  await ph(page, 'Your name').fill(U.name);
  await ph(page, 'you@example.com').fill(U.email);
  await ph(page, 'At least 6 characters').fill(U.pw);
  await ph(page, 'Re-enter password').fill(U.pw);
  await giveConsent(page);
  await page.getByText('Create account', { exact: true }).last().click();
  await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 20000 });
  const goTab = (name) => page.getByText(name, { exact: true }).last().click();
  const saved = async () => {
    await page.waitForTimeout(500);
    return page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('studyplanner:v1:'));
      return k ? JSON.parse(localStorage.getItem(k)) : null;
    });
  };
  const longPress = async (loc) => {
    const box = await loc.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
  };

  await step(page, 'G01', 'Tapping a task opens the edit sheet, prefilled', async () => {
    await label(page, 'Edit task Problem set 4: integrals').first().click();
    await page.waitForTimeout(900);
    await expectVisible(page, 'Edit task', { exact: true });
    await expectVisible(page, 'Save changes');
    const v = await ph(page, 'What do you need to study?').inputValue();
    if (v !== 'Problem set 4: integrals') throw new Error('title not prefilled: ' + v);
    await expectVisible(page, 'Due date', { exact: true });
    if (await page.getByText('Repeat', { exact: true }).count()) throw new Error('repeat options should be hidden when editing one task');
  });

  await step(page, 'G02', 'Changing title, priority, time, subject and date saves one updated task', async () => {
    await ph(page, 'What do you need to study?').fill('Problem set 4: edited');
    await page.getByText('High', { exact: true }).last().click();
    await page.getByText('45m', { exact: true }).last().click();
    await page.getByText('Biology', { exact: true }).last().click();
    const wk = new Date(`${keyIn(2)}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
    await page.getByText(wk, { exact: true }).last().click({ force: true }).catch(() => {});
    await page.getByText('Save changes', { exact: true }).click();
    await expectGone(page, 'Edit task', { exact: true });
    await expectVisible(page, 'Problem set 4: edited');
    const d = await saved();
    const t = d.tasks.find((x) => x.id === 't1');
    if (!t) throw new Error('task t1 missing');
    if (d.tasks.filter((x) => x.title.startsWith('Problem set 4')).length !== 1) throw new Error('duplicate task');
    if (t.title !== 'Problem set 4: edited') throw new Error('title ' + t.title);
    if (t.priority !== 'high') throw new Error('priority ' + t.priority);
    if (t.estimate !== 45) throw new Error('estimate ' + t.estimate);
    if (t.subjectId !== 's2') throw new Error('subject ' + t.subjectId);
    if (t.due === keyIn(0)) throw new Error('due date did not change');
  });

  await step(page, 'G03', 'An overdue task keeps its date when edited', async () => {
    await page.evaluate((y) => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('studyplanner:v1:'));
      const d = JSON.parse(localStorage.getItem(k));
      d.tasks = d.tasks.map((t) => (t.id === 't2' ? { ...t, due: y } : t));
      localStorage.setItem(k, JSON.stringify(d));
    }, keyIn(-1));
    await page.reload({ waitUntil: 'load' });
    await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 60000 });
    await label(page, 'Edit task Read chapter 7: cell division').first().click();
    await page.waitForTimeout(900);
    await expectVisible(page, 'Yesterday');
    await page.getByText('Save changes', { exact: true }).click();
    await expectGone(page, 'Edit task', { exact: true });
    const d = await saved();
    if (d.tasks.find((x) => x.id === 't2').due !== keyIn(-1)) throw new Error('overdue date changed');
  });

  await step(page, 'G04', 'Long-press deletes a task at once and shows Undo (no confirmation)', async () => {
    await longPress(label(page, 'Edit task Read chapter 7: cell division').first());
    await expectVisible(page, 'deleted');
    await expectVisible(page, 'Undo', { exact: true });
    const d = await saved();
    if (d.tasks.some((x) => x.id === 't2')) throw new Error('task still stored');
  });

  await step(page, 'G05', 'Undo brings the task back unchanged', async () => {
    await label(page, 'Undo').click();
    await expectGone(page, 'Undo', { exact: true });
    const d = await saved();
    const t = d.tasks.find((x) => x.id === 't2');
    if (!t) throw new Error('task not restored');
    if (t.title !== 'Read chapter 7: cell division' || t.due !== keyIn(-1)) throw new Error('task changed on restore');
    if (d.tasks.filter((x) => x.id === 't2').length !== 1) throw new Error('duplicated on restore');
  });

  await step(page, 'G06', 'The undo bar disappears by itself', async () => {
    await longPress(label(page, 'Edit task Read chapter 7: cell division').first());
    await expectVisible(page, 'Undo', { exact: true });
    await page.waitForTimeout(7000);
    if (await page.getByText('Undo', { exact: true }).count()) throw new Error('undo bar still visible after 7s');
  });

  await step(page, 'G07', 'Deleting a subject can be undone, including its task links', async () => {
    await page.getByText('Home', { exact: true }).last().click();
    await label(page, 'Open menu').click();
    await page.getByText('Subjects', { exact: true }).first().click();
    await expectVisible(page, 'YOUR COURSES');
    const before = await saved();
    const linked = before.tasks.filter((t) => t.subjectId === 's2').map((t) => t.id);
    await label(page, 'Delete Biology').click();
    await expectVisible(page, 'Subject “Biology” deleted');
    let d = await saved();
    if (d.subjects.some((s) => s.id === 's2')) throw new Error('subject still stored');
    if (d.tasks.some((t) => t.subjectId === 's2')) throw new Error('tasks still linked after delete');
    await label(page, 'Undo').click();
    d = await saved();
    if (!d.subjects.some((s) => s.id === 's2')) throw new Error('subject not restored');
    const relinked = d.tasks.filter((t) => t.subjectId === 's2').map((t) => t.id).sort();
    if (JSON.stringify(relinked) !== JSON.stringify([...linked].sort())) throw new Error('task links not restored');
    await expectVisible(page, 'Biology');
  });

  await step(page, 'G08', 'Deleting an exam can be undone', async () => {
    await goTab('Calendar');
    await label(page, 'Add exam').click();
    await page.waitForTimeout(900);
    await ph(page, 'e.g. Biology midterm').fill('E2E undo exam');
    await page.locator('input[type=time]').last().fill('09:00'); // start time is required
    await page.getByText('Add exam', { exact: true }).last().click();
    await expectVisible(page, 'E2E undo exam');
    await label(page, 'Delete exam E2E undo exam').first().click();
    await expectVisible(page, 'Exam “E2E undo exam” deleted');
    let d = await saved();
    if (d.exams.length !== 0) throw new Error('exam still stored');
    await label(page, 'Undo').click();
    d = await saved();
    if (d.exams.length !== 1 || d.exams[0].title !== 'E2E undo exam') throw new Error('exam not restored');
  });

  await step(page, 'G09', 'Editing from the Calendar works too', async () => {
    const d0 = await saved();
    const t1 = d0.tasks.find((x) => x.id === 't1');
    await goTab('Calendar');
    const cell = label(page, 'Day ' + t1.due);
    if (!(await cell.count())) await label(page, 'Next month').click();
    await label(page, 'Day ' + t1.due).click();
    await page.locator('[aria-label="Edit task ' + t1.title + '"]').last().click(); // the Calendar copy is later in the page than the Dashboard one
    await page.waitForTimeout(900);
    await ph(page, 'What do you need to study?').fill('Edited from calendar');
    await page.getByText('Save changes', { exact: true }).click();
    await expectGone(page, 'Edit task', { exact: true });
    await expectVisible(page, 'Edited from calendar');
  });

  await step(page, 'G10', 'No uncaught JS errors in this flow', async () => {
    const real = errors.filter((e) => !/Download the React DevTools/.test(e));
    if (real.length) throw new Error(`${real.length} errors, first: ${real[0].slice(0, 160)}`);
  });

  await ctx.close();
}

/* ============================ SUITE H: swipe, filters, search, backup, week start, intro, a11y, locale ============================ */
currentSuite = 'Quick wins (390x844)';
if (want('H')) console.log(`\n== ${currentSuite} ==`);
if (want('H')) {
  const { ctx, page, errors } = await newPage(browser, { width: 390, height: 844 });
  const U = { name: 'Quick Tester', email: `quick${Date.now()}@example.com`, pw: 'QuickPass123!' };
  await page.goto(APP, { waitUntil: 'load', timeout: 120000 });
  await skipIntro(page);
  await expectVisible(page, 'Welcome back', { timeout: 60000 });
  await tap(page, 'Create account');
  await ph(page, 'Your name').fill(U.name);
  await ph(page, 'you@example.com').fill(U.email);
  await ph(page, 'At least 6 characters').fill(U.pw);
  await ph(page, 'Re-enter password').fill(U.pw);
  await giveConsent(page);
  await page.getByText('Create account', { exact: true }).last().click();
  await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 20000 });
  const goTab = (name) => page.getByText(name, { exact: true }).last().click();
  const saved = async () => {
    await page.waitForTimeout(500);
    return page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('studyplanner:v1:'));
      return k ? JSON.parse(localStorage.getItem(k)) : null;
    });
  };
  const swipe = async (loc, dx) => {
    await loc.evaluate((el) => el.scrollIntoView({ block: 'center' })); // keep it clear of the bottom bar
    await page.waitForTimeout(200);
    const box = await loc.boundingBox();
    const y = box.y + box.height / 2;
    const x0 = box.x + box.width / 2;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    await page.mouse.move(x0 + dx / 2, y, { steps: 6 });
    await page.mouse.move(x0 + dx, y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(500);
  };
  const openSettings = async () => {
    await goTab('Home');
    await label(page, 'Open menu').click();
    await page.locator('[aria-label="Settings"]').first().click();
    await expectVisible(page, 'Make it yours');
  };
  const t1 = () => label(page, 'Edit task Problem set 4: integrals');

  // the saved data once t1 is done (or not): a busy machine can take a moment to save
  const t1Saved = async (done) => {
    for (let i = 0; i < 10; i++) {
      const d = await saved();
      if (d && !!d.tasks.find((x) => x.id === 't1').done === done) return true;
    }
    return false;
  };
  await step(page, 'H01', 'Swipe right completes a task, swipe right again reopens it', async () => {
    await swipe(t1(), 170);
    if (!(await t1Saved(true))) throw new Error('task not completed by swipe');
    await swipe(t1(), 170);
    if (!(await t1Saved(false))) throw new Error('task not reopened by swipe');
  });

  await step(page, 'H02', 'A short drag does nothing (no accidental actions)', async () => {
    await swipe(t1(), 40);
    const d = await saved();
    const t = d.tasks.find((x) => x.id === 't1');
    if (t.done) throw new Error('short drag completed the task');
    if (await page.getByText('Edit task', { exact: true }).count()) throw new Error('short drag opened the editor');
  });

  await step(page, 'H03', 'Swipe left deletes the task and offers Undo', async () => {
    await swipe(label(page, 'Edit task Read chapter 7: cell division'), -170);
    await expectVisible(page, 'deleted');
    const d = await saved();
    if (d.tasks.some((x) => x.id === 't2')) throw new Error('task still stored');
    await label(page, 'Undo').click();
    const d2 = await saved();
    if (!d2.tasks.some((x) => x.id === 't2')) throw new Error('undo did not restore');
  });

  await step(page, 'H04', 'Swiping does not block normal taps (tap still opens the editor)', async () => {
    await t1().click();
    await page.waitForTimeout(900);
    await expectVisible(page, 'Edit task', { exact: true });
    await page.getByText('Save changes', { exact: true }).click();
    await expectGone(page, 'Edit task', { exact: true });
  });

  // a high priority task for the filter and search checks
  await label(page, 'Add task').click();
  await page.waitForTimeout(900);
  await ph(page, 'What do you need to study?').fill('QW urgent essay');
  await page.getByText('High', { exact: true }).first().click();
  await page.getByText('Add task', { exact: true }).last().click();
  await expectGone(page, 'New task');

  await step(page, 'H05', 'Dashboard filter: High priority shows only high priority tasks', async () => {
    await label(page, 'Filter: High priority').click();
    await page.waitForTimeout(300);
    const list = await bodyText(page);
    const tail = list.slice(list.indexOf('Your tasks'));
    if (!/QW urgent essay/.test(tail)) throw new Error('high priority task missing');
    if (/Problem set 4: integrals/.test(tail)) throw new Error('normal task should be hidden');
  });

  await step(page, 'H06', 'Filter by subject, and a filter with no matches can be cleared', async () => {
    await label(page, 'Filter: High priority').click(); // off
    await label(page, 'Filter: History').click();
    await expectVisible(page, 'No tasks match this filter');
    await label(page, 'Clear filter').click();
    await expectGone(page, 'No tasks match this filter');
    await expectVisible(page, 'Problem set 4: integrals');
  });

  await step(page, 'H07', 'Search finds tasks by priority word and by subject', async () => {
    await label(page, 'Search').click();
    await ph(page, 'Search tasks, exams, classes…').fill('high priority');
    await expectVisible(page, 'QW urgent essay');
    await ph(page, 'Search tasks, exams, classes…').fill('biology');
    await expectVisible(page, 'Read chapter 7: cell division');
    await ph(page, 'Search tasks, exams, classes…').fill('overdue');
    await expectVisible(page, 'No results for');
    await label(page, 'Close search').click();
  });

  await step(page, 'H08', 'Export backup downloads a valid JSON file', async () => {
    await openSettings();
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.getByText('Export backup', { exact: true }).click()]);
    const file = download.suggestedFilename();
    if (!/^studyplanner-backup-\d{4}-\d{2}-\d{2}\.json$/.test(file)) throw new Error('file name ' + file);
    const content = fs.readFileSync(await download.path(), 'utf8');
    const j = JSON.parse(content);
    if (j.app !== 'StudyPlanner' || !Array.isArray(j.data.tasks)) throw new Error('not a valid backup');
    if (!j.data.tasks.some((t) => t.title === 'QW urgent essay')) throw new Error('backup is missing a task');
    globalThis.__backup = content;
  });

  await step(page, 'H09', 'Restore rejects bad text and enables only for a valid backup', async () => {
    await page.getByText('Restore from backup', { exact: true }).click();
    await page.waitForTimeout(900);
    const box = page.locator('[aria-label="Backup text"]').first();
    await box.fill('this is not a backup');
    await expectVisible(page, 'not valid backup text');
    if (!(await page.locator('[aria-label="Restore backup"]').first().evaluate((el) => el.getAttribute('aria-disabled') === 'true'))) throw new Error('restore button should be disabled');
    await box.fill(JSON.stringify({ app: 'Other', data: {} }));
    await expectVisible(page, 'does not look like a StudyPlanner backup');
  });

  await step(page, 'H10', 'Restore brings back data after a reset, and Undo reverses it', async () => {
    await page.locator('[aria-label="Backup text"]').first().fill(globalThis.__backup);
    await expectVisible(page, 'Found');
    await page.locator('[aria-label="Close sheet"]').last().click();
    await expectGone(page, 'Restore from backup', { exact: true }).catch(() => {});
    await page.getByText('Reset study data', { exact: true }).click();
    await page.waitForTimeout(600);
    let d = await saved();
    if (d.tasks.length !== 0) throw new Error('reset did not clear tasks');
    await page.getByText('Restore from backup', { exact: true }).click();
    await page.waitForTimeout(900);
    await page.locator('[aria-label="Backup text"]').first().fill(globalThis.__backup);
    await expectVisible(page, 'Found');
    await page.locator('[aria-label="Restore backup"]').first().click();
    await expectVisible(page, 'Backup restored');
    d = await saved();
    if (!d.tasks.some((t) => t.title === 'QW urgent essay') || d.subjects.length !== 3) throw new Error('data not restored');
    await label(page, 'Undo').click();
    d = await saved();
    if (d.tasks.length !== 0) throw new Error('undo did not return to the reset state');
    // put the data back for the next checks
    await page.getByText('Restore from backup', { exact: true }).click();
    await page.waitForTimeout(900);
    await page.locator('[aria-label="Backup text"]').first().fill(globalThis.__backup);
    await page.locator('[aria-label="Restore backup"]').first().click();
    await expectVisible(page, 'Backup restored');
  });

  await step(page, 'HC1', 'Import calendar (.ics): a pasted file previews, adds a weekly class, an exam and a break, and Undo removes them', async () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0',
      'BEGIN:VEVENT', 'UID:a@x', 'SUMMARY:ICS Chemistry', 'DTSTART:20260907T110000', 'DTEND:20260907T120000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TH', 'LOCATION:Lab 2', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:b@x', 'SUMMARY:ICS Chemistry quiz', 'DTSTART:20991201T090000', 'DTEND:20991201T093000', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:c@x', 'SUMMARY:ICS Winter break', 'DTSTART;VALUE=DATE:20991220', 'DTEND;VALUE=DATE:20991225', 'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    await page.getByText('Import calendar (.ics)', { exact: true }).click();
    await page.waitForTimeout(900);
    const box = page.locator('[aria-label="Calendar file text"]').first();
    await box.fill('not a calendar');
    await expectVisible(page, 'No events found');
    await box.fill(ics);
    await expectVisible(page, 'Found 1 class, 1 exam and 1 break.');
    await page.locator('[aria-label="Add the calendar items"]').first().click();
    await expectVisible(page, '3 items imported');
    let d = await saved();
    const cls = d.classes.find((c) => c.title === 'ICS Chemistry');
    if (!cls || cls.repeat !== 'weekly' || cls.days.join() !== '1,4' || cls.start !== '11:00' || cls.location !== 'Lab 2') throw new Error('class ' + JSON.stringify(cls));
    const ex = d.exams.find((e) => e.title === 'ICS Chemistry quiz');
    if (!ex || ex.date !== '2099-12-01' || ex.duration !== 30) throw new Error('exam ' + JSON.stringify(ex));
    const v = d.vacations.find((x) => x.title === 'ICS Winter break');
    if (!v || v.start !== '2099-12-20' || v.end !== '2099-12-24') throw new Error('break ' + JSON.stringify(v));
    await label(page, 'Undo').click();
    await page.waitForTimeout(300);
    d = await saved();
    if (d.classes.some((c) => c.title.startsWith('ICS ')) || d.exams.some((e) => e.title.startsWith('ICS ')) || d.vacations.some((x) => x.title.startsWith('ICS '))) throw new Error('undo left imported records');
  });

  await step(page, 'HC2', 'Export calendar (.ics) downloads a calendar file with the upcoming exams', async () => {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.getByText('Export calendar (.ics)', { exact: true }).click()]);
    if (!/^studyplanner-\d{4}-\d{2}-\d{2}\.ics$/.test(download.suggestedFilename())) throw new Error('file name ' + download.suggestedFilename());
    const text = fs.readFileSync(await download.path(), 'utf8');
    if (!text.startsWith('BEGIN:VCALENDAR') || !text.includes('END:VCALENDAR')) throw new Error('not a calendar file');
    const d = await saved();
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const upcoming = d.exams.filter((e) => e.date >= todayKey);
    for (const e of upcoming) if (!text.includes(`UID:${e.id}@studyplanner`)) throw new Error('missing exam ' + e.title);
    await expectVisible(page, 'Calendar file saved');
  });

  await step(page, 'H11', 'Week start Monday changes the calendar grid', async () => {
    await label(page, 'Week starts on Mon').click();
    await goTab('Calendar');
    await expectVisible(page, 'Upcoming exams');
    const firstWeekday = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('[aria-label^="Day "]')];
      const first = cells[0].getAttribute('aria-label').replace('Day ', '');
      return new Date(first + 'T12:00:00').getDay();
    });
    if (firstWeekday !== 1) throw new Error('grid does not start on Monday: ' + firstWeekday);
  });

  await step(page, 'H12', 'Week start Sunday restores the default', async () => {
    await openSettings();
    await label(page, 'Week starts on Sun').click();
    await goTab('Calendar');
    const firstWeekday = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('[aria-label^="Day "]')];
      return new Date(cells[0].getAttribute('aria-label').replace('Day ', '') + 'T12:00:00').getDay();
    });
    if (firstWeekday !== 0) throw new Error('grid does not start on Sunday: ' + firstWeekday);
  });

  await step(page, 'H13', 'Show intro again replays the slides and returns to the app', async () => {
    await openSettings();
    await page.getByText('Show intro again', { exact: true }).click();
    await expectVisible(page, 'Plan your day', { timeout: 8000 });
    await expectVisible(page, '1/3');
    await page.getByText('Skip', { exact: true }).first().click();
    await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 15000 });
  });

  await step(page, 'H14', 'Accessibility: tabs, checkboxes and switches expose roles and state', async () => {
    const tabs = await page.locator('[role="tab"]').count();
    if (tabs !== 4) throw new Error('expected 4 tabs, found ' + tabs);
    const selected = await page.locator('[role="tab"][aria-selected="true"]').count();
    if (selected !== 1) throw new Error('expected 1 selected tab, found ' + selected);
    const boxes = await page.locator('[role="checkbox"]').count();
    if (boxes < 1) throw new Error('task toggles are not checkboxes');
    const unlabeled = await page.evaluate(() =>
      [...document.querySelectorAll('[role="checkbox"]')].filter((e) => !e.getAttribute('aria-label')).length
    );
    if (unlabeled) throw new Error(unlabeled + ' unlabeled checkboxes');
    await openSettings();
    for (const name of ['In-app alerts', 'Phone notifications', 'Vibrate when a session ends']) {
      if (!(await page.locator(`[aria-label="${name}"]`).count())) throw new Error('switch not labelled: ' + name);
    }
  });

  await step(page, 'H15', 'Every icon-only button on the dashboard has a label', async () => {
    await goTab('Home');
    const bad = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('[tabindex="0"]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const visible = getComputedStyle(el).visibility !== 'hidden';
        const hasText = (el.innerText || '').trim().length > 0;
        const labelled = !!el.getAttribute('aria-label');
        if (visible && !hasText && !labelled) out.push(el.outerHTML.slice(0, 90));
      });
      return out;
    });
    if (bad.length) throw new Error(`${bad.length} unlabeled controls, e.g. ${bad[0]}`);
  });

  await step(page, 'H16', 'No uncaught JS errors in this flow', async () => {
    const real = errors.filter((e) => !/Download the React DevTools/.test(e));
    if (real.length) throw new Error(`${real.length} errors, first: ${real[0].slice(0, 160)}`);
  });

  await ctx.close();
}

// Dates follow the device language
if (want('H')) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE' });
  const page = await ctx.newPage();
  watchAccounts(page);
  page.on('dialog', (d) => { allDialogs.push(d.message()); d.accept(); });
  await page.goto(APP, { waitUntil: 'load', timeout: 120000 });
  await skipIntro(page);
  await expectVisible(page, 'Welcome back', { timeout: 60000 });
  await tap(page, 'Create account');
  await ph(page, 'Your name').fill('Anna Schmidt');
  await ph(page, 'you@example.com').fill(`de${Date.now()}@example.com`);
  await ph(page, 'At least 6 characters').fill('DeutschPass1!');
  await ph(page, 'Re-enter password').fill('DeutschPass1!');
  await giveConsent(page);
  await page.getByText('Create account', { exact: true }).last().click();
  await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 20000 });
  await step(page, 'H17', 'German phone: calendar shows German month and weekday letters', async () => {
    await page.getByText('Calendar', { exact: true }).last().click();
    const german = new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    await expectVisible(page, german);
    const english = new Date().toLocaleDateString('en-US', { month: 'long' });
    const t = await bodyText(page);
    if (new RegExp(english + ' \\d{4}').test(t) && english !== new Date().toLocaleDateString('de-DE', { month: 'long' })) throw new Error('month shown in English');
    const letters = await page.evaluate(() => [...document.querySelectorAll('div')].map((d) => d.textContent).filter((x) => x === 'D').length);
    if (letters < 1) throw new Error('German weekday letter D (Dienstag/Donnerstag) not found');
  });
  await ctx.close();
}

/* ============================ SUITE I: timer follows the task estimate ============================ */
currentSuite = 'Focus timer vs task estimate (390x844)';
if (want('I')) console.log(`\n== ${currentSuite} ==`);
if (want('I')) {
  const { ctx, page, errors } = await newPage(browser, { width: 390, height: 844 });
  const U = { name: 'Timer Tester', email: `timer${Date.now()}@example.com`, pw: 'TimerPass123!' };
  await page.goto(APP, { waitUntil: 'load', timeout: 120000 });
  await skipIntro(page);
  await expectVisible(page, 'Welcome back', { timeout: 60000 });
  await tap(page, 'Create account');
  await ph(page, 'Your name').fill(U.name);
  await ph(page, 'you@example.com').fill(U.email);
  await ph(page, 'At least 6 characters').fill(U.pw);
  await ph(page, 'Re-enter password').fill(U.pw);
  await giveConsent(page);
  await page.getByText('Create account', { exact: true }).last().click();
  await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 20000 });
  const goTab = (name) => page.getByText(name, { exact: true }).last().click();
  const addTask = async (title, chip) => {
    await label(page, 'Add task').click();
    await page.waitForTimeout(900);
    await ph(page, 'What do you need to study?').fill(title);
    await page.getByText(chip, { exact: true }).last().click();
    await page.getByText('Add task', { exact: true }).last().click();
    await expectGone(page, 'New task');
  };
  const clock = () => focusClock(page);

  await addTask('FT fifteen', '15m');
  await addTask('FT fortyfive', '45m');
  await goTab('Focus');

  await step(page, 'I01', 'The first task due today is picked for you, with its estimate', async () => {
    // the plan ranks equal tasks shortest first: the 15 minute one
    await expectVisible(page, '15:00');
    await expectVisible(page, '0 / 15 min on this task');
  });

  await step(page, 'I02', 'Picking a 15 minute task sets the timer to 15:00', async () => {
    await page.getByText('FT fifteen', { exact: true }).last().click();
    await expectVisible(page, '15:00');
    await expectVisible(page, "Timer set to this task's 15 min estimate");
    await expectVisible(page, '15 min', { exact: true });
  });

  await step(page, 'I03', 'Picking a 45 minute task changes it, and the 15 min option goes away', async () => {
    await page.getByText('FT fortyfive', { exact: true }).last().click();
    await expectVisible(page, '45:00');
    await page.waitForTimeout(300);
    if (await page.locator('[aria-label="15 min focus session"]').count()) throw new Error('stale 15 min option still shown');
  });

  await step(page, 'I04', 'You can still change the length by hand after picking a task', async () => {
    await label(page, '25 min focus session').click();
    await expectVisible(page, '25:00');
    await page.getByText('FT fifteen', { exact: true }).last().click();
    await expectVisible(page, '15:00'); // choosing a task again re-applies its estimate
  });

  await step(page, 'I05', 'No task goes back to the default length', async () => {
    await page.getByText('No task', { exact: true }).last().click();
    await expectVisible(page, '25:00');
  });

  await step(page, 'I06', 'A session that has started is never changed by picking another task', async () => {
    await page.getByText('FT fifteen', { exact: true }).last().click();
    await expectVisible(page, '15:00');
    await label(page, 'Start timer').click();
    await page.waitForTimeout(2200);
    await label(page, 'Pause timer').click();
    const before = await clock();
    if (!before || before === '15:00') throw new Error('timer did not run: ' + before);
    await page.getByText('FT fortyfive', { exact: true }).last().click();
    await page.waitForTimeout(400);
    const after = await clock();
    if (after !== before) throw new Error(`timer changed from ${before} to ${after}`);
    if (await page.getByText('45:00').count()) throw new Error('timer was reset to the new task estimate');
  });

  await step(page, 'I07', 'After resetting, picking a task applies its estimate again', async () => {
    await label(page, 'Reset timer').click();
    await page.getByText('FT fortyfive', { exact: true }).last().click();
    await expectVisible(page, '45:00');
  });

  await step(page, 'I07b', 'A running session survives a reload', async () => {
    await label(page, 'Start timer').click();
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: 'load' });
    await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 60000 });
    await goTab('Focus');
    await label(page, 'Pause timer').waitFor({ timeout: 6000 }); // still running
    const left = await clock();
    if (!left || left >= '45:00') throw new Error('not resumed: ' + left);
    await label(page, 'Pause timer').click();
    await label(page, 'Reset timer').click();
  });

  await step(page, 'I07c', 'The ±5 min buttons set any length', async () => {
    await expectVisible(page, '45:00');
    await label(page, '5 min longer').click();
    await expectVisible(page, '50:00');
    await label(page, '5 min shorter').click();
    await label(page, '5 min shorter').click();
    await expectVisible(page, '40:00');
    await label(page, '5 min longer').click();
  });

  await step(page, 'I07d', 'Running hides the tab bar and the task list (focus mode); pausing brings them back', async () => {
    await label(page, 'Start timer').click();
    await page.waitForTimeout(800);
    if (await page.locator('[aria-label="Add task"]').count()) throw new Error('tab bar shown in focus mode');
    if (await page.getByText('Working on', { exact: true }).count()) throw new Error('task list shown in focus mode');
    await expectVisible(page, 'Focus mode: pause to see your tasks');
    await label(page, 'Pause timer').click();
    await page.locator('[aria-label="Add task"]').first().waitFor({ timeout: 4000 });
    await expectVisible(page, 'Working on', { exact: true });
    await label(page, 'Reset timer').click();
  });

  await step(page, 'I08', 'Starting from the dashboard plan opens Focus with that task’s estimate', async () => {
    await goTab('Home');
    await label(page, 'Start plan').click();
    await expectVisible(page, 'FOCUS SESSION');
    // the plan ranks equal tasks shortest first, so its first task is the 15 minute one
    await expectVisible(page, '15:00');
    await expectVisible(page, 'FT fifteen');
  });

  await step(page, 'I09', 'No uncaught JS errors in this flow', async () => {
    const real = errors.filter((e) => !/Download the React DevTools/.test(e));
    if (real.length) throw new Error(`${real.length} errors, first: ${real[0].slice(0, 160)}`);
  });

  await ctx.close();
}

/* ============================ SUITE J: keep screen on + session alert plumbing ============================ */
currentSuite = 'Focus: keep awake & alerts (390x844)';
if (want('J')) console.log(`\n== ${currentSuite} ==`);
if (want('J')) {
  const { ctx, page, errors } = await newPage(browser, { width: 390, height: 844 });
  const U = { name: 'Awake Tester', email: `awake${Date.now()}@example.com`, pw: 'AwakePass123!' };
  await page.goto(APP, { waitUntil: 'load', timeout: 120000 });
  await skipIntro(page);
  await expectVisible(page, 'Welcome back', { timeout: 60000 });
  await tap(page, 'Create account');
  await ph(page, 'Your name').fill(U.name);
  await ph(page, 'you@example.com').fill(U.email);
  await ph(page, 'At least 6 characters').fill(U.pw);
  await ph(page, 'Re-enter password').fill(U.pw);
  await giveConsent(page);
  await page.getByText('Create account', { exact: true }).last().click();
  await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 20000 });
  const goTab = (name) => page.getByText(name, { exact: true }).last().click();
  const settings = () =>
    page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('studyplanner:settings:'));
      return k ? JSON.parse(localStorage.getItem(k)) : {};
    });
  const sw = () => page.locator('[aria-label="Keep screen on while focusing"]').last();

  await step(page, 'J01', 'Focus tab: the phone-notification tip is only for phones, not the web', async () => {
    await goTab('Focus');
    await expectVisible(page, 'FOCUS SESSION');
    if (await page.getByText('turn on phone notifications', { exact: false }).count()) throw new Error('tip shown on web');
  });

  await step(page, 'J02', 'The timer still starts, runs and pauses with keep-awake switched on', async () => {
    const start = await focusClock(page); // today's first task is picked for you, so this is its estimate
    await label(page, 'Start timer').click();
    await page.waitForTimeout(2200);
    await label(page, 'Pause timer').click();
    const t = await focusClock(page);
    if (t === start) throw new Error('timer did not run: ' + t);
    await label(page, 'Reset timer').click();
    if ((await focusClock(page)) !== start) throw new Error('reset did not go back to ' + start);
  });

  await step(page, 'J02b', 'Reset is off while running; after a pause it can be undone', async () => {
    const start = await focusClock(page);
    await label(page, 'Start timer').click();
    await page.waitForTimeout(2200);
    if ((await label(page, 'Reset timer').getAttribute('aria-disabled')) !== 'true') throw new Error('reset is usable while running');
    await label(page, 'Pause timer').click();
    const paused = await focusClock(page);
    await label(page, 'Reset timer').click();
    await expectVisible(page, 'Timer reset');
    await label(page, 'Undo').click();
    if ((await focusClock(page)) !== paused) throw new Error('undo did not bring back ' + paused);
    await label(page, 'Reset timer').click();
    if ((await focusClock(page)) !== start) throw new Error('not reset');
  });

  await step(page, 'J03', 'Settings has "Keep screen on while focusing", on by default', async () => {
    await goTab('Home');
    await label(page, 'Open menu').click();
    await page.locator('[aria-label="Settings"]').first().click();
    await expectVisible(page, 'Keep screen on while focusing');
    const on = await sw().evaluate((el) => el.checked === true || el.getAttribute('aria-checked') === 'true');
    if (!on) throw new Error('should be on by default');
  });

  await step(page, 'J04', 'Turning it off is remembered after a reload', async () => {
    await sw().click({ force: true });
    await page.waitForTimeout(500);
    if ((await settings()).keepAwake !== false) throw new Error('setting not saved');
    await page.reload({ waitUntil: 'load' });
    await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 60000 });
    if ((await settings()).keepAwake !== false) throw new Error('setting lost on reload');
  });

  await step(page, 'J05', 'The timer also works with keep-awake switched off', async () => {
    await goTab('Focus');
    const start = await focusClock(page);
    await label(page, 'Start timer').click();
    await page.waitForTimeout(1800);
    await label(page, 'Pause timer').click();
    const t = await focusClock(page);
    if (t === start) throw new Error('timer did not run: ' + t);
  });

  await step(page, 'J06', 'No uncaught JS errors in this flow', async () => {
    const real = errors.filter((e) => !/Download the React DevTools/.test(e));
    if (real.length) throw new Error(`${real.length} errors, first: ${real[0].slice(0, 160)}`);
  });

  await ctx.close();
}

/* ============================ SUITE K: toasts instead of dialogs ============================ */
currentSuite = 'Toasts instead of dialogs (390x844)';
if (want('K')) console.log(`\n== ${currentSuite} ==`);
if (want('K')) {
  const { ctx, page, errors, dialogs } = await newPage(browser, { width: 390, height: 844 });
  const pad = (n) => String(n).padStart(2, '0');
  const keyIn = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const U = { name: 'Toast Tester', email: `toast${Date.now()}@example.com`, pw: 'ToastPass123!' };
  await page.goto(APP, { waitUntil: 'load', timeout: 120000 });
  await skipIntro(page);
  await expectVisible(page, 'Welcome back', { timeout: 60000 });
  await tap(page, 'Create account');
  await ph(page, 'Your name').fill(U.name);
  await ph(page, 'you@example.com').fill(U.email);
  await ph(page, 'At least 6 characters').fill(U.pw);
  await ph(page, 'Re-enter password').fill(U.pw);
  await giveConsent(page);
  await page.getByText('Create account', { exact: true }).last().click();
  await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 20000 });
  const goTab = (name) => page.getByText(name, { exact: true }).last().click();
  const saved = async () => {
    await page.waitForTimeout(500);
    return page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('studyplanner:v1:'));
      return k ? JSON.parse(localStorage.getItem(k)) : null;
    });
  };
  const openSettings = async () => {
    await goTab('Home');
    await label(page, 'Open menu').click();
    await page.locator('[aria-label="Settings"]').first().click();
    await expectVisible(page, 'Make it yours');
  };

  await step(page, 'K01', 'Export backup confirms with a toast', async () => {
    await openSettings();
    await page.getByText('Export backup', { exact: true }).click();
    await expectVisible(page, 'Backup saved to your downloads');
  });

  await step(page, 'K02', 'Reset study data happens at once, with a toast and Undo (no confirmation)', async () => {
    const before = await saved();
    if (before.tasks.length === 0) throw new Error('expected sample tasks');
    await page.getByText('Reset study data', { exact: true }).click();
    await expectVisible(page, 'All study data cleared');
    await expectVisible(page, 'Undo', { exact: true });
    const mid = await saved();
    if (mid.tasks.length !== 0 || mid.subjects.length !== 0) throw new Error('data not cleared');
    await label(page, 'Undo').click();
    const after = await saved();
    if (after.tasks.length !== before.tasks.length || after.subjects.length !== before.subjects.length) throw new Error('undo did not restore everything');
  });

  await step(page, 'K03', 'Stop repeating is immediate, and Undo brings back the repeat and its copies', async () => {
    await goTab('Home');
    await label(page, 'Add task').click();
    await page.waitForTimeout(900);
    await ph(page, 'What do you need to study?').fill('Toast habit');
    await tap(page, 'Every day');
    await page.getByText('Add task', { exact: true }).last().click();
    await expectGone(page, 'New task');
    const before = await saved();
    const copies = before.tasks.filter((t) => t.recurId).length;
    if (before.recurring.length !== 1 || copies < 7) throw new Error('repeat not created');
    await goTab('Calendar');
    await label(page, 'Stop repeating Toast habit').click();
    await expectVisible(page, 'Stopped repeating');
    let d = await saved();
    if (d.recurring.length !== 0) throw new Error('repeat still stored');
    if (d.tasks.some((t) => t.recurId && !t.done)) throw new Error('upcoming copies still stored');
    await label(page, 'Undo').click();
    d = await saved();
    if (d.recurring.length !== 1) throw new Error('repeat not restored');
    if (d.tasks.filter((t) => t.recurId).length !== copies) throw new Error('copies not restored');
    if (new Set(d.tasks.filter((t) => t.recurId).map((t) => t.due)).size !== copies) throw new Error('duplicate copies after undo');
  });

  await step(page, 'K04', 'Clearing past exams is immediate and can be undone', async () => {
    await page.evaluate((y) => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('studyplanner:v1:'));
      const d = JSON.parse(localStorage.getItem(k));
      d.exams = [...d.exams, { id: 'old1', title: 'Old exam', date: y, subjectId: null }];
      localStorage.setItem(k, JSON.stringify(d));
    }, keyIn(-3));
    await page.reload({ waitUntil: 'load' });
    await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 60000 });
    await goTab('Calendar');
    await page.getByText('Clear 1 past exam', { exact: true }).click();
    await expectVisible(page, '1 past exam cleared');
    let d = await saved();
    if (d.exams.length !== 0) throw new Error('past exam still stored');
    await label(page, 'Undo').click();
    d = await saved();
    if (d.exams.length !== 1 || d.exams[0].id !== 'old1') throw new Error('past exam not restored');
  });

  await step(page, 'K05', 'Signing out needs no confirmation and says so in a toast', async () => {
    await openSettings();
    await page.getByText('Sign out', { exact: true }).click();
    await expectVisible(page, 'Welcome back', { timeout: 8000 });
    await expectVisible(page, 'You have been signed out');
  });

  await step(page, 'K06', 'Deleting the account can be undone during the countdown', async () => {
    await loginFlow(page, U.email, U.pw);
    await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 20000 });
    await openSettings();
    await page.getByText('Delete account', { exact: true }).click();
    await expectVisible(page, 'Deleting your account');
    await label(page, 'Undo').click();
    await expectVisible(page, 'Account kept');
    await page.waitForTimeout(7000);
    if (await page.getByText('Welcome back', { exact: true }).count()) throw new Error('account was deleted despite Undo');
    // the cloud account is still there: it signs in
    const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    if ((await sb.auth.signInWithPassword({ email: U.email, password: U.pw })).error) throw new Error('the account is gone');
  });

  await step(page, 'K07', 'Without Undo the account is deleted after the countdown, with a toast', async () => {
    await page.getByText('Delete account', { exact: true }).click();
    await expectVisible(page, 'Deleting your account');
    await expectVisible(page, 'Welcome back', { timeout: 12000 });
    await expectVisible(page, 'Your account was deleted');
    // gone from the cloud: it no longer signs in
    const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    if (!(await sb.auth.signInWithPassword({ email: U.email, password: U.pw })).error) throw new Error('the account still signs in');
  });

  await step(page, 'K08', 'No browser dialog (alert or confirm) appeared during these flows', async () => {
    if (dialogs.length) throw new Error('dialogs shown: ' + dialogs.join(' | ').slice(0, 200));
  });

  await step(page, 'K09', 'No uncaught JS errors in this flow', async () => {
    const real = errors.filter((e) => !/Download the React DevTools/.test(e));
    if (real.length) throw new Error(`${real.length} errors, first: ${real[0].slice(0, 160)}`);
  });

  await ctx.close();
}

/* ============================ SUITE L: flashcards ============================ */
currentSuite = 'Flashcards (390x844)';
if (want('L')) console.log(`\n== ${currentSuite} ==`);
if (want('L')) {
  const { ctx, page, errors } = await newPage(browser, { width: 390, height: 844 });
  const U = { name: 'Card Tester', email: `cards${Date.now()}@example.com`, pw: 'CardPass123!' };
  await page.goto(APP, { waitUntil: 'load', timeout: 120000 });
  await skipIntro(page);
  await expectVisible(page, 'Welcome back', { timeout: 60000 });
  await tap(page, 'Create account');
  await ph(page, 'Your name').fill(U.name);
  await ph(page, 'you@example.com').fill(U.email);
  await ph(page, 'At least 6 characters').fill(U.pw);
  await ph(page, 'Re-enter password').fill(U.pw);
  await giveConsent(page);
  await page.getByText('Create account', { exact: true }).last().click();
  await expectVisible(page, 'QUOTE OF THE DAY', { timeout: 20000 });
  const keyIn = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const cards = () =>
    page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('studyplanner:v1:'));
      return (k && JSON.parse(localStorage.getItem(k)).cards) || [];
    });
  const openFlashcards = async () => {
    await label(page, 'Home tab').click();
    await label(page, 'Open menu').click();
    await page.waitForTimeout(400);
    await label(page, 'Flashcards page').click();
    await expectVisible(page, 'FLASHCARDS');
  };

  await step(page, 'L01', 'Flashcards: the menu opens an empty screen that says how to start; no dashboard card yet', async () => {
    if (await page.locator('[aria-label$="Open flashcards"]').count()) throw new Error('dashboard card with no cards');
    await openFlashcards();
    await expectVisible(page, 'No flashcards yet');
  });

  await step(page, 'L02', 'Pasting lines adds a card per line, in the chosen deck (with Undo)', async () => {
    await page.getByText('Add cards', { exact: true }).first().click();
    await page.getByRole('tab', { name: 'Paste many' }).last().click();
    await page.locator('[aria-label="One card per line: question | answer"]').last().fill('Unit of force | newton (N)\nOhm’s law | V = IR\nnot a card');
    await expectVisible(page, '2 cards found');
    await page.getByText('Add 2 cards', { exact: true }).last().click();
    await expectVisible(page, '2 cards added');
    const c = await cards();
    if (c.length !== 2 || c[0].front !== 'Unit of force' || c[1].back !== 'V = IR') throw new Error('cards: ' + JSON.stringify(c.map((x) => [x.front, x.back])));
    await expectVisible(page, '2 cards to review');
  });

  await step(page, 'L03', 'Review: answer hidden until asked; Again brings a card back in the session; Good schedules it for tomorrow', async () => {
    await page.getByText('Review 2 cards', { exact: true }).first().click();
    await expectVisible(page, 'Card 1 of 2');
    if (await page.getByText('newton (N)', { exact: true }).count()) throw new Error('answer shown before asked');
    await tap(page, 'Show answer');
    await expectVisible(page, 'newton (N)');
    await page.locator('[aria-label^="Again:"]').last().click();
    // the other card, then the forgotten one again
    for (let i = 0; i < 2; i++) {
      await tap(page, 'Show answer');
      await page.locator('[aria-label^="Good:"]').last().click();
    }
    await expectVisible(page, 'Well done!');
    await expectVisible(page, 'You reviewed 2 cards (1 to see again soon).');
    await tap(page, 'Finish');
    const c = await cards();
    const tomorrow = keyIn(1);
    if (!c.every((x) => x.reps === 1 && x.due === tomorrow)) throw new Error('schedule: ' + JSON.stringify(c.map((x) => [x.reps, x.due])));
    await expectVisible(page, 'All caught up');
  });

  await step(page, 'L04', 'A card can be edited and deleted (with Undo)', async () => {
    await label(page, 'No subject: 2 cards. Show the cards').click();
    await label(page, 'Edit card: Ohm’s law').click();
    await page.locator('[aria-label="Answer (back)"]').last().fill('V = I × R');
    await tap(page, 'Save changes');
    await expectVisible(page, 'V = I × R');
    await label(page, 'Delete card: Unit of force').click();
    await expectVisible(page, 'Card deleted');
    if ((await cards()).length !== 1) throw new Error('not deleted');
    await page.getByText('Undo', { exact: true }).last().click();
    await page.waitForTimeout(400);
    if ((await cards()).length !== 2) throw new Error('undo did not bring it back');
  });

  await step(page, 'L05a', 'Progress report: the sheet sums the period up, and the summary can be shared as a message', async () => {
    await label(page, 'Progress tab').click();
    await label(page, 'Progress report: share it as a PDF or a message').click();
    await expectVisible(page, 'For a parent, teacher or mentor');
    await page.getByRole('tab', { name: 'Last 4 weeks' }).last().click();
    await page.evaluate(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }));
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await tap(page, 'Share summary');
    await expectVisible(page, 'Summary copied: paste it into a message');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    if (!/^Progress report for Card Tester, /.test(text) || !/• Tasks: 0 done, 0 overdue/.test(text)) throw new Error('summary: ' + text.slice(0, 160));
    await label(page, 'Close sheet').last().click();
  });

  await step(page, 'L05', 'No uncaught JS errors in this flow', async () => {
    const real = errors.filter((e) => !/Download the React DevTools/.test(e));
    if (real.length) throw new Error(`${real.length} errors, first: ${real[0].slice(0, 160)}`);
  });

  await ctx.close();
}

await browser.close();
await deleteTestAccounts().catch((e) => console.log('Deleting test accounts failed:', e.message));

results.push({ suite: "Whole run", id: "Z01", name: "No browser alert or confirm dialog appeared in any test", ok: allDialogs.length === 0, err: allDialogs.join(" | ").slice(0, 200), ms: 0 });
console.log(allDialogs.length === 0 ? "  PASS Z01 No browser alert or confirm dialog appeared in any test" : "  FAIL Z01 dialogs appeared: " + allDialogs.join(" | ").slice(0, 200));

const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
// a partial run doesn't overwrite the full run's results
fs.writeFileSync(new URL(ONLY.length ? './results-partial.json' : './results.json', import.meta.url), JSON.stringify(results, null, 2));
console.log(`\nTOTAL ${results.length}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
