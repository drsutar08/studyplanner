// Keeps the home-screen widgets ("Next class" and "Today") up to date. They only exist in development and store
// builds: Expo Go and the web have no widget module, so loading it there fails and every call is a no-op.
import { Platform } from 'react-native';
import { t } from '../i18n';
import { formatDue, formatTime, dateKey } from '../dates';
import { widgetTimeline } from './timeline';
import { todaySummary } from './today';

let widget = null;
if (Platform.OS === 'ios' || Platform.OS === 'android') {
  try {
    widget = require('./NextClassWidget').default;  
  } catch {
    widget = null; // Expo Go: the native widget module isn't included
  }
}

export const widgetsSupported = () => !!widget;

const FALLBACK = '#7A5CFA';

// Translated, display-ready props for one timeline entry
const propsFor = (session, subjectById) => {
  const base = { kicker: t('widget.nextClass'), emptyText: t('widget.empty'), liveText: t('widget.now') };
  if (!session) return { ...base, color: FALLBACK };
  const { cls, date, startAt } = session;
  const subject = subjectById[cls.subjectId];
  const time = cls.end ? `${formatTime(cls.start)} – ${formatTime(cls.end)}` : formatTime(cls.start);
  return {
    ...base,
    title: cls.title,
    color: subject ? subject.color : FALLBACK,
    startAt: startAt.getTime(),
    live: false,
    timeText: date === dateKey() ? time : t('widget.dayTime', { day: formatDue(date), time }),
    place: cls.mode === 'online' ? t('widget.online') : [cls.location, subject && subject.name].filter(Boolean).join(' · '),
  };
};

// Call whenever classes, breaks, subjects or the language change, and when the app comes to the front.
export function syncNextClassWidget({ classes, term, vacations, subjects, rotation = null }) {
  if (!widget) return;
  try {
    const subjectById = Object.fromEntries(subjects.map((s) => [s.id, s]));
    const now = new Date();
    const entries = [];
    for (const { date, session } of widgetTimeline(classes, term, vacations, now, 2, rotation)) {
      const props = propsFor(session, subjectById);
      // While a class is running it says "Now" instead of counting down to a time that has passed,
      // so a class that starts later gets a second entry at its start time.
      if (session && session.startAt <= date) {
        entries.push({ date, props: { ...props, live: true } });
      } else {
        entries.push({ date, props });
        if (session) entries.push({ date: session.startAt, props: { ...props, live: true } });
      }
    }
    if (Platform.OS === 'ios') widget.updateTimeline(entries);
    else widget.updateSnapshot(entries[0].props);
  } catch {
    // A widget refresh must never break the app
  }
}

// The "Today" widget: today's tasks, focus against the goal and flashcards due (see today.js)
let todayWidget = null;
if (Platform.OS === 'ios' || Platform.OS === 'android') {
  try {
    todayWidget = require('./TodayWidget').default;
  } catch {
    todayWidget = null;
  }
}

// Call whenever tasks, sessions, cards, the daily goal or the language change, and when the app comes to the front
// (and when the day changes: the app checks on coming back).
export function syncTodayWidget({ tasks, sessions, cardsDue, dailyGoal }) {
  if (!todayWidget) return;
  try {
    const s = todaySummary({ tasks, sessions, cardsDue, dailyGoal, today: dateKey() });
    const props = {
      kicker: t('widget.today'),
      headline: s.left ? t('widget.tasksLeft', { count: s.left }) : t('widget.allDone'),
      overdueText: s.overdue ? t('widget.overdue', { count: s.overdue }) : '',
      titles: s.titles,
      focusText: t('widget.focus', { done: s.minutes, goal: s.goal }),
      cardsText: s.cardsDue ? t('widget.cards', { count: s.cardsDue }) : '',
    };
    if (Platform.OS === 'ios') {
      // the same props now, and a fresh (empty-of-focus) day at midnight until the app opens again
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      todayWidget.updateTimeline([
        { date: new Date(), props },
        { date: midnight, props: { ...props, focusText: t('widget.focus', { done: 0, goal: s.goal }), headline: t('widget.openToSee'), overdueText: '', titles: [], cardsText: '' } },
      ]);
    } else todayWidget.updateSnapshot(props);
  } catch {
    // A widget refresh must never break the app
  }
}
