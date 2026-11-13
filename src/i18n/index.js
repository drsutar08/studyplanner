// Translations. Every piece of text the user sees goes through t():
//   t('common.save')                         -> "Save"
//   t('calendar.dayMeta', { count: 3 })      -> plural forms: { one: '{count} task', other: '{count} tasks' }
//   t('vacation.daysLeft', { name: 'Ana' })  -> "{name}" placeholders are filled in
// English is the source and the fallback: a key missing in another language shows the English text.
import { getLocales } from 'expo-localization';
import { LOCALE, setLocale } from '../locale';
import en from './en';
import hi from './hi';
import or from './or';
import es from './es';

const DICTS = { en, hi, or, es };

// Only English is switched on for now. The other dictionaries stay in the code (and in the tests); to bring a language
// back, add its code here: Settings shows it again, and the app uses it (a saved choice or the phone's language).
export const ENABLED_LANGUAGES = ['en'];
const enabled = (code) => ENABLED_LANGUAGES.includes(code);

// Shown in Settings in their own language, so people can find theirs.
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'or', name: 'ଓଡ଼ିଆ' },
  { code: 'es', name: 'Español' },
].filter((l) => enabled(l.code));
// the language picker is only worth showing with a choice to make
export const LANGUAGE_CHOICE = LANGUAGES.length > 1;

let language = 'en';
let version = 0;
let datesFromDevice = false; // weekday names from the phone's locale instead of our dictionaries

export const getLanguage = () => language;

const deviceLocale = () => {
  try {
    return getLocales()[0] || null;
  } catch {
    return null;
  }
};

// `choice` is the Settings value: 'system' or a language code. Returns true when the language changed
// (the caller then remounts the screens so every label is drawn again).
export function applyLanguage(choice = 'system') {
  const device = deviceLocale();
  const deviceCode = device && enabled(device.languageCode) ? device.languageCode : 'en';
  const code = choice !== 'system' && enabled(choice) ? choice : deviceCode;
  // Dates follow the language; keep the device region when the device already uses that language.
  // On "System" with a phone language the app has no text for (e.g. German), the text falls back to
  // English but dates and weekday names stay in the phone's language.
  const foreign = choice === 'system' && device && !DICTS[device.languageCode];
  datesFromDevice = !!foreign;
  setLocale(foreign || (device && device.languageCode === code) ? device.languageTag : code);
  if (code === language && version > 0) return false;
  language = code;
  version += 1;
  return true;
}

const lookup = (dict, key) => key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dict);

// Plural category for a count. Hindi and Odia treat 0 and 1 as singular; Spanish and English only 1.
const pluralOf = (n) => {
  if (language === 'hi' || language === 'or') return n === 0 || n === 1 ? 'one' : 'other';
  return n === 1 ? 'one' : 'other';
};

export function t(key, params) {
  let value = lookup(DICTS[language], key);
  if (value === undefined) value = lookup(en, key);
  if (value === undefined) {
    if (__DEV__) console.warn(`Missing translation: ${key}`);
    return key;
  }
  if (typeof value === 'object' && params && typeof params.count === 'number') {
    value = value[pluralOf(params.count)] ?? value.other;
  }
  if (typeof value !== 'string') return key;
  return params ? value.replace(/\{(\w+)\}/g, (m, name) => (params[name] !== undefined ? String(params[name]) : m)) : value;
}

// Weekday names in the current language, 0 = Sunday. `width`: 'long' | 'short' | 'narrow'.
// 1 Aug 2021 was a Sunday, so day d of that week has weekday d.
export const weekdayName = (day, width = 'long') =>
  datesFromDevice ? new Date(2021, 7, 1 + day).toLocaleDateString(LOCALE, { weekday: width }) : t(`days.${width}.${day}`);
