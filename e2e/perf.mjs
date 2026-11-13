// Performance with a lot of data: signs up a throwaway account, then measures the app with its sample data and again
// with a heavy year of it (2,000 tasks, 150 exams, 12 subjects, a year of focus sessions). For each action: how long
// it took, the main-thread blocks over 50 ms, and the functions that used the most CPU. Needs the web app running.
//   node e2e/perf.mjs            (the account is deleted at the end)
import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

// the sign-up form's consent (18 or older, and the terms agreed), by data-testid so it works in any language
const giveConsent = async (p) => {
  await p.locator('[data-testid="consent-adult"]').first().click();
  const agree = p.locator('[data-testid="consent-agree"]').first();
  if ((await agree.getAttribute('aria-checked')) !== 'true') await agree.click();
};

const APP = process.env.APP_URL || 'http://localhost:8081';
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
const USER = { name: 'Perf Check', email: `perf${Date.now()}@example.com`, pw: 'Secret123!' };
const PHONE = process.env.PERF_PHONE === '1';

const ph = (page, p) => page.getByPlaceholder(p).first();
const byText = (page, text) => page.getByText(text, { exact: true });

// the heavy year, built in the page from the account's own data (its subjects, term and classes)
function grow(data) {
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const day = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return key(d);
  };
  const colors = ['#E4572E', '#17A398', '#F2A541', '#7A5CFA', '#2E86DE', '#D6336C'];
  const subjects = [...data.subjects];
  for (let i = subjects.length; i < 12; i++) subjects.push({ id: `s-p${i}`, name: `Subject ${i + 1}`, color: colors[i % colors.length] });
  const tasks = [...data.tasks];
  for (let i = 0; i < 2000; i++) {
    const s = subjects[i % subjects.length];
    const past = i % 4 !== 0; // three in four are done, in the past year
    const due = past ? day(-((i * 7) % 360) - 1) : day((i % 120) - 5);
    tasks.push({
      id: `p-${i}`,
      title: `Perf task ${i}: ${['read', 'write up', 'revise', 'practise'][i % 4]} ${s.name}`,
      subjectId: s.id,
      due,
      time: i % 5 === 0 ? `${pad(8 + (i % 12))}:00` : null,
      estimate: [20, 30, 45, 60][i % 4],
      priority: ['low', 'med', 'high'][i % 3],
      notes: i % 10 === 0 ? 'Some notes about this task. '.repeat(4) : '',
      done: past,
      completedAt: past ? due : null,
      subtasks: i % 6 === 0 ? [{ id: `p-${i}-a`, title: 'Part one', done: past }, { id: `p-${i}-b`, title: 'Part two', done: false }] : undefined,
    });
  }
  const exams = [...data.exams];
  for (let i = 0; i < 150; i++) {
    const s = subjects[i % subjects.length];
    const past = i % 3 !== 0;
    exams.push({ id: `px-${i}`, title: `Perf exam ${i}`, subjectId: s.id, kind: ['Test', 'Quiz', 'Essay'][i % 3], date: past ? day(-((i * 5) % 340) - 1) : day((i % 90) + 1), duration: 45, notes: '', score: past ? 40 + (i % 60) : null, outOf: past ? 100 : null, weight: 1 });
  }
  const sessions = [...data.sessions];
  for (let i = 0; i < 1500; i++) sessions.push({ id: `pss-${i}`, date: day(-(i % 365)), minutes: [25, 45, 60][i % 3], subjectId: subjects[i % subjects.length].id, taskId: null, at: '18:00' });
  return { ...data, subjects, tasks, exams, sessions };
}

async function measure(page, label, cdp, action) {
  await page.evaluate(() => {
    window.__long = [];
  });
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  await action();
  // let the frame that shows the change finish
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const ms = Date.now() - t0;
  const { profile } = await cdp.send('Profiler.stop');
  const long = await page.evaluate(() => window.__long);
  // self time per function (app code only)
  const byNode = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas;
  profile.samples.forEach((id, i) => {
    const n = byNode.get(id);
    const f = n.callFrame;
    if (!f.url || /node_modules|chrome-extension/.test(f.url) || !f.functionName) return;
    const k = `${f.functionName} (${f.url.split('/').pop().split('?')[0]}:${f.lineNumber + 1})`;
    self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000);
  });
  const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(0)}ms`);
  const row = { label, ms, longTasks: long.length, longest: Math.max(0, ...long).toFixed(0), top };
  console.log(`  ${label.padEnd(30)} ${String(ms).padStart(6)} ms   blocks>50ms: ${long.length} (longest ${row.longest} ms)${top.length ? `\n      ${top.join('\n      ')}` : ''}`);
  return row;
}

async function run(page, cdp, tag) {
  console.log(`\n== ${tag} ==`);
  const rows = [];
  const goto = (name) => page.locator(PHONE ? `[aria-label="${name} tab"]` : `[aria-label^="${name} page"], [aria-label^="${name} "]`).first().click();
  rows.push(
    await measure(page, 'cold start (reload to Dashboard)', cdp, async () => {
      await page.reload({ waitUntil: 'load' });
      await page.getByText('QUOTE OF THE DAY').first().waitFor({ timeout: 120000 });
    })
  );
  await page.waitForTimeout(10000); // the first sync (with the heavy data, thousands of records going up) settles
  for (const [name, sees] of [['Calendar', 'Month'], ['Progress', 'LAST 7 DAYS'], ['Subjects', 'YOUR COURSES'], [PHONE ? 'Focus' : 'Focus Timer', 'FOCUS SESSION'], [PHONE ? 'Home' : 'Dashboard', 'QUOTE OF THE DAY']]) {
    rows.push(
      await measure(page, `open ${name}`, cdp, async () => {
        await goto(name);
        await page.getByText(sees).first().waitFor({ timeout: 30000 });
      })
    );
  }
  rows.push(
    await measure(page, 'tick a task done', cdp, async () => {
      const box = page.locator('[role="checkbox"][aria-checked="false"]').first();
      await box.click();
      await page.waitForFunction(() => document.querySelectorAll('[role="checkbox"][aria-checked="true"]').length > 0);
    })
  );
  rows.push(
    await measure(page, 'open the new task sheet', cdp, async () => {
      await page.locator(PHONE ? '[aria-label="Add task"]' : '[aria-label="New task from menu"]').first().click();
      await ph(page, 'What do you need to study?').waitFor({ timeout: 10000 });
    })
  );
  rows.push(
    await measure(page, 'type a title (20 keys)', cdp, async () => {
      await ph(page, 'What do you need to study?').pressSequentially('Read chapter twelve!', { delay: 0 });
    })
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  return rows;
}

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge', headless: true });
const results = {};
try {
  const ctx = await browser.newContext({ viewport: PHONE ? { width: 390, height: 844 } : { width: 1280, height: 860 } });
  await ctx.addInitScript(() => {
    window.__long = [];
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: 'longtask', buffered: false });
    } catch {
      /* not supported */
    }
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await page.goto(APP, { waitUntil: 'load', timeout: 120000 });
  try {
    await byText(page, 'Skip').first().waitFor({ timeout: 60000 });
    await byText(page, 'Skip').first().click();
  } catch {
    /* no intro */
  }
  await byText(page, 'Create account').first().click();
  await ph(page, 'Your name').fill(USER.name);
  await ph(page, 'you@example.com').fill(USER.email);
  await ph(page, 'At least 6 characters').fill(USER.pw);
  await ph(page, 'Re-enter password').fill(USER.pw);
  await giveConsent(page);
  await byText(page, 'Create account').last().click();
  await page.getByText('QUOTE OF THE DAY').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(4000);

  results.sample = await run(page, cdp, 'sample data');

  const sizes = await page.evaluate(grow => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('studyplanner:v1:') && !x.includes(':sync'));
    const data = JSON.parse(localStorage.getItem(k));
    const big = eval(`(${grow})`)(data);
    localStorage.setItem(k, JSON.stringify(big));
    return { key: k, tasks: big.tasks.length, exams: big.exams.length, sessions: big.sessions.length, kb: Math.round(JSON.stringify(big).length / 1024) };
  }, grow.toString());
  console.log(`\nheavy data: ${sizes.tasks} tasks, ${sizes.exams} exams, ${sizes.sessions} sessions, ${sizes.kb} KB`);
  results.heavy = await run(page, cdp, 'heavy data');
  results.sizes = sizes;
} finally {
  await browser.close();
  const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email: USER.email, password: USER.pw });
  if (!error) await sb.rpc('delete_my_account');
}
fs.writeFileSync(new URL('./shots/perf.json', import.meta.url), JSON.stringify(results, null, 2));
