// A progress report to share with a parent or teacher: what happened in a period (focus time, tasks, attendance,
// grades, the streak) and what's coming. Pure: components/ProgressReportSheet.js turns it into a page and a message.
import { addDays, daysBetween } from './dates';
import { subjectAverages, overallAverage } from './grades';
import { attendanceOf } from './attendance';
import { protectedStreak } from './stats';

export const PERIODS = ['week', 'month', 'term'];

// The period's first and last day: this week (from `weekStart`), the last 4 weeks, or the term so far (90 days
// without a term)
export function periodRange(period, today, { weekStart, term } = {}) {
  if (period === 'week') return { from: weekStart || addDays(today, -6), to: today };
  if (period === 'term') return { from: term && term.start && term.start <= today ? term.start : addDays(today, -89), to: today };
  return { from: addDays(today, -27), to: today };
}

const inRange = (key, from, to) => !!key && key >= from && key <= to;
const day = (v) => (v ? String(v).slice(0, 10) : null);

export function buildReport(state, { period = 'week', today, weekStart, weekStartDay = 0, profile = {} }) {
  const { from, to } = periodRange(period, today, { weekStart, term: state.term });
  const subjects = state.subjects || [];
  const name = (id) => (subjects.find((s) => s.id === id) || {}).name || null;
  const color = (id) => (subjects.find((s) => s.id === id) || {}).color || null;

  const sessions = (state.sessions || []).filter((s) => inRange(s.date, from, to) && s.minutes > 0);
  const minutes = sessions.reduce((n, s) => n + s.minutes, 0);
  const bySubject = new Map();
  for (const s of sessions) bySubject.set(s.subjectId || null, (bySubject.get(s.subjectId || null) || 0) + s.minutes);

  const tasks = state.tasks || [];
  const done = tasks.filter((t) => t.done && inRange(day(t.completedAt), from, to));
  const dueInPeriod = tasks.filter((t) => inRange(t.due, from, to));
  const onTime = dueInPeriod.filter((t) => t.done && day(t.completedAt) && day(t.completedAt) <= t.due);

  // attendance: every marked class session, per subject (activities aren't classes)
  const att = new Map();
  for (const c of (state.classes || []).filter((x) => x.kind !== 'activity')) {
    const a = attendanceOf(c);
    if (!a.total) continue;
    const k = c.subjectId || null;
    const cur = att.get(k) || { attended: 0, total: 0 };
    att.set(k, { attended: cur.attended + a.attended, total: cur.total + a.total });
  }
  const attTotal = [...att.values()].reduce((x, a) => ({ attended: x.attended + a.attended, total: x.total + a.total }), { attended: 0, total: 0 });

  const exams = state.exams || [];
  const cards = state.cards || [];
  return {
    period,
    from,
    to,
    days: daysBetween(from, to) + 1,
    student: { name: profile.name || '', school: profile.school || '', course: profile.course || '', year: profile.studyYear || '' },
    focus: {
      minutes,
      sessions: sessions.length,
      activeDays: new Set(sessions.map((s) => s.date)).size,
      streak: protectedStreak(state.sessions || [], today, weekStartDay).days,
      bySubject: [...bySubject.entries()].map(([id, m]) => ({ id, name: name(id), color: color(id), minutes: m })).sort((a, b) => b.minutes - a.minutes),
    },
    tasks: { done: done.length, due: dueInPeriod.length, onTime: onTime.length, overdue: tasks.filter((t) => !t.done && t.due && t.due < today).length },
    attendance: {
      pct: attTotal.total ? Math.round((attTotal.attended / attTotal.total) * 100) : null,
      bySubject: [...att.entries()].map(([id, a]) => ({ id, name: name(id), color: color(id), pct: Math.round((a.attended / a.total) * 100), attended: a.attended, total: a.total })).sort((a, b) => a.pct - b.pct),
    },
    grades: {
      average: overallAverage(exams) == null ? null : Math.round(overallAverage(exams)),
      bySubject: subjectAverages(exams).map((g) => ({ id: g.subjectId, name: name(g.subjectId), color: color(g.subjectId), average: Math.round(g.average), count: g.count })),
    },
    cards: { total: cards.length, learnt: cards.filter((c) => c.reps >= 3).length },
    upcoming: exams
      .filter((e) => e.date >= today && e.date <= addDays(today, 14))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({ title: e.title, date: e.date, subject: name(e.subjectId), days: daysBetween(today, e.date) })),
  };
}
