// Calendar files (.ics, iCalendar): export classes, activities, exams and breaks so Google / Apple / Outlook
// calendars can show them, and import a timetable a school publishes. Pure (plus classes.js), unit-tested in
// e2e/ics.test.mjs. Times are "floating" (no time zone): a calendar app shows them in its own local time.
import { occursOn, ACTIVITY_CATEGORIES } from './classes';

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plusDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return keyOf(new Date(y, m - 1, d + n));
};
// The app's own fields ride along as X-STUDYPLANNER-* properties: other calendars ignore them, our import reads them back
const xProps = (fields) => Object.entries(fields).filter(([, v]) => v).map(([k, v]) => `X-STUDYPLANNER-${k.toUpperCase()}:${esc(v)}`);
const icsDate = (key) => key.replace(/-/g, '');
const icsDateTime = (key, hhmm) => `${icsDate(key)}T${hhmm.replace(':', '')}00`;
const addMin = (hhmm, minutes) => {
  const total = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + minutes;
  const capped = Math.min(total, 23 * 60 + 59);
  return `${pad(Math.floor(capped / 60))}:${pad(capped % 60)}`;
};

// Text values: backslash, comma, semicolon and new lines are escaped
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const unesc = (s) => String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

// Lines longer than 75 characters are folded onto continuation lines that start with a space
const fold = (line) => {
  const out = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join('\r\n');
};

// ---- export ----
// data: { classes, exams, vacations, subjects, term, rotation }. Class and activity sessions are written one by
// one from fromKey to the end of their date range or term (at most \`days\` ahead), so breaks and Day A / Day B
// rotation come out exactly as in the app. Returns the file text.
export const buildIcs = ({ classes = [], exams = [], vacations = [], subjects = [], term = null, rotation = null }, { fromKey, days = 180, stamp = '20260101T000000Z', name = 'StudyPlanner' } = {}) => {
  const subjectName = Object.fromEntries(subjects.map((s) => [s.id, s.name]));
  const until = plusDays(fromKey, days);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//StudyPlanner//Study planner//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(name)}`];
  const event = (uid, fields) => {
    lines.push('BEGIN:VEVENT', `UID:${uid}@studyplanner`, `DTSTAMP:${stamp}`, ...fields.filter(Boolean), 'END:VEVENT');
  };
  const timeFields = (key, start, end) =>
    start ? [`DTSTART:${icsDateTime(key, start)}`, `DTEND:${icsDateTime(key, end || addMin(start, 60))}`] : [`DTSTART;VALUE=DATE:${icsDate(key)}`, `DTEND;VALUE=DATE:${icsDate(plusDays(key, 1))}`];

  for (const c of classes) {
    const where = c.mode === 'online' ? c.link : c.location;
    const about = [subjectName[c.subjectId], c.teacher, c.mode === 'online' && c.link].filter(Boolean).join(' · ');
    const extra = xProps({ subject: subjectName[c.subjectId], teacher: c.teacher, notes: c.notes, online: c.mode === 'online' ? '1' : '' });
    for (let k = fromKey; k <= until; k = plusDays(k, 1)) {
      if (!occursOn(c, k, term, vacations, rotation)) continue;
      event(`${c.id}-${icsDate(k)}`, [`SUMMARY:${esc(c.title)}`, ...timeFields(k, c.start, c.end), where ? `LOCATION:${esc(where)}` : null, about ? `DESCRIPTION:${esc(about)}` : null, `CATEGORIES:${c.kind === 'activity' ? `ACTIVITY,${String(c.category || 'other').toUpperCase()}` : 'CLASS'}`, ...extra]);
    }
  }
  for (const e of exams) {
    if (e.date < fromKey) continue;
    const where = e.mode === 'online' ? e.link : [e.building, e.room].filter(Boolean).join(', ');
    event(`${e.id}`, [
      `SUMMARY:${esc(`${e.title}${e.kind && !e.title.toLowerCase().includes(String(e.kind).toLowerCase()) ? ` (${e.kind})` : ''}`)}`,
      ...timeFields(e.date, e.time, e.time ? addMin(e.time, e.duration || 60) : null),
      where ? `LOCATION:${esc(where)}` : null,
      subjectName[e.subjectId] || e.notes ? `DESCRIPTION:${esc([subjectName[e.subjectId], e.notes].filter(Boolean).join(' · '))}` : null,
      'CATEGORIES:EXAM',
      ...xProps({ subject: subjectName[e.subjectId], notes: e.notes, kind: e.kind, online: e.mode === 'online' ? '1' : '' }),
    ]);
  }
  for (const v of vacations) {
    if (v.end < fromKey) continue;
    event(`${v.id}`, [`SUMMARY:${esc(v.title)}`, `DTSTART;VALUE=DATE:${icsDate(v.start)}`, `DTEND;VALUE=DATE:${icsDate(plusDays(v.end, 1))}`, 'TRANSP:TRANSPARENT', 'CATEGORIES:BREAK', ...xProps({ notes: v.notes })]);
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
};

// ---- import ----
// A date or date-time value: { date: 'YYYY-MM-DD', time: 'HH:MM' | null }. UTC times ("Z") are turned into
// the device's local time; other times are taken as written.
const readWhen = (value, params) => {
  const v = value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  if (!m[4] || /VALUE=DATE(?!-)/i.test(params)) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: null };
  if (m[7]) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    return { date: keyOf(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
};

// The events in a calendar file: [{ uid, title, start, end, location, description, categories, rrule, x }] (rrule as an
// object of its parts, e.g. { FREQ: 'WEEKLY', BYDAY: 'MO,WE', UNTIL: '20261218' }). Anything unreadable is skipped.
export const parseIcs = (text) => {
  const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, ''); // unfold
  const events = [];
  let cur = null;
  for (const line of raw.split('\n')) {
    if (/^BEGIN:VEVENT/i.test(line)) cur = {};
    else if (/^END:VEVENT/i.test(line)) {
      if (cur && cur.start && cur.title) events.push(cur);
      cur = null;
    } else if (cur) {
      const at = line.indexOf(':');
      if (at < 0) continue;
      const [name, ...params] = line.slice(0, at).split(';');
      const value = line.slice(at + 1);
      const key = name.toUpperCase();
      if (key === 'SUMMARY') cur.title = unesc(value).trim();
      else if (key === 'UID') cur.uid = value.trim();
      else if (key === 'LOCATION') cur.location = unesc(value).trim();
      else if (key === 'DESCRIPTION') cur.description = unesc(value).trim();
      else if (key === 'CATEGORIES') cur.categories = value.toUpperCase();
      else if (key.startsWith('X-STUDYPLANNER-')) cur.x = { ...cur.x, [key.slice(15).toLowerCase()]: unesc(value) };
      else if (key === 'DTSTART') cur.start = readWhen(value, params.join(';'));
      else if (key === 'DTEND') cur.end = readWhen(value, params.join(';'));
      else if (key === 'RRULE') cur.rrule = Object.fromEntries(value.split(';').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k.toUpperCase(), v.toUpperCase()]));
    }
  }
  return events;
};

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const weekdayOf = (key) => new Date(`${key}T12:00:00`).getDay();
const minutesBetween = (a, b) => Number(b.slice(0, 2)) * 60 + Number(b.slice(3, 5)) - (Number(a.slice(0, 2)) * 60 + Number(a.slice(3, 5)));
const EXAM_WORDS = /\b(exam|examination|test|quiz|midterm|mid-term|final|finals|assessment|viva|practical exam)\b/i;
const BREAK_WORDS = /\b(holiday|holidays|break|vacation|recess|half[- ]term|no school|closed)\b/i;

// What a calendar file adds to the app: weekly events become repeating classes, exam-like events exams,
// all-day breaks breaks, and other one-off timed events one-off classes. Ones already in the app (same title,
// day and time) are left out. Returns { classes, exams, vacations, skipped } with fields as the app's add
// actions take them (no ids).
export const importPlan = (events, existing = {}, { today = null } = {}) => {
  const have = new Set([
    ...(existing.classes || []).map((c) => `${c.title.toLowerCase()}|${c.repeat === 'once' ? c.date : (c.days || []).join(',')}|${c.start || ''}`),
    ...(existing.exams || []).map((e) => `${e.title.toLowerCase()}|${e.date}|${e.time || ''}`),
    ...(existing.vacations || []).map((v) => `${v.title.toLowerCase()}|${v.start}`),
  ]);
  const out = { classes: [], exams: [], vacations: [], skipped: 0 };
  const seen = new Set();
  const add = (list, key, record) => {
    if (have.has(key) || seen.has(key)) {
      out.skipped += 1;
      return;
    }
    seen.add(key);
    out[list].push(record);
  };
  // Subject, teacher, notes and online link: from our own X- properties when the file came from the app
  const subjectByName = new Map((existing.subjects || []).map((sb) => [sb.name.toLowerCase(), sb.id]));
  const details = (ev) => {
    const x = ev.x || {};
    const online = x.online === '1';
    return {
      subjectId: (x.subject && subjectByName.get(x.subject.toLowerCase())) || null,
      teacher: x.teacher || '',
      notes: ev.x ? x.notes || '' : ev.description || '',
      mode: online ? 'online' : 'inPerson',
      location: online ? '' : ev.location || '',
      link: online ? ev.location || '' : '',
    };
  };
  const tag = (ev) => (ev.categories || '').split(',')[0];
  const activityOf = (ev) => {
    if (tag(ev) !== 'ACTIVITY') return {};
    const cat = ((ev.categories || '').split(',')[1] || '').toLowerCase();
    return { kind: 'activity', category: ACTIVITY_CATEGORIES.includes(cat) ? cat : 'other' };
  };
  // repeated copies of one weekly event (an exported file lists each session) fold into one class
  const weeklyGroups = new Map();
  for (const ev of events) {
    const { start, end } = ev;
    const endTime = end && end.time && end.date === start.date ? end.time : null;
    const allDay = !start.time;
    const title = ev.title.slice(0, 70);
    if (allDay && (tag(ev) === 'BREAK' || BREAK_WORDS.test(title) || (end && end.date > plusDays(start.date, 1)))) {
      const last = end && end.date > start.date ? plusDays(end.date, -1) : start.date; // DTEND is the day after
      add('vacations', `${title.toLowerCase()}|${start.date}`, { title, start: start.date, end: last, pause: true, notes: (ev.x && ev.x.notes) || '' });
      continue;
    }
    if (ev.rrule && ev.rrule.FREQ === 'WEEKLY') {
      const days = (ev.rrule.BYDAY ? ev.rrule.BYDAY.split(',') : [DAY_CODES[weekdayOf(start.date)]]).map((d) => DAY_CODES.indexOf(d.replace(/^[-+\d]+/, ''))).filter((d) => d >= 0);
      const untilM = ev.rrule.UNTIL && ev.rrule.UNTIL.match(/^(\d{4})(\d{2})(\d{2})/);
      const rangeEnd = untilM ? `${untilM[1]}-${untilM[2]}-${untilM[3]}` : null;
      const cls = { title, repeat: 'weekly', days: [...new Set(days)].sort(), start: start.time, end: endTime, range: rangeEnd ? 'manual' : 'none', rangeStart: rangeEnd ? start.date : null, rangeEnd, ...details(ev), ...activityOf(ev) };
      add('classes', `${title.toLowerCase()}|${cls.days.join(',')}|${cls.start || ''}`, cls);
      continue;
    }
    if (tag(ev) === 'EXAM' || EXAM_WORDS.test(title)) {
      const duration = start.time && endTime ? Math.max(15, minutesBetween(start.time, endTime)) : 60;
      // our own export writes "Title (Kind)"
      const x = ev.x || {};
      const tagged = x.kind && title.endsWith(` (${x.kind})`);
      const examTitle = tagged ? title.slice(0, -x.kind.length - 3) : title;
      const { subjectId, notes, mode, location, link } = details(ev);
      add('exams', `${examTitle.toLowerCase()}|${start.date}|${start.time || ''}`, { title: examTitle, kind: x.kind || 'Exam', date: start.date, time: start.time, duration, mode, building: location, room: '', link, notes, subjectId });
      continue;
    }
    if (!start.time) continue; // an all-day note that isn't a break: nothing to make of it
    if (today && start.date < today) continue; // past one-off events aren't worth importing
    // the same title at the same weekday and time on several dates: one weekly class
    const gk = `${title.toLowerCase()}|${weekdayOf(start.date)}|${start.time}`;
    const g = weeklyGroups.get(gk) || { title, start: start.time, end: endTime, fields: { ...details(ev), ...activityOf(ev) }, dates: [] };
    g.dates.push(start.date);
    weeklyGroups.set(gk, g);
  }
  // an activity or class seen on two or more dates repeats weekly; a single one is a one-off
  const merged = new Map(); // title|start -> weekly class with all its days
  for (const g of weeklyGroups.values()) {
    if (g.dates.length >= 2) {
      const sorted = [...g.dates].sort();
      const mk = `${g.title.toLowerCase()}|${g.start}`;
      const prev = merged.get(mk);
      const day = weekdayOf(sorted[0]);
      if (prev) {
        prev.days = [...new Set([...prev.days, day])].sort();
        prev.rangeStart = prev.rangeStart < sorted[0] ? prev.rangeStart : sorted[0];
        prev.rangeEnd = prev.rangeEnd > sorted.at(-1) ? prev.rangeEnd : sorted.at(-1);
      } else {
        merged.set(mk, { title: g.title, repeat: 'weekly', days: [day], start: g.start, end: g.end, range: 'manual', rangeStart: sorted[0], rangeEnd: sorted.at(-1), ...g.fields });
      }
    } else {
      add('classes', `${g.title.toLowerCase()}|${g.dates[0]}|${g.start}`, { title: g.title, repeat: 'once', date: g.dates[0], days: [], start: g.start, end: g.end, range: 'none', rangeStart: null, rangeEnd: null, ...g.fields });
    }
  }
  for (const c of merged.values()) add('classes', `${c.title.toLowerCase()}|${c.days.join(',')}|${c.start || ''}`, c);
  return out;
};
