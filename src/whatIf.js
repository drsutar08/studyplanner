// Grade "what-if": the score needed on the exams still to come to reach a target average in a subject, and
// what the subject (and overall) average would be with a given score. Uses the same weighted averages as
// grades.js. Pure, unit-tested in e2e/whatIf.test.mjs.
import { isGraded, percentOf, subjectAverages } from './grades';

export const TARGETS = [50, 60, 70, 75, 80, 90];

const weightOf = (e) => (typeof e.weight === 'number' && e.weight > 0 ? e.weight : 1);

// The graded points so far: sum of percent × weight, and the total weight
const sums = (graded) =>
  graded.filter(isGraded).reduce((acc, e) => ({ points: acc.points + percentOf(e) * weightOf(e), weight: acc.weight + weightOf(e) }), { points: 0, weight: 0 });

// The same score x (percent) on every exam still to come, so that the average reaches `target`.
// `upcoming` is a list of weights (the exams still to come, 1 = a normal exam). Returns
// { needed, status: 'reached' | 'possible' | 'impossible', best, worst, current } where best / worst are the
// averages with 100% / 0% on all of them and current the average now (null with nothing graded).
export const neededScore = ({ graded = [], upcoming = [1], target }) => {
  const { points, weight } = sums(graded);
  const ahead = upcoming.reduce((n, w) => n + (w > 0 ? w : 1), 0) || 1;
  const total = weight + ahead;
  const needed = (target * total - points) / ahead;
  const best = (points + 100 * ahead) / total;
  const worst = points / total;
  const status = needed <= 0 ? 'reached' : needed <= 100 ? 'possible' : 'impossible';
  return { needed: Math.max(0, needed), status, best, worst, current: weight ? points / weight : null };
};

// The subject average with `score` (percent) on each of the exams still to come
export const projectedAverage = ({ graded = [], upcoming = [1], score }) => {
  const { points, weight } = sums(graded);
  const ahead = upcoming.reduce((n, w) => n + (w > 0 ? w : 1), 0);
  return weight + ahead ? (points + score * ahead) / (weight + ahead) : null;
};

// The overall average (every subject counts the same, as on Progress) if `subjectId` ends at `average`.
export const projectedOverall = (exams, subjectId, average) => {
  const subs = subjectAverages(exams).filter((s) => s.subjectId !== subjectId);
  const all = [...subs.map((s) => s.average), average];
  return all.reduce((n, a) => n + a, 0) / all.length;
};
