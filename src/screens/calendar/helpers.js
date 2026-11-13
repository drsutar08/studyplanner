// Small text helpers for the Calendar screen and its sections
import { t, weekdayName } from '../../i18n';
import { formatDate, parseKey } from '../../dates';

// Repeat days of a repeating task: "Every day", "Weekdays" or "Mon, Wed" in the app language
export const describeDays = (days) => {
  if (days.length === 7) return t('classes.days.every');
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return t('classes.days.weekdays');
  return days.map((d) => weekdayName(d, 'short')).join(', ');
};

export const shortDay = (key) => formatDate(parseKey(key), { month: 'short', day: 'numeric' });

// The small line under a weekly class in the timetable: how long it runs for
export const rangeNote = (cls, term) => {
  if (cls.range === 'term' && term) return t('calendar.termRange', { start: shortDay(term.start), end: shortDay(term.end) });
  if (cls.range === 'manual' && cls.rangeStart && cls.rangeEnd) return t('calendar.range', { start: shortDay(cls.rangeStart), end: shortDay(cls.rangeEnd) });
  return '';
};
