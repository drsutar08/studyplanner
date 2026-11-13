// Subjects: checking a name, and the numbers on a subject's card. Pure, unit-tested in e2e/subjects.test.mjs.

const norm = (s) => String(s || '').trim().toLocaleLowerCase();

// Translation key of the problem with a subject name, or null. `editingId` is the subject being renamed
// (it may keep its own name).
export const validateSubjectName = (name, subjects, editingId = null) => {
  if (!norm(name)) return 'subjects.errors.name';
  if (subjects.some((s) => s.id !== editingId && norm(s.name) === norm(name))) return 'subjects.errors.duplicate';
  return null;
};

// What a subject's card shows: task counts, focus minutes in `week` (a Set of 'YYYY-MM-DD'), the next open
// task (soonest due), the next exam (today or later) and how many weekly class slots it has.
export const subjectSummary = (subject, { tasks, sessions, exams, classes }, today, week) => {
  const mine = tasks.filter((t) => t.subjectId === subject.id);
  const open = mine.filter((t) => !t.done).sort((a, b) => a.due.localeCompare(b.due) || (a.time || '99:99').localeCompare(b.time || '99:99'));
  const done = mine.length - open.length;
  const nextExam =
    exams
      .filter((e) => e.subjectId === subject.id && e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))[0] || null;
  const weekly = classes.filter((c) => c.subjectId === subject.id && c.kind !== 'activity' && c.repeat === 'weekly').reduce((n, c) => n + (c.days || []).length, 0);
  return {
    total: mine.length,
    done,
    open: open.length,
    nextTask: open[0] || null,
    nextExam,
    classesPerWeek: weekly,
    weekMinutes: sessions.filter((s) => s.subjectId === subject.id && week.has(s.date)).reduce((n, s) => n + s.minutes, 0),
  };
};
