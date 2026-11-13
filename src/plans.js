// Free and Premium (see the 20261112 migration, which enforces the limits). Pure, so it can be tested.
// The server's my_plan() says which plan an account is on, whether the limits are switched on yet, and the numbers.

// until the server says otherwise (signed out, offline, or the migration not applied): no limits
export const NO_LIMITS = { loaded: false, plan: 'free', enforced: false, expiresAt: null, source: null, ads: false, age: 'unknown', adRewardsLeft: 0, limits: { ai: 30, aiPeriod: 'day', cards: 1000000, photos: 2000, groups: 10 } };

export const FREE = { ai: 0, aiPeriod: 'day', cards: 200, photos: 50, groups: 1 };
export const PREMIUM = { ai: 30, aiPeriod: 'day', cards: null, photos: 2000, groups: 10 }; // null: unlimited

// prices to show until the store's own are loaded (the stores charge the local equivalent of these dollar prices)
export const PRICES = { month: '$2.99', year: '$19.99' };

// The comparison on the Premium page: [key, free, premium]; each value an i18n key under premium.values, or a number
export const COMPARISON = [
  ['ai', 'none', { n: PREMIUM.ai, per: 'day' }],
  ['ads', 'adsAdults', 'none'],
  ['planning', 'all', 'all'],
  ['focus', 'all', 'all'],
  ['grades', 'all', 'all'],
  ['cards', { n: FREE.cards }, 'unlimited'],
  ['photos', { n: FREE.photos }, { n: PREMIUM.photos }],
  ['groups', { n: FREE.groups }, { n: PREMIUM.groups }],
  ['report', 'thisWeek', 'allPeriods'],
];

// From the server's answer (snake_case) to what the app uses
export function readPlan(row) {
  if (!row || typeof row !== 'object') return NO_LIMITS;
  const l = row.limits || {};
  return {
    loaded: true,
    plan: row.plan === 'premium' ? 'premium' : 'free',
    enforced: !!row.enforced,
    expiresAt: row.expires_at || null,
    source: row.source || null,
    // the server decides who sees ads (every account that isn't Premium: the 20261114 migration), and says the age
    // group, which picks the kind of ads asked for (under-18 and unknown: 'under the age of consent', rated G)
    ads: row.ads === true,
    age: row.age === 'adult' || row.age === 'minor' ? row.age : 'unknown',
    adRewardsLeft: Math.max(0, Number(row.ad_rewards_left) || 0),
    limits: {
      ai: l.ai == null || !Number.isFinite(Number(l.ai)) ? NO_LIMITS.limits.ai : Number(l.ai), // 0 is real: Free has no AI
      aiPeriod: 'day',
      cards: Number(l.cards) || NO_LIMITS.limits.cards,
      photos: Number(l.photos) || NO_LIMITS.limits.photos,
      groups: Number(l.groups) || NO_LIMITS.limits.groups,
    },
  };
}

// The Free limits apply to this account now
export const limited = (p) => !!p && p.enforced && p.plan !== 'premium';

// The AI study helper is Premium only (the server refuses everyone else, whether or not the Free limits are on).
// Only once the plan is known: before that, or offline, the screen stays open and the server decides.
export const aiLocked = (p) => !!p && p.loaded === true && p.plan !== 'premium';

// Room left for `adding` more of something ('cards' | 'photos' | 'groups') when `have` exist: a number, or Infinity
export function roomFor(p, what, have) {
  if (!limited(p)) return Infinity;
  return Math.max(0, p.limits[what] - have);
}

// Features only Premium has (the app checks these; the server checks the counted ones above)
export const premiumOnly = (p, feature) => limited(p) && (feature === 'reportPeriods' || feature === 'reportPdf');

// Photos on tasks, counted as the server counts them (every photo stored; tasks in the archive too)
export const photoCount = (tasks = [], archive = []) =>
  [...tasks, ...archive].reduce((n, x) => n + ((x && x.attachments) || []).filter((a) => a.kind === 'photo').length, 0);
