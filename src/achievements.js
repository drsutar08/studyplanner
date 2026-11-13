// Achievements: badges earned from what a student does (streaks, focus hours, sessions, tasks, exam prep plans,
// flashcards). Worked out from the data, so they can't go wrong; the date each was first earned is kept
// (the `achievements` list, [{ id, earnedAt }]) to show it and to celebrate it once. Pure.
import { bestStreak, protectedStreak } from './stats';

// group -> the steps in it (each step is a badge: `${group}-${target}`)
export const BADGE_STEPS = {
  streak: [3, 7, 14, 30],
  hours: [1, 10, 50, 100],
  sessions: [1, 25, 100],
  tasks: [10, 50, 200],
  prep: [1, 5],
  cards: [10, 50],
};
export const BADGE_ICONS = { streak: 'flame', hours: 'time', sessions: 'timer', tasks: 'checkmark-done', prep: 'school', cards: 'albums' };

// how far along each group is
export function badgeValues(state, today, weekStart = 0) {
  const sessions = state.sessions || [];
  const exams = state.exams || [];
  const tasks = state.tasks || [];
  const prepDone = exams.filter((e) => {
    const plan = tasks.filter((t) => t.prepFor === e.id);
    return plan.length > 0 && plan.every((t) => t.done);
  }).length;
  return {
    streak: Math.max(bestStreak(sessions), protectedStreak(sessions, today, weekStart).days),
    hours: Math.floor(sessions.reduce((n, s) => n + (s.minutes || 0), 0) / 60),
    sessions: sessions.filter((s) => s.minutes > 0).length,
    tasks: tasks.filter((t) => t.done).length + (state.archive || []).length,
    prep: prepDone,
    cards: (state.cards || []).filter((c) => c.reps >= 3).length,
  };
}

// Every badge: { id, group, target, value, earned, earnedAt }, in groups and step order
export function badges(state, today, weekStart = 0) {
  const values = badgeValues(state, today, weekStart);
  const when = Object.fromEntries((state.achievements || []).map((a) => [a.id, a.earnedAt]));
  return Object.entries(BADGE_STEPS).flatMap(([group, steps]) =>
    steps.map((target) => {
      const id = `${group}-${target}`;
      const earned = values[group] >= target;
      return { id, group, target, value: Math.min(values[group], target), earned, earnedAt: earned ? when[id] || null : null };
    })
  );
}

// Badges earned but not yet recorded: [{ id, earnedAt: today }] to add (and celebrate)
export const newlyEarned = (list, today) => list.filter((b) => b.earned && !b.earnedAt).map((b) => ({ id: b.id, earnedAt: today }));

// The next badge in each group still to earn, closest first (for "almost there")
export const nextUp = (list) =>
  Object.keys(BADGE_STEPS)
    .map((g) => list.find((b) => b.group === g && !b.earned))
    .filter(Boolean)
    .sort((a, b) => b.value / b.target - a.value / a.target);
