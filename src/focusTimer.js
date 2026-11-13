// The Focus timer's rules, kept out of the screen so they can be tested: Pomodoro breaks, and bringing
// a session back after the app was closed. Pure, unit-tested in e2e/focusTimer.test.mjs.

// Defaults; each can be changed in Settings (`round`, `shortBreak`, `longBreak` below)
export const ROUND = 4; // focus sessions in a round; the break after the last one is a long one
export const SHORT_BREAK = 5; // minutes
export const LONG_BREAK = 15;
export const ROUND_OPTIONS = [2, 3, 4, 5, 6];
export const SHORT_BREAK_OPTIONS = [3, 5, 10];
export const LONG_BREAK_OPTIONS = [10, 15, 20, 30];

// The timer's settings, falling back to the defaults for anything unset or out of range
export const focusRules = (settings = {}) => ({
  round: ROUND_OPTIONS.includes(settings.focusRound) ? settings.focusRound : ROUND,
  shortBreak: SHORT_BREAK_OPTIONS.includes(settings.shortBreak) ? settings.shortBreak : SHORT_BREAK,
  longBreak: LONG_BREAK_OPTIONS.includes(settings.longBreak) ? settings.longBreak : LONG_BREAK,
});

// The break after a focus session, given how many sessions are done today (including the one just finished).
export const breakAfter = (doneToday, rules = focusRules()) =>
  doneToday > 0 && doneToday % rules.round === 0 ? { minutes: rules.longBreak, long: true } : { minutes: rules.shortBreak, long: false };

// Where today's next focus session sits in the round: { n: 1..round, of: round }
export const roundPosition = (doneToday, rules = focusRules()) => ({ n: (doneToday % rules.round) + 1, of: rules.round });

// What to show after loading the timer the app saved (see the Focus screen), at time `nowMs`:
//   { status: 'running', endAt, remainingMs }   still going
//   { status: 'finished', endedAt }             it ran out while the app was closed
//   { status: 'paused', remainingMs }           paused when it was closed
//   { status: 'idle' }                          nothing under way
// plus phase ('focus' | 'break'), minutes, taskId, chosen (the task was picked by hand), and `done`: the
// "session complete" panel still open, kept for the day it was shown (`today`). null if unreadable.
const isDone = (d) => !!d && (d.kind === 'break' || (d.kind === 'focus' && d.minutes > 0));
export const restoreTimer = (saved, nowMs, today = null) => {
  if (!saved || typeof saved !== 'object' || !(saved.minutes > 0)) return null;
  const base = {
    phase: saved.phase === 'break' ? 'break' : 'focus',
    minutes: saved.minutes,
    taskId: saved.taskId ?? null,
    chosen: !!saved.chosen,
    done: today && saved.day === today && isDone(saved.done) ? saved.done : null,
  };
  const full = saved.minutes * 60000;
  if (saved.status === 'running' && Number.isFinite(saved.endAt)) {
    const left = saved.endAt - nowMs;
    if (left > full) return { ...base, status: 'idle' }; // the clock went backwards: don't trust it
    return left > 0 ? { ...base, status: 'running', endAt: saved.endAt, remainingMs: left } : { ...base, status: 'finished', endedAt: saved.endAt };
  }
  if (saved.status === 'paused' && saved.remainingMs > 0 && saved.remainingMs <= full) return { ...base, status: 'paused', remainingMs: saved.remainingMs };
  return { ...base, status: 'idle' };
};

// Minutes to log for a session stopped early: whole minutes focused, rounded (under a minute isn't logged).
export const minutesFocused = (elapsedMs) => Math.max(0, Math.round(elapsedMs / 60000));
