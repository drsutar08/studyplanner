// The flow diagrams in docs/feature-guide/flows.html as PNG images (for the Word guide)
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
const dir = new URL('../docs/feature-guide/', import.meta.url);
const b = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge', headless: true });
const page = await b.newPage({ viewport: { width: 1300, height: 900 }, deviceScaleFactor: 2 });
await page.goto(new URL('flows.html', dir).href);
for (const [id, n] of [['journey', 1], ['study', 2], ['sync', 3], ['groups', 4]]) {
  await page.locator(`#${id}`).screenshot({ path: fileURLToPath(new URL(`flow-${n}-${id}.png`, dir)) });
  console.log(`flow-${n}-${id}.png`);
}
await b.close();
