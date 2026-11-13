// Vacation (break) rules. Pure functions with no imports, so they can be unit tested directly.
//
// A vacation is { id, title, start, end, pause, notes } with 'YYYY-MM-DD' dates (end inclusive).
// When `pause` is true, weekly classes are skipped and repeating tasks are not created on its days;
// both carry on by themselves afterwards. With `pause` false it only marks the days on the calendar.

const parse = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const toKey = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const plusDays = (key, n) => {
  const dt = parse(key);
  dt.setDate(dt.getDate() + n);
  return toKey(dt);
};

// [id, label translation key, length in days]. Text for the user is returned as translation keys
// (see src/i18n/en/calendar.js); the UI translates them.
export const PRESETS = [
  ['day', 'vacations.presets.day', 1],
  ['week', 'vacations.presets.week', 7],
  ['twoWeeks', 'vacations.presets.twoWeeks', 14],
  ['custom', 'vacations.presets.custom', null],
];

// Number of days from start to end, both included.
export const vacationLength = (start, end) => Math.round((parse(end) - parse(start)) / 86400000) + 1;

export const presetEnd = (start, preset) => {
  const p = PRESETS.find(([id]) => id === preset);
  return p && p[2] ? plusDays(start, p[2] - 1) : null;
};

// Which preset a start/end pair matches ('custom' when none does).
export const presetOf = (start, end) => {
  const n = vacationLength(start, end);
  const p = PRESETS.find(([, , days]) => days === n);
  return p ? p[0] : 'custom';
};

// { key, params } for t(): whole weeks read as weeks ('2 weeks'), anything else as days ('4 days').
export const lengthLabel = (start, end) => {
  const n = vacationLength(start, end);
  if (n % 7 === 0) return { key: 'vacations.length.weeks', params: { count: n / 7 } };
  return { key: 'vacations.length.days', params: { count: n } };
};

export const vacationOn = (vacations, key) => (vacations || []).find((v) => key >= v.start && key <= v.end) || null;

// True when a pausing vacation covers this day.
export const pausedOn = (vacations, key) => (vacations || []).some((v) => v.pause !== false && key >= v.start && key <= v.end);

// Translation key of the form's error, or null when the vacation can be saved.
export const validateVacation = (v) => {
  if (!v.title || !v.title.trim()) return 'vacations.errors.name';
  if (!v.start || !v.end) return 'vacations.errors.dates';
  if (v.end < v.start) return 'vacations.errors.order';
  return null;
};

// The break you are on today (if any) and the next one coming up.
export const breakStatus = (vacations, today) => {
  const sorted = [...(vacations || [])].sort((a, b) => a.start.localeCompare(b.start));
  const current = sorted.find((v) => v.start <= today && v.end >= today) || null;
  const next = sorted.find((v) => v.start > today) || null;
  return {
    current,
    daysLeft: current ? vacationLength(today, current.end) : 0, // including today
    next,
    daysUntil: next ? vacationLength(today, next.start) - 1 : 0,
  };
};
