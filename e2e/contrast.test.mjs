// Unit tests for colour contrast (WCAG AA, 4.5:1 for text): the theme's text colours on its backgrounds, and the
// readable() / solid() shades of subject colours. `npm run test:contrast`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'contrast-'));
const src = fs.readFileSync(new URL('../src/theme.js', import.meta.url), 'utf8').replace("import { StyleSheet } from 'react-native';", 'const StyleSheet = { create: (x) => x };');
fs.writeFileSync(path.join(tmp, 'theme.mjs'), src);
const { colors, contrast, readable, solid, subjectPalette, applyScheme } = await import(pathToFileURL(path.join(tmp, 'theme.mjs')).href);

let pass = 0;
const test = (name, fn) => {
  try {
    fn();
    pass += 1;
    console.log('  PASS', name);
  } catch (e) {
    console.log('  FAIL', name, '\n      ', e.message);
    process.exitCode = 1;
  }
};
const AA = 4.5;
const atLeast = (fg, bg, what) => assert.ok(contrast(fg, bg) >= AA, `${what}: ${fg} on ${bg} is ${contrast(fg, bg).toFixed(2)}`);
// colours people pick for subjects, besides the palette
const extra = ['#F2A541', '#FFD43B', '#00B894', '#0984E3', '#E84393', '#2D3436', '#DFE6E9', '#E17055'];

test('contrast() matches known values', () => {
  assert.equal(contrast('#FFFFFF', '#000000').toFixed(1), '21.0');
  assert.equal(contrast('#777777', '#FFFFFF').toFixed(2), '4.48');
});

for (const scheme of ['light', 'dark']) {
  test(`${scheme}: text colours read on the page, cards and panels`, () => {
    applyScheme(scheme);
    for (const fg of ['ink', 'muted', 'accent', 'danger', 'success', 'warn']) for (const bg of ['bg', 'surface', 'surfaceAlt']) atLeast(colors[fg], colors[bg], `${fg} on ${bg}`);
    atLeast(colors.accent, colors.accentSoft, 'accent on accentSoft');
    atLeast(colors.danger, colors.dangerSoft, 'danger on dangerSoft');
    atLeast(colors.success, colors.successSoft, 'success on successSoft');
    atLeast(colors.warn, colors.warnSoft, 'warn on warnSoft');
    atLeast(colors.onAccent, colors.accentFill, 'onAccent on accentFill');
  });

  test(`${scheme}: readable() makes every subject colour readable on cards and their tinted chips`, () => {
    applyScheme(scheme);
    for (const c of [...subjectPalette, ...extra]) {
      const r = readable(c);
      atLeast(r, colors.surface, `readable(${c})`);
      atLeast(r, colors.bg, `readable(${c}) on the page`);
    }
  });
}

test('readable() leaves colours that already read alone, and passes non-hex values through', () => {
  applyScheme('light');
  assert.equal(readable(colors.ink), colors.ink);
  assert.equal(readable('rgba(0,0,0,0.5)'), 'rgba(0,0,0,0.5)');
  assert.equal(readable('#E4572E99'), '#E4572E99');
});

test('solid() deepens a colour until white text reads on it', () => {
  for (const c of [...subjectPalette, ...extra]) atLeast('#FFFFFF', solid(c), `white on solid(${c})`);
  assert.equal(solid('#3B4CCA'), '#3B4CCA');
});

console.log(`contrast: ${pass} passed`);
