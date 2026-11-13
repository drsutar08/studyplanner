import { LOCALE } from './locale';
import { t, weekdayName, getLanguage } from './i18n';
// All dates are local "YYYY-MM-DD" strings so they sort and compare as text.

export const dateKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parse = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Some engines (the web build on some browsers, Hermes on some phones) have no month names for every
// language and silently fall back to English. Detect that once per locale and build the date from our
// own dictionary instead (common.js: months.*, dateFormats.*).
const intlKnows = {};
const intlSupports = (loc) => {
  const lang = getLanguage();
  const k = `${loc}|${lang}`;
  if (!(k in intlKnows)) {
    try {
      const month = new Date(2021, 0, 15).toLocaleDateString(loc, { month: 'long' });
      intlKnows[k] = lang === 'en' || month !== 'January';
    } catch {
      intlKnows[k] = false;
    }
  }
  return intlKnows[k];
};

// Like toLocaleDateString(LOCALE, opts) for the combinations the app uses:
// weekday ('short' | 'long'), day ('numeric'), month ('short' | 'long'), year ('numeric').
export const formatDate = (d, opts) => {
  if (intlSupports(LOCALE)) return d.toLocaleDateString(LOCALE, opts);
  const parts = {
    weekday: opts.weekday ? weekdayName(d.getDay(), opts.weekday === 'long' ? 'long' : 'short') : '',
    day: opts.day ? String(d.getDate()) : '',
    month: opts.month ? t(`months.${opts.month === 'long' ? 'long' : 'short'}.${d.getMonth()}`) : '',
    year: opts.year ? String(d.getFullYear()) : '',
  };
  const shape = `${parts.weekday ? 'w' : ''}${parts.day ? 'd' : ''}${parts.month ? 'm' : ''}${parts.year ? 'y' : ''}`;
  return t(`dateFormats.${shape}`, parts);
};

export const addDays = (key, n) => {
  const d = parse(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};

export const formatDue = (key) => {
  const today = dateKey();
  if (key === today) return t('common.today');
  if (key === addDays(today, 1)) return t('common.tomorrow');
  if (key === addDays(today, -1)) return t('common.yesterday');
  return formatDate(parse(key), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

// Times are optional local "HH:MM" strings (24-hour), e.g. '14:30'.
export const formatTime = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
};

export const longDate =(key = dateKey()) =>
  formatDate(parse(key), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

// Oldest first, ending today.
export const lastNDays = (n) => {
  const today = dateKey();
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
};

export const weekdayLetter = (key) => weekdayName(parse(key).getDay(), 'narrow');

// ---- calendar helpers ----
export const parseKey = (key) => parse(key);
export const weekday = (key) => parse(key).getDay(); // 0 = Sunday
export const daysBetween = (fromKey, toKey) =>
  Math.round((parse(toKey).getTime() - parse(fromKey).getTime()) / 86400000);

export const monthOf = (key) => key.slice(0, 7); // 'YYYY-MM'
export const addMonths = (monthKey, n) => {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
export const monthTitle = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  return formatDate(new Date(y, m - 1, 1), { month: 'long', year: 'numeric' });
};
// 6 rows x 7 columns of date keys covering the month (Sunday first). `inMonth` marks days of that month.
export const monthGrid = (monthKey, weekStart = 0) => {
  const [y, m] = monthKey.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() - weekStart + 7) % 7; // days of the previous month shown before the 1st
  const start = new Date(y, m - 1, 1 - lead);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = dateKey(d);
    return { key, day: d.getDate(), inMonth: key.slice(0, 7) === monthKey };
  });
};
// Narrow weekday letters in the app language, starting from `weekStart` (0 = Sunday, 1 = Monday).
export const weekdayLetters = (weekStart = 0) => Array.from({ length: 7 }, (_, i) => weekdayName((i + weekStart) % 7, 'narrow'));
// Always Sunday-first: index = weekday number (0 = Sunday), used for repeat days.
// A function, not a constant, so it follows a language change.
export const dayLetters = () => weekdayLetters(0);

// "Today", "Tomorrow", "in 5 days", "3 days ago"
export const countdownLabel = (key) => {
  const n = daysBetween(dateKey(), key);
  if (n === 0) return t('common.today');
  if (n === 1) return t('common.tomorrow');
  if (n > 1) return t('common.inDays', { count: n });
  return n === -1 ? t('common.yesterday') : t('common.daysAgo', { count: -n });
};
