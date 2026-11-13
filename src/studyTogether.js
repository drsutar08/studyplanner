// Study together: who in your study groups is in a focus session (or on a break) right now, from the presence of
// each group's channel (cloud/studyTogether.js). Pure, so it can be tested.
//   groups: [{ id, name, presence: { [userId]: [{ name, status }] } }]   (supabase's presenceState(), keyed by user)
//   status: { phase: 'focus' | 'break', endAt, paused, remainingMs, minutes, subject, color }

// The people studying, once each (with every group they share with you), focus sessions first, ending soonest first
export function studyingNow(groups, myId, now) {
  const byUser = new Map();
  for (const g of groups || []) {
    for (const [userId, metas] of Object.entries(g.presence || {})) {
      if (userId === myId) continue;
      const meta = (metas || [])[metas.length - 1];
      const s = meta && meta.status;
      if (!s) continue;
      const leftMs = s.paused ? s.remainingMs : s.endAt - now;
      if (!(leftMs > 0)) continue; // ended (an app that closed mid-session takes a moment to drop out)
      const seen = byUser.get(userId);
      if (seen) {
        if (!seen.groups.includes(g.name)) seen.groups.push(g.name);
        continue;
      }
      byUser.set(userId, {
        userId,
        name: String(meta.name || '').slice(0, 60),
        phase: s.phase === 'break' ? 'break' : 'focus',
        paused: !!s.paused,
        endAt: s.endAt || null,
        leftMs,
        minutes: s.minutes || 0,
        subject: s.subject ? String(s.subject).slice(0, 60) : null,
        color: s.color || null,
        groups: [g.name],
      });
    }
  }
  const rank = (p) => (p.phase === 'focus' ? (p.paused ? 1 : 0) : 2);
  return [...byUser.values()].sort((a, b) => rank(a) - rank(b) || a.leftMs - b.leftMs || a.name.localeCompare(b.name));
}

// Joining someone's session: a running focus session with at least 2 minutes to go. Yours ends when theirs does.
export const JOIN_MIN_MS = 2 * 60 * 1000;
export const canJoin = (p, now) => !!p && p.phase === 'focus' && !p.paused && !!p.endAt && p.endAt - now >= JOIN_MIN_MS;
export const joinPlan = (p, now) => ({ endAt: p.endAt, minutes: Math.max(1, Math.round((p.endAt - now) / 60000)) });

// What this device shares about its timer: nothing about the task (only its subject), and nothing when idle
export function myStatus({ underWay, running, phase, endAt, remaining, minutes, subject }) {
  if (!underWay) return null;
  return {
    phase,
    paused: !running,
    endAt: running ? endAt : null,
    remainingMs: running ? null : Math.round(remaining),
    minutes,
    subject: subject ? subject.name : null,
    color: subject ? subject.color : null,
  };
}
