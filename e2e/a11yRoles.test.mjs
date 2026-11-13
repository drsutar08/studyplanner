// Every accessibilityRole in the app must be one Android accepts: an unknown one (like 'table', which is only valid as
// the newer `role` prop) crashes the phone app with a white screen, while the web ignores it. `node e2e/a11yRoles.test.mjs`
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const rn = fs.readFileSync(path.join(ROOT, 'node_modules/react-native/Libraries/Components/View/ViewAccessibility.js'), 'utf8');
const block = rn.slice(rn.indexOf('export type AccessibilityRole'), rn.indexOf('export type Role'));
const allowed = new Set([...block.matchAll(/'([a-z]+)'/g)].map((m) => m[1]));

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.js$/.test(e.name)) files.push(p);
  }
};
walk(path.join(ROOT, 'src'));
files.push(path.join(ROOT, 'App.js'));

const bad = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // accessibilityRole="x", and the string values inside accessibilityRole={...}
    for (const m of line.matchAll(/accessibilityRole=(?:"([a-z]+)"|\{([^}]*)\})/g)) {
      const values = m[1] ? [m[1]] : [...m[2].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
      for (const v of values) if (!allowed.has(v)) bad.push(`${path.relative(ROOT, f)}:${i + 1}  accessibilityRole "${v}"`);
    }
  });
}
if (bad.length) {
  console.log(`  FAIL accessibilityRole values Android rejects:\n${bad.map((b) => `       ${b}`).join('\n')}`);
  process.exitCode = 1;
} else console.log(`  PASS every accessibilityRole is one Android accepts (${files.length} files)\n\n1 passed`);
