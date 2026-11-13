// Phone screenshots for the mobile feature guide: the app as it runs on an Android phone (Pixel 7 size) and an iPhone
// (iPhone 15 size), emulated in the browser: screen size, touch, mobile mode and the phone's browser identity. The
// screens are the app's own (it is one code base); the phone's own frame (status bar, notch) isn't part of them.
// Needs the web app running and the demo accounts (scripts/seed-demo.mjs, scripts/feature-screenshots.mjs).
//   node scripts/mobile-screenshots.mjs [android|ios]      (ONLY_MISSING=1 keeps the ones already taken)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';


// the showcase account back to English and Light after the shots
const env = Object.fromEntries(
  fs
    .readFileSync(new URL('../.env.development.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
async function resetShowcase() {
  const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email: 'demo.showcase@example.com', password: 'DemoPass123!' });
  const r = await sb.from('records').select('data').eq('kind', 'singleton').eq('id', 'settings').single();
  if (r.data) await sb.from('records').upsert([{ kind: 'singleton', id: 'settings', deleted: false, data: { ...r.data.data, language: 'system', theme: 'light' } }], { onConflict: 'user_id,kind,id' });
  // the task the offline shot adds goes again
  const { data: rows } = await sb.from('records').select('id,data').eq('kind', 'task').eq('deleted', false);
  const extra = (rows || []).filter((t) => t.data && t.data.title === 'Added while offline');
  if (extra.length) await sb.from('records').upsert(extra.map((t) => ({ kind: 'task', id: t.id, deleted: true, data: null })), { onConflict: 'user_id,kind,id' });
}

const APP = process.env.APP_URL || 'http://localhost:8081/';
// the Physics group's link (id.code), written by scripts/seed-demo.mjs when it makes the demo groups
const DEMO_GROUP = fs.existsSync(new URL('./.demo-group-link', import.meta.url)) ? fs.readFileSync(new URL('./.demo-group-link', import.meta.url), 'utf8').trim() : '';
// notes for the AI flashcards shot
const AI_NOTES = 'Photosynthesis happens in chloroplasts. The light reactions in the thylakoid membranes use light to split water, releasing oxygen and making ATP and NADPH. The Calvin cycle in the stroma uses that ATP and NADPH to fix carbon dioxide into sugar; the enzyme RuBisCO does the fixing. Chlorophyll absorbs red and blue light and reflects green.';
const PW = 'DemoPass123!';
const DEVICES = {
  android: {
    name: 'Android (Pixel 7)',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  },
  ios: {
    name: 'iPhone 15',
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  },
};
const which = process.argv[2] ? [process.argv[2]] : Object.keys(DEVICES);
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge', headless: true });
const summary = [];

for (const key of which) {
  const dev = DEVICES[key];
  await resetShowcase(); // each phone starts from English and Light
  const OUT = new URL(`../docs/feature-guide/mobile/${key}/`, import.meta.url);
  fs.mkdirSync(OUT, { recursive: true });
  const file = (f) => fileURLToPath(new URL(f, OUT));
  let ok = 0;
  const failed = [];
  console.log(`\n== ${dev.name} ==`);

  const session = async (url = APP) => {
    const ctx = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor, isMobile: true, hasTouch: true, userAgent: dev.userAgent, colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    return { ctx, page };
  };
  const signin = async (page, email) => {
    try {
      await page.getByText('Skip', { exact: true }).first().click({ timeout: 60000 });
    } catch {
      /* no intro */
    }
    await page.getByPlaceholder('you@example.com').first().fill(email);
    await page.getByPlaceholder('Your password').first().fill(PW);
    await page.getByText('Sign in', { exact: true }).last().click();
  };
  const home = (page) => page.getByText('QUOTE OF THE DAY').first().waitFor({ timeout: 60000 });
  const shot = async (page, f, title, steps) => {
    if (process.env.ONLY_MISSING && fs.existsSync(file(f))) return ok++;
    try {
      if (steps) await steps();
      await page.waitForTimeout(900);
      await page.screenshot({ path: file(f) });
      ok++;
      console.log(`  ✓ ${f}  ${title}`);
    } catch (e) {
      failed.push(f);
      console.log(`  ✗ ${f}  ${title}: ${String(e.message).split('\n')[0]}`);
    }
  };
  const tab = (page, name) => page.locator(`[aria-label="${name} tab"]`).first().click();
  const menu = async (page, label) => {
    await tab(page, 'Home');
    await page.locator('[aria-label="Open menu"]').first().click();
    await page.waitForTimeout(500);
    // the profile is the name at the bottom of the menu; the rest are labelled entries
    if (label === 'View profile') await page.getByText('View profile', { exact: true }).first().click();
    else await page.locator(`[aria-label^="${label}"]`).first().click();
    await page.waitForTimeout(600);
  };
  const closeSheets = async (page) => {
    for (let i = 0; i < 3; i++) {
      const c = page.locator('[aria-label="Close sheet"]');
      if (!(await c.count())) break;
      await c.last().click().catch(() => {});
      await page.waitForTimeout(400);
    }
  };

  // before signing in
  {
    const { ctx, page } = await session();
    await shot(page, '01-intro.png', 'Welcome slides', () => page.getByText('Skip', { exact: true }).first().waitFor({ timeout: 60000 }));
    await page.getByText('Skip', { exact: true }).first().click();
    await shot(page, '02-sign-in.png', 'Sign in', () => page.getByPlaceholder('you@example.com').first().waitFor());
    await shot(page, '03-create-account.png', 'Create account', async () => {
      await page.getByText('Create account', { exact: true }).first().click();
      await page.getByPlaceholder('Your name').first().fill('Asha Patel');
      await page.getByPlaceholder('you@example.com').first().fill('asha@example.com');
      await page.getByPlaceholder('At least 6 characters').first().fill('Study2026!');
    });
    await ctx.close();
  }

  // the sample-data account
  {
    const { ctx, page } = await session();
    await signin(page, 'demo.showcase@example.com');
    await home(page);
    await page.waitForTimeout(2500);
    await shot(page, '04-dashboard.png', 'Dashboard');
    await shot(page, '37-menu.png', 'The menu', () => page.locator('[aria-label="Open menu"]').first().click());
    await page.mouse.click(dev.viewport.width - 20, dev.viewport.height / 2);
    await page.waitForTimeout(500);
    await shot(page, '47-quick-add.png', 'Quick add', () => page.locator('[aria-label="Quick add a task"]').first().fill('Physics worksheet fri 45 min 5pm !'));
    await page.locator('[aria-label="Quick add a task"]').first().fill('');
    await shot(page, '05-smart-plan.png', 'Smart plan for today', () => page.getByText('Smart plan for today').first().scrollIntoViewIfNeeded());
    await shot(page, '06-new-task.png', 'New task sheet', async () => {
      await page.locator('[aria-label="Add task"]').first().click();
      await page.getByPlaceholder('What do you need to study?').first().fill('Revise chapter 6: thermodynamics');
    });
    await closeSheets(page);
    await shot(page, '07-edit-task-steps.png', 'A task with steps and a link', () => page.locator('[aria-label="Edit task Problem set 5: series"]').first().click());
    await closeSheets(page);
    await shot(page, '08-multi-select.png', 'Select several tasks', async () => {
      await page.getByText('Select', { exact: true }).first().scrollIntoViewIfNeeded();
      await page.getByText('Select', { exact: true }).first().click();
    });
    await page.reload({ waitUntil: 'load' });
    await home(page);
    await shot(page, '09-search.png', 'Search', async () => {
      await page.locator('[aria-label="Search"]').first().click();
      await page.getByPlaceholder('Search tasks, exams, classes…').first().fill('cal');
    });
    await page.reload({ waitUntil: 'load' });
    await home(page);
    await shot(page, '10-notifications.png', 'Alerts', () => page.locator('[aria-label="Notifications"]').first().click());
    await page.reload({ waitUntil: 'load' });
    await home(page);
    // these two ask Claude (2 of the account's 30 a day); ONLY_MISSING=1 keeps them once taken
    await shot(page, '43-ai-advice.png', 'AI helper: what to study now', async () => {
      await page.getByText('What should I study now?', { exact: true }).first().scrollIntoViewIfNeeded();
      await page.getByText('What should I study now?', { exact: true }).first().click();
      await page.getByRole('button', { name: 'What should I study now?' }).last().click();
      await page.getByText('Ask again', { exact: true }).last().waitFor({ timeout: 90000 });
    });
    await shot(page, '44-ai-cards.png', 'AI helper: flashcards from notes', async () => {
      await page.getByRole('tab', { name: 'Flashcards' }).last().click();
      await page.locator('[aria-label="Your notes"]').last().fill(AI_NOTES);
      await page.getByRole('button', { name: 'Make flashcards' }).last().click();
      await page.getByText(/cards? made\. Untick/).last().waitFor({ timeout: 90000 });
    });
    await closeSheets(page);

    await tab(page, 'Calendar');
    await shot(page, '11-calendar-month.png', 'Calendar: month', () => page.getByText('Month', { exact: true }).first().click());
    await shot(page, '12-calendar-week.png', 'Calendar: week', () => page.getByText('Week', { exact: true }).first().click());
    await page.getByText('Month', { exact: true }).first().click();
    await shot(page, '13-upcoming-exams.png', 'Upcoming exams', async () => {
      await page.getByText('Upcoming exams', { exact: true }).first().scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 0));
    });
    await shot(page, '14-exam-prep.png', 'Exam prep plan', async () => {
      await page.locator('[aria-label^="Make a prep plan for"]').first().click();
      await page.locator('[aria-label="Topics (optional)"]').last().fill('Limits, Derivatives, Integrals');
    });
    await closeSheets(page);
    await shot(page, '15-timetable.png', 'Weekly timetable', async () => {
      await page.getByText('Weekly timetable', { exact: true }).first().scrollIntoViewIfNeeded();
    });
    await shot(page, '16-add-class.png', 'Add a class', () => page.locator('[aria-label="Add class"]').first().click());
    await closeSheets(page);
    await shot(page, '17-vacations.png', 'Vacations and breaks', async () => {
      await page.getByText('Vacations', { exact: true }).first().scrollIntoViewIfNeeded();
    });

    await tab(page, 'Focus');
    await shot(page, '18-focus-timer.png', 'Focus timer');
    await menu(page, 'Subjects');
    await shot(page, '19-subjects.png', 'Subjects');
    await menu(page, 'Flashcards');
    await shot(page, '38-flashcards.png', 'Flashcards');
    await shot(page, '39-flashcard-review.png', 'Reviewing flashcards', async () => {
      await page.getByText(/^Review \d+ cards?$/).first().click();
      await page.getByText('Show answer', { exact: true }).last().click();
    });
    await closeSheets(page);
    await shot(page, '40-add-cards.png', 'Paste many flashcards', async () => {
      await page.getByText('Add cards', { exact: true }).first().click();
      await page.getByText('Paste many', { exact: true }).last().click();
      await page.locator('[aria-label="One card per line: question | answer"]').last().fill('Unit of force | newton (N)\nSpeed of light | about 300,000 km per second\nFirst law of thermodynamics | energy is conserved');
    });
    await closeSheets(page);
    await tab(page, 'Progress');
    await shot(page, '20-progress.png', 'Progress');
    await shot(page, '21-weekly-review.png', 'Weekly review', async () => {
      await page.locator('[aria-label^="Weekly review:"]').first().scrollIntoViewIfNeeded();
      await page.locator('[aria-label^="Weekly review:"]').first().click();
    });
    await closeSheets(page);
    await shot(page, '41-progress-report.png', 'Progress report', async () => {
      await page.locator('[aria-label="Progress report: share it as a PDF or a message"]').first().scrollIntoViewIfNeeded();
      await page.locator('[aria-label="Progress report: share it as a PDF or a message"]').first().click();
    });
    await closeSheets(page);
    await shot(page, '42-achievements.png', 'Achievements', () => page.getByText('Achievements', { exact: true }).first().scrollIntoViewIfNeeded());
    await closeSheets(page);
    await shot(page, '22-grades.png', 'Grades and GPA', () => page.getByText('Grades', { exact: true }).first().scrollIntoViewIfNeeded());
    await shot(page, '23-what-if.png', 'What-if calculator', async () => {
      const open = page.locator('[aria-label="What do I need? Try a target grade"]').first();
      await open.scrollIntoViewIfNeeded();
      await open.click();
      await page.locator('[aria-label="Target 90%"]').last().click();
    });
    await closeSheets(page);
    await shot(page, '24-attendance.png', 'Attendance', () => page.getByText(/^Attendance/).first().scrollIntoViewIfNeeded());

    await menu(page, 'Settings');
    await shot(page, '25-settings.png', 'Settings');
    await shot(page, '26-settings-sync.png', 'Cloud sync and data', () => page.getByText('Cloud sync', { exact: true }).first().scrollIntoViewIfNeeded());
    await shot(page, '48-reading.png', 'Text size and font', () => page.getByText('Text size', { exact: true }).first().scrollIntoViewIfNeeded());
    await shot(page, '49-privacy.png', 'Privacy & data', async () => {
      await page.getByText('Privacy & data', { exact: true }).first().scrollIntoViewIfNeeded();
      await page.getByText('Privacy & data', { exact: true }).first().click();
    });
    await closeSheets(page);
    await shot(page, '50-premium.png', 'Study Planner Premium', async () => {
      await page.getByText('Study Planner Premium', { exact: true }).first().scrollIntoViewIfNeeded();
      await page.getByText('Study Planner Premium', { exact: true }).first().click();
    });
    await closeSheets(page);
    await menu(page, 'View profile');
    await shot(page, '27-profile.png', 'Profile');

    // dark mode, then back to Light
    await menu(page, 'Settings');
    await page.getByText('Dark', { exact: true }).first().click();
    await tab(page, 'Home');
    await shot(page, '29-dark-mode.png', 'Dark mode', () => page.waitForTimeout(1500));
    await menu(page, 'Settings');
    await page.getByText('Light', { exact: true }).first().click();
    await page.waitForTimeout(1000);

    // offline: the "not synced" dot
    await tab(page, 'Home').catch(() => {});
    await ctx.route(/\.supabase\.co\/rest\//, (r) => r.abort('internetdisconnected'));
    await page.locator('[aria-label="Add task"]').first().click();
    await page.getByPlaceholder('What do you need to study?').first().fill('Added while offline');
    await page.getByText('Add task', { exact: true }).last().click();
    await shot(page, '31-not-synced-dot.png', 'The "not synced" dot', () => page.locator('[data-testid="unsynced-dot"]').first().waitFor({ timeout: 20000 }));
    await ctx.unroute(/\.supabase\.co\/rest\//);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(4000);
    // another language (last: the language is put back at the end, see resetShowcase)
    await menu(page, 'Settings');
    await page.getByText('हिन्दी', { exact: true }).first().scrollIntoViewIfNeeded();
    await page.getByText('हिन्दी', { exact: true }).first().click();
    await page.waitForTimeout(1500);
    await shot(page, '30-hindi.png', 'Hindi', () => page.locator('[aria-label^="होम"]').first().click());
    await ctx.close();
  }

  // study groups
  {
    const { ctx, page } = await session();
    await signin(page, 'demo.priya@example.com');
    await home(page);
    await menu(page, 'Settings');
    await shot(page, '33-share-live-group.png', 'Share a live group', async () => {
      await page.getByText('Share my timetable', { exact: true }).first().scrollIntoViewIfNeeded();
      await page.getByText('Share my timetable', { exact: true }).first().click();
      await page.locator('[aria-label="Show the link for Physics study group"]').first().click();
      await page.locator('[aria-label="Show QR code"]').last().click();
    });
    await shot(page, '34-group-board-owner.png', 'Group board (owner)', async () => {
      await page.locator('[aria-label="Open the board for Physics study group"]').first().click();
      await page.getByText('Physics study group: board').last().waitFor();
    });
    await ctx.close();
  }
  {
    const { ctx, page } = await session();
    await signin(page, 'demo.arjun@example.com');
    await home(page);
    await menu(page, 'Settings');
    await shot(page, '35-group-member.png', 'Group board (member)', async () => {
      await page.locator('[aria-label="Open the board for Physics study group"]').first().scrollIntoViewIfNeeded();
      await page.locator('[aria-label="Open the board for Physics study group"]').first().click();
      await page.getByText('Physics study group: board').last().waitFor();
    });
    await ctx.close();
  }
  {
    const { ctx, page } = await session(`${APP}#group=${DEMO_GROUP}`);
    await signin(page, 'demo.meera@example.com');
    await shot(page, '36-join-group.png', 'Joining a group', () => page.getByText('Join a study group').first().waitFor({ timeout: 30000 }));
    await ctx.close();
  }
  // study together and replies: Priya focuses while Arjun looks (both left as they were)
  {
    const p = await session();
    await signin(p.page, 'demo.priya@example.com');
    await home(p.page);
    await tab(p.page, 'Focus');
    await p.page.locator('[aria-label="Start timer"]').first().click();
    const { ctx, page } = await session();
    await signin(page, 'demo.arjun@example.com');
    await home(page);
    await tab(page, 'Focus');
    await shot(page, '45-studying-now.png', 'Studying now', async () => {
      await page.getByText('Studying now', { exact: true }).first().waitFor({ timeout: 20000 });
      await page.getByText('Studying now', { exact: true }).first().scrollIntoViewIfNeeded();
      // in the middle of the screen, clear of the tab bar
      await page.getByRole('button', { name: /^Study with/ }).first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(500);
    });
    await menu(page, 'Settings');
    await shot(page, '46-board-replies.png', 'Replies on the board', async () => {
      await page.locator('[aria-label="Open the board for Physics study group"]').first().scrollIntoViewIfNeeded();
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
    await ctx.close();
    await p.ctx.close();
  }
  summary.push(`${dev.name}: ${ok} screenshots${failed.length ? `, failed: ${failed.join(', ')}` : ''}`);
}
await browser.close();
await resetShowcase();
console.log(`\n${summary.join('\n')}`);
