// Smart reminders: when someone usually studies (from their focus sessions), and a nudge at that time about what's
// due soon. Pure: notifications.js schedules it on phones, and the top bar's list shows it around that time.
import { addDays } from './dates';

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The hour most focus sessions of the last `days` days started in, as 'HH:00', or null with too little to go on
// (fewer than `min` sessions, or no hour with two). Ties go to the later hour (the evening habit, usually).
export function usualStudyTime(sessions, today, { days = 28, min = 3 } = {}) {
  const from = addDays(today, -days);
  const recent = (sessions || []).filter((s) => s.at && s.date >= from && s.date <= today);
  if (recent.length < min) return null;
  const byHour = new Array(24).fill(0);
  for (const s of recent) {
    const h = Number(String(s.at).slice(0, 2));
    if (h >= 0 && h < 24) byHour[h] += 1;
  }
  let best = -1;
  for (let h = 0; h < 24; h++) if (byHour[h] >= 2 && (best < 0 || byHour[h] >= byHour[best])) best = h;
  return best < 0 ? null : `${pad(best)}:00`;
}

// What a nudge on `day` would say: tasks due that day and the next (not done), and exams within 3 days. null when
// there's nothing to say (no nagging on a free day).
export function nudgeFor({ tasks = [], exams = [] }, day) {
  const next = addDays(day, 1);
  const open = tasks.filter((t) => !t.done && t.due);
  const today = open.filter((t) => t.due === day).length;
  const tomorrow = open.filter((t) => t.due === next).length;
  const soon = exams
    .filter((e) => e.date > day && e.date <= addDays(day, 3))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({ title: e.title, date: e.date }));
  if (!today && !tomorrow && !soon.length) return null;
  return { day, today, tomorrow, exam: soon[0] || null };
}

// The next nudge: { at (Date), time ('HH:00'), ...nudgeFor } at the usual time today, or tomorrow when that has
// passed, today has nothing, or a session already started today within the hour before it
export function nextNudge(data, now = new Date(), opts) {
  const today = keyOf(now);
  const time = usualStudyTime(data.sessions, today, opts);
  if (!time) return null;
  const h = Number(time.slice(0, 2));
  const studied = (data.sessions || []).some((s) => s.date === today && s.at && Number(s.at.slice(0, 2)) >= h - 1);
  for (const offset of [0, 1]) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, h, 0, 0, 0);
    if (offset === 0 && (d.getTime() <= now.getTime() || studied)) continue;
    const say = nudgeFor(data, keyOf(d));
    if (say) return { at: d, time, ...say };
  }
  return null;
}

// Whether to show the nudge in the app now: from half an hour before the usual time to 90 minutes after, on a day it
// has something to say, unless a session has started since half an hour before
export function nudgeNow(data, now = new Date(), opts) {
  const today = keyOf(now);
  const time = usualStudyTime(data.sessions, today, opts);
  if (!time) return null;
  const h = Number(time.slice(0, 2));
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < h * 60 - 30 || mins > h * 60 + 90) return null;
  const since = `${pad(Math.max(0, h - 1))}:30`;
  if ((data.sessions || []).some((s) => s.date === today && s.at && s.at >= since)) return null;
  const say = nudgeFor(data, today);
  return say ? { time, ...say } : null;
}
