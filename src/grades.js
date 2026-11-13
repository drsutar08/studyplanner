// Grades: a score per exam, averages per subject and overall, and GPA conversions.
// Pure functions with no imports, so they can be unit tested: `npm run test:grades`.
//
// An exam's result is stored on the exam: `score` (a number), `outOf` (default 100) and `weight`
// (1 by default; a final can count 2× or 3×). An exam without a score isn't graded yet.

// a missing 'out of' means 100; an 'out of' of 0 can't be graded
const outOfOf = (e) => (e.outOf == null ? 100 : e.outOf);

export const isGraded = (e) => typeof e.score === 'number' && Number.isFinite(e.score) && outOfOf(e) > 0;

// 0–100 (can go above 100 for extra credit)
export const percentOf = (e) => (isGraded(e) ? (e.score / outOfOf(e)) * 100 : null);

const weightOf = (e) => (typeof e.weight === 'number' && e.weight > 0 ? e.weight : 1);

// Weighted average percent of a list of exams, or null when none is graded.
export const average = (exams) => {
  const graded = exams.filter(isGraded);
  const total = graded.reduce((n, e) => n + weightOf(e), 0);
  return total ? graded.reduce((n, e) => n + percentOf(e) * weightOf(e), 0) / total : null;
};

// Per subject: { subjectId, average, count, exams (newest first) }, best average first. Exams without a
// subject are grouped under subjectId null.
export const subjectAverages = (exams) => {
  const by = new Map();
  for (const e of exams.filter(isGraded)) {
    const k = e.subjectId ?? null;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(e);
  }
  return [...by.entries()]
    .map(([subjectId, list]) => ({ subjectId, average: average(list), count: list.length, exams: [...list].sort((a, b) => b.date.localeCompare(a.date)) }))
    .sort((a, b) => b.average - a.average);
};

// Overall: every subject counts the same, however many exams it has. null with nothing graded.
export const overallAverage = (exams) => {
  const subs = subjectAverages(exams);
  return subs.length ? subs.reduce((n, s) => n + s.average, 0) / subs.length : null;
};

// Letter grade on the common US scale
const LETTERS = [
  [93, 'A', 4.0],
  [90, 'A-', 3.7],
  [87, 'B+', 3.3],
  [83, 'B', 3.0],
  [80, 'B-', 2.7],
  [77, 'C+', 2.3],
  [73, 'C', 2.0],
  [70, 'C-', 1.7],
  [67, 'D+', 1.3],
  [63, 'D', 1.0],
  [60, 'D-', 0.7],
  [0, 'F', 0],
];
export const letterOf = (percent) => (LETTERS.find(([min]) => percent >= min) || LETTERS[LETTERS.length - 1])[1];
export const gpa4Of = (percent) => (LETTERS.find(([min]) => percent >= min) || LETTERS[LETTERS.length - 1])[2];
// 10-point CGPA (as used in India): percent / 9.5, capped at 10
export const gpa10Of = (percent) => Math.min(10, Math.max(0, percent / 9.5));

// Overall GPA: the mean of the subjects' GPAs on the chosen scale ('gpa4' | 'gpa10'). null with nothing graded.
export const overallGpa = (exams, scale) => {
  const subs = subjectAverages(exams);
  if (!subs.length) return null;
  const conv = scale === 'gpa10' ? gpa10Of : gpa4Of;
  return subs.reduce((n, s) => n + conv(s.average), 0) / subs.length;
};

// Past exams that still need a score, most recent first
const NO_SCORE = ['missed', 'excused', 'cancelled'];
export const needsScore = (exams, today) =>
  exams.filter((e) => e.date < today && !isGraded(e) && !NO_SCORE.includes(e.attendance)).sort((a, b) => b.date.localeCompare(a.date));

// Checks the result fields from the exam form (strings as typed). Returns a translation key or null.
// An empty score means "not graded yet" and is fine.
export const validateResult = (scoreText, outOfText) => {
  const s = String(scoreText ?? '').trim();
  if (!s) return null;
  const score = Number(s.replace(',', '.'));
  const outOf = Number(String(outOfText ?? '').trim().replace(',', '.') || 100);
  if (!Number.isFinite(score) || score < 0) return 'grades.errors.score';
  if (!Number.isFinite(outOf) || outOf <= 0) return 'grades.errors.outOf';
  if (score > outOf * 2) return 'grades.errors.tooHigh';
  return null;
};

// A subject's scores over time, oldest first: { points: [{ id, date, pct, title }], change } where change is
// the last score minus the first (percentage points), null with fewer than two. Ties on a day keep their order.
export const gradeTrend = (exams) => {
  const points = exams
    .filter(isGraded)
    .map((e, i) => ({ id: e.id, date: e.date, pct: percentOf(e), title: e.title, i }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.i - b.i)
    .map(({ i, ...p }) => p);
  return { points, change: points.length >= 2 ? points[points.length - 1].pct - points[0].pct : null };
};
