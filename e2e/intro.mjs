import { chromium } from 'playwright-core';
const APP = process.env.APP_URL || 'http://localhost:8081';
const b = await chromium.launch({ channel: 'msedge', headless: true });
const res = [];
const t = async (name, fn) => { try { await fn(); res.push([1, name]); console.log('  PASS', name); } catch (e) { res.push([0, name]); console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
const see = (p, s, o = {}) => p.getByText(s, { exact: o.exact ?? false }).first().waitFor({ state: 'visible', timeout: o.timeout ?? 6000 });

for (const [label, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  console.log(`\n== ${label} ==`);
  const ctx = await b.newContext({ viewport: vp });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.message)));
  await p.goto(APP, { waitUntil: 'load', timeout: 120000 });
  await t('splash shows brand + tagline', async () => { await see(p, 'Plan · Focus · Grow', { timeout: 90000 }); await p.waitForTimeout(900); await p.screenshot({ path: `e2e/shots/splash-${label}.png` }); });
  await t('intro slide 1 appears after splash', async () => { await see(p, 'Plan your day', { timeout: 8000 }); await see(p, '1/3'); await p.screenshot({ path: `e2e/shots/intro1-${label}.png` }); });
  await t('Skip is visible on slide 1', async () => see(p, 'Skip', { exact: true }));
  await t('Next -> slide 2', async () => { await p.getByText('Next', { exact: true }).click(); await see(p, 'Stay in the zone'); await see(p, '2/3'); await p.waitForTimeout(500); await p.screenshot({ path: `e2e/shots/intro2-${label}.png` }); });
  await t('Next -> slide 3 shows Get started and hides Skip', async () => { await p.getByText('Next', { exact: true }).click(); await see(p, 'Watch yourself grow'); await see(p, 'Get started', { exact: true }); await p.waitForTimeout(500); if (await p.getByText('Skip', { exact: true }).count()) throw new Error('Skip still visible'); await p.screenshot({ path: `e2e/shots/intro3-${label}.png` }); });
  await t('Get started -> login screen', async () => { await p.getByText('Get started', { exact: true }).click(); await see(p, 'Welcome back'); });
  await t('intro is not shown again after reload', async () => { await p.reload({ waitUntil: 'load' }); await see(p, 'Welcome back', { timeout: 30000 }); if (await p.getByText('1/3', { exact: true }).count()) throw new Error('intro shown again'); });
  await t('no uncaught JS errors', async () => { if (errs.length) throw new Error(errs[0].slice(0, 150)); });
  await ctx.close();
}
{
  console.log('\n== skip path ==');
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(APP, { waitUntil: 'load', timeout: 120000 });
  await t('Skip jumps straight to login', async () => { await see(p, 'Plan your day', { timeout: 90000 }); await p.getByText('Skip', { exact: true }).click(); await see(p, 'Welcome back'); });
  await ctx.close();
}
{
  console.log('\n== dots navigation ==');
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(APP, { waitUntil: 'load', timeout: 120000 });
  await t('scrolling the pager moves to the next slide', async () => { await see(p, 'Plan your day', { timeout: 90000 }); await p.mouse.move(200, 150); await p.mouse.wheel(300, 0); await see(p, 'Stay in the zone', { timeout: 4000 }); await see(p, '2/3'); });
  await ctx.close();
}
await b.close();
console.log(`\nTOTAL ${res.length} PASS ${res.filter((r) => r[0]).length}`);
