// Unit tests for flashcards and spaced repetition. Pure logic: `npm run test:flashcards`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flashcards-'));
fs.writeFileSync(
  path.join(tmp, 'dates.mjs'),
  `const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const key = (d) => \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')}\`;
export const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return key(d); };`
);
fs.writeFileSync(path.join(tmp, 'flashcards.mjs'), fs.readFileSync(new URL('../src/flashcards.js', import.meta.url), 'utf8').replace("'./dates'", "'./dates.mjs'"));
const { newCard, review, nextInterval, dueCards, deckStats, parseCards, intervalUnit } = await import(pathToFileURL(path.join(tmp, 'flashcards.mjs')).href);

let pass = 0;
const test = (name, fn) => {
  try {
    fn();
    pass += 1;
    console.log('  PASS', name);
  } catch (e) {
    console.log('  FAIL', name, '\n      ', e.message);
    process.exitCode = 1;
  }
};
const today = '2026-11-02';
const card = (over = {}) => ({ ...newCard({ id: 'c', front: 'Q', back: 'A', today }), ...over });

test('a new card is due today, with the starting ease', () => {
  const c = newCard({ id: 'x', subjectId: 's', front: '  What is F?  ', back: ' ma ', today });
  assert.deepEqual([c.front, c.back, c.due, c.interval, c.ease, c.reps], ['What is F?', 'ma', today, 0, 2.5, 0]);
});

test('Good: 1 day, then 3, then growing by the ease', () => {
  let c = card();
  const days = [];
  for (let i = 0; i < 4; i++) {
    c = review(c, 'good', today);
    days.push(c.interval);
  }
  assert.deepEqual(days, [1, 3, 8, 20]);
  assert.equal(review(card(), 'good', today).due, '2026-11-03');
});

test('Again: back today, the ease drops, a lapse counted once it had been learnt', () => {
  const learnt = review(review(card(), 'good', today), 'good', today);
  const r = review(learnt, 'again', today);
  assert.deepEqual([r.interval, r.due, r.reps, r.lapses, r.ease], [0, today, 0, 1, 2.3]);
  assert.equal(review(card(), 'again', today).lapses, 0); // a new card forgotten isn't a lapse
});

test('Hard is shorter than Good, Easy longer; the ease never drops below 1.3', () => {
  const c = card({ reps: 3, interval: 10, ease: 2.5 });
  assert.ok(nextInterval(c, 'hard') < nextInterval(c, 'good'));
  assert.ok(nextInterval(c, 'easy') > nextInterval(c, 'good'));
  let low = card({ ease: 1.35 });
  for (let i = 0; i < 5; i++) low = review(low, 'again', today);
  assert.equal(low.ease, 1.3);
});

test('due today: reviews due first (oldest first), then new cards up to the day’s limit', () => {
  const cards = [
    card({ id: 'n1', createdAt: '2026-10-01' }),
    card({ id: 'r2', reps: 2, due: '2026-11-01' }),
    card({ id: 'later', reps: 2, due: '2026-11-09' }),
    card({ id: 'r1', reps: 2, due: '2026-10-30' }),
    card({ id: 'n2', createdAt: '2026-10-02' }),
  ];
  assert.deepEqual(dueCards(cards, today).map((c) => c.id), ['r1', 'r2', 'n1', 'n2']);
  assert.deepEqual(dueCards(cards, today, { newPerDay: 1 }).map((c) => c.id), ['r1', 'r2', 'n1']);
  const decks = [card({ id: 'm', subjectId: 'math' }), card({ id: 'none', subjectId: null })];
  assert.deepEqual(dueCards(decks, today, { subjectId: null }).map((c) => c.id), ['none']); // no subject is a deck too
  assert.deepEqual(dueCards(decks, today, { subjectId: 'math' }).map((c) => c.id), ['m']);
});

test('decks per subject: due, new and in all; empty decks left out', () => {
  const subjects = [{ id: 'm', name: 'Maths' }, { id: 'p', name: 'Physics' }];
  const cards = [card({ id: 1, subjectId: 'm' }), card({ id: 2, subjectId: 'm', reps: 1, due: '2026-11-20' }), card({ id: 3, subjectId: null })];
  assert.deepEqual(deckStats(cards, subjects, today).map((d) => [d.name, d.due, d.fresh, d.total]), [['Maths', 1, 1, 2], [null, 1, 1, 1]]);
});

test('cards typed one per line with a separator', () => {
  assert.deepEqual(parseCards('F = ma | Newton’s second law\nSpeed of light\t3×10⁸ m/s\n\nno separator\nH2O - water'), [
    { front: 'F = ma', back: 'Newton’s second law' },
    { front: 'Speed of light', back: '3×10⁸ m/s' },
    { front: 'H2O', back: 'water' },
  ]);
});

test('how long until a card comes back, in words-sized units', () => {
  assert.deepEqual([0, 1, 13, 20, 90].map(intervalUnit), [{ n: 0, unit: 'now' }, { n: 1, unit: 'day' }, { n: 13, unit: 'day' }, { n: 3, unit: 'week' }, { n: 3, unit: 'month' }]);
});

console.log(`flashcards: ${pass} passed`);
