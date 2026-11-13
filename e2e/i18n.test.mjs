// Checks every translation against the English source: same keys, same {placeholders}, same list
// lengths, plural forms present, nothing left empty. Pure, no browser: `npm run test:i18n`
// Optional: `node e2e/i18n.test.mjs hi` checks one language only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const AREAS = ['common', 'core', 'today', 'calendar', 'manage'];
const LANGS = process.argv[2] ? [process.argv[2]] : ['hi', 'or', 'es'];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-'));

const load = async (lang) => {
  const out = {};
  for (const area of AREAS) {
    const file = path.join(tmp, `${lang}-${area}.mjs`);
    fs.writeFileSync(file, fs.readFileSync(new URL(`../src/i18n/${lang}/${area}.js`, import.meta.url), 'utf8'));
    out[area] = (await import(pathToFileURL(file).href)).default;
  }
  return out;
};

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const isPlural = (v) => v && typeof v === 'object' && !Array.isArray(v) && 'other' in v && Object.keys(v).every((k) => ['one', 'other'].includes(k));

// Walk English and the translation together; report every mismatch with its key path
function compare(en, tr, where, problems) {
  if (typeof en === 'string') {
    if (typeof tr !== 'string') return problems.push(`${where}: expected text, got ${tr === undefined ? 'nothing' : typeof tr}`);
    if (!tr.trim()) return problems.push(`${where}: empty`);
    if (placeholders(en) !== placeholders(tr)) problems.push(`${where}: placeholders {${placeholders(en)}} vs {${placeholders(tr)}}`);
    return undefined;
  }
  if (Array.isArray(en)) {
    if (!Array.isArray(tr) || tr.length !== en.length) return problems.push(`${where}: expected a list of ${en.length}`);
    en.forEach((v, i) => compare(v, tr[i], `${where}[${i}]`, problems));
    return undefined;
  }
  if (isPlural(en)) {
    if (!isPlural(tr)) return problems.push(`${where}: expected plural forms { one, other }`);
    ['one', 'other'].forEach((k) => compare(en[k], tr[k], `${where}.${k}`, problems));
    return undefined;
  }
  if (!tr || typeof tr !== 'object') return problems.push(`${where}: missing section`);
  for (const k of Object.keys(en)) compare(en[k], tr[k], where ? `${where}.${k}` : k, problems);
  for (const k of Object.keys(tr)) if (!(k in en)) problems.push(`${where ? `${where}.` : ''}${k}: not in English (typo?)`);
  return undefined;
}

const en = await load('en');
let failed = 0;
for (const lang of LANGS) {
  const tr = await load(lang);
  for (const area of AREAS) {
    const problems = [];
    compare(en[area], tr[area], '', problems);
    if (problems.length) {
      failed += 1;
      process.exitCode = 1;
      console.log(`  FAIL ${lang}/${area}.js (${problems.length})`);
      problems.slice(0, 25).forEach((p) => console.log(`       ${p}`));
    } else {
      console.log(`  PASS ${lang}/${area}.js`);
    }
  }
}
assert.ok(true);
console.log(failed ? `\n${failed} file(s) with problems` : `\n${LANGS.length * AREAS.length} passed`);
