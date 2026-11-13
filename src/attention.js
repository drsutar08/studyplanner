// "Needs your attention" on the dashboard: things from attendance, grades and activity hours that want
// a tap, worst first. Only what applies is listed. Pure, unit-tested in e2e/attention.test.mjs.
import { unmarkedSessions, attendanceSummary, standing } from './attendance';
import { needsScore } from './grades';
import { onlyClasses, activityHours, weekStartOf, overLimit } from './classes';

// [{ id, ...details }]:
//   below  { classes: [{ title, pct }] }  classes under the attendance minimum `target` (percent)
//   hours  { over, limit }                minutes over the weekly work limit (hours) this week
//   mark   { count }                      recent class sessions not marked attended / missed
//   score  { count }                      past exams waiting for a score
export const attentionItems = ({ classes, exams, term = null, vacations = [], rotation = null, today, nowHHMM, target, workLimit = null, weekStart = 0 }) => {
  const out = [];
  const lessons = onlyClasses(classes);
  const below = attendanceSummary(lessons)
    .rows.filter((r) => !standing(r, target).ok)
    .map((r) => ({ title: r.cls.title, pct: Math.round(r.pct) }));
  if (below.length) out.push({ id: 'below', classes: below });
  if (workLimit) {
    const week = activityHours(classes, weekStartOf(today, weekStart), term, vacations, rotation);
    const over = overLimit(week.byCategory.work || 0, workLimit);
    if (over > 0) out.push({ id: 'hours', over, limit: workLimit });
  }
  const mark = unmarkedSessions(lessons, today, nowHHMM, term, vacations, rotation).length;
  if (mark) out.push({ id: 'mark', count: mark });
  const score = needsScore(exams, today).length;
  if (score) out.push({ id: 'score', count: score });
  return out;
};
