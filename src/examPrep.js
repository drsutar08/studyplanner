// Exam prep plans: revision sessions spread over the days before an exam, as ordinary tasks (with `prepFor` set to
// the exam's id, so the plan can be found, replaced or removed). Pure: the sheet (components/ExamPrepSheet.js)
// turns the steps into titles in the person's language.
import { addDays, daysBetween } from './dates';

export const PREP_MINUTES = [30, 45, 60, 90];
export const MAX_SESSIONS = 12;

// the days revision can go on: from today to the day before the exam
export const prepDays = (exam, today) => {
  const n = daysBetween(today, exam.date);
  return n > 0 ? Array.from({ length: n }, (_, i) => addDays(today, i)) : [];
};

// how many sessions to suggest: every day when the exam is close, about every other day further out, up to 8
export const suggestedSessions = (days) => (days <= 3 ? days : Math.min(8, Math.max(3, Math.round(days * 0.6))));

// Topics from what was typed: one per line or separated by commas, without blanks or repeats
export const parseTopics = (text) => {
  const seen = new Set();
  return String(text || '')
    .split(/[\n,;]+/)
    .map((s) => s.trim().slice(0, 80))
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
};

// The plan's steps: [{ due, kind, topic?, n, of, estimate }], oldest first, the last on the day before the exam.
// kind: 'topic' (one per topic, in order), 'session' (when there are no topics left), 'practice' (a practice test,
// second to last, when there are 3 or more) and 'final' (the last one, a final review).
export function prepPlan({ exam, today, count, minutes = 45, topics = [] }) {
  const days = prepDays(exam, today);
  const total = Math.max(0, Math.min(count == null ? suggestedSessions(days.length) : count, days.length, MAX_SESSIONS));
  if (!total) return [];
  // spread over the days, ending on the last one: the i-th session on day ceil((i + 1) * days / total) - 1
  const dates = Array.from({ length: total }, (_, i) => days[Math.ceil(((i + 1) * days.length) / total) - 1]);
  const study = total >= 3 ? total - 2 : total - 1; // sessions before the practice test and the final review
  return dates.map((due, i) => {
    const step = { due, n: i + 1, of: total, estimate: minutes };
    if (i === total - 1) return { ...step, kind: 'final' };
    if (total >= 3 && i === total - 2) return { ...step, kind: 'practice', estimate: Math.max(minutes, 60) };
    if (topics.length) return { ...step, kind: 'topic', topic: topics[i % topics.length], ...(topics.length > study && i === study - 1 ? { rest: topics.slice(study) } : {}) };
    return { ...step, kind: 'session' };
  });
}

// the exam's tasks as they are now (done and not): the generated plan (`prepFor`) and tasks linked by hand (`examId`)
export const planTasks = (tasks, examId) => (tasks || []).filter((t) => t.prepFor === examId || t.examId === examId);
