// What the "Today" home-screen widget shows: tasks still to do today (overdue ones too), the first few of them,
// focus minutes against the daily goal, and flashcards due. Pure, so it is unit tested (e2e/widget.test.mjs).

// cardsDue: as the dashboard counts them (flashcards.js dueCards, with the day's limit on new cards)
export function todaySummary({ tasks = [], sessions = [], cardsDue = 0, dailyGoal = 60, today, shown = 3 }) {
  const open = tasks.filter((x) => !x.done && x.due <= today);
  // overdue first, then by time of day (untimed last), then high priority first
  const rank = { high: 0, med: 1, low: 2 };
  const order = [...open].sort(
    (a, b) => a.due.localeCompare(b.due) || (a.time || '99').localeCompare(b.time || '99') || (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1) || a.title.localeCompare(b.title)
  );
  const minutes = sessions.filter((s) => s.date === today).reduce((n, s) => n + (s.minutes || 0), 0);
  return {
    left: open.length,
    overdue: open.filter((x) => x.due < today).length,
    done: tasks.filter((x) => x.done && x.due === today).length,
    titles: order.slice(0, shown).map((x) => x.title),
    minutes,
    goal: dailyGoal,
    cardsDue,
  };
}
