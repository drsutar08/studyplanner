// Class timetable rules. Pure functions with no imports, so they can be unit tested directly.
//
// A class is one-off (`repeat: 'once'` on `date`), weekly (`repeat: 'weekly'` on `days`, 0 = Sunday), or follows
// a rotating timetable (`repeat: 'rotation'` on `rotationDays`, the letters of a Day A / Day B cycle). A weekly
// class can also be limited to some weeks of a Week 1 / Week 2 cycle (`rotationWeeks`).
// A weekly class can be limited to a date range: 'none' (every week), 'term' (the shared term dates)
// or 'manual' (its own `rangeStart`..`rangeEnd`). Dates are 'YYYY-MM-DD', times 'HH:MM'.
// Text for the user is returned as translation keys (see src/i18n/en/calendar.js); the UI translates them.

const weekdayOf = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const addMinutes = (hhmm, minutes) => {
  const t = (((toMin(hhmm) + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

const keyOf = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const plusDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return keyOf(new Date(y, m - 1, d + n));
};
const pausedDay = (vacations, key) => vacations.some((v) => v.pause !== false && key >= v.start && key <= v.end);

// ---- rotating timetables ----
// rotation = { type: 'days' | 'weeks', length, startDate, startIndex, schoolDays: [1..5], weekStart }
//  - 'days': lettered days (Day A, Day B, ...). The letter moves on each school day. `startDate` is a school day
//    whose letter is `startIndex` (0 = A).
//  - 'weeks': Week 1, Week 2, ... The number moves each week (weeks start on `weekStart`, 0 = Sunday).
// A pausing break "bumps" the rotation: its days (or whole weeks) don't count, so it resumes where it left off.
// A break set to keep going doesn't stop the count.
const rotationCache = new Map();
const cacheKey = (rot, vacations, key) =>
  [
    rot.type,
    rot.length,
    rot.startDate,
    rot.startIndex,
    (rot.schoolDays || []).join(''),
    rot.weekStart || 0,
    vacations
      .filter((v) => v.pause !== false)
      .map((v) => v.start + v.end)
      .join(','),
    key,
  ].join('|');

const schoolDay = (rot, key) => (rot.schoolDays || [1, 2, 3, 4, 5]).includes(weekdayOf(key));
const weekStartKey = (key, weekStart) => plusDays(key, -((weekdayOf(key) - (weekStart || 0) + 7) % 7));
// a week counts unless a pausing break covers every one of its school days
const weekCounts = (rot, weekKey, vacations) => {
  for (let i = 0; i < 7; i += 1) {
    const d = plusDays(weekKey, i);
    if (schoolDay(rot, d) && !pausedDay(vacations, d)) return true;
  }
  return false;
};

// The rotation slot of a day: the letter index for a lettered-day cycle (null on days that are not school days
// or are paused), or the week index for a week cycle. null when there is no rotation.
export const rotationIndexOn = (rotation, key, vacations = []) => {
  if (!rotation || !rotation.startDate || !(rotation.length >= 2)) return null;
  const ck = cacheKey(rotation, vacations, key);
  if (rotationCache.has(ck)) return rotationCache.get(ck);
  const len = rotation.length;
  let idx = null;
  if (rotation.type === 'weeks') {
    const from = weekStartKey(rotation.startDate, rotation.weekStart);
    const to = weekStartKey(key, rotation.weekStart);
    let steps = 0;
    if (to >= from) {
      for (let w = from; w < to; w = plusDays(w, 7)) steps += weekCounts(rotation, w, vacations) ? 1 : 0;
    } else {
      for (let w = to; w < from; w = plusDays(w, 7)) steps -= weekCounts(rotation, w, vacations) ? 1 : 0;
    }
    idx = (((rotation.startIndex + steps) % len) + len) % len;
  } else if (schoolDay(rotation, key) && !pausedDay(vacations, key)) {
    let steps = 0;
    if (key >= rotation.startDate) {
      for (let d = rotation.startDate; d < key; d = plusDays(d, 1)) if (schoolDay(rotation, d) && !pausedDay(vacations, d)) steps += 1;
    } else {
      for (let d = key; d < rotation.startDate; d = plusDays(d, 1)) if (schoolDay(rotation, d) && !pausedDay(vacations, d)) steps -= 1;
    }
    idx = (((rotation.startIndex + steps) % len) + len) % len;
  }
  if (rotationCache.size > 5000) rotationCache.clear();
  rotationCache.set(ck, idx);
  return idx;
};

// "A", "B", ... for a lettered day (the UI wraps it as "Day A"; weeks show as "Week 1").
export const rotationLetter = (index) => String.fromCharCode(65 + index);

// The first and last day a class can happen on ([null, null] = no limit).
export const classRange = (cls, term) => {
  if (cls.repeat === 'once') return [cls.date, cls.date];
  if (cls.range === 'term') return term ? [term.start, term.end] : [null, null];
  if (cls.range === 'manual') return [cls.rangeStart || null, cls.rangeEnd || null];
  return [null, null];
};

// `vacations`: a pausing break skips repeating classes on its days (a one-off class you set on purpose still happens).
// `rotation`: the rotating timetable, needed by rotation classes and by weekly classes limited to some weeks.
export const occursOn = (cls, key, term, vacations = [], rotation = null) => {
  if (cls.repeat === 'once') return cls.date === key;
  if (pausedDay(vacations, key)) return false;
  if (cls.repeat === 'rotation') {
    if (!rotation || rotation.type !== 'days') return false;
    const idx = rotationIndexOn(rotation, key, vacations);
    if (idx === null || !(cls.rotationDays || []).includes(idx)) return false;
  } else {
    if (!cls.days || !cls.days.includes(weekdayOf(key))) return false;
    if (cls.rotationWeeks && cls.rotationWeeks.length && rotation && rotation.type === 'weeks') {
      if (!cls.rotationWeeks.includes(rotationIndexOn(rotation, key, vacations))) return false;
    }
  }
  const [from, to] = classRange(cls, term);
  return (!from || key >= from) && (!to || key <= to);
};

// Classes on one day, earliest first (classes without a time go last).
export const classesOn = (classes, key, term, vacations = [], rotation = null) =>
  classes
    .filter((c) => occursOn(c, key, term, vacations, rotation))
    .sort((a, b) => (a.start || '99:99').localeCompare(b.start || '99:99') || a.title.localeCompare(b.title));

// The first day after `afterKey` that the class meets (paused breaks skipped), or null if it doesn't
// meet again within `maxDays`. Used as the due date for homework: "due next class".
export const nextSessionDate = (cls, afterKey, term, vacations = [], maxDays = 120, rotation = null) => {
  const [y, m, d] = afterKey.split('-').map(Number);
  for (let i = 1; i <= maxDays; i += 1) {
    const dt = new Date(y, m - 1, d + i);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    if (occursOn(cls, key, term, vacations, rotation)) return key;
  }
  return null;
};

// Homework linked to a class (tasks added with "+ homework"): the open ones soonest due first, how many
// of those are overdue, and the last few finished ones (newest first) so the class shows what was done.
export const classHomework = (tasks, classId, today, keepDone = 3) => {
  const mine = tasks.filter((t) => t.classId === classId);
  const open = mine.filter((t) => !t.done).sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title));
  const done = mine
    .filter((t) => t.done)
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '') || b.due.localeCompare(a.due))
    .slice(0, keepDone);
  return { open, overdue: open.filter((t) => t.due < today).length, done };
};

// Reminders for timed classes in the next `days` days, `leadMin` minutes before each starts, soonest first.
export const classAlerts = (classes, term, now = new Date(), { days = 7, leadMin = 10, vacations = [], rotation = null } = {}) => {
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    for (const cls of classes) {
      if (!cls.start || !occursOn(cls, key, term, vacations, rotation)) continue;
      const [h, m] = cls.start.split(':').map(Number);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m - leadMin, 0, 0);
      if (at.getTime() > now.getTime()) out.push({ cls, date: key, at });
    }
  }
  return out.sort((a, b) => a.at - b.at);
};

// A class is over once its last possible day is before today (an open-ended weekly class never is).
export const isPastClass = (cls, today, term) => {
  const [, to] = classRange(cls, term);
  return !!to && to < today;
};

const byStart = (a, b) => (a.start || '99:99').localeCompare(b.start || '99:99') || a.title.localeCompare(b.title);

// The timetable on the Calendar: weekly classes grouped by weekday in week order (only days that have
// classes), upcoming one-off classes by date, and the classes that are over.
// `cycle`: rotation classes grouped by their letter (Day A, Day B, ...), only letters that have classes.
export const timetable = (classes, today, term, weekStart = 0, rotation = null) => {
  const live = classes.filter((c) => !isPastClass(c, today, term));
  const weeks = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7)
    .map((day) => ({ day, classes: live.filter((c) => c.repeat === 'weekly' && c.days.includes(day)).sort(byStart) }))
    .filter((g) => g.classes.length > 0);
  const rotating = live.filter((c) => c.repeat === 'rotation');
  const letters = Math.max(rotation && rotation.type === 'days' ? rotation.length : 0, ...rotating.map((c) => Math.max(-1, ...(c.rotationDays || [])) + 1));
  const cycle = Array.from({ length: letters }, (_, index) => ({ index, classes: rotating.filter((c) => (c.rotationDays || []).includes(index)).sort(byStart) })).filter(
    (g) => g.classes.length > 0
  );
  const oneOffs = live.filter((c) => c.repeat === 'once').sort((a, b) => a.date.localeCompare(b.date) || byStart(a, b));
  const past = classes.filter((c) => isPastClass(c, today, term));
  return { weeks, cycle, oneOffs, past };
};

// Where a class stands right now on a given day: 'done', 'now' or null (later, or no times set).
export const classStatus = (cls, nowHHMM) => {
  if (cls.end && cls.end <= nowHHMM) return 'done';
  if (cls.start && cls.end && cls.start <= nowHHMM) return 'now';
  return null;
};

// Sessions of all classes in a month ('YYYY-MM'), for the header count.
export const sessionsInMonth = (classes, month, term, vacations = [], rotation = null) => {
  const [y, m] = month.split('-').map(Number);
  const daysIn = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= daysIn; d += 1) {
    const key = `${month}-${String(d).padStart(2, '0')}`;
    n += classes.filter((c) => occursOn(c, key, term, vacations, rotation)).length;
  }
  return n;
};

// How a set of weekdays reads: { key } for 'Every day' / 'Weekdays', otherwise { days } sorted, for the UI
// to join as short day names ('Mon, Wed').
export const describeDays = (days) => {
  const d = [...days].sort();
  if (d.length === 7) return { key: 'classes.days.every' };
  if (d.length === 5 && [1, 2, 3, 4, 5].every((x) => d.includes(x))) return { key: 'classes.days.weekdays' };
  return { days: d };
};

// Returns the translation key of the form's error, or null when the class can be saved.
export const validateClass = (cls, term) => {
  if (!cls.title || !cls.title.trim()) return 'classes.errors.name';
  if (cls.repeat === 'once' && !cls.date) return 'classes.errors.date';
  if (cls.repeat === 'weekly' && (!cls.days || cls.days.length === 0)) return 'classes.errors.days';
  if (cls.repeat === 'rotation' && (!cls.rotationDays || cls.rotationDays.length === 0)) return 'classes.errors.rotationDays';
  if (cls.start && cls.end && toMin(cls.end) <= toMin(cls.start)) return 'classes.errors.endAfterStart';
  const repeating = cls.repeat === 'weekly' || cls.repeat === 'rotation';
  if (repeating && cls.range === 'term' && !term) return 'classes.errors.term';
  if (repeating && cls.range === 'manual') {
    if (!cls.rangeStart || !cls.rangeEnd) return 'classes.errors.range';
    if (cls.rangeEnd < cls.rangeStart) return 'classes.errors.rangeOrder';
  }
  return null;
};

// Translation key of the error, or null when the term dates are valid.
export const validateTerm = (term) => {
  if (!term || !term.start || !term.end) return 'classes.errors.termRange';
  if (term.end < term.start) return 'classes.errors.termOrder';
  return null;
};

// ---- activities ----
// Clubs, sports, part-time work and the like are stored with the classes (same schedule rules, breaks,
// rotation and reminders) but marked `kind: 'activity'` with a `category`. They take part in everything
// about time (day list, week view, free time, reminders) and nothing academic (homework, attendance).
export const ACTIVITY_CATEGORIES = ['club', 'sport', 'work', 'volunteer', 'arts', 'other'];
export const isActivity = (c) => !!c && c.kind === 'activity';
export const onlyClasses = (list) => list.filter((c) => !isActivity(c));
export const onlyActivities = (list) => list.filter(isActivity);

// The Activities tab: repeating ones in week order (by their first day after `weekStart`, then start time),
// rotation ones after them, then upcoming one-offs by date; `past` holds the finished ones.
export const activityList = (list, today, term, weekStart = 0) => {
  const acts = onlyActivities(list);
  const firstDay = (c) => Math.min(...(c.days || []).map((d) => (d - weekStart + 7) % 7));
  const live = acts.filter((c) => !isPastClass(c, today, term));
  const order = (c) => (c.repeat === 'weekly' ? 0 : c.repeat === 'rotation' ? 1 : 2);
  const current = live.sort(
    (a, b) =>
      order(a) - order(b) ||
      (a.repeat === 'weekly' ? firstDay(a) - firstDay(b) : 0) ||
      (a.repeat === 'once' ? a.date.localeCompare(b.date) : 0) ||
      byStart(a, b)
  );
  return { current, past: acts.filter((c) => isPastClass(c, today, term)) };
};

// ---- activity hours ----
// How long one session lasts in minutes (0 when it has no start or end time).
export const sessionMinutes = (c) => (c.start && c.end ? Math.max(0, toMin(c.end) - toMin(c.start)) : 0);

// The first day of the week holding `key` ('YYYY-MM-DD'); `weekStart` 0 = Sunday, 1 = Monday.
export const weekStartOf = (key, weekStart = 0) => weekStartKey(key, weekStart);

// Scheduled activity time in the 7 days from `fromKey`, from the timetable (breaks and rotation applied):
// minutes per activity id and per category, the total, timed sessions, and sessions with no times (not counted).
export const activityHours = (list, fromKey, term, vacations = [], rotation = null) => {
  const byId = {};
  const byCategory = {};
  let total = 0;
  let sessions = 0;
  let untimed = 0;
  const acts = onlyActivities(list);
  for (let i = 0; i < 7; i += 1) {
    const key = plusDays(fromKey, i);
    for (const c of acts) {
      if (!occursOn(c, key, term, vacations, rotation)) continue;
      const m = sessionMinutes(c);
      if (!m) {
        untimed += 1;
        continue;
      }
      const cat = ACTIVITY_CATEGORIES.includes(c.category) ? c.category : 'other';
      byId[c.id] = (byId[c.id] || 0) + m;
      byCategory[cat] = (byCategory[cat] || 0) + m;
      total += m;
      sessions += 1;
    }
  }
  return { byId, byCategory, total, sessions, untimed };
};

// Minutes of work over a weekly limit in hours (0 when under it or when there is no limit).
export const overLimit = (workMinutes, limitHours) => (limitHours > 0 ? Math.max(0, workMinutes - limitHours * 60) : 0);

// ---- what's next today ----
// From today's list (classesOn()), what is on now or next: { cls, status: 'now' | 'next', minutes } where
// `minutes` is until it ends (now) or starts (next). Untimed ones are skipped; null when nothing is left today.
export const nextUp = (list, nowHHMM) => {
  const now = toMin(nowHHMM);
  const timed = list.filter((c) => c.start).sort(byStart);
  const live = timed.find((c) => c.end && toMin(c.start) <= now && now < toMin(c.end));
  if (live) return { cls: live, status: 'now', minutes: toMin(live.end) - now };
  const next = timed.find((c) => toMin(c.start) > now);
  return next ? { cls: next, status: 'next', minutes: toMin(next.start) - now } : null;
};
