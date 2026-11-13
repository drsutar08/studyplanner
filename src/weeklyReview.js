// The weekly review: what got done in a week, what slipped (overdue now), focus time against the week before,
// and what's coming next, plus ways to put the slipped tasks back on the calendar. Pure.
import { addDays } from './dates';

const PRIORITY = { high: 0, med: 1, low: 2 };
const doneOn = (task) => (task.completedAt ? String(task.completedAt).slice(0, 10) : null);
const inRange = (key, start, end) => !!key && key >= start && key <= end;
const minutes = (sessions, start, end) => sessions.filter((s) => inRange(s.date, start, end)).reduce((n, s) => n + (s.minutes || 0), 0);

// { start, end, done, slipped, focus, focusBefore, bySubject, next: { tasks, exams } } for the week from `start`
// (its first day); `today` decides what counts as slipped (due before today, not done)
export function weeklyReview({ tasks = [], sessions = [], exams = [], subjects = [] }, start, today) {
  const end = addDays(start, 6);
  const done = tasks.filter((t) => t.done && inRange(doneOn(t), start, end));
  const slipped = tasks
    .filter((t) => !t.done && t.due && t.due < today)
    .sort((a, b) => a.due.localeCompare(b.due) || (PRIORITY[a.priority] ?? 1) - (PRIORITY[b.priority] ?? 1));
  const bySubject = subjects
    .map((s) => ({ id: s.id, name: s.name, color: s.color, done: done.filter((t) => t.subjectId === s.id).length, minutes: minutes(sessions.filter((x) => x.subjectId === s.id), start, end) }))
    .filter((s) => s.done || s.minutes)
    .sort((a, b) => b.minutes - a.minutes || b.done - a.done);
  const nextEnd = addDays(today, 7);
  return {
    start,
    end,
    done,
    slipped,
    focus: minutes(sessions, start, end),
    focusBefore: minutes(sessions, addDays(start, -7), addDays(start, -1)),
    bySubject,
    next: {
      tasks: tasks.filter((t) => !t.done && t.due && t.due >= today && t.due <= nextEnd).length,
      exams: exams.filter((e) => e.date >= today && e.date <= nextEnd).length,
    },
  };
}

// Slipped tasks spread over the days from `from`, the most urgent first (high priority, then the oldest), at most
// `perDay` a day: [{ due, ids }] for MOVE_TASKS, one per day used
export function spreadOut(tasks, from, perDay = 3) {
  const order = [...tasks].sort((a, b) => (PRIORITY[a.priority] ?? 1) - (PRIORITY[b.priority] ?? 1) || (a.due || '').localeCompare(b.due || ''));
  const days = [];
  order.forEach((t, i) => {
    const d = Math.floor(i / perDay);
    if (!days[d]) days[d] = { due: addDays(from, d), ids: [] };
    days[d].ids.push(t.id);
  });
  return days;
}
