// Exports translations for a native-speaker review: one CSV per language in docs/translation-review/,
// with the English source, the current text, a context note, and empty "OK?" / "Suggested change" columns.
// `npm run i18n:review`            the areas added since the first translation (default)
// `npm run i18n:review -- --all`   every string in the app
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const AREAS = ['common', 'core', 'today', 'calendar', 'manage'];
const LANGS = { hi: 'Hindi', or: 'Odia', es: 'Spanish' };
// Added after the app was first translated: these have not been seen by a native speaker yet
const RECENT = [
  'calendar.prep',
  'today.review',
  'core.smart',
  'manage.settings.smartReminders',
  'manage.settings.smartRemindersAt',
  'manage.settings.smartRemindersLearning',
  'core.cloud.startOffline',
  'core.cloud.startOfflineNote',
  'manage.board',
  'manage.groups',
  'core.auth.localOnly',
  'core.nav.pageBadgeA11y',
  'today.focus.shorterA11y',
  'today.focus.longerA11y',
  'today.focus.lengthA11y',
  'manage.legacy',
  'today.taskRow.moreCopies',
  'core.account.unsent',
  'core.account.signOutAnyway',
  'core.account.goneElsewhere',
  'manage.settings.deleteAccountSub',
  'core.cloud',
  'core.auth.errors.notConfirmed',
  'core.auth.errors.tooManyCloud',
  'core.auth.errors.network',
  'core.auth.errors.generic',
  'core.auth.errors.noCloud',
  'core.auth.login.forgot',
  'core.auth.login.resetSent',
  'core.auth.login.checkEmail',
  'core.account.deleteFailed',
  'manage.archive',
  'today.select',
  'today.grades.trendUp',
  'today.grades.trendDown',
  'today.grades.trendFlat',
  'today.reminders.weekTitle',
  'today.reminders.weekBehind',
  'today.reminders.weekOnTrack',
  'today.reminders.weekNoSubjects',
  'manage.settings.weeklyReport',
  'manage.settings.weeklyReportSub',
  'manage.groups.showQr',
  'manage.groups.hideQr',
  'manage.groups.qrA11y',
  'manage.groups.qrHint',
  'today.today.more',
  'manage.groups',
  'today.whatIf',
  'core.attachments',
  'today.progress.hoursShort',
  'today.report',
  'today.goals',
  'manage.subjects.goal',
  'manage.subjects.goalOff',
  'manage.subjects.goalA11y',
  'manage.subjects.goalHint',
  'manage.subjects.goalProgress',
  'manage.subjects.goalMet',
  'manage.subjects.goalOnTrack',
  'manage.subjects.goalBehind',
  'core.shortcuts',
  'calendar.calendar.moved',
  'calendar.calendar.dragHint',
  'calendar.calendar.dragHintWeek',
  'manage.ics',
  'calendar.week',
  'calendar.homework',
  'calendar.classHomework',
  'calendar.tasksSection',
  'calendar.rotation',
  'calendar.activities',
  'calendar.hours',
  'today.today.hero',
  'today.today.next',
  'today.today.attention',
  'today.today.tiles.a11y',
  'manage.profile',
  'manage.subjects',
  'manage.settings',
  'core.topBar',
  'core.auth.signup',
  'today.focus',
  'today.reminders.breakEndTitle',
  'today.reminders.breakEndBody',
  'today.steps',
  'today.planTime',
  'today.grades',
  'today.attendance',
  'today.reminders.activitySoon',
  'core.undo.activityDeleted',
];
const all = process.argv.includes('--all');
const root = new URL('..', import.meta.url);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-review-'));

const load = async (lang) => {
  const out = {};
  for (const area of AREAS) {
    const file = path.join(tmp, `${lang}-${area}.mjs`);
    fs.writeFileSync(file, fs.readFileSync(new URL(`src/i18n/${lang}/${area}.js`, root), 'utf8'));
    out[area] = (await import(pathToFileURL(file).href)).default;
  }
  return out;
};

// Every string as [key, text]; a plural becomes key.one / key.other
const flatten = (obj, prefix, out = []) => {
  if (typeof obj === 'string') out.push([prefix, obj]);
  else if (Array.isArray(obj)) obj.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  else if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
};

const PLACEHOLDER_NOTES = {
  title: 'the name of a task, class, exam or activity',
  count: 'a number',
  n: 'a number',
  pct: 'a percentage number (no % sign)',
  target: 'a percentage number (no % sign)',
  date: 'a date such as "Tue, Oct 27"',
  time: 'a time such as "9:00 AM"',
  name: 'a name (subject, scale or type)',
  category: 'an activity type in capitals, e.g. SPORT',
  attended: 'a number',
  total: 'a number',
  missed: 'a number',
  subjects: 'a number',
  value: 'a grade such as "84%" or "3.0"',
  letter: 'a letter grade such as "B+"',
  score: 'a number',
  outOf: 'a number',
  advice: 'a whole sentence from another string',
  start: 'a time such as "9:00 AM"',
  end: 'a time such as "10:00 AM"',
  days: 'a list of weekdays such as "Mon, Wed"',
  cycle: 'a list such as "Day A / Day B"',
  today: 'a label such as "Day A"',
  over: 'a length of time such as "2h"',
  limit: 'an hour limit such as "20h"',
  work: 'a length of time such as "12h 30m"',
  free: 'a length of time such as "2h 15m"',
};
// Questions for the reviewer on strings whose meaning is easy to get wrong (all languages)
const QUESTIONS = {
  'today.attendance.attended': 'Button and label: the student was at the class or sat the exam. Also shown on past exam rows.',
  'today.attendance.missed': 'Button and label: the student was absent. Also shown on past exam rows.',
  'today.attendance.excused': 'Absent for an accepted reason (illness, approved leave); does not count against attendance. Is this the word your school uses?',
  'today.attendance.cancelled': 'The class or exam did not happen. Also shown on exam rows, so it must fit "exam" too (Spanish: examen is masculine).',
  'today.attendance.minimum': 'Above a 60% / 70% / 75% / 80% / 90% picker: the minimum attendance the school requires.',
  'today.attendance.noneToSpare': 'Attendance is exactly at the minimum: missing one more class drops below it.',
  'today.grades.weight': 'Label above 1× / 2× / 3× buttons: how many times this exam counts in the average.',
  'today.grades.scale.gpa10': 'The 10-point CGPA scale (as used in India). Spanish shows "Sobre 10", the usual 0–10 grade.',
  'today.grades.outOf': 'The maximum score of the exam, e.g. 42 "out of" 50.',
  'calendar.rotation.typeDays': 'Schools where days are named Day A, Day B... instead of by weekday.',
  'calendar.rotation.bumpLabel': 'A break pauses the Day A / Day B cycle, so it carries on afterwards where it stopped.',
  'calendar.activities.sheet.with': 'Optional field: the person in charge (coach, club leader, shift manager).',
  'calendar.activities.todayKicker': 'Small heading on the home screen above today\'s classes and activities.',
};
const note = (key, en) => {
  const bits = QUESTIONS[key] ? [`QUESTION: ${QUESTIONS[key]}`] : [];
  if (/A11y$|A11y\./.test(key)) bits.push('Read aloud by screen readers, not shown on screen.');
  if (/\.one$/.test(key)) bits.push('Singular form (count = 1).');
  if (/\.other$/.test(key)) bits.push('Plural form.');
  if (/kicker|label$|Title$|title$/.test(key) && en === en.toUpperCase() && /[A-Z]/.test(en)) bits.push('Shown in capitals as a small heading.');
  const ph = [...new Set([...en.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];
  if (ph.length) bits.push(`Keep ${ph.map((p) => `{${p}}`).join(', ')} exactly as written: ${ph.map((p) => `{${p}} = ${PLACEHOLDER_NOTES[p] || 'filled in by the app'}`).join('; ')}.`);
  return bits.join(' ');
};

const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
const inScope = (key) => all || RECENT.some((r) => key === r || key.startsWith(`${r}.`));

const en = await load('en');
const enRows = Object.fromEntries(AREAS.flatMap((a) => flatten(en[a], a)));
const outDir = new URL('docs/translation-review/', root);
fs.mkdirSync(outDir, { recursive: true });
for (const [lang, language] of Object.entries(LANGS)) {
  const tr = await load(lang);
  const trRows = Object.fromEntries(AREAS.flatMap((a) => flatten(tr[a], a)));
  const keys = Object.keys(enRows).filter(inScope);
  const lines = [['Key', 'English', language, 'Notes', 'OK? (Y/N)', 'Suggested change'].map(cell).join(',')];
  for (const k of keys) lines.push([k, enRows[k], trRows[k] ?? '', note(k, enRows[k]), '', ''].map(cell).join(','));
  // BOM so Excel reads the file as UTF-8 (Devanagari and Odia script)
  fs.writeFileSync(new URL(`${lang}.csv`, outDir), '﻿' + lines.join('\r\n') + '\r\n');
  console.log(`${lang}: ${keys.length} strings -> docs/translation-review/${lang}.csv`);
}
