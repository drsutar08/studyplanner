// Study streaks and focus totals from the focus sessions ({ date: 'YYYY-MM-DD', minutes }).
// Pure, unit-tested in e2e/stats.test.mjs.

const keyOf = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const plusDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return keyOf(new Date(y, m - 1, d + n));
};

// Days in a row with focus time, ending today, or yesterday when nothing has been done yet today
// (so the streak doesn't look broken first thing in the morning).
export const currentStreak = (sessions, today) => {
  const studied = new Set(sessions.filter((s) => s.minutes > 0).map((s) => s.date));
  let cursor = studied.has(today) ? today : plusDays(today, -1);
  let n = 0;
  while (studied.has(cursor)) {
    n += 1;
    cursor = plusDays(cursor, -1);
  }
  return n;
};

// The streak with protection: one missed day a week (the week starting on `weekStart`, 0 = Sunday) doesn't break it,
// as long as the days either side of it were studied. { days: days studied in the run, saved: the missed days it
// got over }. Two missed days in a row always end it.
const weekOf = (key, weekStart) => {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return plusDays(key, -((dt.getDay() - weekStart + 7) % 7));
};
export const protectedStreak = (sessions, today, weekStart = 0) => {
  const studied = new Set(sessions.filter((s) => s.minutes > 0).map((s) => s.date));
  let cursor = studied.has(today) ? today : plusDays(today, -1);
  let days = 0;
  const saved = [];
  for (;;) {
    if (studied.has(cursor)) {
      days += 1;
      cursor = plusDays(cursor, -1);
      continue;
    }
    const before = plusDays(cursor, -1);
    const usedThisWeek = saved.some((d) => weekOf(d, weekStart) === weekOf(cursor, weekStart));
    if (days > 0 && studied.has(before) && !usedThisWeek) {
      saved.push(cursor);
      cursor = before;
      continue;
    }
    return { days, saved };
  }
};

// The longest run of days in a row with focus time, ever.
export const bestStreak = (sessions) => {
  const days = [...new Set(sessions.filter((s) => s.minutes > 0).map((s) => s.date))].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    run = prev && plusDays(prev, 1) === d ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
};

export const focusMinutes = (sessions, date = null) => sessions.filter((s) => !date || s.date === date).reduce((n, s) => n + (s.minutes || 0), 0);
