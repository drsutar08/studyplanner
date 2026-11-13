// Layout for the Calendar's week view: which blocks go in which day column and lane. Pure logic (only uses
// the class rules), unit tested: `npm run test:week`. Times are minutes after midnight.
import { classesOn } from './classes';

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// The 7 date keys of the week containing `key`, starting on `weekStart` (0 = Sunday, 1 = Monday).
export const weekDays = (key, weekStart = 0) => {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const back = (dt.getDay() - weekStart + 7) % 7;
  return Array.from({ length: 7 }, (_, i) => keyOf(new Date(y, m - 1, d - back + i)));
};

// Side-by-side lanes for overlapping blocks within one day. Each block gets `lane` and `lanes` (how many
// lanes its overlap group needs), so the view can split the column width.
export const assignLanes = (blocks) => {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out = [];
  let group = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((b) => b.lane + 1));
    group.forEach((b) => out.push({ ...b, lanes }));
    group = [];
  };
  for (const b of sorted) {
    if (group.length && b.startMin >= groupEnd) flush();
    const laneEnds = [];
    group.forEach((g) => {
      laneEnds[g.lane] = Math.max(laneEnds[g.lane] ?? -1, g.endMin);
    });
    let lane = laneEnds.findIndex((end) => end <= b.startMin);
    if (lane === -1) lane = laneEnds.length;
    group.push({ ...b, lane });
    groupEnd = Math.max(groupEnd, b.endMin);
  }
  if (group.length) flush();
  return out;
};

// Everything shown in the week: per day, the timed blocks (classes, exams, timed tasks) with lanes, and
// counts of untimed tasks / exams; plus the hour range to draw (at least 8:00–20:00, widened to fit).
export const buildWeek = ({ classes = [], term = null, vacations = [], exams = [], tasks = [], rotation = null }, days) => {
  let first = 8 * 60;
  let last = 20 * 60;
  const columns = days.map((key) => {
    const blocks = [];
    for (const c of classesOn(classes, key, term, vacations, rotation)) {
      if (!c.start) continue;
      const startMin = toMin(c.start);
      blocks.push({ id: `c:${c.id}`, kind: 'class', ref: c, title: c.title, subjectId: c.subjectId, startMin, endMin: c.end ? toMin(c.end) : startMin + 60 });
    }
    const dayExams = exams.filter((e) => e.date === key);
    for (const e of dayExams) {
      if (!e.time) continue;
      const startMin = toMin(e.time);
      blocks.push({ id: `e:${e.id}`, kind: 'exam', ref: e, title: e.title, subjectId: e.subjectId, startMin, endMin: Math.min(24 * 60, startMin + (e.duration || 60)) });
    }
    const dayTasks = tasks.filter((t) => t.due === key);
    for (const t of dayTasks) {
      if (!t.time) continue;
      const startMin = toMin(t.time);
      blocks.push({ id: `t:${t.id}`, kind: 'task', ref: t, title: t.title, subjectId: t.subjectId, done: !!t.done, startMin, endMin: Math.min(24 * 60, startMin + Math.max(15, t.estimate || 30)) });
    }
    for (const b of blocks) {
      first = Math.min(first, b.startMin);
      last = Math.max(last, b.endMin);
    }
    return {
      key,
      blocks: assignLanes(blocks),
      untimedTasks: dayTasks.filter((t) => !t.time && !t.done).length,
      untimedExams: dayExams.filter((e) => !e.time).length,
    };
  });
  return { columns, startHour: Math.floor(first / 60), endHour: Math.min(24, Math.ceil(last / 60)) };
};
