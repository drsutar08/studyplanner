// Sample study data with records in every part of the app, dated around `now`: for a new account that
// wants to look around ("Start with sample data"), for demos, and for scripts/make-sample-data.mjs.
// Pure, no imports. Returns the same shape as a backup's data.
export function sampleData(now = new Date()) {
  // ---- dates around today ----
  const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const day = (n) => keyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
  const today = day(0);
  const weekday = (key) => new Date(`${key}T12:00:00`).getDay();
  let seq = 0;
  const id = (p) => `${p}${(seq += 1).toString(36)}`;

  // ---- subjects ----
  const S = {
    math: { id: 's-math', name: 'Mathematics', color: '#E4572E', weeklyGoal: 180 },
    bio: { id: 's-bio', name: 'Biology', color: '#17A398', weeklyGoal: 120 },
    hist: { id: 's-hist', name: 'History', color: '#7A5CFA' },
    phys: { id: 's-phys', name: 'Physics', color: '#2E86DE', weeklyGoal: 120 },
    eng: { id: 's-eng', name: 'English', color: '#F2A541' },
  };
  const subjects = Object.values(S);

  // ---- term and breaks ----
  const term = { start: day(-60), end: day(50) };
  const vacations = [
    { id: 'v-midterm', title: 'Mid-term break', start: day(-24), end: day(-22), pause: true, notes: '' },
    { id: 'v-diwali', title: 'Diwali break', start: day(9), end: day(11), pause: true, notes: 'Home for the festival' },
    { id: 'v-winter', title: 'Winter break', start: day(52), end: day(66), pause: true, notes: '' },
  ];
  const paused = (key) => vacations.some((v) => v.pause && key >= v.start && key <= v.end);

  // ---- classes (weekly, through the term) with attendance for past sessions ----
  const cls = (over) => ({
    teacher: '',
    repeat: 'weekly',
    date: null,
    range: 'term',
    rangeStart: null,
    rangeEnd: null,
    mode: 'inPerson',
    location: '',
    link: '',
    notes: '',
    createdAt: term.start,
    ...over,
  });
  const classes = [
    cls({ id: 'c-calc', title: 'Calculus II', subjectId: S.math.id, teacher: 'Prof. Rao', days: [1, 3], start: '09:00', end: '10:30', location: 'Room 204' }),
    cls({ id: 'c-bio', title: 'Cell Biology', subjectId: S.bio.id, teacher: 'Dr. Mehta', days: [2, 4], start: '11:00', end: '12:00', location: 'Lab 3' }),
    cls({ id: 'c-hist', title: 'Modern History', subjectId: S.hist.id, teacher: 'Ms. Das', days: [1, 5], start: '13:00', end: '14:00', location: 'Hall B' }),
    cls({ id: 'c-phys', title: 'Physics Lab', subjectId: S.phys.id, teacher: 'Dr. Iyer', days: [3], start: '14:00', end: '16:00', location: 'Physics Lab 1' }),
    cls({ id: 'c-eng', title: 'English Literature', subjectId: S.eng.id, teacher: 'Mr. Thomas', days: [2], start: '15:00', end: '16:00', mode: 'online', link: 'https://meet.example.com/eng-lit' }),
    // a one-off guest lecture next week
    cls({ id: 'c-guest', title: 'Guest lecture: Climate & cells', subjectId: S.bio.id, repeat: 'once', date: day(6), days: [], range: 'none', start: '16:00', end: '17:00', location: 'Auditorium' }),
  ];
  // past sessions marked: mostly attended, a few missed, one excused, one cancelled (Modern History dips below 75%)
  const missEvery = { 'c-calc': 9, 'c-bio': 7, 'c-hist': 3, 'c-phys': 6, 'c-eng': 8 };
  for (const c of classes.filter((x) => x.repeat === 'weekly')) {
    const att = {};
    let n = 0;
    for (let i = -42; i <= -1; i += 1) {
      const k = day(i);
      if (!c.days.includes(weekday(k)) || paused(k)) continue;
      n += 1;
      if (i >= -2) continue; // the last couple are left to mark (they show up in "classes to mark")
      att[k] = n % missEvery[c.id] === 0 ? 'missed' : 'attended';
    }
    const ks = Object.keys(att);
    if (c.id === 'c-bio' && ks[3]) att[ks[3]] = 'excused';
    if (c.id === 'c-phys' && ks[2]) att[ks[2]] = 'cancelled';
    c.attendance = att;
  }

  // ---- activities ----
  const act = (over) => cls({ subjectId: null, range: 'none', kind: 'activity', createdAt: day(-30), ...over });
  classes.push(
    act({ id: 'a-football', title: 'Football practice', category: 'sport', teacher: 'Coach Singh', days: [2, 4], start: '17:30', end: '19:00', location: 'North field' }),
    act({ id: 'a-cafe', title: 'Cafe shift', category: 'work', teacher: 'Anita (manager)', days: [3, 6], start: '18:00', end: '21:00', location: 'Bean There Cafe' }),
    act({ id: 'a-chess', title: 'Chess club', category: 'club', days: [5], start: '16:30', end: '17:30', location: 'Room 12' }),
    act({ id: 'a-choir', title: 'College choir', category: 'arts', days: [1], start: '18:00', end: '19:00', location: 'Music room' }),
    act({ id: 'a-volunteer', title: 'Beach clean-up', category: 'volunteer', repeat: 'once', date: day(8), days: [], start: '07:00', end: '10:00', location: 'Puri beach' })
  );

  // ---- exams: graded ones, ones waiting for a score, missed / excused, and upcoming ----
  const exam = (over) => ({ kind: 'Exam', time: '10:00', duration: 60, mode: 'inPerson', building: 'Exam hall', room: '', link: '', notes: '', ...over });
  const exams = [
    // earlier scores, so each subject has a trend
    exam({ id: 'x-mathd', title: 'Algebra diagnostic', subjectId: S.math.id, kind: 'Test', date: day(-48), duration: 45, score: 31, outOf: 50, weight: 1, attendance: 'attended' }),
    exam({ id: 'x-mathh', title: 'Functions homework test', subjectId: S.math.id, kind: 'Test', date: day(-37), duration: 40, score: 74, outOf: 100, weight: 1, attendance: 'attended' }),
    exam({ id: 'x-bioq', title: 'Microscopy quiz', subjectId: S.bio.id, kind: 'Quiz', date: day(-33), duration: 20, score: 16, outOf: 20, weight: 1, attendance: 'attended' }),
    exam({ id: 'x-histe', title: 'Source essay', subjectId: S.hist.id, kind: 'Essay', date: day(-40), score: 61, outOf: 100, weight: 1, attendance: 'attended' }),
    exam({ id: 'x-mathq1', title: 'Calculus quiz 1', subjectId: S.math.id, kind: 'Quiz', date: day(-26), duration: 30, score: 18, outOf: 20, weight: 1, attendance: 'attended' }),
    exam({ id: 'x-biot1', title: 'Cell biology test', subjectId: S.bio.id, kind: 'Test', date: day(-19), score: 41, outOf: 50, weight: 1, attendance: 'attended' }),
    exam({ id: 'x-histm', title: 'History mid-term', subjectId: S.hist.id, kind: 'Midterm', date: day(-15), duration: 120, score: 68, outOf: 100, weight: 2, attendance: 'attended' }),
    exam({ id: 'x-engp', title: 'Poetry presentation', subjectId: S.eng.id, kind: 'Presentation', date: day(-12), duration: 20, score: 17, outOf: 20, weight: 1, attendance: 'attended' }),
    exam({ id: 'x-physq', title: 'Optics quiz', subjectId: S.phys.id, kind: 'Quiz', date: day(-9), duration: 30, attendance: 'missed', notes: 'Was ill' }),
    exam({ id: 'x-engq', title: 'Grammar quiz', subjectId: S.eng.id, kind: 'Quiz', date: day(-7), duration: 30, attendance: 'excused' }),
    exam({ id: 'x-mathq2', title: 'Calculus quiz 2', subjectId: S.math.id, kind: 'Quiz', date: day(-2), duration: 30 }), // needs a score
    exam({ id: 'x-calcm', title: 'Calculus mid-term', subjectId: S.math.id, kind: 'Midterm', date: day(3), time: '10:00', duration: 90, building: 'Hall B', room: 'Seat 42' }),
    exam({ id: 'x-biop', title: 'Biology practical', subjectId: S.bio.id, kind: 'Practical', date: day(6), time: '14:00', duration: 120, building: 'Lab 3' }),
    exam({ id: 'x-physm', title: 'Physics mid-term', subjectId: S.phys.id, kind: 'Midterm', date: day(13), time: '09:30', duration: 90 }),
    exam({ id: 'x-histf', title: 'History final', subjectId: S.hist.id, kind: 'Final', date: day(41), time: '09:00', duration: 180, notes: 'Chapters 1–12' }),
  ];

  // ---- tasks: overdue, today, coming up and done; homework, subtasks, priorities and times ----
  const task = (over) => ({ time: null, notes: '', estimate: 30, priority: 'med', done: false, completedAt: null, ...over });
  const steps = (titles, done = 0) => titles.map((t, i) => ({ id: id('st'), title: t, done: i < done }));
  const tasks = [
    task({ id: 't-lab', title: 'Lab report: enzyme activity', subjectId: S.bio.id, due: day(-2), estimate: 60, priority: 'high', classId: 'c-bio', subtasks: steps(['Write method', 'Plot results', 'Discussion'], 1) }),
    task({ id: 't-essay-plan', title: 'Plan the Partition essay', subjectId: S.hist.id, due: day(-1), estimate: 45 }),
    task({ id: 't-ps5', title: 'Problem set 5: series', subjectId: S.math.id, due: today, time: '17:00', estimate: 60, classId: 'c-calc', subtasks: steps(['Q1–4', 'Q5–8', 'Check answers'], 1), attachments: [{ id: 'a-ps5', kind: 'link', url: 'https://www.khanacademy.org/math/calculus-2/bc-series-new', name: 'khanacademy.org/math/calculus-2/bc-ser…' }] }),
    task({ id: 't-flash', title: 'Flashcards: cell cycle', subjectId: S.bio.id, due: today, estimate: 20 }),
    task({ id: 't-read9', title: 'Read chapter 9', subjectId: S.hist.id, due: today, estimate: 45, done: true, completedAt: today }),
    task({ id: 't-poem', title: 'Annotate two poems', subjectId: S.eng.id, due: day(1), estimate: 40, classId: 'c-eng' }),
    task({ id: 't-pastpaper', title: 'Past paper 2023 (mid-term prep)', subjectId: S.math.id, due: day(2), estimate: 120, priority: 'high' }),
    task({ id: 't-optics', title: 'Optics worksheet', subjectId: S.phys.id, due: day(4), estimate: 50 }),
    task({ id: 't-practical', title: 'Revise practical techniques', subjectId: S.bio.id, due: day(5), estimate: 60, subtasks: steps(['Microscopy', 'Staining', 'Safety rules']) }),
    task({ id: 't-essay', title: 'Partition essay: first draft', subjectId: S.hist.id, due: day(7), estimate: 90, notes: '1,500 words, Harvard referencing' }),
    task({ id: 't-vocab', title: 'Vocabulary list: unit 6', subjectId: S.eng.id, due: day(12), estimate: 15, priority: 'low' }),
    task({ id: 't-final-plan', title: 'Make a revision plan for the history final', subjectId: S.hist.id, due: day(20), estimate: 30 }),
    task({ id: 't-done1', title: 'Problem set 4: integrals', subjectId: S.math.id, due: day(-5), estimate: 60, done: true, completedAt: day(-5) }),
    task({ id: 't-done2', title: 'Microscope drawing', subjectId: S.bio.id, due: day(-4), estimate: 30, done: true, completedAt: day(-4) }),
    task({ id: 't-done3', title: 'Newton’s laws summary', subjectId: S.phys.id, due: day(-3), estimate: 40, done: true, completedAt: day(-3) }),
  ];

  // ---- repeating tasks, with their copies for the next two weeks (as the app makes them) ----
  const recurring = [
    { id: 'r-flash', title: 'Daily flashcards', subjectId: S.bio.id, time: null, notes: '', estimate: 20, priority: 'med', days: [0, 1, 2, 3, 4, 5, 6], startDate: day(-14) },
    { id: 'r-plan', title: 'Weekly planning', subjectId: null, time: '19:00', notes: 'Look at the week ahead', estimate: 30, priority: 'med', days: [0], startDate: day(-14) },
  ];
  const horizonEnd = day(13);
  for (const r of recurring) {
    for (let i = 0; i <= 13; i += 1) {
      const k = day(i);
      if (!r.days.includes(weekday(k)) || paused(k)) continue;
      tasks.push(task({ id: id('rc'), title: r.title, subjectId: r.subjectId, due: k, time: r.time, notes: r.notes, estimate: r.estimate, priority: r.priority, recurId: r.id }));
    }
    r.generatedUntil = horizonEnd;
  }

  // ---- focus sessions: most days of the last two weeks, a streak up to today ----
  const sessions = [];
  const pick = [S.math, S.bio, S.hist, S.phys, S.eng];
  for (let i = -14; i <= 0; i += 1) {
    if (i === -8 || i === -9) continue; // a short gap, so the current streak is a week
    const k = day(i);
    const count = i === 0 ? 2 : 1 + ((i + 20) % 3);
    for (let j = 0; j < count; j += 1) {
      const s = pick[(i + j + 14) % pick.length];
      const linked = tasks.find((t) => t.subjectId === s.id && !t.recurId);
      sessions.push({ id: id('ss'), date: k, minutes: [25, 45, 25, 60][(i + j + 14) % 4], subjectId: s.id, taskId: linked ? linked.id : null, at: ['09:40', '14:15', '20:30'][j] });
    }
  }

  // ---- flashcards: a few learnt (due today or later), a few new ----
  const card = (id, subjectId, front, back, over = {}) => ({ id, subjectId, front, back, due: today, interval: 0, ease: 2.5, reps: 0, lapses: 0, createdAt: day(-3), reviewedAt: null, ...over });
  const learnt = (days, interval) => ({ due: day(days), interval, reps: 2, reviewedAt: day(days - interval) });
  const cards = [
    card('k-deriv', S.math.id, 'Derivative of sin x', 'cos x', learnt(0, 3)),
    card('k-chain', S.math.id, 'The chain rule', '(f ∘ g)′(x) = f′(g(x)) · g′(x)', learnt(0, 3)),
    card('k-ibp', S.math.id, 'Integration by parts', '∫u dv = uv − ∫v du'),
    card('k-series', S.math.id, 'When does a geometric series converge?', 'When |r| < 1; its sum is a / (1 − r)', learnt(4, 8)),
    card('k-mito', S.bio.id, 'Where is ATP mostly made?', 'In the mitochondria (cellular respiration)', learnt(0, 1)),
    card('k-mitosis', S.bio.id, 'The phases of mitosis', 'Prophase, metaphase, anaphase, telophase'),
    card('k-enzyme', S.bio.id, 'What does an enzyme do?', 'It speeds up a reaction by lowering its activation energy'),
    card('k-newton2', S.phys.id, 'Newton’s second law', 'F = ma: force equals mass times acceleration', learnt(2, 3)),
    card('k-light', S.phys.id, 'Speed of light in a vacuum', '3 × 10⁸ m/s'),
    card('k-partition', S.hist.id, 'Year of the Partition of India', '1947'),
  ];

  return { subjects, tasks, sessions, exams, recurring, classes, term, vacations, rotation: null, cards };
}
