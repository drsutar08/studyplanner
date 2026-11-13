// Free time around today's timetable, for the Smart plan. Pure logic (only uses the class rules), unit
// tested: `npm run test:freetime`. Times are minutes after midnight.
import { classesOn } from './classes';

export const DAY_END = 22 * 60; // the plan doesn't suggest studying after 22:00
const MIN_SLOT = 15; // gaps shorter than this aren't worth planning into

export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const fromMin = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Busy blocks on a day: timed classes (one hour when there is no end time) and timed exams (their duration).
// Overlapping blocks are merged, sorted by start.
export const busyBlocks = ({ classes = [], term = null, vacations = [], exams = [], rotation = null }, key) => {
  const raw = [];
  for (const c of classesOn(classes, key, term, vacations, rotation)) {
    if (!c.start) continue;
    const start = toMin(c.start);
    raw.push({ start, end: c.end ? toMin(c.end) : start + 60 });
  }
  for (const e of exams) {
    if (e.date !== key || !e.time) continue;
    const start = toMin(e.time);
    raw.push({ start, end: Math.min(24 * 60, start + (e.duration || 60)) });
  }
  raw.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const b of raw) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else merged.push({ ...b });
  }
  return merged;
};

// Free gaps between `fromMin` (now, rounded up to 5 minutes) and DAY_END, around the busy blocks.
export const freeSlots = (busy, fromMin, dayEnd = DAY_END) => {
  let cursor = Math.ceil(fromMin / 5) * 5;
  const slots = [];
  for (const b of busy) {
    if (b.end <= cursor) continue;
    if (b.start - cursor >= MIN_SLOT) slots.push({ start: cursor, end: Math.min(b.start, dayEnd) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= dayEnd) break;
  }
  if (dayEnd - cursor >= MIN_SLOT) slots.push({ start: cursor, end: dayEnd });
  return slots.filter((s) => s.end - s.start >= MIN_SLOT);
};

export const freeMinutes = (slots) => slots.reduce((n, s) => n + (s.end - s.start), 0);

// Gives each plan item a clock time: in order, each goes into the earliest free gap that still has room
// for its whole length. Items that fit nowhere today get `at: null`.
export const scheduleIntoSlots = (items, slots) => {
  const room = slots.map((s) => ({ ...s, next: s.start }));
  return items.map((it) => {
    const need = it.task.estimate;
    const slot = room.find((s) => s.end - s.next >= need);
    if (!slot) return { ...it, at: null };
    const at = { start: slot.next, end: slot.next + need };
    slot.next = at.end;
    return { ...it, at };
  });
};
