import { daysBetween, dateKey } from './dates';

// Rule-based daily planner. No network and no AI model: it scores every unfinished task, then fills the
// time you have with the highest-scoring ones. The scoring is deliberately simple so it is easy to explain:
//   overdue / due soon  +  priority  +  an exam coming up in the same subject
const HORIZON_DAYS = 7; // tasks due further out than this are not planned today
// Reasons hold no text: `label` is a translation key and `params` its values. The UI shows t(label, params).

export function scoreTask(task, exams, today) {
  const d = daysBetween(today, task.due);
  let score = 0;
  const reasons = [];

  if (d < 0) {
    score += 100 + Math.min(-d, 10) * 3;
    reasons.push({ key: 'overdue', label: 'plan.reason.overdue', params: { days: -d }, tone: 'danger' });
  } else if (d === 0) {
    score += 80;
    reasons.push({ key: 'today', label: 'plan.reason.today', params: {}, tone: 'accent' });
  } else if (d === 1) {
    score += 50;
    reasons.push({ key: 'tomorrow', label: 'plan.reason.tomorrow', params: {}, tone: 'accent' });
  } else {
    score += Math.max(0, 40 - d * 4);
  }

  if (task.priority === 'high') {
    score += 30;
    reasons.push({ key: 'high', label: 'plan.reason.high', params: {}, tone: 'danger' });
  } else if (task.priority === 'low') {
    score -= 5;
  } else {
    score += 10;
  }

  // An exam coming up boosts the task. A task linked to an exam (by hand or by a prep plan) counts that exam, up to
  // 3 weeks out and with a bigger boost; any other task counts the nearest exam in its subject, up to 2 weeks out.
  const linkedId = task.examId || task.prepFor;
  const linked = linkedId ? exams.find((e) => e.id === linkedId && e.date >= today) : null;
  let next = null;
  if (linked) next = { days: daysBetween(today, linked.date), linked: true };
  else if (task.subjectId) {
    next = exams
      .filter((e) => e.subjectId === task.subjectId && e.date >= today)
      .map((e) => ({ days: daysBetween(today, e.date) }))
      .sort((a, b) => a.days - b.days)[0];
  }
  if (next && next.days <= (next.linked ? 21 : 14)) {
    const [near, mid, far] = next.linked ? [55, 40, 25] : [40, 25, 10];
    score += next.days <= 3 ? near : next.days <= 7 ? mid : next.days <= 14 ? far : 10;
    reasons.push({
      key: 'exam',
      label: next.days === 0 ? 'plan.reason.examToday' : next.days === 1 ? 'plan.reason.examTomorrow' : 'plan.reason.examIn',
      params: { days: next.days },
      tone: next.days <= 3 ? 'danger' : 'warn',
    });
  }

  return { score, reasons };
}

// Returns the suggested plan for `budget` minutes.
//   items:   [{ task, score, reasons, startMin, endMin }] in the order to do them
//   skipped: unfinished tasks that were due soon but did not fit
export function buildPlan({ tasks, exams = [], budget, today = dateKey() }) {
  const candidates = tasks
    .filter((t) => !t.done && daysBetween(today, t.due) <= HORIZON_DAYS)
    .map((task) => ({ task, ...scoreTask(task, exams, today) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.task.due.localeCompare(b.task.due) ||
        a.task.estimate - b.task.estimate
    );

  const items = [];
  const skipped = [];
  let used = 0;

  for (const c of candidates) {
    const fits = used + c.task.estimate <= budget;
    // Always include the single most important task, even if it is longer than the time available
    if (fits || items.length === 0) {
      items.push({ ...c, startMin: used, endMin: used + c.task.estimate });
      used += c.task.estimate;
    } else {
      skipped.push(c);
    }
  }

  return { items, skipped, totalMinutes: used, budget, overBudget: used > budget };
}

// Time left for the day: the daily goal minus what has already been focused, in 15-minute steps.
export function defaultBudget(dailyGoal, minutesToday) {
  const left = Math.max(0, dailyGoal - minutesToday);
  return Math.max(30, Math.round(left / 15) * 15);
}
