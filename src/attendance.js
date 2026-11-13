// Attendance: each class keeps `attendance`, a map of session date ('YYYY-MM-DD') to 'attended', 'missed',
// 'excused' (absent for an accepted reason) or 'cancelled' (the class didn't happen). Only attended and missed
// count towards the percentage; excused, cancelled and unmarked sessions don't count either way. Pure logic (plus classes.js), unit-tested in e2e/attendance.test.mjs.
import { occursOn } from './classes';

export const STATUSES = ['attended', 'missed', 'excused', 'cancelled'];
export const TARGETS = [60, 70, 75, 80, 90];
export const DEFAULT_TARGET = 75;
const LOOKBACK = 14; // days back that unmarked sessions are listed
const FALLBACK_SINCE = 7; // ... for classes added before attendance existed (no createdAt)

const keyOf = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const plusDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return keyOf(new Date(y, m - 1, d + n));
};

export const statusOn = (cls, date) => (cls.attendance && STATUSES.includes(cls.attendance[date]) ? cls.attendance[date] : null);

// The class's record with one session changed; `status` null (or the same as before) clears it.
export const markSession = (attendance, date, status) => {
  const next = { ...(attendance || {}) };
  if (!STATUSES.includes(status) || next[date] === status) delete next[date];
  else next[date] = status;
  return next;
};

// Counts for one class: attended, missed, their total, the percentage (null when there are none yet), and
// the excused / cancelled sessions that are left out.
export const attendanceOf = (cls) => {
  let attended = 0;
  let missed = 0;
  let excused = 0;
  let cancelled = 0;
  for (const v of Object.values(cls.attendance || {})) {
    if (v === 'attended') attended += 1;
    else if (v === 'missed') missed += 1;
    else if (v === 'excused') excused += 1;
    else if (v === 'cancelled') cancelled += 1;
  }
  const total = attended + missed;
  return { attended, missed, total, pct: total ? (attended / total) * 100 : null, excused, cancelled };
};

// Against a minimum (percent): how many more sessions can be missed and stay at or above it, or, when
// below it, how many sessions in a row must be attended to get back (Infinity when the target is 100%).
export const standing = ({ attended, missed }, target) => {
  const t = Math.min(100, Math.max(1, target)) / 100;
  const total = attended + missed;
  if (!total) return { ok: true, canMiss: 0, needed: 0 };
  if (attended / total >= t - 1e-9) return { ok: true, canMiss: Math.max(0, Math.floor(attended / t - total + 1e-9)), needed: 0 };
  const needed = t >= 1 ? Infinity : Math.ceil((t * total - attended) / (1 - t) - 1e-9);
  return { ok: false, canMiss: 0, needed };
};

// Every class with at least one marked session, lowest percentage first; and the overall percentage
// across all marked sessions (each session counts once).
export const attendanceSummary = (classes) => {
  const rows = classes
    .map((cls) => ({ cls, ...attendanceOf(cls) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => a.pct - b.pct || a.cls.title.localeCompare(b.cls.title));
  const attended = rows.reduce((n, r) => n + r.attended, 0);
  const total = rows.reduce((n, r) => n + r.total, 0);
  return { rows, attended, missed: total - attended, total, pct: total ? (attended / total) * 100 : null };
};

// Is the session on `date` over (so it can be marked "missed" by now)? Today counts once the class
// has ended, or started when it has no end time; an untimed class today counts from tomorrow.
export const sessionOver = (cls, date, today, nowHHMM) => {
  if (date < today) return true;
  if (date > today) return false;
  if (cls.end) return cls.end <= nowHHMM;
  return !!cls.start && cls.start <= nowHHMM;
};

// Sessions of the last `LOOKBACK` days that are over and not marked yet, newest first:
// [{ cls, date }]. A class only counts from the day it was added.
export const unmarkedSessions = (classes, today, nowHHMM, term = null, vacations = [], rotation = null, lookback = LOOKBACK) => {
  const out = [];
  for (const cls of classes) {
    let from = plusDays(today, -lookback);
    const since = cls.createdAt || plusDays(today, -FALLBACK_SINCE);
    if (since > from) from = since;
    for (let d = today; d >= from; d = plusDays(d, -1)) {
      if (!occursOn(cls, d, term, vacations, rotation) || statusOn(cls, d) || !sessionOver(cls, d, today, nowHHMM)) continue;
      out.push({ cls, date: d });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || (b.cls.start || '').localeCompare(a.cls.start || '') || a.cls.title.localeCompare(b.cls.title));
};

// ---- exams ----
// An exam keeps one `attendance` status (same values as a class session). An exam with a score was sat,
// whatever it is marked, so the form never has to ask.
const hasScore = (e) => typeof e.score === 'number' && Number.isFinite(e.score);
export const examStatus = (exam) => (hasScore(exam) ? 'attended' : STATUSES.includes(exam.attendance) ? exam.attendance : null);

// Exams up to `today`: how many were sat out of those sat or missed (excused / cancelled left out),
// and the percentage (null when none are marked).
export const examAttendance = (exams, today) => {
  const n = { attended: 0, missed: 0, excused: 0, cancelled: 0 };
  for (const e of exams) {
    if (e.date > today) continue;
    const s = examStatus(e);
    if (s) n[s] += 1;
  }
  const total = n.attended + n.missed;
  return { ...n, total, pct: total ? (n.attended / total) * 100 : null };
};

// ---- the end-of-day nudge ----
// Today's class sessions (not activities) still to mark, and when to remind: 30 minutes after the last of
// them ends (an untimed class counts as ending at 6 PM), kept between 6 PM and 10 PM. null when all are marked.
const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const attendanceNudge = (classes, today, term = null, vacations = [], rotation = null) => {
  const due = classes.filter((c) => c.kind !== 'activity' && occursOn(c, today, term, vacations, rotation) && !statusOn(c, today));
  if (!due.length) return null;
  const ends = due.map((c) => (c.end ? toMin(c.end) : c.start ? toMin(c.start) + 60 : 18 * 60));
  const at = Math.min(22 * 60, Math.max(18 * 60, Math.max(...ends) + 30));
  return { at: toHHMM(at), count: due.length, titles: due.map((c) => c.title) };
};
