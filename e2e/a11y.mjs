// Accessibility audit: signs up a throwaway account, opens each screen on a phone and a desktop, in light and dark,
// and runs axe (WCAG 2.1 A/AA) on it. Needs the web app running (npx expo start --web). The account is deleted at
// the end.   node e2e/a11y.mjs            (exit code 1 when anything is found)
import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// the sign-up form's consent (18 or older, and the terms agreed), by data-testid so it works in any language
const giveConsent = async (p) => {
  await p.locator('[data-testid="consent-adult"]').first().click();
  const agree = p.locator('[data-testid="consent-agree"]').first();
  if ((await agree.getAttribute('aria-checked')) !== 'true') await agree.click();
};

const APP = process.env.APP_URL || 'http://localhost:8081';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
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
const USER = { name: 'A11y Check', email: `a11y${Date.now()}@example.com`, pw: 'Secret123!' };

const found = new Map(); // rule -> { impact, help, where: Set, nodes: [] }
async function audit(page, where) {
  await page.waitForTimeout(700);
  await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] });
    // what the element shows, to compare with its label
    for (const v of r.violations) for (const n of v.nodes) n.text = ((document.querySelector(n.target[0]) || {}).innerText || '').slice(0, 80);
    return r;
  });
  for (const v of res.violations) {
    const f = found.get(v.id) || { impact: v.impact, help: v.help, where: new Set(), nodes: [] };
    f.where.add(where);
    for (const n of v.nodes) f.nodes.push({ where, target: n.target.join(' '), html: n.html.slice(0, 160), text: n.text, why: (n.any[0] || n.all[0] || n.none[0] || {}).message });
    found.set(v.id, f);
  }
  console.log(`  ${where}: ${res.violations.length ? res.violations.map((v) => `${v.id}(${v.nodes.length})`).join(', ') : 'ok'}`);
}

const ph = (page, p) => page.getByPlaceholder(p).first();
const byText = (page, text) => page.getByText(text, { exact: true });
// a phone reaches Subjects and Settings from the menu on Home; a desktop has them all in the sidebar
const go = async (page, phone, name) => {
  const menuLabel = name === 'Settings' ? 'Settings' : `${SCREENS[name]} page`;
  if (!phone) return page.locator(`[aria-label="${menuLabel}"]`).first().click();
  if (name === 'Subjects' || name === 'Settings') {
    await page.locator('[aria-label="Home tab"]').first().click();
    await page.locator('[aria-label="Open menu"]').first().click();
    await page.waitForTimeout(400);
    return page.locator(`[aria-label="${menuLabel}"]`).first().click();
  }
  return page.locator(`[aria-label="${name} tab"]`).first().click();
};
const SCREENS = { Calendar: 'Calendar', Focus: 'Focus Timer', Subjects: 'Subjects', Progress: 'Progress', Settings: 'Settings' };

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge', headless: true });
let first = true;
try {
  for (const scheme of ['light', 'dark']) {
    for (const [kind, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 860 }]]) {
      const phone = kind === 'phone';
      const ctx = await browser.newContext({ viewport, colorScheme: scheme });
      const page = await ctx.newPage();
      const tag = (s) => `${kind}/${scheme}/${s}`;
      await page.goto(APP, { waitUntil: 'load', timeout: 120000 });
      const skip = byText(page, 'Skip').first();
      try {
        await skip.waitFor({ state: 'visible', timeout: 60000 });
        if (scheme === 'light') await audit(page, tag('intro')); // before signing in it's always light
        await skip.click();
      } catch {
        /* no intro */
      }
      await ph(page, 'you@example.com').waitFor({ timeout: 30000 });
      if (scheme === 'light') await audit(page, tag('sign in'));
      if (first) {
        await byText(page, 'Create account').first().click();
        await ph(page, 'Your name').fill(USER.name);
        await ph(page, 'you@example.com').fill(USER.email);
        await ph(page, 'At least 6 characters').fill(USER.pw);
        await ph(page, 'Re-enter password').fill(USER.pw);
        await giveConsent(page);
        await audit(page, tag('create account'));
        await byText(page, 'Create account').last().click();
        first = false;
      } else {
        await ph(page, 'you@example.com').fill(USER.email);
        await ph(page, 'Your password').fill(USER.pw);
        await byText(page, 'Sign in').last().click();
      }
      await page.getByText('QUOTE OF THE DAY').first().waitFor({ timeout: 30000 });
      // the theme is Light unless chosen: the dark pass picks Dark in Settings
      if (scheme === 'dark') {
        if (phone) await page.locator('[aria-label="Open menu"]').first().click();
        await page.locator('[aria-label="Settings"]').first().click();
        await page.getByText('Dark', { exact: true }).first().click();
        await page.waitForTimeout(800);
        await page.locator(phone ? '[aria-label="Home tab"]' : '[aria-label^="Dashboard "]').first().click();
      }
      await audit(page, tag('home'));
      for (const name of ['Calendar', 'Focus', 'Subjects', 'Progress', 'Settings']) {
        try {
          await go(page, phone, name);
          await audit(page, tag(name.toLowerCase()));
        } catch (e) {
          console.log(`  ${tag(name)}: could not open (${String(e.message).split('\n')[0]})`);
        }
      }
      try {
        await page.locator(phone ? '[aria-label="Home tab"]' : '[aria-label^="Dashboard "]').first().click();
        await page.locator(phone ? '[aria-label="Add task"]' : '[aria-label="New task from menu"]').first().click();
        await ph(page, 'What do you need to study?').waitFor({ timeout: 5000 });
        await audit(page, tag('new task sheet'));
      } catch (e) {
        console.log(`  ${tag('new task sheet')}: could not open (${String(e.message).split('\n')[0]})`);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  // the throwaway account goes
  const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email: USER.email, password: USER.pw });
  if (!error) await sb.rpc('delete_my_account');
}

const report = [...found].map(([id, f]) => ({ id, impact: f.impact, help: f.help, where: [...f.where], nodes: f.nodes }));
fs.writeFileSync(new URL('./shots/a11y.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(`\n${report.length ? report.map((r) => `${r.impact.padEnd(9)} ${r.id}: ${r.help} (${r.where.length} screens)`).join('\n') : 'No violations'}`);
process.exit(report.length ? 1 : 0);
