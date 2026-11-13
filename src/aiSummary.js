// What the AI study helper is told about a student when asked "what should I study now?": a short plain-text
// summary of what's due, what's coming, where they're behind and what they've done lately. Only titles, dates and
// numbers go in (no notes, no task details). Pure.
import { addDays } from './dates';
import { subjectAverages } from './grades';
import { attendanceOf } from './attendance';
import { dueCards } from './flashcards';

export function adviceSummary(state, today) {
  const subjects = state.subjects || [];
  const name = (id) => (subjects.find((s) => s.id === id) || {}).name || 'no subject';
  const open = (state.tasks || []).filter((t) => !t.done && t.due);
  const line = (t) => `- ${t.title} (${name(t.subjectId)}, ${t.estimate || 30} min${t.priority === 'high' ? ', high priority' : ''}, due ${t.due})`;
  const overdue = open.filter((t) => t.due < today);
  const dueToday = open.filter((t) => t.due === today);
  const soon = open.filter((t) => t.due > today && t.due <= addDays(today, 3));
  const exams = (state.exams || []).filter((e) => e.date >= today && e.date <= addDays(today, 21)).sort((a, b) => a.date.localeCompare(b.date));
  const grades = subjectAverages(state.exams || []).filter((g) => g.average < 70);
  const attendance = new Map();
  for (const c of (state.classes || []).filter((x) => x.kind !== 'activity')) {
    const a = attendanceOf(c);
    if (!a.total) continue;
    const cur = attendance.get(c.subjectId) || { attended: 0, total: 0 };
    attendance.set(c.subjectId, { attended: cur.attended + a.attended, total: cur.total + a.total });
  }
  const lowAttendance = [...attendance.entries()].filter(([, a]) => a.attended / a.total < 0.75);
  const weekAgo = addDays(today, -6);
  const focus = new Map();
  for (const s of (state.sessions || []).filter((x) => x.date >= weekAgo && x.date <= today)) focus.set(s.subjectId, (focus.get(s.subjectId) || 0) + (s.minutes || 0));
  const cards = dueCards(state.cards || [], today).length;

  const parts = [];
  const section = (title, rows) => rows.length && parts.push(`${title}:\n${rows.join('\n')}`);
  section('Overdue tasks', overdue.slice(0, 12).map(line));
  section('Due today', dueToday.slice(0, 12).map(line));
  section('Due in the next 3 days', soon.slice(0, 12).map(line));
  section('Exams in the next 3 weeks', exams.slice(0, 8).map((e) => `- ${e.title} (${name(e.subjectId)}) on ${e.date}`));
  section('Subjects with a low grade average', grades.map((g) => `- ${name(g.subjectId)}: ${Math.round(g.average)}%`));
  section('Subjects with attendance under 75%', lowAttendance.map(([id, a]) => `- ${name(id)}: ${Math.round((a.attended / a.total) * 100)}%`));
  section('Focus time in the last 7 days', subjects.map((s) => `- ${s.name}: ${focus.get(s.id) || 0} min`));
  if (cards) parts.push(`Flashcards due for review: ${cards}`);
  return parts.length ? parts.join('\n\n') : 'Nothing is due and no exams are coming up.';
}
