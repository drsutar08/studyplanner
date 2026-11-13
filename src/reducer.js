// The app's data and every change to it: a pure reducer, (state, action) -> state. src/store.js keeps it per
// account and saves it; e2e/store.test.mjs tests it directly. (`t` is a task throughout this file.)
import { review as reviewCard } from './flashcards';
import { dateKey, addDays, weekday } from './dates';
import { pausedOn } from './vacations';
import { addStep, toggleStep, freshSteps } from './subtasks';
import { markSession, STATUSES } from './attendance';
import { hhmmNow as nowHHMM } from './clock';
import { ACTIVITY_CATEGORIES } from './classes';
import { applyRows, LISTS } from './cloud/sync';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// The editable fields of an exam, taken from an ADD_EXAM / UPDATE_EXAM action.
const examFields = (a) => ({
  title: a.title,
  subjectId: a.subjectId ?? null,
  kind: a.kind || 'Exam',
  date: a.date,
  time: a.time || null,
  duration: a.duration || 60,
  mode: a.mode === 'online' ? 'online' : 'inPerson',
  building: a.building || '',
  room: a.room || '',
  link: a.link || '',
  notes: a.notes || '',
  // the result (grades): score / outOf, counted `weight` times in averages
  ...(typeof a.score === 'number' && Number.isFinite(a.score) ? { score: a.score, outOf: a.outOf > 0 ? a.outOf : 100, weight: a.weight > 0 ? a.weight : 1 } : {}),
});

// An exam with a score was sat
const satIfScored = (e) => (typeof e.score === 'number' ? { ...e, attendance: 'attended' } : e);

// The editable fields of a class, taken from an ADD_CLASS / UPDATE_CLASS action. See classes.js for the rules.
const classFields = (a) => {
  const repeat = a.repeat === 'weekly' || a.repeat === 'rotation' ? a.repeat : 'once';
  const once = repeat === 'once';
  const range = once ? 'none' : ['term', 'manual'].includes(a.range) ? a.range : 'none';
  const online = a.mode === 'online';
  const weeks = repeat === 'weekly' && Array.isArray(a.rotationWeeks) ? [...a.rotationWeeks].sort() : [];
  return {
    title: a.title,
    subjectId: a.subjectId ?? null,
    teacher: a.teacher || '',
    repeat,
    date: once ? a.date : null,
    days: repeat === 'weekly' ? [...a.days].sort() : [],
    ...(repeat === 'rotation' ? { rotationDays: [...(a.rotationDays || [])].sort() } : {}),
    ...(weeks.length ? { rotationWeeks: weeks } : {}),
    start: a.start || null,
    end: a.end || null,
    range,
    rangeStart: range === 'manual' ? a.rangeStart : null,
    rangeEnd: range === 'manual' ? a.rangeEnd : null,
    mode: online ? 'online' : 'inPerson',
    location: online ? '' : a.location || '',
    link: online ? a.link || '' : '',
    notes: a.notes || '',
    // an activity (club, sport, work...) has a category instead of a subject
    ...(a.kind === 'activity' ? { kind: 'activity', category: ACTIVITY_CATEGORIES.includes(a.category) ? a.category : 'other', subjectId: null } : {}),
  };
};

// The exam link on an edited task: `examId` (by hand) is set or cleared when the form sends it. Choosing a different
// exam, or none, also drops the link a generated prep plan gave it (`prepFor`).
const examLink = (t, a) => {
  if (!('examId' in a)) return {};
  const examId = a.examId || undefined;
  return { examId, ...(t.prepFor && t.prepFor !== examId ? { prepFor: undefined } : {}) };
};

export const initial = { subjects: [], tasks: [], sessions: [], exams: [], recurring: [], classes: [], term: null, vacations: [], rotation: null, groups: [], archive: [], cards: [], achievements: [], ready: false, owner: null };

const vacationFields = (a) => ({ title: a.title, start: a.start, end: a.end, pause: a.pause !== false, notes: a.notes || '' });

export function reducer(state, a) {
  switch (a.type) {
    case 'RESET':
      return { ...state, subjects: [], tasks: [], sessions: [], exams: [], recurring: [], classes: [], term: null, vacations: [], rotation: null, groups: [], archive: [], cards: [], achievements: [] };

    case 'HYDRATE':
      return { ...state, exams: [], recurring: [], classes: [], term: null, vacations: [], rotation: null, groups: [], archive: [], cards: [], achievements: [], ...a.data, ready: true, loadFailed: false, owner: a.owner ?? null };

    // Used by "Restore from backup" (and its Undo): swap in a whole set of data
    case 'REPLACE_DATA':
      return {
        ...state,
        subjects: a.data.subjects,
        tasks: a.data.tasks,
        sessions: a.data.sessions,
        exams: a.data.exams || [],
        recurring: a.data.recurring || [],
        classes: a.data.classes || [],
        term: a.data.term || null,
        vacations: a.data.vacations || [],
        rotation: a.data.rotation || null,
        groups: a.data.groups || [],
        archive: a.data.archive || [],
        cards: a.data.cards || [],
        achievements: a.data.achievements || [],
      };

    // A task photo is now in Storage (cloud/photos.js): { taskId, attachmentId, path }. The picture stays here too.
    case 'SET_PHOTO_PATH':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === a.taskId && t.attachments ? { ...t, attachments: t.attachments.map((x) => (x.id === a.attachmentId ? { ...x, path: a.path } : x)) } : t
        ),
      };

    // Rows from the account's other devices (cloud sync): { rows, base } — see cloud/sync.js applyRows
    case 'APPLY_REMOTE': {
      const res = applyRows(state, a.rows, a.base, undefined, a.baseData);
      if (!res.changed) return state;
      const keys = [...Object.keys(LISTS), 'term', 'rotation'];
      return { ...state, ...Object.fromEntries(keys.map((k) => [k, res.data[k]])) };
    }

    // The account's data couldn't be read (a device new to the account, offline): the app offers "Try again"
    case 'LOAD_FAILED':
      return { ...initial, loadFailed: true, owner: a.owner ?? null };

    case 'UNLOAD':
      return { ...initial };

    case 'ADD_SUBJECT':
      return {
        ...state,
        subjects: [...state.subjects, { id: uid(), name: a.name, color: a.color, ...(a.weeklyGoal > 0 ? { weeklyGoal: a.weeklyGoal } : {}) }],
      };

    // Rename a subject, change its colour or its weekly goal (minutes, 0 = none); its tasks, classes and exams keep pointing at it
    case 'UPDATE_SUBJECT':
      return {
        ...state,
        subjects: state.subjects.map((x) => {
          if (x.id !== a.id) return x;
          const { weeklyGoal, ...rest } = { ...x, name: a.name ?? x.name, color: a.color ?? x.color };
          const goal = 'weeklyGoal' in a ? a.weeklyGoal : weeklyGoal;
          return goal > 0 ? { ...rest, weeklyGoal: goal } : rest;
        }),
      };

    case 'DELETE_SUBJECT':
      return {
        ...state,
        subjects: state.subjects.filter((s) => s.id !== a.id),
        tasks: state.tasks.map((t) => (t.subjectId === a.id ? { ...t, subjectId: null } : t)),
        classes: state.classes.map((c) => (c.subjectId === a.id ? { ...c, subjectId: null } : c)),
        cards: (state.cards || []).map((c) => (c.subjectId === a.id ? { ...c, subjectId: null } : c)),
      };

    case 'ADD_CLASS':
      return { ...state, classes: [...state.classes, { id: uid(), createdAt: dateKey(), ...classFields(a) }] };

    case 'UPDATE_CLASS':
      return { ...state, classes: state.classes.map((c) => (c.id === a.id ? { ...c, ...classFields(a) } : c)) };

    // Attendance for one session: { id, date, status: 'attended' | 'missed' | 'excused' | 'cancelled' | null }. The same status again clears it.
    case 'MARK_ATTENDANCE':
      return {
        ...state,
        classes: state.classes.map((c) => (c.id === a.id ? { ...c, attendance: markSession(c.attendance, a.date, a.status) } : c)),
      };

    // Many sessions at once: { items: [{ id, date }], status } sets each (status null clears them: the Undo)
    case 'SET_ATTENDANCE_MANY':
      return {
        ...state,
        classes: state.classes.map((c) => {
          const mine = a.items.filter((it) => it.id === c.id);
          if (!mine.length) return c;
          const attendance = { ...(c.attendance || {}) };
          for (const it of mine) {
            if (STATUSES.includes(a.status)) attendance[it.date] = a.status;
            else delete attendance[it.date];
          }
          return { ...c, attendance };
        }),
      };

    case 'DELETE_CLASS':
      return { ...state, classes: state.classes.filter((c) => c.id !== a.id) };

    case 'RESTORE_CLASS':
      return state.classes.some((c) => c.id === a.cls.id) ? state : { ...state, classes: [...state.classes, a.cls] };

    // Breaks. Each change re-plans the upcoming repeating-task copies around the paused days.
    case 'ADD_VACATION':
      return replanRepeats({ ...state, vacations: [...state.vacations, { id: uid(), ...vacationFields(a) }] });

    case 'UPDATE_VACATION':
      return replanRepeats({ ...state, vacations: state.vacations.map((v) => (v.id === a.id ? { ...v, ...vacationFields(a) } : v)) });

    case 'DELETE_VACATION':
      return replanRepeats({ ...state, vacations: state.vacations.filter((v) => v.id !== a.id) });

    case 'RESTORE_VACATION':
      return state.vacations.some((v) => v.id === a.vacation.id) ? state : replanRepeats({ ...state, vacations: [...state.vacations, a.vacation] });

    // A calendar file import (ics.js importPlan): { batch, classes, exams, vacations }. Every record gets the id
    // `${batch}-${n}`, so UNDO_IMPORT { batch } takes exactly that import back out.
    case 'IMPORT_RECORDS':
      return replanRepeats(addBatch(state, a));

    case 'UNDO_IMPORT':
      return replanRepeats(removeBatch(state, a.batch));

    // Study groups (share.js): { group, plan }. Joining the same group again (a newer link) swaps its old
    // records for the new ones. A rotation comes along only when there was none.
    case 'JOIN_GROUP': {
      const old = (state.groups || []).find((g) => g.id === a.group.id);
      const base = old ? removeBatch(state, old.batch) : state;
      const next = addBatch(base, { batch: a.group.batch, ...a.plan });
      return replanRepeats({
        ...next,
        rotation: next.rotation || a.plan.rotation || null,
        // the board's tasks already copied (groupTasks.js) stay remembered across updates
        groups: [...(next.groups || []).filter((g) => g.id !== a.group.id), old && old.copied ? { ...a.group, copied: old.copied } : a.group],
      });
    }

    // A live group's shared tasks (groupTasks.js reconcileGroupTasks): { groupId, add, update, remove, copied }
    case 'SYNC_GROUP_TASKS': {
      const gone = new Set(a.remove);
      const patches = Object.fromEntries(a.update.map((u) => [u.id, u.patch]));
      const have = new Set(state.tasks.map((t) => t.id));
      return {
        ...state,
        tasks: [...state.tasks.filter((t) => !gone.has(t.id)).map((t) => (patches[t.id] ? { ...t, ...patches[t.id] } : t)), ...a.add.filter((t) => !have.has(t.id))],
        groups: (state.groups || []).map((g) => (g.id === a.groupId ? { ...g, copied: a.copied } : g)),
      };
    }

    case 'LEAVE_GROUP': {
      const g = (state.groups || []).find((x) => x.id === a.id);
      if (!g) return state;
      const left = removeBatch(state, g.batch);
      // its shared tasks go too, unless done
      return replanRepeats({ ...left, tasks: left.tasks.filter((t) => t.fromGroup !== a.id || t.done), groups: state.groups.filter((x) => x.id !== a.id) });
    }

    // Undo for joining or leaving a group: put these lists back exactly as they were
    case 'RESTORE_LISTS': {
      const keys = ['subjects', 'tasks', 'classes', 'exams', 'vacations', 'rotation', 'groups', 'archive', 'cards', 'achievements'].filter((k) => k in a.lists);
      return replanRepeats({ ...state, ...Object.fromEntries(keys.map((k) => [k, a.lists[k]])) });
    }

    // The shared term dates that "Term" classes follow
    // The rotating timetable (null turns it off). See classes.js for how a day's letter / week is counted.
    case 'SET_ROTATION':
      return { ...state, rotation: a.rotation || null };

    case 'SET_TERM':
      return { ...state, term: a.term ? { start: a.term.start, end: a.term.end } : null };

    case 'ADD_TASK':
      return {
        ...state,
        tasks: [
          ...state.tasks,
          {
            id: a.id || uid(), // given by quick add, so its Undo and Edit can find it
            title: a.title,
            subjectId: a.subjectId,
            due: a.due,
            time: a.time || null,
            notes: a.notes || '',
            estimate: a.estimate,
            priority: a.priority || 'med',
            done: false,
            completedAt: null,
            ...(a.classId ? { classId: a.classId } : {}), // homework added from a class
            ...(a.examId ? { examId: a.examId } : {}), // linked by hand to an exam
            ...(a.subtasks && a.subtasks.length ? { subtasks: a.subtasks } : {}), // steps
            ...(a.attachments && a.attachments.length ? { attachments: a.attachments } : {}), // links and photos
          },
        ],
      };

    case 'TOGGLE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === a.id
            ? { ...t, done: !t.done, completedAt: !t.done ? dateKey() : null, snoozedUntil: null }
            : t
        ),
      };

    // Add a subtask straight from the task card
    case 'ADD_SUBTASK':
      return { ...state, tasks: state.tasks.map((t) => (t.id === a.id ? { ...t, subtasks: addStep(t.subtasks || [], a.title) } : t)) };

    case 'TOGGLE_SUBTASK':
      return { ...state, tasks: state.tasks.map((t) => (t.id === a.id ? { ...t, subtasks: toggleStep(t.subtasks || [], a.stepId) } : t)) };

    // From the "Mark done" button on a reminder: only ever marks done (a second tap must not reopen it)
    case 'COMPLETE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === a.id && !t.done ? { ...t, done: true, completedAt: dateKey(), snoozedUntil: null } : t)),
      };

    // From the "Snooze" button: remind again at `until` (ms since epoch)
    case 'SNOOZE_TASK':
      return { ...state, tasks: state.tasks.map((t) => (t.id === a.id && !t.done ? { ...t, snoozedUntil: a.until } : t)) };

    case 'DELETE_TASK':
      return { ...state, tasks: state.tasks.filter((t) => t.id !== a.id) };

    case 'LOG_SESSION':
      return {
        ...state,
        sessions: [
          ...state.sessions,
          {
            id: uid(),
            // a session that ran out while the app was closed is logged on the day it ended
            date: typeof a.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : dateKey(),
            minutes: a.minutes,
            subjectId: a.subjectId ?? null,
            taskId: a.taskId ?? null,
            at: typeof a.at === 'string' ? a.at : nowHHMM(), // when it ended, for the day's session log
          },
        ],
      };

    // A focus session logged by mistake; RESTORE_SESSION puts it back (Undo)
    case 'DELETE_SESSION':
      return { ...state, sessions: state.sessions.filter((s) => s.id !== a.id) };

    case 'RESTORE_SESSION':
      return state.sessions.some((s) => s.id === a.session.id) ? state : { ...state, sessions: [...state.sessions, a.session] };

    case 'ADD_EXAM':
      return {
        ...state,
        exams: [...state.exams, satIfScored({ id: uid(), ...examFields(a) })],
      };

    // Exam attendance: { id, status: 'attended' | 'missed' | 'excused' | 'cancelled' | null }. The same status again clears it.
    case 'MARK_EXAM_ATTENDANCE':
      return {
        ...state,
        exams: state.exams.map((e) => {
          if (e.id !== a.id) return e;
          const { attendance, ...rest } = e;
          return STATUSES.includes(a.status) && a.status !== attendance ? { ...rest, attendance: a.status } : rest;
        }),
      };

    case 'DELETE_EXAM':
      return {
        ...state,
        exams: state.exams.filter((e) => e.id !== a.id),
        // tasks linked by hand to it are kept, just unlinked
        tasks: (state.tasks || []).some((t) => t.examId === a.id) ? state.tasks.map((t) => (t.examId === a.id ? { ...t, examId: undefined } : t)) : state.tasks,
      };

    // A repeating task is stored once as a template; real tasks are generated from it for the next HORIZON days.
    case 'ADD_RECURRING':
      return materialize({
        ...state,
        recurring: [
          ...state.recurring,
          {
            id: uid(),
            title: a.title,
            subjectId: a.subjectId ?? null,
            time: a.time || null,
            notes: a.notes || '',
            estimate: a.estimate,
            priority: a.priority || 'med',
            days: a.days,
            ...(a.classId ? { classId: a.classId } : {}),
            ...(a.subtasks && a.subtasks.length ? { subtasks: a.subtasks } : {}),
            startDate: a.startDate,
            generatedUntil: null,
          },
        ],
      });

    case 'DELETE_RECURRING': {
      const today = dateKey();
      return {
        ...state,
        recurring: state.recurring.filter((r) => r.id !== a.id),
        // drop its future, unfinished tasks; keep anything done or already past
        tasks: state.tasks.filter((t) => !(t.recurId === a.id && !t.done && t.due >= today)),
      };
    }

    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === a.id
            ? { ...t, title: a.title, subjectId: a.subjectId ?? null, due: a.due, time: a.time || null, notes: a.notes || '', estimate: a.estimate, priority: a.priority || 'med', classId: 'classId' in a ? a.classId || undefined : t.classId, ...examLink(t, a), subtasks: 'subtasks' in a ? a.subtasks : t.subtasks, attachments: 'attachments' in a ? a.attachments : t.attachments }
            : t
        ),
      };

    // Drag and drop on the Calendar: a new day (and, from the week view, a new time; `time` left out keeps it).
    // A moved copy of a repeating task remembers where it came from, so re-planning doesn't put a new copy there.
    case 'MOVE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === a.id ? { ...t, due: a.due, ...('time' in a ? { time: a.time || null } : {}), ...(t.recurId ? { movedFrom: t.movedFrom || t.due } : {}) } : t
        ),
      };

    // Several tasks at once (the Dashboard's "Select"): { ids }, and for moving { ids, due }. Undo is RESTORE_LISTS.
    case 'COMPLETE_TASKS': {
      const ids = new Set(a.ids);
      return { ...state, tasks: state.tasks.map((t) => (ids.has(t.id) && !t.done ? { ...t, done: true, completedAt: dateKey(), snoozedUntil: null } : t)) };
    }

    case 'MOVE_TASKS': {
      const ids = new Set(a.ids);
      return { ...state, tasks: state.tasks.map((t) => (ids.has(t.id) ? { ...t, due: a.due, ...(t.recurId ? { movedFrom: t.movedFrom || t.due } : {}) } : t)) };
    }

    // Link tasks to an exam, or unlink them (examId null), from the exam's side: { ids, examId }
    case 'SET_TASK_EXAM': {
      const ids = new Set(a.ids);
      return { ...state, tasks: state.tasks.map((t) => (ids.has(t.id) ? { ...t, ...examLink(t, a) } : t)) };
    }

    // An exam's prep plan (examPrep.js): { examId, tasks } replaces the plan's tasks not done yet with these
    case 'ADD_PREP_PLAN':
      return { ...state, tasks: [...state.tasks.filter((t) => !(t.prepFor === a.examId && !t.done)), ...a.tasks] };

    // ...and taking it back: { ids } go, { restore } (the tasks it replaced) come back
    case 'UNDO_PREP_PLAN': {
      const ids = new Set(a.ids);
      const kept = state.tasks.filter((t) => !ids.has(t.id));
      const have = new Set(kept.map((t) => t.id));
      return { ...state, tasks: [...kept, ...(a.restore || []).filter((t) => !have.has(t.id))] };
    }

    // Flashcards (flashcards.js): { cards } added; { id, patch } edited; { id } deleted (RESTORE_CARD { card } is its Undo);
    // { id, grade, today } a review
    // Badges earned (achievements.js): { items: [{ id, earnedAt }] }, each recorded once
    case 'EARN_ACHIEVEMENTS': {
      const have = new Set((state.achievements || []).map((x) => x.id));
      const add = a.items.filter((x) => !have.has(x.id));
      return add.length ? { ...state, achievements: [...(state.achievements || []), ...add] } : state;
    }

    case 'ADD_CARDS':
      return { ...state, cards: [...(state.cards || []), ...a.cards] };
    case 'UPDATE_CARD':
      return { ...state, cards: (state.cards || []).map((c) => (c.id === a.id ? { ...c, ...a.patch } : c)) };
    case 'DELETE_CARD':
      return { ...state, cards: (state.cards || []).filter((c) => c.id !== a.id) };
    case 'RESTORE_CARD':
      return (state.cards || []).some((c) => c.id === a.card.id) ? state : { ...state, cards: [...(state.cards || []), a.card] };
    case 'REVIEW_CARD':
      return { ...state, cards: (state.cards || []).map((c) => (c.id === a.id ? reviewCard(c, a.grade, a.today) : c)) };

    case 'DELETE_TASKS': {
      const ids = new Set(a.ids);
      return { ...state, tasks: state.tasks.filter((t) => !ids.has(t.id)) };
    }

    // Done tasks finished before `before` (a date) leave the lists for the archive, in short form (no notes,
    // steps or attachments). Restored ones are marked `kept` so they stay. Nothing to move: the same state.
    case 'ARCHIVE_DONE': {
      const old = (t) => t.done && t.completedAt && t.completedAt < a.before && !t.kept;
      const moving = state.tasks.filter(old);
      if (!moving.length) return state;
      const short = ({ id, title, subjectId, due, completedAt, estimate, priority, classId, recurId }) => ({ id, title, subjectId: subjectId ?? null, due, completedAt, estimate, priority, ...(classId ? { classId } : {}), ...(recurId ? { recurId } : {}) });
      return { ...state, tasks: state.tasks.filter((t) => !old(t)), archive: [...(state.archive || []), ...moving.map(short)] };
    }

    // Back into the lists (as done tasks): { ids } or every one with { all: true }
    case 'RESTORE_ARCHIVED': {
      const back = (state.archive || []).filter((x) => a.all || a.ids.includes(x.id));
      if (!back.length) return state;
      const have = new Set(state.tasks.map((t) => t.id));
      return {
        ...state,
        archive: state.archive.filter((x) => !back.includes(x)),
        tasks: [...state.tasks, ...back.filter((x) => !have.has(x.id)).map((x) => ({ ...x, time: null, notes: '', done: true, kept: true }))],
      };
    }

    case 'CLEAR_ARCHIVE':
      return { ...state, archive: [] };

    case 'MOVE_EXAM':
      return { ...state, exams: state.exams.map((e) => (e.id === a.id ? { ...e, date: a.date, ...('time' in a ? { time: a.time || null } : {}) } : e)) };

    // a one-off class: { id, date, start?, end? }
    case 'MOVE_CLASS':
      return {
        ...state,
        classes: state.classes.map((c) => (c.id === a.id && c.repeat === 'once' ? { ...c, date: a.date, ...('start' in a ? { start: a.start, end: a.end } : {}) } : c)),
      };

    // ---- undo support: put back something that was just deleted ----
    case 'RESTORE_TASK':
      return state.tasks.some((t) => t.id === a.task.id) ? state : { ...state, tasks: [...state.tasks, a.task] };

    case 'RESTORE_EXAM':
      return state.exams.some((e) => e.id === a.exam.id) ? state : { ...state, exams: [...state.exams, a.exam] };

    case 'RESTORE_RECURRING': {
      const have = new Set(state.tasks.map((t) => t.id));
      return {
        ...state,
        recurring: state.recurring.some((r) => r.id === a.recurring.id) ? state.recurring : [...state.recurring, a.recurring],
        tasks: [...state.tasks, ...a.tasks.filter((t) => !have.has(t.id))],
      };
    }

    case 'RESTORE_SUBJECT':
      return {
        ...state,
        subjects: state.subjects.some((s) => s.id === a.subject.id) ? state.subjects : [...state.subjects, a.subject],
        // re-link the tasks that lost this subject when it was deleted
        tasks: state.tasks.map((t) => (a.taskIds.includes(t.id) && !t.subjectId ? { ...t, subjectId: a.subject.id } : t)),
        classes: state.classes.map((c) => ((a.classIds || []).includes(c.id) && !c.subjectId ? { ...c, subjectId: a.subject.id } : c)),
      };

    case 'UPDATE_EXAM':
      return {
        ...state,
        exams: state.exams.map((e) =>
          e.id === a.id ? satIfScored((({ score, outOf, weight, ...rest }) => ({ ...rest, ...examFields(a) }))(e)) : e
        ),
      };

    // Editing a repeat: drop its upcoming unfinished copies and regenerate them from the new settings.
    // Finished copies stay, and materialize() will not create a second copy on a day that already has one.
    case 'UPDATE_RECURRING': {
      const today = dateKey();
      const tasks = state.tasks.filter((t) => !(t.recurId === a.id && !t.done && t.due >= today));
      const recurring = state.recurring.map((r) =>
        r.id === a.id
          ? { ...r, title: a.title, subjectId: a.subjectId ?? null, time: a.time || null, notes: a.notes || '', estimate: a.estimate, priority: a.priority || 'med', days: a.days, generatedUntil: null, classId: 'classId' in a ? a.classId || undefined : r.classId, subtasks: 'subtasks' in a ? a.subtasks : r.subtasks }
          : r
      );
      return materialize({ ...state, tasks, recurring });
    }

    case 'MATERIALIZE':
      return materialize(state);

    default:
      return state;
  }
}

const HORIZON = 14; // days of repeating tasks created ahead of time

// Drop unfinished upcoming repeat copies that now fall on a paused day, then fill the horizon again
// (which also brings back copies on days that are no longer paused).
// Records from one import or group join carry ids `${batch}-…`: added together, removed together. Ids given
// in the action are kept (share.js links its classes to the subjects it adds); others are numbered.
function addBatch(state, a) {
  let n = 0;
  const id = (r) => r.id || `${a.batch}-${(n += 1)}`;
  return {
    ...state,
    subjects: [...state.subjects, ...(a.subjects || []).map((s) => ({ id: id(s), name: s.name, color: s.color }))],
    classes: [...state.classes, ...(a.classes || []).map((c) => ({ id: id(c), createdAt: dateKey(), ...classFields(c) }))],
    exams: [...state.exams, ...(a.exams || []).map((e) => ({ id: id(e), ...examFields(e) }))],
    vacations: [...state.vacations, ...(a.vacations || []).map((v) => ({ id: id(v), ...vacationFields(v) }))],
  };
}

function removeBatch(state, batch) {
  const mine = (r) => String(r.id).startsWith(`${batch}-`);
  const gone = new Set(state.subjects.filter(mine).map((s) => s.id));
  return {
    ...state,
    subjects: state.subjects.filter((s) => !mine(s)),
    // your own tasks on a subject that goes keep going, without the subject
    tasks: gone.size ? state.tasks.map((t) => (gone.has(t.subjectId) ? { ...t, subjectId: null } : t)) : state.tasks,
    classes: state.classes.filter((c) => !mine(c)),
    exams: state.exams.filter((e) => !mine(e)),
    vacations: state.vacations.filter((v) => !mine(v)),
  };
}

function replanRepeats(state) {
  if (!state.recurring.length) return state;
  const today = dateKey();
  const tasks = state.tasks.filter((t) => !(t.recurId && !t.done && t.due >= today && pausedOn(state.vacations, t.due)));
  const recurring = state.recurring.map((r) => ({ ...r, generatedUntil: null }));
  return materialize({ ...state, tasks, recurring });
}

function materialize(state) {
  if (!state.recurring.length) return state;
  const today = dateKey();
  const end = addDays(today, HORIZON - 1);
  let added = [];
  let changed = false;

  const recurring = state.recurring.map((r) => {
    let from = r.generatedUntil ? addDays(r.generatedUntil, 1) : r.startDate;
    if (from < today) from = today; // never back-fill the past
    if (from > end) return r;
    for (let d = from; d <= end; d = addDays(d, 1)) {
      const exists = state.tasks.some((t) => t.recurId === r.id && (t.due === d || t.movedFrom === d));
      if (r.days.includes(weekday(d)) && !exists && !pausedOn(state.vacations, d)) {
        added.push({
          // the same id on every device, so synced copies of one day don't double up
          id: `${r.id}@${d}`,
          title: r.title,
          subjectId: r.subjectId,
          due: d,
          time: r.time || null,
          notes: r.notes || '',
          estimate: r.estimate,
          priority: r.priority,
          done: false,
          completedAt: null,
          recurId: r.id,
          ...(r.classId ? { classId: r.classId } : {}),
          ...(r.subtasks && r.subtasks.length ? { subtasks: freshSteps(r.subtasks) } : {}),
        });
      }
    }
    changed = true;
    return { ...r, generatedUntil: end };
  });

  return changed ? { ...state, recurring, tasks: [...state.tasks, ...added] } : state;
}

