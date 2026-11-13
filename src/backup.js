// Backup / restore of a user's study data as plain JSON text.
// Kept free of React and device APIs so it is easy to test.
import { cleanAttachments } from './attachments';

// activity categories (same as ACTIVITY_CATEGORIES in classes.js)
const ACTIVITY_KINDS = ['club', 'sport', 'work', 'volunteer', 'arts', 'other'];

export const BACKUP_APP = 'StudyPlanner';
export const BACKUP_VERSION = 1;

export function buildBackup(data, user) {
  return JSON.stringify(
    {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      exportedBy: user ? user.email : undefined,
      data: {
        subjects: data.subjects || [],
        tasks: data.tasks || [],
        sessions: data.sessions || [],
        exams: data.exams || [],
        recurring: data.recurring || [],
        classes: data.classes || [],
        term: data.term || null,
        vacations: data.vacations || [],
        rotation: data.rotation || null,
        groups: data.groups || [],
        archive: data.archive || [],
        cards: data.cards || [],
        achievements: data.achievements || [],
      },
    },
    null,
    2
  );
}

export const backupFileName = (now = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `studyplanner-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
};

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
// A task's steps: well-formed ones only, titles trimmed (same limits as src/subtasks.js)
const steps = (raw) =>
  raw
    .filter((s) => s && typeof s.title === 'string' && s.title.trim())
    .slice(0, 30)
    .map((s, i) => ({ id: isStr(s.id) ? s.id : `st${i}`, title: s.title.trim().slice(0, 80), done: !!s.done }));
const isColor = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

// A real backup is a few hundred KB at most; anything far bigger is not one of ours.
const MAX_BACKUP_CHARS = 5 * 1024 * 1024;

// Error codes. The UI shows them as the translation key `backup.errors.<code>` with `params`
// (this file does not translate anything itself).
export const BACKUP_ERRORS = {
  tooLarge: 'tooLarge',
  notJson: 'notJson',
  notOurs: 'notOurs',
  tooNew: 'tooNew',
  missingList: 'missingList', // params: { list: 'subjects' | 'tasks' | 'sessions' }
};

const fail = (code, params) => ({ error: params ? { code, params } : { code } });

// Returns { data } with cleaned arrays, or { error: { code, params? } } describing what a person can fix.
export function parseBackup(text) {
  if (String(text).length > MAX_BACKUP_CHARS) return fail(BACKUP_ERRORS.tooLarge);
  let raw;
  try {
    raw = JSON.parse(String(text).trim());
  } catch {
    return fail(BACKUP_ERRORS.notJson);
  }
  if (!raw || typeof raw !== 'object' || raw.app !== BACKUP_APP || !raw.data) {
    return fail(BACKUP_ERRORS.notOurs);
  }
  if (raw.version > BACKUP_VERSION) {
    return fail(BACKUP_ERRORS.tooNew);
  }
  const d = raw.data;
  for (const k of ['subjects', 'tasks', 'sessions']) {
    if (!Array.isArray(d[k])) return fail(BACKUP_ERRORS.missingList, { list: k });
  }

  const subjects = d.subjects.filter((s) => s && isStr(s.id) && isStr(s.name)).map((s) => ({ id: s.id, name: s.name, color: isColor(s.color) ? s.color : '#3B4CCA', ...(num(s.weeklyGoal) && s.weeklyGoal > 0 ? { weeklyGoal: Math.round(s.weeklyGoal) } : {}) }));
  const subjectIds = new Set(subjects.map((s) => s.id));

  const tasks = d.tasks
    .filter((t) => t && isStr(t.id) && isStr(t.title) && isDate(t.due))
    .map((t) => ({
      ...t,
      subjectId: subjectIds.has(t.subjectId) ? t.subjectId : null,
      estimate: num(t.estimate) ? t.estimate : 30,
      time: isTime(t.time) ? t.time : null,
      notes: typeof t.notes === 'string' ? t.notes : '',
      priority:['low', 'med', 'high'].includes(t.priority) ? t.priority : 'med',
      done: !!t.done,
      completedAt: isDate(t.completedAt) ? t.completedAt : null,
      ...(Array.isArray(t.subtasks) ? { subtasks: steps(t.subtasks) } : {}),
      ...(t.attachments !== undefined ? { attachments: cleanAttachments(t.attachments) } : {}),
    }));

  const sessions = d.sessions
    .filter((s) => s && isDate(s.date) && num(s.minutes) && s.minutes > 0)
    .map(({ at, ...s }) => ({
      ...s,
      id: isStr(s.id) ? s.id : `s${Math.random().toString(36).slice(2, 9)}`,
      subjectId: subjectIds.has(s.subjectId) ? s.subjectId : null,
      ...(isTime(at) ? { at } : {}),
    }));

  const exams = (Array.isArray(d.exams) ? d.exams : [])
    .filter((e) => e && isStr(e.id) && isStr(e.title) && isDate(e.date))
    .map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      subjectId: subjectIds.has(e.subjectId) ? e.subjectId : null,
      kind: isStr(e.kind) ? e.kind : 'Exam',
      time: isTime(e.time) ? e.time : null,
      duration: num(e.duration) && e.duration > 0 ? e.duration : 60,
      mode: e.mode === 'online' ? 'online' : 'inPerson',
      building: typeof e.building === 'string' ? e.building : '',
      room: typeof e.room === 'string' ? e.room : '',
      link: typeof e.link === 'string' ? e.link : '',
      notes: typeof e.notes === 'string' ? e.notes : '',
      ...(num(e.score) && e.score >= 0 ? { score: e.score, outOf: num(e.outOf) && e.outOf > 0 ? e.outOf : 100, weight: num(e.weight) && e.weight > 0 && e.weight <= 10 ? e.weight : 1 } : {}),
      ...(['attended', 'missed', 'excused', 'cancelled'].includes(e.attendance) ? { attendance: e.attendance } : {}),
    }));

  const recurring = (Array.isArray(d.recurring) ? d.recurring : [])
    .filter((r) => r && isStr(r.id) && isStr(r.title) && Array.isArray(r.days) && r.days.length > 0)
    .map((r) => ({
      ...r,
      subjectId: subjectIds.has(r.subjectId) ? r.subjectId : null,
      days: r.days.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6),
      estimate: num(r.estimate) ? r.estimate : 30,
      time: isTime(r.time) ? r.time : null,
      notes: typeof r.notes === 'string' ? r.notes : '',
      startDate: isDate(r.startDate) ? r.startDate : null,
    }))
    .filter((r) => r.days.length > 0);

  const term = d.term && isDate(d.term.start) && isDate(d.term.end) && d.term.start <= d.term.end ? { start: d.term.start, end: d.term.end } : null;

  // The rotating timetable: lettered days (2–8) or weeks (2–4), counted from a known day
  const r = d.rotation;
  const rotation =
    r && ['days', 'weeks'].includes(r.type) && isDate(r.startDate) && Number.isInteger(r.length) && r.length >= 2 && r.length <= (r.type === 'days' ? 8 : 4)
      ? {
          type: r.type,
          length: r.length,
          startDate: r.startDate,
          startIndex: Number.isInteger(r.startIndex) && r.startIndex >= 0 && r.startIndex < r.length ? r.startIndex : 0,
          schoolDays: Array.isArray(r.schoolDays) && r.schoolDays.some((x) => Number.isInteger(x) && x >= 0 && x <= 6) ? [...new Set(r.schoolDays.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort() : [1, 2, 3, 4, 5],
          weekStart: r.weekStart === 1 ? 1 : 0,
        }
      : null;
  const slots = (list, max) => (Array.isArray(list) ? [...new Set(list.filter((x) => Number.isInteger(x) && x >= 0 && x < max))].sort() : []);

  // Classes: a one-off needs its date, a weekly class at least one day, a rotation class at least one letter.
  // Bad optional values fall back to safe defaults.
  const classes = (Array.isArray(d.classes) ? d.classes : [])
    .filter((c) => c && isStr(c.id) && isStr(c.title))
    .map((c) => {
      const weekly = c.repeat === 'weekly';
      const rotating = c.repeat === 'rotation';
      const days = weekly && Array.isArray(c.days) ? [...new Set(c.days.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort() : [];
      const rotationDays = rotating ? slots(c.rotationDays, 8) : [];
      const rotationWeeks = weekly ? slots(c.rotationWeeks, 4) : [];
      let range = (weekly || rotating) && ['term', 'manual'].includes(c.range) ? c.range : 'none';
      if (range === 'manual' && !(isDate(c.rangeStart) && isDate(c.rangeEnd))) range = 'none';
      if (range === 'term' && !term) range = 'none';
      const start = isTime(c.start) ? c.start : null;
      return {
        id: c.id,
        title: c.title,
        subjectId: subjectIds.has(c.subjectId) ? c.subjectId : null,
        teacher: typeof c.teacher === 'string' ? c.teacher : '',
        repeat: weekly ? 'weekly' : rotating ? 'rotation' : 'once',
        date: weekly || rotating ? null : isDate(c.date) ? c.date : null,
        days,
        ...(rotating ? { rotationDays } : {}),
        ...(rotationWeeks.length ? { rotationWeeks } : {}),
        start,
        end: start && isTime(c.end) && c.end > start ? c.end : null,
        range,
        rangeStart: range === 'manual' ? c.rangeStart : null,
        rangeEnd: range === 'manual' ? c.rangeEnd : null,
        mode: c.mode === 'online' ? 'online' : 'inPerson',
        location: typeof c.location === 'string' ? c.location : '',
        link: typeof c.link === 'string' ? c.link : '',
        notes: typeof c.notes === 'string' ? c.notes : '',
        ...(isDate(c.createdAt) ? { createdAt: c.createdAt } : {}),
        ...(c.kind === 'activity' ? { kind: 'activity', category: ACTIVITY_KINDS.includes(c.category) ? c.category : 'other', subjectId: null } : {}),
        ...(c.attendance && typeof c.attendance === 'object'
          ? { attendance: Object.fromEntries(Object.entries(c.attendance).filter(([k, v]) => isDate(k) && ['attended', 'missed', 'excused', 'cancelled'].includes(v))) }
          : {}),
      };
    })
    .filter((c) => (c.repeat === 'weekly' ? c.days.length > 0 : c.repeat === 'rotation' ? c.rotationDays.length > 0 : !!c.date));

  const vacations = (Array.isArray(d.vacations) ? d.vacations : [])
    .filter((v) => v && isStr(v.id) && isStr(v.title) && isDate(v.start) && isDate(v.end) && v.start <= v.end)
    .map((v) => ({ id: v.id, title: v.title, start: v.start, end: v.end, pause: v.pause !== false, notes: typeof v.notes === 'string' ? v.notes : '' }));

  // Study groups joined (the records they added are in the lists above)
  const groups = (Array.isArray(d.groups) ? d.groups : [])
    .filter((g) => g && isStr(g.id) && isStr(g.batch) && isStr(g.name))
    .map((g) => ({
      id: g.id,
      name: g.name.slice(0, 60),
      from: typeof g.from === 'string' ? g.from.slice(0, 60) : '',
      batch: g.batch,
      joinedAt: isDate(g.joinedAt) ? g.joinedAt : null,
      sharedAt: isDate(g.sharedAt) ? g.sharedAt : null,
      counts: Object.fromEntries(['classes', 'exams', 'vacations', 'subjects'].map((k) => [k, g.counts && num(g.counts[k]) ? g.counts[k] : 0])),
      ...(g.live ? { live: true, version: isStr(g.version) ? g.version : null } : {}),
      ...(Array.isArray(g.copied) ? { copied: g.copied.filter(isStr) } : {}),
    }));

  // Archived tasks (done long ago): the short form
  const archive = (Array.isArray(d.archive) ? d.archive : [])
    .filter((x) => x && isStr(x.id) && isStr(x.title) && isDate(x.due) && isDate(x.completedAt))
    .map((x) => ({
      id: x.id,
      title: x.title,
      subjectId: subjectIds.has(x.subjectId) ? x.subjectId : null,
      due: x.due,
      completedAt: x.completedAt,
      estimate: num(x.estimate) ? x.estimate : 30,
      priority: ['low', 'med', 'high'].includes(x.priority) ? x.priority : 'med',
      ...(isStr(x.classId) ? { classId: x.classId } : {}),
      ...(isStr(x.recurId) ? { recurId: x.recurId } : {}),
    }));

  // Flashcards: a question and an answer, with where they are in the review schedule
  const cards = (Array.isArray(d.cards) ? d.cards : [])
    .filter((c) => c && isStr(c.id) && isStr(c.front) && isStr(c.back) && isDate(c.due))
    .map((c) => ({
      id: c.id,
      subjectId: subjectIds.has(c.subjectId) ? c.subjectId : null,
      front: c.front.slice(0, 500),
      back: c.back.slice(0, 1000),
      due: c.due,
      interval: num(c.interval) ? c.interval : 0,
      ease: num(c.ease) && c.ease >= 1.3 ? c.ease : 2.5,
      reps: num(c.reps) ? c.reps : 0,
      lapses: num(c.lapses) ? c.lapses : 0,
      createdAt: isDate(c.createdAt) ? c.createdAt : c.due,
      reviewedAt: isDate(c.reviewedAt) ? c.reviewedAt : null,
    }));

  // Badges earned, with the day each was first earned
  const achievements = (Array.isArray(d.achievements) ? d.achievements : []).filter((x) => x && isStr(x.id) && isDate(x.earnedAt)).map((x) => ({ id: x.id, earnedAt: x.earnedAt }));

  return {
    data: { subjects, tasks, sessions, exams, recurring, classes, term, vacations, rotation, groups, archive, cards, achievements },
    counts: { subjects: subjects.length, tasks: tasks.length, sessions: sessions.length, exams: exams.length, recurring: recurring.length, classes: classes.length, vacations: vacations.length },
    skipped: d.tasks.length - tasks.length + (d.subjects.length - subjects.length) + (d.sessions.length - sessions.length),
  };
}


