import { Platform, StyleSheet } from 'react-native';

// Light and dark palettes share the same token names. Components read `colors.x`, never a hex value,
// for anything that sits on the page background or a card. Bright hues (subject colours, gradients,
// white text on a coloured button) can stay literal: they read well in both modes.
const light = {
  bg: '#EEF1F7',
  surface: '#FFFFFF',
  surfaceAlt: '#F6F8FF', // subtle panels inside cards, empty states
  ink: '#151B33',
  muted: '#5C6482',
  faint: '#C3C8DC', // disabled text, unchecked boxes, chevrons (not for text people need to read)
  line: '#DDE2EE',
  accent: '#3B4CCA',
  accentFill: '#3B4CCA', // behind white text: buttons, the selected segment
  accentSoft: '#E3E7FA',
  accentBorder: '#C9D0FF',
  danger: '#B93636',
  dangerSoft: '#FBE4E4',
  dangerBorder: '#F1C5C5',
  success: '#157A52',
  successSoft: '#DDF3EA',
  successBorder: '#CDEBDD',
  warn: '#8A5A0F',
  warnSoft: '#FFEFD6',
  warnBorder: '#F6E3B8',
  teal: '#0F8F85',
  tealSoft: '#EEF8F6',
  tealBorder: '#CBEBE7',
  violet: '#7A5CFA',
  violetSoft: '#EFEAFF',
  onAccent: '#FFFFFF', // text and icons on accent / coloured fills
  scrim: 'rgba(21,27,51,0.5)',
  shadow: '#1B2440',
};

const dark = {
  bg: '#0E1220',
  surface: '#181D2E',
  surfaceAlt: '#1F2539',
  ink: '#E8EBF7',
  muted: '#9AA3C2',
  faint: '#4A5274',
  line: '#2A3150',
  accent: '#8F9BFA', // text and icons on dark cards
  accentFill: '#4F5FE6', // behind white text
  accentSoft: '#262E5A',
  accentBorder: '#3A4590',
  danger: '#F07171',
  dangerSoft: '#3A1F26',
  dangerBorder: '#5A2A33',
  success: '#3CC98F',
  successSoft: '#15332A',
  successBorder: '#1F4A3B',
  warn: '#F2B864',
  warnSoft: '#3A2E17',
  warnBorder: '#56431F',
  teal: '#3CC1B4',
  tealSoft: '#14302E',
  tealBorder: '#1E4A46',
  violet: '#A18DFF',
  violetSoft: '#2A2450',
  onAccent: '#FFFFFF',
  scrim: 'rgba(0,0,0,0.6)',
  shadow: '#000000',
};

// WCAG contrast of two #RRGGBB colours (1 to 21)
const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => channel(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
// a, moved part of the way (0..1) to b
export const mix = (a, b, k) => {
  const [x, y] = [rgb(a), rgb(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
};
const shade = (hex, toward, ok) => {
  if (ok(hex)) return hex;
  for (let k = 0.05; k <= 1; k += 0.05) {
    const c = mix(hex, toward, k);
    if (ok(c)) return c;
  }
  return toward;
};
const memo = new Map();
const cached = (key, f) => {
  if (!memo.has(key)) memo.set(key, f());
  return memo.get(key);
};

// A subject's (or any bright) colour as text: darkened on a light page, lightened on a dark one, until it reads at
// 4.5:1 on `bg` (by default cards and the page) and on the faint tint of itself that chips put behind it. Colours
// that already read are left alone.
export function readable(color, bg) {
  const backs = bg ? [bg] : [colors.surface, colors.bg];
  if (!isHex(color) || !backs.every(isHex)) return color;
  return cached(`r${color}${backs.join('')}`, () => {
    const ok = (c) => backs.every((b) => contrast(c, b) >= 4.5 && contrast(c, mix(b, color, 0.15)) >= 4.5);
    return shade(color, lum(backs[0]) > 0.4 ? '#000000' : '#FFFFFF', ok);
  });
}

// A colour deepened until white text on it reads at 4.5:1: subject-coloured buttons and chips
export function solid(color) {
  if (!isHex(color)) return color;
  return cached(`s${color}`, () => shade(color, '#000000', (c) => contrast(c, '#FFFFFF') >= 4.5));
}

// The live palette. It is updated in place when the theme changes, so `colors.ink` read during render
// is always the current value. The app remounts its screens after a change (see App.js).
export const colors = { ...light };

// Each subject gets one of these. The colour shows up as the edge tab on its tasks.
export const subjectPalette = [
  '#E4572E', // vermilion
  '#17A398', // teal
  '#F2A541', // amber
  '#7A5CFA', // violet
  '#2E86DE', // blue
  '#D6336C', // raspberry
];

export const radius = { sm: 8, md: 14, lg: 22 };

const makeShadow = () => ({
  shadowColor: colors.shadow,
  shadowOpacity: scheme === 'dark' ? 0.45 : 0.18,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 5,
});

const makeType = () => ({
  title: { fontSize: 30, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  h2: { fontSize: 18, fontWeight: '700', color: colors.ink },
  body: { fontSize: 16, color: colors.ink },
  meta: { fontSize: 13, color: colors.muted },
});

let scheme = 'light';
let version = 0;

export const shadow = makeShadow();
export const type = makeType();

export const getScheme = () => scheme;

// Switch the palette. Returns true when something changed (the caller then remounts the screens).
export function applyScheme(next) {
  const s = next === 'dark' ? 'dark' : 'light';
  if (s === scheme) return false;
  scheme = s;
  Object.assign(colors, s === 'dark' ? dark : light);
  Object.assign(shadow, makeShadow());
  const t = makeType();
  Object.keys(t).forEach((k) => {
    type[k] = forReading(t[k]); // with the reading settings kept
  });
  version += 1;
  return true;
}

// Reading (Settings → Appearance): a text size and, optionally, an easier-to-read font (Lexend, see readingFonts.js).
// Applied to every style built by themedStyles below, and to `type`. Returns true when something changed.
export const TEXT_SIZES = { standard: 1, large: 1.15, larger: 1.3 };
let reading = { scale: 1, font: false };
const READ_FONT = { 400: 'Lexend_400Regular', 500: 'Lexend_500Medium', 600: 'Lexend_600SemiBold', 700: 'Lexend_700Bold', 800: 'Lexend_800ExtraBold' };
const familyFor = (weight) => {
  const w = weight === 'bold' ? 700 : Number(weight) || 400;
  return READ_FONT[Math.min(800, Math.max(400, Math.round(w / 100) * 100))];
};
export function applyReading({ size = 'standard', font = false } = {}) {
  const next = { scale: TEXT_SIZES[size] || 1, font: !!font };
  if (next.scale === reading.scale && next.font === reading.font) return false;
  reading = next;
  const t = makeType();
  Object.keys(t).forEach((k) => {
    type[k] = forReading(t[k]);
  });
  version += 1;
  return true;
}
// one style with the reading settings applied: sizes scaled, and the font's own weight instead of fontWeight
// (a custom font draws its weights as separate fonts; on Android fontWeight would fall back to the system font)
function forReading(style) {
  if (!style || typeof style !== 'object' || !('fontSize' in style || 'fontWeight' in style || 'lineHeight' in style)) return style;
  const out = { ...style };
  if (reading.scale !== 1) {
    if (typeof out.fontSize === 'number') out.fontSize = Math.round(out.fontSize * reading.scale * 2) / 2;
    if (typeof out.lineHeight === 'number') out.lineHeight = Math.round(out.lineHeight * reading.scale);
  }
  if (reading.font && !out.fontFamily) {
    out.fontFamily = familyFor(out.fontWeight);
    if (Platform.OS !== 'web') delete out.fontWeight;
  }
  return out;
}
const withReading = (sheet) => (reading.scale === 1 && !reading.font ? sheet : Object.fromEntries(Object.entries(sheet).map(([k, v]) => [k, forReading(v)])));

// Drop-in for StyleSheet.create that follows the theme: pass a function so the styles are rebuilt
// (once) after each theme change.
//   const styles = themedStyles(() => ({ row: { backgroundColor: colors.surface } }));
// Use it like a normal styles object: styles.row
export function themedStyles(factory) {
  let built = -1;
  let cache = null;
  const get = () => {
    if (built !== version) {
      cache = StyleSheet.create(withReading(factory()));
      built = version;
    }
    return cache;
  };
  return new Proxy({}, { get: (_, key) => get()[key], has: (_, key) => key in get(), ownKeys: () => Reflect.ownKeys(get()), getOwnPropertyDescriptor: (_, key) => Object.getOwnPropertyDescriptor(get(), key) });
}
