// Flashcards with spaced repetition (a simplified SM-2). Each card has an interval (days until it is shown again) and
// an ease (how fast the interval grows). A review is graded Again, Hard, Good or Easy. Pure.
import { addDays } from './dates';

export const GRADES = ['again', 'hard', 'good', 'easy'];
export const START_EASE = 2.5;
const MIN_EASE = 1.3;
export const NEW_PER_DAY = 20; // new cards brought into a day's reviews

export const newCard = ({ id, subjectId = null, front, back, today }) => ({
  id,
  subjectId,
  front: String(front).trim().slice(0, 500),
  back: String(back).trim().slice(0, 1000),
  due: today,
  interval: 0,
  ease: START_EASE,
  reps: 0,
  lapses: 0,
  createdAt: today,
  reviewedAt: null,
});

// The interval after a grade (in days; 0 = again today)
export function nextInterval(card, grade) {
  const { interval = 0, ease = START_EASE, reps = 0 } = card;
  if (grade === 'again') return 0;
  if (grade === 'hard') return Math.max(1, Math.round(reps ? interval * 1.2 : 1));
  if (grade === 'good') return reps === 0 ? 1 : reps === 1 ? 3 : Math.max(interval + 1, Math.round(interval * ease));
  return reps === 0 ? 4 : Math.max(interval + 2, Math.round(interval * ease * 1.3)); // easy
}

// The card after a review on `today`
export function review(card, grade, today) {
  const interval = nextInterval(card, grade);
  const ease = Math.max(MIN_EASE, (card.ease || START_EASE) + { again: -0.2, hard: -0.15, good: 0, easy: 0.15 }[grade]);
  const again = grade === 'again';
  return {
    ...card,
    interval,
    ease: Math.round(ease * 100) / 100,
    reps: again ? 0 : (card.reps || 0) + 1,
    lapses: (card.lapses || 0) + (again && card.reps ? 1 : 0),
    due: addDays(today, interval),
    reviewedAt: today,
  };
}

// Cards to review on `today`: those due (oldest first), then new ones up to the day's limit (counting new cards
// already started today). `subjectId` narrows it to one deck (null: the cards without a subject).
export function dueCards(cards, today, { subjectId, newPerDay = NEW_PER_DAY } = {}) {
  const deck = (cards || []).filter((c) => subjectId === undefined || (c.subjectId || null) === subjectId);
  const old = deck.filter((c) => c.reps > 0 && c.due <= today).sort((a, b) => a.due.localeCompare(b.due));
  const startedToday = deck.filter((c) => c.reps > 0 && c.createdAt === today && c.reviewedAt === today).length;
  const fresh = deck.filter((c) => !c.reps && c.due <= today).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [...old, ...fresh.slice(0, Math.max(0, newPerDay - startedToday))];
}

// Per subject (and cards without one): how many are due, new and in all
export function deckStats(cards, subjects, today) {
  const decks = [...(subjects || []).map((s) => ({ id: s.id, name: s.name, color: s.color })), { id: null, name: null, color: null }];
  return decks
    .map((d) => {
      const mine = (cards || []).filter((c) => (c.subjectId || null) === d.id);
      const due = dueCards(mine, today);
      return { ...d, total: mine.length, due: due.length, fresh: mine.filter((c) => !c.reps).length };
    })
    .filter((d) => d.total);
}

// Cards typed or pasted, one per line: "question | answer". A tab works too, and " - " or " = " when the line has
// neither (so "F = ma | Newton's second law" splits at the bar).
const SEPARATORS = ['|', '\t', ' - ', ' = '];
export function parseCards(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sep = SEPARATORS.find((s) => line.includes(s));
      if (!sep) return null;
      const at = line.indexOf(sep);
      const front = line.slice(0, at).trim();
      const back = line.slice(at + sep.length).trim();
      return front && back ? { front, back } : null;
    })
    .filter(Boolean);
}

// "1d", "3d", "2w", "4mo": how long until a card comes back
export const intervalUnit = (days) => (days <= 0 ? { n: 0, unit: 'now' } : days < 14 ? { n: days, unit: 'day' } : days < 60 ? { n: Math.round(days / 7), unit: 'week' } : { n: Math.round(days / 30), unit: 'month' });
