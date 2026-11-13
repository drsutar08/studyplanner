// The weekly report: per subject, focus time this week against last week and against its weekly goal, tasks
// done and overdue, the grade average, attendance and the next exam, and which subjects are falling behind.
// Pure, unit-tested in e2e/report.test.mjs.
import { average, isGraded } from './grades';
import { attendanceOf } from './attendance';

// Weekly goal choices for a subject, in minutes (0 = no goal)
export const GOAL_OPTIONS = [0, 60, 120, 180, 300, 420];

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plusDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return keyOf(new Date(y, m - 1, d + n));
};
const weekKeys = (start) => Array.from({ length: 7 }, (_, i) => plusDays(start, i));

export const goalOf = (subject) => (subject && subject.weeklyGoal > 0 ? subject.weeklyGoal : 0);

// How far along a goal should be by `today` in the week starting `start`: 1 for a past week, else the share of
// days gone (today counts as half: the day isn't over)
export const weekElapsed = (start, today) => {
  const end = plusDays(start, 6);
  if (today > end) return 1;
  if (today < start) return 0;
  const [y1, m1, d1] = start.split('-').map(Number);
  const [y2, m2, d2] = today.split('-').map(Number);
  const days = Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
  return (days + 0.5) / 7;
};

// A subject's weekly goal: { goal, minutes, pct (0-100+), left, onTrack } or null without a goal
export const goalProgress = (subject, sessions, start, today) => {
  const goal = goalOf(subject);
  if (!goal) return null;
  const days = new Set(weekKeys(start));
  const minutes = sessions.filter((s) => s.subjectId === subject.id && days.has(s.date)).reduce((n, s) => n + (s.minutes || 0), 0);
  return { goal, minutes, pct: Math.round((minutes / goal) * 100), left: Math.max(0, goal - minutes), onTrack: minutes >= goal * weekElapsed(start, today) - 1 };
};

const EXAM_SOON_DAYS = 14;
const LOW_GRADE = 60;

// { start, end, total, prevTotal, done, overdue, subjects: [...], behind: [...] }. Each subject:
// { id, name, color, minutes, prevMinutes, goal, done, overdue, average, attendance, nextExam, daysToExam,
//   reasons: ['goal' | 'examSoon' | 'drop' | 'overdue' | 'lowGrade' | 'attendance'] }.
// `behind` lists the subjects with any reason, most reasons first.
export const weeklyReport = ({ subjects = [], tasks = [], sessions = [], exams = [], classes = [] }, start, { today, attendanceTarget = 75 } = {}) => {
  const end = plusDays(start, 6);
  const days = new Set(weekKeys(start));
  const prevDays = new Set(weekKeys(plusDays(start, -7)));
  const elapsed = weekElapsed(start, today);
  // overdue as of the end of the week, or today for the current week
  const cutoff = today < end ? today : plusDays(end, 1);
  const minutesIn = (set, id) => sessions.filter((s) => set.has(s.date) && (id === undefined || s.subjectId === id)).reduce((n, s) => n + (s.minutes || 0), 0);
  const doneIn = (list) => list.filter((t) => t.done && t.completedAt && days.has(String(t.completedAt).slice(0, 10))).length;
  const overdueIn = (list) => list.filter((t) => !t.done && t.due < cutoff).length;

  const rows = subjects.map((sb) => {
    const mine = tasks.filter((t) => t.subjectId === sb.id);
    const graded = exams.filter((e) => e.subjectId === sb.id && isGraded(e));
    const att = classes
      .filter((c) => c.subjectId === sb.id && c.kind !== 'activity')
      .map(attendanceOf)
      .reduce((a, x) => ({ attended: a.attended + x.attended, total: a.total + x.total }), { attended: 0, total: 0 });
    const next = exams.filter((e) => e.subjectId === sb.id && e.date >= today && !isGraded(e)).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
    const daysToExam = next ? Math.round((new Date(`${next.date}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000) : null;
    const minutes = minutesIn(days, sb.id);
    const prevMinutes = minutesIn(prevDays, sb.id);
    const goal = goalOf(sb);
    const row = {
      id: sb.id,
      name: sb.name,
      color: sb.color,
      minutes,
      prevMinutes,
      goal,
      done: doneIn(mine),
      overdue: overdueIn(mine),
      average: graded.length ? Math.round(average(graded) * 10) / 10 : null,
      attendance: att.total ? (att.attended / att.total) * 100 : null,
      nextExam: next,
      daysToExam,
    };
    const reasons = [];
    if (goal && minutes < goal * elapsed - 1) reasons.push('goal');
    if (next && today <= end && daysToExam <= EXAM_SOON_DAYS && minutes < 60) reasons.push('examSoon'); // about the week still going
    if (prevMinutes >= 60 && minutes <= prevMinutes / 2 && elapsed >= 1) reasons.push('drop');
    if (row.overdue > 0) reasons.push('overdue');
    if (row.average !== null && row.average < LOW_GRADE) reasons.push('lowGrade');
    if (row.attendance !== null && att.total >= 3 && row.attendance < attendanceTarget) reasons.push('attendance');
    return { ...row, reasons };
  });

  return {
    start,
    end,
    total: minutesIn(days),
    prevTotal: minutesIn(prevDays),
    done: doneIn(tasks),
    overdue: overdueIn(tasks),
    subjects: [...rows].sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name)),
    behind: rows.filter((r) => r.reasons.length).sort((a, b) => b.reasons.length - a.reasons.length || (a.daysToExam ?? 999) - (b.daysToExam ?? 999)),
  };
};

// The weekly report notification: when it goes out (7 PM on the last day of the week; next week's once that has
// passed) and what it says: the week's report from weeklyReport() at that time. { at: Date, report }
export const REPORT_HOUR = 19;
export const reportNotice = (data, { now = new Date(), weekStart = 0, attendanceTarget } = {}) => {
  const today = keyOf(now);
  // the start of this week
  const back = (now.getDay() - weekStart + 7) % 7;
  let start = plusDays(today, -back);
  const atFor = (s) => {
    const [y, m, d] = plusDays(s, 6).split('-').map(Number);
    return new Date(y, m - 1, d, REPORT_HOUR, 0, 0, 0);
  };
  let at = atFor(start);
  if (at.getTime() <= now.getTime()) {
    start = plusDays(start, 7);
    at = atFor(start);
  }
  // the report as it would read that evening (counted as the week's last day)
  return { at, report: weeklyReport(data, start, { today: plusDays(start, 6), attendanceTarget }) };
};
