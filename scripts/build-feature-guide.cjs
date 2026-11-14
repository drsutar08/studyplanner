// Builds docs/feature-guide/Study-Planner-Feature-Guide.docx from the screenshots and flow diagrams.
// When a feature is added or changed: add or edit it in AREAS below, take its screenshot (scripts/feature-screenshots.mjs),
// then run: node scripts/build-feature-guide.cjs  (open it in Word once and update the contents page, or let Word ask)
// --mobile builds the phone guide (Study-Planner-Mobile-Guide.docx) from the same content, with the Android and iPhone
// screenshots side by side (scripts/mobile-screenshots.mjs); features marked desktopOnly are left out of it.
const path = require('path');
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, AlignmentType, Table, TableRow, TableCell, WidthType,
  ShadingType, BorderStyle, LevelFormat, PageBreak, TableOfContents, Footer, PageNumber, Header, PageOrientation,
} = require('docx');

const ROOT = path.join(__dirname, '..', 'docs', 'feature-guide').split(path.sep).join('/');
const SHOTS = `${ROOT}/screenshots`;
const MOBILE = process.argv.includes('--mobile');
const DOC_NAME = MOBILE ? 'Mobile guide' : 'Feature guide';
const BLUE = '3B4CCA';
const INK = '151B33';
const MUTED = '5C6482';
const FONT = 'Calibri';
const CONTENT_W = 9026; // A4 with 1" margins, in DXA

// ---------- helpers ----------
const p = (text, opts = {}) => new Paragraph({ spacing: { after: 120, line: 300 }, ...opts, children: Array.isArray(text) ? text : [new TextRun({ text, font: FONT, size: 22, color: INK })] });
const run = (text, o = {}) => new TextRun({ text, font: FONT, size: 22, color: INK, ...o });
const bullet = (parts, keepNext = false) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 60, line: 280 }, keepNext, children: (Array.isArray(parts) ? parts : [parts]).map((x) => (typeof x === 'string' ? run(x) : x)) });
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, spacing: { after: 160 }, children: [new TextRun({ text, font: FONT })] });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 100 }, keepNext: true, children: [new TextRun({ text, font: FONT })] });
const label = (text) => new Paragraph({ spacing: { before: 80, after: 40 }, keepNext: true, children: [new TextRun({ text, font: FONT, size: 20, bold: true, color: BLUE })] });
const caption = (text) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text, font: FONT, size: 18, italics: true, color: MUTED })] });

const pngSize = (file) => {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};
const image = (file, maxW = 600, maxH = 420) => {
  const { w, h } = pngSize(file);
  const k = Math.min(maxW / w, maxH / h);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 60 },
    keepNext: true,
    children: [new ImageRun({ type: 'png', data: fs.readFileSync(file), transformation: { width: Math.round(w * k), height: Math.round(h * k) } })],
  });
};
const phonePair = (file, cap) => {
  const sides = [['android', 'Android'], ['ios', 'iPhone']].map(([dir, name]) => [`${ROOT}/mobile/${dir}/${file}`, name]).filter(([f]) => fs.existsSync(f));
  if (!sides.length) return [];
  const w = Math.floor(CONTENT_W / 2);
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const cell = ([f, name]) =>
    new TableCell({
      width: { size: w, type: WidthType.DXA },
      borders: { top: none, bottom: none, left: none, right: none },
      children: [image(f, 230, 500), new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: name, font: FONT, size: 18, bold: true, color: MUTED })] })],
    });
  return [
    new Table({ width: { size: w * sides.length, type: WidthType.DXA }, columnWidths: sides.map(() => w), alignment: AlignmentType.CENTER, rows: [new TableRow({ cantSplit: true, children: sides.map(cell) })] }),
    caption(cap),
  ];
};
const shot = (file, cap) => {
  if (MOBILE) return phonePair(file, cap);
  const f = `${SHOTS}/${file}`;
  if (!fs.existsSync(f)) return [];
  const phone = file.includes('phone');
  return [image(f, phone ? 200 : 560, phone ? 400 : 330), caption(cap)];
};

// A feature: name, what it does, how to use it, screenshots
const feature = ({ name, what, how = [], shots: desktopShots = [], mobileShots, mobileWhat, mobileHow, tip }) => {
  const shots = MOBILE && mobileShots ? mobileShots : desktopShots;
  if (MOBILE) {
    what = mobileWhat || what;
    how = mobileHow || how;
  }
  return [
  h2(name),
  label('What it does'),
  p(what, { keepNext: shots.length > 0 || how.length > 0 || !!tip }),
  ...(how.length ? [label('How to use it'), ...how.map((x, i) => bullet(x, shots.length > 0 || !!tip || i < how.length - 1))] : []),
  ...(tip ? [p([run('Good to know: ', { bold: true }), run(tip)], { spacing: { before: 80, after: 120 }, keepNext: shots.length > 0 })] : []),
  ...shots.flatMap(([f, c]) => shot(f, c)),
  ];
};

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: 'C9D0FF' };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
const tableCell = (text, w, { head = false, fill } = {}) =>
  new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders,
    margins: { top: 50, bottom: 50, left: 110, right: 110 },
    shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: BLUE } : fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, font: FONT, size: 18, bold: head, color: head ? 'FFFFFF' : INK })] })],
  });
const table = (rows, widths) =>
  new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((r, i) => new TableRow({ tableHeader: i === 0, children: r.map((c, j) => tableCell(c, widths[j], { head: i === 0, fill: i > 0 && i % 2 === 0 ? 'F4F6FD' : undefined })) })),
  });

// ---------- the content ----------
const AREAS = [
  {
    title: '1. Getting started and accounts',
    intro: 'Everything a student needs to start: a short welcome, an account of their own, and a profile.',
    features: [
      {
        name: 'Welcome slides',
        what: 'The first time the app opens, three short slides explain what it does: plan your day, focus, and see your progress. They can be skipped.',
        how: ['Open the app and swipe or tap Next.', 'Tap Skip to go straight to signing in.'],
        shots: [['01-intro.png', 'The welcome slides']],
      },
      {
        name: 'Create an account and sign in',
        what: 'Each student has their own private account (email and password). Their plans are saved to it, so they can sign in on any phone or computer and find everything there.',
        how: [
          'Tap Create account and enter a name, email and password. A meter shows how strong the password is.',
          'In the Development app (StudyPlanner Dev), tick “Start with sample data” to explore with example subjects, classes and tasks. The Production app starts empty, as real students expect.',
          'Forgot the password? Tap “Forgot password?” and a reset link is emailed.',
        ],
        tip: 'New students get a welcome email (in their language) with a quick guide to the app.',
        shots: [['02-sign-in.png', 'Signing in'], ['03-create-account.png', 'Creating an account, with the password strength meter']],
      },
      {
        name: 'Profile',
        what: 'Name, photo or avatar colour, school or college, course and year. The profile also lets the student change their password, sign out, or delete their account and all its data.',
        how: ['Tap your name at the bottom of the menu (or the avatar at the top right).'],
        shots: [['27-profile.png', 'The profile page']],
      },
      {
        name: 'Bring data from the older version',
        what: 'Students who used the app before accounts existed can bring their old plans into their new account. Only the old account with the same password can be brought over, and nothing current is lost.',
        how: ['Settings → “Bring in data from the older version”, pick the old account and enter its password. There is an Undo.'],
      },
    ],
  },
  {
    title: '2. The dashboard and tasks',
    intro: 'The dashboard is the home screen: what’s due today, what’s late, and what’s coming up, with a plan for the day.',
    features: [
      {
        name: 'Dashboard',
        what: 'A greeting with today’s focus goal, a quote of the day, three tiles (due today, overdue, upcoming), today’s classes, upcoming exams and breaks, and all tasks grouped by when they’re due. Tapping a tile shows only those tasks.',
        how: ['Tap a task to edit it, tap its circle to mark it done.', 'On a phone, swipe a task right to complete it or left to delete it (with Undo).', 'Filter by subject, or show only high-priority tasks.'],
        shots: [['04-dashboard.png', 'The dashboard']],
      },
      {
        name: 'Smart plan for today',
        what: 'The app picks which tasks to do today so they fit the daily study goal, putting the most urgent first (overdue work, high priority, exams coming soon). It shows how much time each takes.',
        how: ['Use “More plan time” or “Less plan time” to change how long the plan is.', 'Tap “Start first task” to begin a focus session on it.'],
        shots: [['05-smart-plan.png', 'The smart plan on the dashboard']],
      },
      {
        name: 'Adding and editing tasks',
        what: 'A task has a title, subject, due date and optional time, priority, how long it should take, notes, and can repeat (daily, weekly or on chosen days). Homework can be linked to a class.',
        how: ['Tap + (phone) or “New task” (computer).', 'Press N on a computer keyboard to add a task from anywhere.'],
        shots: [['06-new-task.png', 'Adding a task']],
      },
      {
        name: 'Quick add and voice (new)',
        what: 'A task from one line on the dashboard. Type “Physics worksheet fri 45 min 5pm !” and the app picks up the day (today, tomorrow or a weekday), the time, how long it takes, the subject (by name, or #maths) and ! for important, and shows what it found as you type. It understands the words in all four languages.',
        how: ['Dashboard → the quick add box at the top. Type, then press Enter or +. There is an Undo.', 'Or say it (new): tap the mic, say “Biology revision tomorrow 40 minutes at 4 pm”, check what it heard, then press +.', 'Without a day the task is due today; without a length it gets the usual focus length.'],
        tip: 'The mic is in the Android and iPhone apps, and in Chrome, Edge and Safari on the web. The first time, the phone or browser asks to use the microphone.',
        shots: [['46-quick-add.png', 'Quick add, with what it picked up shown under the box']],
        mobileShots: [['47-quick-add.png', 'Quick add']],
      },
      {
        name: 'Steps, links and photos',
        what: 'Big tasks can be split into steps that are ticked off one by one, with a progress bar. Links (for example a video or website) and photos (for example a page of the textbook) can be attached.',
        how: ['Open a task and add steps under “Steps”, or a link or photo under “Attachments”.'],
        shots: [['07-edit-task-steps.png', 'A task with steps and a link']],
      },
      {
        name: 'Select several tasks at once',
        what: 'Mark many tasks done, move them to another day, or delete them in one go.',
        how: ['Tap “Select” above the task list, tick the tasks, then choose an action. Works in the Calendar too.'],
        shots: [['08-multi-select.png', 'Selecting several tasks']],
      },
      {
        name: 'Search',
        what: 'Finds tasks, exams, classes and subjects as you type. Choosing an exam or class opens the calendar on its day.',
        how: ['Type in the search bar at the top, or press / on a computer.'],
        shots: [['09-search.png', 'Search results']],
      },
      {
        name: '“Coming up” grouped by day',
        what: 'Upcoming tasks are shown under a heading for each day. A task that repeats (for example daily flashcards) shows once with “+ more”, so the list stays short.',
      },
      {
        name: 'Archive of finished tasks',
        what: 'Tasks finished long ago can be moved to an archive, keeping the lists tidy. They can be brought back at any time.',
        how: ['Settings → Archive.'],
      },
    ],
  },
  {
    title: '3. Calendar, exams and timetable',
    intro: 'The calendar brings together tasks, exams, classes and breaks, by month or by week.',
    features: [
      {
        name: 'Month and week views',
        what: 'The month view shows each day’s tasks, exams and classes; the week view shows the timetable hour by hour. Tasks and exams can be dragged to another day.',
        how: ['Switch between Month and Week at the top. Tap a day to see everything on it.'],
        shots: [['11-calendar-month.png', 'Calendar: month view'], ['12-calendar-week.png', 'Calendar: week view']],
      },
      {
        name: 'Exams',
        what: 'Each exam has a date, time, length, place (or online link) and subject, with a countdown in days. After the exam the score can be added, and whether the student attended.',
        how: ['Calendar → Upcoming exams → Add exam.'],
        shots: [['13-upcoming-exams.png', 'Upcoming exams with countdowns']],
      },
      {
        name: 'Exam prep plans (new)',
        what: 'Pick an exam and the app spreads revision sessions over the days before it, ending with a practice test and a final review the day before. If topics are given, each gets its own session. The sessions become ordinary tasks, and the exam shows the plan’s progress (“Prep plan: 2 of 6 done”).',
        how: ['Calendar → Upcoming exams → the cap button on an exam.', 'Choose the number of sessions and their length, type the topics, check the preview, then “Add revision tasks”. There is an Undo.'],
        tip: 'Making a new plan replaces only the tasks not yet done.',
        shots: [['14-exam-prep.png', 'Making an exam prep plan']],
      },
      {
        name: 'Link a task to an exam (new)',
        what: 'Link a task to an exam from either side. When you add or edit a task, choose “For exam” (this subject’s exams come first). Or open an exam and tap the link button to tick the tasks that belong to it. A linked task shows a flag line on its card (“For Physics mid-term · Mon, Nov 16”), and linked tasks count in the exam’s “Prep plan: x of y done” progress, next to any generated revision sessions. Linked tasks also rank higher in Today’s smart plan and the Focus queue as the exam gets closer (up to 3 weeks out, more than for a task that only shares the exam’s subject). Deleting an exam keeps its tasks and just unlinks them.',
        how: ['From the task: Add task (or edit one) → For exam → pick the exam. “No exam” unlinks it.', 'From the exam: Calendar → Upcoming exams → the link button on an exam → tick the tasks to link (untick to unlink).'],
        tip: 'Regenerating a prep plan never removes tasks you linked by hand.',
        shots: [
          ['14b-task-exam-link.png', 'Linking a task to an exam'],
          ['14c-exam-link-tasks.png', 'Linking tasks from the exam'],
          ['14d-task-exam-badge.png', 'A task shows the exam it is for'],
        ],
      },
      {
        name: 'Weekly timetable and classes',
        what: 'Classes repeat every week (or on a rotation such as Day A / Day B), with a teacher, room or online link, and the dates of the term. The Today screen shows the next class with a countdown.',
        how: ['Calendar → Weekly timetable → Add class.'],
        shots: [['15-timetable.png', 'The weekly timetable'], ['16-add-class.png', 'Adding a class']],
      },
      {
        name: 'Homework from a class',
        what: 'Homework can be added straight from a class, and each class shows its homework underneath.',
      },
      {
        name: 'Attendance',
        what: 'Each class session can be marked attended, missed, excused or cancelled. The app shows the attendance percentage per subject and warns when it drops below the target (75% by default).',
        how: ['Mark a class on the Today screen or in the Calendar; a reminder in the evening lists the ones not marked.'],
        shots: [['24-attendance.png', 'Attendance per subject on Progress']],
      },
      {
        name: 'Vacations and breaks',
        what: 'Holidays and breaks pause classes and repeating tasks on those days, so nothing is scheduled while the student is away.',
        how: ['Calendar → Vacations → Add break.'],
        shots: [['17-vacations.png', 'Vacations and breaks']],
      },
      {
        name: 'Activities',
        what: 'Clubs, sports and other activities can be added like classes, with a weekly limit on the hours spent on them.',
      },
      {
        name: 'Import and export a calendar',
        what: 'The timetable and exams can be saved as a calendar file (.ics) to add to Google Calendar or Outlook, and a calendar file from school can be imported.',
        how: ['Settings → Export calendar / Import calendar.'],
      },
    ],
  },
  {
    title: '4. Focus, flashcards and progress',
    intro: 'Tools to study in focused sessions, remember what was learnt, and see how it’s going, with an AI helper for the next step.',
    features: [
      {
        name: 'Focus timer',
        what: 'A Pomodoro-style timer: focus for 25, 45 or 60 minutes (or any length), then take a short break, with a longer break after a round. Each session is logged against its subject and task. The screen can stay on while focusing.',
        how: ['Open Focus Timer, pick a task and a length, tap Start. Focus mode hides everything else.'],
        shots: [['18-focus-timer.png', 'The focus timer']],
      },
      {
        name: 'Subjects',
        what: 'Each subject has a colour and an optional weekly study goal. Its card shows progress, open tasks, time studied this week, classes, grade and attendance.',
        how: ['Open Subjects from the menu; tap a subject to edit it.'],
        shots: [['19-subjects.png', 'Subjects']],
      },
      {
        name: 'Flashcards (new)',
        what: 'Question-and-answer cards, in a deck for each subject. Reviews are spaced out: each card comes back just before it would be forgotten, sooner if it was hard and later if it was easy, so a few minutes a day is enough to remember a lot. The dashboard shows how many cards are due.',
        how: [
          'Menu → Flashcards → Add cards. Type one card, or choose “Paste many” and paste one card per line as “question | answer”.',
          'Tap “Review” to go through the cards due today: think of the answer, tap “Show answer”, then say how it went (Again, Hard, Good or Easy). Each button shows when the card will come back.',
        ],
        tip: 'Up to 20 new cards are started a day, so a large deck doesn’t arrive all at once. A card counts as “learnt” after three reviews in a row without “Again”.',
        shots: [['37-flashcards.png', 'Decks and the cards due today'], ['38-flashcard-review.png', 'Reviewing a card: each answer button shows when it comes back'], ['39-add-cards.png', 'Pasting many cards at once']],
        mobileShots: [['38-flashcards.png', 'Decks and the cards due today'], ['39-flashcard-review.png', 'Reviewing a card'], ['40-add-cards.png', 'Pasting many cards at once']],
      },
      {
        name: 'Progress',
        what: 'Study streaks, minutes studied each day against the daily goal, time per subject, weekly goals and a weekly report.',
        shots: [['20-progress.png', 'The progress page']],
      },
      {
        name: 'Weekly review (new)',
        what: 'A look back at the week (or the week before): tasks done, focus time compared with the week before, time per subject, what slipped, and what’s coming in the next 7 days. Overdue tasks can be moved to today or tomorrow, or spread over the next days, in one tap, with Undo.',
        how: ['Progress → Weekly review.'],
        shots: [['21-weekly-review.png', 'The weekly review']],
      },
      {
        name: 'Progress report for parents and teachers (new)',
        what: 'A one-page report for a parent, teacher or mentor, for this week, the last 4 weeks or this term: focus time and streak, tasks done on time, attendance and grades per subject, flashcards learnt and the exams in the next two weeks. The student’s name and school come from the profile. Notes and task details stay private.',
        how: ['Progress → Progress report. Choose the period.', '“Save as PDF” makes a PDF to send or print; “Share summary” shares a short text version (in a chat app, or copied on a computer).'],
        shots: [['40-progress-report.png', 'The progress report']],
        mobileShots: [['41-progress-report.png', 'The progress report']],
      },
      {
        name: 'Achievements and streak protection (new)',
        what: 'Badges for study streaks, hours of focus, sessions, tasks done, finished exam prep plans and flashcards learnt, 18 in all. Badges not yet earned show how close they are, and a new badge pops up once when it’s earned. Streak protection means one missed day a week doesn’t break a streak, as long as the days either side were studied.',
        how: ['Progress → Achievements. “Almost there” lists the badges closest to being earned.'],
        tip: 'Two missed days in a row still end a streak. The dashboard, profile and report all count the streak the same way.',
        shots: [['41-achievements.png', 'Achievements, with the badges closest to being earned']],
        mobileShots: [['42-achievements.png', 'Achievements']],
      },
      {
        name: 'AI study helper: what to study now (new)',
        what: 'The AI helper (Claude, by Anthropic) looks at what’s due, the coming exams, weaker subjects and recent focus time, and suggests the next study session: 2 to 4 steps, most urgent first, each with why it matters and how long to spend.',
        how: ['Dashboard → “What should I study now?” → “What should I study now?”. “Ask again” gives a fresh suggestion.'],
        tip: 'Only titles, dates and numbers are sent, never notes or task details, and only when the student asks. Each account can ask 30 times a day.',
        shots: [['42-ai-advice.png', 'A suggested study session']],
        mobileShots: [['43-ai-advice.png', 'A suggested study session']],
      },
      {
        name: 'AI study helper: flashcards, quizzes and prep topics (new)',
        what: 'Paste a page of notes and the helper makes flashcards from the key points (keep the ones you want) or a 5-question practice quiz with explanations. In an exam prep plan, “Suggest with AI” fills in the topics to revise. Answers come in the app’s language.',
        how: [
          'Flashcards → “Make with AI”, or Dashboard → “What should I study now?” → the Flashcards or Quiz tab. Pick a subject, paste notes, then “Make flashcards” or “Make a quiz”.',
          'Untick any cards you don’t want, then add them. In a quiz, tap an answer to see if it’s right and why.',
        ],
        tip: 'Notes can be up to 20,000 characters. AI can make mistakes, so check the cards before relying on them.',
        shots: [['43-ai-cards.png', 'Flashcards made from notes']],
        mobileShots: [['44-ai-cards.png', 'Flashcards made from notes']],
      },
      {
        name: 'Grades and GPA',
        what: 'Scores from exams give an average per subject (as a percentage, a 4-point GPA or a 10-point CGPA) and a trend over time.',
        how: ['Add a score to an exam after it has happened.'],
        shots: [['22-grades.png', 'Grades on Progress']],
      },
      {
        name: '“What do I need?” calculator',
        what: 'Pick a target grade and the app says what score is needed in the next exam to reach it, and shows what an average would become with a given score.',
        how: ['Progress → “What do I need? Try a target grade”.'],
        shots: [['23-what-if.png', 'The what-if calculator']],
      },
    ],
  },
  {
    title: '5. Reminders',
    intro: 'Reminders inside the app and, on phones, as notifications.',
    features: [
      {
        name: 'In-app alerts',
        what: 'The bell at the top lists overdue tasks, tasks due today and exams in the next three days.',
        shots: [['10-notifications.png', 'The alerts list']],
      },
      {
        name: 'Phone notifications',
        what: 'Notifications for tasks on their due day (with Done and Snooze buttons), the evening before and the morning of an exam, 10 minutes before a class, an evening reminder to mark attendance, a daily study reminder at a chosen hour, and a weekly report.',
        how: ['Settings → Notifications.'],
      },
      {
        name: 'Smart reminders (new)',
        what: 'The app learns when the student usually studies (from their focus sessions) and reminds them at that time about what’s due, for example “You usually study around 6 PM: 3 tasks due tomorrow · Physics mid-term in 3 days”. It stays quiet on days with nothing due, or once they’ve started studying.',
        how: ['On by default: Settings → Smart reminders shows the time it has learnt.'],
      },
      {
        name: 'Home-screen widgets',
        what: 'Two widgets for the home screen of an Android phone or an iPhone. “Next class” shows the next class and when it starts. “Today” (new) shows how many tasks are left today, the first three of them, focus time against the daily goal, and how many flashcards are due.',
        how: ['Long-press the home screen → Widgets → Study Planner, then pick “Next class” or “Today”.'],
        tip: 'Widgets need the installed app (not Expo Go or the web). They refresh whenever the app opens or the tasks change.',
      },
      {
        name: 'Shortcuts on the app icon (new)',
        what: 'Press and hold the Study Planner icon on the home screen for three shortcuts: New task (opens the new task sheet), Start focus (opens the focus timer) and Review flashcards. They show in the app’s language.',
        how: ['Long-press the app icon, then tap a shortcut.', 'On Android, a shortcut can also be dragged onto the home screen as an icon of its own.'],
        tip: 'Shortcuts need the installed app (not Expo Go or the web).',
      },
    ],
  },
  {
    title: '6. Study groups and classrooms',
    intro: 'Classmates can share timetables, and the group’s owner can post notes and tasks for everyone. Teachers can share study materials with their own students in a classroom.',
    features: [
      {
        name: 'Live study groups',
        what: 'A student shares their classes, exams and breaks with classmates through a link or QR code. Classmates who join get them in their own calendar, and when the owner changes something, everyone’s copy updates by itself. Private things (attendance, scores, notes, homework, tasks) are never shared.',
        how: ['Settings → Share my timetable → choose what to share → Create live link, then copy, share or show the QR code.', 'The owner sees how many members each group has, and can stop sharing.'],
        shots: [['33-share-live-group.png', 'Sharing a live group with a link and QR code']],
      },
      {
        name: 'Joining a group',
        what: 'Opening a group link shows the group, who shared it and what it will add, before joining. A member can leave a group at any time.',
        shots: [['36-join-group.png', 'Joining a group from a link']],
      },
      {
        name: 'Group board: notes (new)',
        what: 'The group’s owner posts notes such as “Test moved to Friday”, and can pin the important ones to the top. Members see them straight away, with a pop-up when a new one arrives.',
        how: ['Owner: Settings → Share my timetable → Board.', 'Member: Settings → the board button next to the group.'],
        shots: [['34-group-board-owner.png', 'The owner’s board']],
      },
      {
        name: 'Group board: shared tasks (new)',
        what: 'The owner posts an assignment (title, due date, length, details) and every member gets their own copy in their task list to tick off. If the owner changes it, the copies not yet done change too; if the owner removes it, the copies not yet done go. A member who deletes their copy doesn’t get it back.',
        shots: [['35-group-member.png', 'A member’s view: the pinned note and the task “In your tasks”']],
      },
      {
        name: 'Replies on the board (new)',
        what: 'Anyone in a group, the owner and every member, can reply under a note or a shared task (“Is it chapters 4 and 5?”). Replies appear for everyone straight away. People delete their own replies, and the owner can delete any. Each reply shows who wrote it and when; the name comes from the account, so it can’t be faked.',
        how: ['Open the group’s board → “Reply” (or “2 replies”) under a post → type → send.'],
        tip: 'Up to 50 replies on each post.',
        shots: [['45-board-replies.png', 'A reply under a note on the board']],
        mobileShots: [['46-board-replies.png', 'A reply under a note']],
      },
      {
        name: 'Study together (new)',
        what: 'The Focus screen shows who in your study groups is studying right now: their name, the subject and how many minutes are left (never the task). “Join” starts your own focus session that ends when theirs does. While focusing, a line under the timer says who else is studying (“Priya is studying too”), and each group’s board shows who in that group is studying.',
        how: ['Focus Timer → Studying now → Join.', 'Settings → Study groups → “Show my focus sessions to my groups” turns sharing off; you still see the others.'],
        tip: 'Only the group’s owner and members can see it, and nothing is stored: a status goes when the timer stops or the app closes.',
        shots: [['44-studying-now.png', 'Studying now, with Join']],
        mobileShots: [['45-studying-now.png', 'Studying now']],
      },
      {
        name: 'Classrooms for teachers (new)',
        what: 'A teacher makes a classroom and shares study materials with their own students only: PDFs, photos of the board, Word, PowerPoint and Excel files (up to 20 MB each), web links such as videos, and notes. Students join with the classroom’s 8-letter code, and the teacher approves each one. Students who aren’t approved, and anyone else, can’t see anything.',
        how: [
          'Settings → Classrooms → Create → give it a name (e.g. “Physics 10-B”) and a subject → Create classroom.',
          'Share the code with the class (the Share button sends it by WhatsApp, email and so on).',
          'Students tab: Approve or Decline each request. Remove a student at any time, or make a new code if the old one is passed around.',
          'Materials tab → Add material → File, Link or Note. Pin important ones to the top; the bin deletes one (tap twice).',
        ],
        tip: 'Free: 1 classroom and 200 MB of files. Premium: 10 classrooms and 5 GB. Students never see each other’s names; the teacher sees only names, never their tasks or grades.',
      },
      {
        name: 'Joining a classroom (new)',
        what: 'Students get their teacher’s materials in the app. New materials show a “New” badge, and a message pops up when the teacher adds one while the app is open.',
        how: [
          'Settings → Classrooms → Join with a code → type the code from the teacher → Ask to join.',
          'Wait for the teacher to approve (a message says “You’re in!”), then open the classroom.',
          'Tap a file to open it in the phone’s PDF, Office or photo app; tap a link to open it in the browser.',
          'The flag button reports a material, and “Report this classroom” reports the whole classroom, to the Studyly team.',
        ],
        tip: 'Leave a classroom at any time from inside it. File links work for one hour, so a forwarded link stops working.',
      },
    ],
  },
  {
    title: '7. Cloud, sync and safety',
    intro: 'The student’s data is theirs: saved on the device first, kept in step across devices, and backed up.',
    features: [
      {
        name: 'Sync across devices',
        what: 'Every change is saved on the device at once and sent to the cloud within a second or two. Other devices signed in to the same account update live. If the same task is changed on two devices, the changes are merged field by field, so neither is lost.',
        how: ['Nothing to do. Settings → Cloud sync shows when it last synced, with a “Sync now” button.'],
        shots: [['26-settings-sync.png', 'Cloud sync and data settings']],
      },
      {
        name: 'Works offline, with a “not synced” dot (new)',
        what: 'The app works without internet. Changes waiting to be sent show an orange dot on the account button, and Settings says how many are waiting. They are sent as soon as the device is back online.',
        shots: [['31-not-synced-dot.png', 'The orange “not synced” dot on the account button']],
      },
      {
        name: 'Start offline on a new device (new)',
        what: 'If a new device has no internet, the student can start offline with an empty plan and use the app straight away; their account’s data merges in when they’re back online, and anything they added is kept.',
      },
      {
        name: 'Photos in the cloud',
        what: 'Photos attached to tasks are stored privately in the cloud, so they appear on the student’s other devices too.',
      },
      {
        name: 'Study Planner Premium (new)',
        what: 'Everything needed to plan and study stays free. Premium adds more: 30 AI requests a day (Free: 5 a week), unlimited flashcards (Free: 200), 2,000 photos (Free: 50), up to 10 study groups to make (Free: 1), the progress report for a month or a term and as a PDF, and no ads. The Premium page shows the account’s plan, the two side by side and the prices. When a Free limit is reached, the app says so and offers a way to Premium.',
        how: ['Settings → Account → Study Planner Premium.', 'In the phone apps: pick monthly or yearly (prices in your currency, from Google Play or the App Store) and buy. Restore purchases brings Premium back on a new phone; Manage opens the store to change or cancel.'],
        tip: 'The limits are checked by the server, so they hold whatever the app does. Until buying Premium is ready, every account gets everything; at launch, existing accounts get 3 months of Premium as a thank-you.',
        shots: [['49-premium.png', 'Study Planner Premium']],
        mobileShots: [['50-premium.png', 'Study Planner Premium']],
      },
      {
        name: 'Ads on the Free plan (new)',
        what: 'In the Android and iPhone apps, every account on the Free plan sees a few ads from Google AdMob: a banner under the quote on the Dashboard and one at the bottom of Progress, and now and then a full-screen ad at a natural break (when a break starts after a focus session, or when a finished flashcard review closes; at most once every 10 minutes). When the week’s free AI requests are used, a short ad can be watched for one more (up to 3 a day). Ads are never personalised and never shown during a session, a review or a quiz. Students under 18 (and accounts with no age recorded) get only general-audience (G) ads.',
        how: ['Nothing to do: ads appear only where described. Premium removes them.'],
        tip: 'No ads on Premium or on the web.',
      },
      {
        name: 'Privacy & data (new)',
        what: 'One page explains, in plain words, what the app keeps, where, who can see it and for how long: your study data (only your account can read it), the copy on each device, what study groups see, what the AI helper receives, error reports (30 days) and backups (14 days). It also says what the app never does: no ads, no tracking and no selling of data. The controls are on the same page: save a copy of your data, turn study-together sharing on or off, and delete your account. Deleting it removes everything, including its copies in the backups.',
        how: ['Settings → Data → Privacy & data.'],
        tip: 'The full privacy policy, for the app stores, is docs/privacy-policy.md.',
        shots: [['48-privacy.png', 'Privacy & data']],
        mobileShots: [['49-privacy.png', 'Privacy & data']],
      },
      {
        name: 'Signing out keeps devices private',
        what: 'Signing out removes the account’s data from that device (it stays in the cloud). If some changes haven’t been sent yet, the app warns first. An account deleted on one device is signed out on the others.',
      },
      {
        name: 'Backups',
        what: 'A copy of everyone’s data is taken every night and kept for 14 days, so a student’s data can be restored to an earlier day if something goes wrong. Students can also save their own backup file and restore it.',
        how: ['Settings → Export backup / Restore from backup.'],
      },
      {
        name: 'Error reports and limits',
        what: 'If something goes wrong in the app, a short private report is sent to the developer so it can be fixed. Sensible limits keep the service healthy: up to 10 live groups per person, 200 members per group and 100 posts on a group board.',
      },
      {
        name: 'App updates (new)',
        what: 'When a new version is out, the phone app asks the student to update. For an important release the old version shows an “Update required” screen that can’t be skipped, so everyone moves to the version that works with the latest data. For other releases, an “Update available” message can be put off with Later and comes back only when there is a newer version.',
        how: [
          'Tap Update now to open the app’s page in Google Play, then tap Update.',
          'The student’s tasks and subjects are safe: they are in their account and appear again after the update.',
        ],
        tip: 'Only in the phone apps. The web version is always the newest.',
      },
    ],
  },
  {
    title: '8. Personalise and accessibility',
    intro: 'The app adapts to the student, their language and their device.',
    features: [
      {
        name: 'Settings',
        what: 'Daily focus goal, timer lengths, reminders, theme, language, week start day, study groups, backups and the account.',
        shots: [['25-settings.png', 'Settings']],
      },
      {
        name: 'Light and dark mode',
        what: 'The app opens in the light look. A dark look is one tap away, or “System” makes it follow the phone’s own light or dark setting.',
        how: ['Settings → Theme: Light (the default), Dark or System.'],
        shots: [['29-dark-mode.png', 'Dark mode']],
      },
      {
        name: 'Four languages',
        what: 'English, Hindi, Odia and Spanish, including dates and times in the local style.',
        how: ['Settings → Language.'],
        shots: [['30-hindi.png', 'The dashboard in Hindi']],
      },
      {
        name: 'Phone, tablet and computer',
        what: 'On a phone the app has a bottom tab bar and a + button; on a computer it has a side menu and two columns. The same account works on the web, Android and iPhone.',
        shots: [['32-phone.png', 'On a phone']],
        mobileShots: [], // the menu is shown under Getting around on a phone
      },
      {
        name: 'Text size and an easier-to-read font (new)',
        what: 'Text can be made bigger everywhere in the app (Standard, Large or Larger), and the letters can be switched to Lexend, a font with more space between letters that was designed to make reading easier. It can help students with dyslexia or tired eyes. Both settings follow the account to every device.',
        how: ['Settings → Appearance → Text size: Standard, Large or Larger.', 'Settings → Appearance → “Easier-to-read font”.'],
        tip: 'On a phone the app also follows the phone’s own text size setting.',
        shots: [['47-reading.png', 'Text size and the easier-to-read font in Settings']],
        mobileShots: [['48-reading.png', 'Text size and the easier-to-read font']],
      },
      {
        name: 'Install the web app (new)',
        what: 'The web version can be installed like an app: it gets its own icon on the home screen or desktop and opens in its own window, without the browser’s address bar. It is the same app and the same account, so nothing needs setting up again.',
        how: ['Chrome or Edge (computer or Android): Settings → About → “Install the app”.', 'iPhone or iPad: open the app in Safari, tap Share, then “Add to Home Screen” (Settings → About → “Install the app” shows how).'],
        tip: 'Once installed the row disappears. To remove it, uninstall it like any other app.',
      },
      {
        name: 'Keyboard shortcuts',
        desktopOnly: true,
        what: 'On a computer: N for a new task, / to search, 1–5 to switch screens, and more.',
        how: ['Press ? to see them all.'],
        shots: [['28-shortcuts.png', 'Keyboard shortcuts']],
      },
      {
        name: 'Accessible to everyone',
        what: 'Text is readable for people with low vision (it meets the WCAG 2.1 AA contrast standard in light and dark mode), every button has a name for screen readers (which also hear which option is chosen, such as the current theme), and everything works with a keyboard. An automatic check runs on every screen.',
      },
      {
        name: 'Fast with lots of data',
        what: 'Tested with a heavy year of data (2,000 tasks, 150 exams, 1,500 focus sessions): screens open in a quarter of a second.',
      },
    ],
  },
  {
    title: '9. Quality behind the scenes',
    intro: 'How the app is kept working as it grows. Useful for a technical reviewer.',
    features: [
      {
        name: 'Automatic tests',
        what: 'About 200 browser tests drive the real app (on a phone and a computer screen) through every feature, and 30 sets of unit tests check the logic: planning, sync and merging, prep plans, reminders, grades, attendance and more.',
      },
      {
        name: 'Checks on every change (CI)',
        what: 'Each time the code is pushed to GitHub, the code style checks and unit tests run automatically; the browser tests can be run on demand.',
      },
      {
        name: 'Accessibility and performance checks',
        what: 'A script checks every screen against the WCAG 2.1 accessibility rules in light and dark mode, and another measures the app’s speed with a large amount of data.',
      },
      {
        name: 'Demo accounts',
        what: 'Ready-made demo accounts (a group owner, two members and one with full sample data) make it easy to show the app.',
      },
    ],
  },
];

const FLOWS = [
  ['flow-1-journey.png', 'Using the app: from opening it to studying'],
  ['flow-2-study.png', 'The study loop: plan, do, review'],
  ['flow-3-sync.png', 'How data is saved and synced'],
  ['flow-4-groups.png', 'How live study groups work'],
];

// ---------- the phone guide's extra first area ----------
if (MOBILE) {
  for (const a of AREAS) a.features = a.features.filter((f) => !f.desktopOnly);
  AREAS.unshift({
    title: '0. Getting around on a phone',
    intro: 'On Android and iPhone the app works the same way. Five things to know first.',
    features: [
      {
        name: 'The tab bar and the + button',
        what: 'The bar at the bottom has Home (the dashboard), Calendar, Focus and Progress, with a big + in the middle to add a task from anywhere.',
        mobileShots: [['04-dashboard.png', 'Home, with the tab bar at the bottom']],
      },
      {
        name: 'The menu',
        what: 'Subjects, Settings and the profile are in the menu: tap ☰ at the top left of Home. It also shows the subjects and today’s goal.',
        mobileShots: [['37-menu.png', 'The menu']],
      },
      {
        name: 'Swipe a task',
        what: 'Swipe a task to the right to mark it done, or to the left to delete it (an Undo appears). A long press deletes it too.',
      },
      {
        name: 'Notifications on the phone',
        what: 'Tasks on their due day (with Done and Snooze buttons right in the notification), exams the evening before and on the morning, classes 10 minutes before, a smart reminder at the usual study time, and the weekly report. Turn them on in Settings → Notifications.',
      },
      {
        name: 'Outside the app',
        what: 'A home-screen widget shows the next class (Android and iPhone). On an iPhone, a running focus session shows on the lock screen and in the Dynamic Island. The screen can stay on while focusing, and the phone can vibrate when a session ends.',
      },
    ],
  });
}

// ---------- the document ----------
const count = AREAS.reduce((n, a) => n + a.features.length, 0);
const children = [
  new Paragraph({ spacing: { before: 2400, after: 200 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Study Planner', font: FONT, size: 72, bold: true, color: BLUE })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: MOBILE ? 'Mobile guide: Android and iPhone' : 'Feature guide', font: FONT, size: 40, color: INK })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'Plan · Focus · Grow', font: FONT, size: 26, italics: true, color: MUTED })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: MOBILE ? `${count} features, with Android and iPhone screenshots side by side` : `${count} features in ${AREAS.length} areas, with screenshots and flow diagrams`, font: FONT, size: 24, color: MUTED })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'November 2026', font: FONT, size: 24, color: MUTED })] }),

  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 160 }, children: [new TextRun({ text: 'Contents', font: FONT })] }),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-1' }),

  h1('About Study Planner'),
  p('Study Planner is an app that helps students organise their studies in one place: tasks and homework, exams, the class timetable, breaks, focused study sessions and progress. It works on the web, on Android phones and on iPhones, with the same account everywhere.'),
  p('It is built for school and college students. It plans each day for them, reminds them at the right time, shows how their studies are going, and lets classmates share timetables and assignments.'),
  ...(MOBILE
    ? [p([run('About the screenshots: ', { bold: true }), run('they show the app at the screen size of an Android phone (Pixel 7) and an iPhone (iPhone 15). The app is the same on both; only the phone’s own frame (status bar, notch) differs.')])]
    : []),
  label('The main ideas'),
  bullet([run('Everything in one place: ', { bold: true }), run('tasks, exams, classes, breaks, focus time, grades and attendance.')]),
  bullet([run('It plans for you: ', { bold: true }), run('a smart daily plan, exam prep plans and a weekly review.')]),
  bullet([run('Works anywhere: ', { bold: true }), run('phone or computer, online or offline, kept in step through the cloud.')]),
  bullet([run('Better together: ', { bold: true }), run('live study groups with a shared board of notes and tasks.')]),
  bullet([run('For everyone: ', { bold: true }), run('four languages, light and dark mode, and accessible to people using screen readers or keyboards.')]),
  label('At a glance'),
  p([run('Features marked ', { color: MUTED }), run('(new)', { bold: true, color: BLUE }), run(' are the most recent additions.', { color: MUTED })], { spacing: { after: 100 } }),
  table([['Area', 'Features'], ...AREAS.map((a) => [a.title.replace(/^\d+\.\s*/, ''), a.features.map((f) => f.name.replace(' (new)', '')).join(', ')])], [2600, CONTENT_W - 2600]),

];
const flows = [
  new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 120 }, children: [new TextRun({ text: 'How it works: flow diagrams', font: FONT })] }),
  p('Four diagrams show how the pieces fit together.'),
  ...FLOWS.flatMap(([f, c], i) => [...(i ? [new Paragraph({ children: [new PageBreak()] })] : []), image(`${ROOT}/${f}`, 900, 430), caption(`Figure ${i + 1}: ${c}`)]),
];
const features = [];
AREAS.forEach((a, i) => {
  features.push(i ? h1(a.title) : new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 160 }, children: [new TextRun({ text: a.title, font: FONT })] }), p(a.intro, { spacing: { after: 160 } }));
  for (const f of a.features) features.push(...feature(f));
});

const margins = { top: 1440, bottom: 1440, left: 1440, right: 1440 };
const section = (kids, landscape = false) => ({
  properties: { page: { margin: margins, ...(landscape ? { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE } } : {}) } },
  headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Study Planner · ${DOC_NAME}`, font: FONT, size: 16, color: MUTED })] })] }) },
  footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT], font: FONT, size: 16, color: MUTED })] })] }) },
  children: kids,
});
const doc = new Document({
  creator: 'Study Planner',
  title: `Study Planner: ${DOC_NAME.toLowerCase()}`,
  description: 'Every feature of the Study Planner app, with screenshots and flow diagrams',
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 36, bold: true, color: BLUE, font: FONT }, paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, color: INK, font: FONT }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
  sections: [
    section(children),
    section(flows, true),
    section(features),
  ],
});
Packer.toBuffer(doc).then((buf) => {
  const out = `${ROOT}/${MOBILE ? 'Study-Planner-Mobile-Guide' : 'Study-Planner-Feature-Guide'}.docx`;
  fs.writeFileSync(out, buf);
  console.log(`${out} (${Math.round(buf.length / 1024)} KB, ${count} features)`);
});
