import { t } from './i18n';
import { daysBetween, formatTime } from './dates';

// A smart reminder (smartReminders.js) in words: "You usually study around 6:00 PM" and "3 tasks due tomorrow ·
// Physics mid-term in 3 days"
export function nudgeText(n) {
  const parts = [];
  if (n.today) parts.push(t('smart.dueToday', { count: n.today }));
  if (n.tomorrow) parts.push(t('smart.dueTomorrow', { count: n.tomorrow }));
  if (n.exam) parts.push(t('smart.exam', { title: n.exam.title, count: daysBetween(n.day, n.exam.date) }));
  return { title: t('smart.title', { time: formatTime(n.time) }), body: parts.join(' · ') };
}
