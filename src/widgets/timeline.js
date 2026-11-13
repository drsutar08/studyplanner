// What the "Next class" widget should show, and when it should change. Pure logic (only uses the class
// rules), so it is unit tested: `npm run test:widget`.
import { classesOn } from '../classes';

const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const at = (key, hhmm) => {
  const [y, m, d] = key.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi, 0, 0);
};

// Timed classes that have not ended yet, over the next `days` days, soonest first.
// A class without an end time is treated as one hour long.
export const upcomingSessions = (classes, term, vacations, now = new Date(), days = 2, rotation = null) => {
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const key = keyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i));
    for (const cls of classesOn(classes, key, term, vacations, rotation)) {
      if (!cls.start) continue;
      const startAt = at(key, cls.start);
      const endAt = cls.end ? at(key, cls.end) : new Date(startAt.getTime() + 3600000);
      if (endAt > now) out.push({ cls, date: key, startAt, endAt });
    }
  }
  return out.sort((a, b) => a.startAt - b.startAt);
};

// Widget timeline: show the first session now, and switch to the next one as each session ends.
// After the last one ends the widget shows its empty state (session: null).
export const widgetTimeline = (classes, term, vacations, now = new Date(), days = 2, rotation = null) => {
  const sessions = upcomingSessions(classes, term, vacations, now, days, rotation);
  if (sessions.length === 0) return [{ date: now, session: null }];
  const entries = sessions.map((s, i) => ({ date: i === 0 ? now : sessions[i - 1].endAt, session: s }));
  entries.push({ date: sessions[sessions.length - 1].endAt, session: null });
  return entries;
};
