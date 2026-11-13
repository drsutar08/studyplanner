// Google Play phone screenshots: 1080 x 1920 (9:16), the app on the showcase demo account, in English and Light.
// The web app emulated at phone size (the screens are the app's own; the phone's status bar isn't part of them).
// Needs the web app running (npx expo start --web --port 8081) and the demo accounts (scripts/seed-demo.mjs).
//   node scripts/store-screenshots.mjs        -> docs/store/screenshots/
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP = process.env.APP_URL || 'http://localhost:8081/';
const OUT = new URL('../docs/store/screenshots/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const file = (f) => fileURLToPath(new URL(f, OUT));

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge', headless: true });
const ctx = await browser.newContext({
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'light',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
});
const page = await ctx.newPage();
await page.goto(APP, { waitUntil: 'load', timeout: 120000 });
try {
  await page.getByText('Skip', { exact: true }).first().click({ timeout: 60000 });
} catch {
  /* no intro */
}
await page.getByPlaceholder('you@example.com').first().fill('demo.showcase@example.com');
await page.getByPlaceholder('Your password').first().fill('DemoPass123!');
await page.getByText('Sign in', { exact: true }).last().click();
await page.getByText('QUOTE OF THE DAY').first().waitFor({ timeout: 60000 });
await page.waitForTimeout(2500);

const tab = (name) => page.locator(`[aria-label="${name} tab"]`).first().click();
const menu = async (label) => {
  await tab('Home');
  await page.locator('[aria-label="Open menu"]').first().click();
  await page.waitForTimeout(500);
  await page.locator(`[aria-label^="${label}"]`).first().click();
  await page.waitForTimeout(600);
};
const closeSheets = async () => {
  for (let i = 0; i < 3; i++) {
    const c = page.locator('[aria-label="Close sheet"]');
    if (!(await c.count())) break;
    await c.last().click().catch(() => {});
    await page.waitForTimeout(400);
  }
};
let ok = 0;
const shot = async (f, title, steps) => {
  try {
    if (steps) await steps();
    await page.waitForTimeout(900);
    await page.screenshot({ path: file(f) });
    ok++;
    console.log(`  ✓ ${f}  ${title}`);
  } catch (e) {
    console.log(`  ✗ ${f}  ${title}: ${String(e.message).split('\n')[0]}`);
  }
};

await shot('01-plan-your-day.png', 'Dashboard');
await shot('02-smart-plan.png', 'Smart plan', () => page.getByText('Smart plan for today').first().scrollIntoViewIfNeeded());
await tab('Calendar');
await shot('03-calendar.png', 'Calendar', () => page.getByText('Month', { exact: true }).first().click());
await shot('04-exam-prep.png', 'Exam prep plan', async () => {
  await page.getByText('Upcoming exams', { exact: true }).first().scrollIntoViewIfNeeded();
  await page.locator('[aria-label^="Make a prep plan for"]').first().click();
  await page.locator('[aria-label="Topics (optional)"]').last().fill('Limits, Derivatives, Integrals');
});
await closeSheets();
await tab('Focus');
await shot('05-focus-timer.png', 'Focus timer');
await menu('Flashcards');
await shot('06-flashcards.png', 'Flashcards');
await shot('07-flashcard-review.png', 'Reviewing flashcards', async () => {
  await page.getByText(/^Review \d+ cards?$/).first().click();
  await page.getByText('Show answer', { exact: true }).last().click();
});
await closeSheets();
await tab('Progress');
await shot('08-progress.png', 'Progress');
await shot('09-grades.png', 'Grades', () => page.getByText('Grades', { exact: true }).first().scrollIntoViewIfNeeded());
await menu('Settings');
await shot('10-premium.png', 'Premium', async () => {
  await page.getByText('Studyly Premium', { exact: true }).first().scrollIntoViewIfNeeded();
  await page.getByText('Studyly Premium', { exact: true }).first().click();
});
await closeSheets();
await browser.close();
console.log(`${ok} screenshots in docs/store/screenshots/`);
