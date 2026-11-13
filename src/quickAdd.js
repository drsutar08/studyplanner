// Quick add: a task from one line, e.g. "Physics worksheet tomorrow 30 min !". Pure, so it can be tested.
// `words` comes from the language (i18n quickAdd.*): lists of words for today, tomorrow, the weekdays (Sunday
// first), minutes, hours and the little words before a day ("on", "by", "due"), all lower case.
//   parseQuickAdd(text, { today, subjects, words, defaultMinutes }) ->
//     { title, due, time, estimate, priority, subjectId, found: { due, time, estimate, priority, subject } }
// Picked up and taken out of the title: a day, a time ("5pm", "17:30"), a length ("30 min", "1.5 h"), "!" for high
// priority and "#name" for a subject. A subject named in the text ("Physics worksheet") is picked too but stays in
// the title.

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plusDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return keyOf(new Date(y, m - 1, d + n));
};
const weekdayOf = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// a word on its own: not inside another (works for scripts without \b, like Devanagari and Odia)
const wordRe = (alts, flags = 'iu') => new RegExp(`(^|[\\s,.;:!?(])(${alts.map(esc).join('|')})(?=$|[\\s,.;:!?)])`, flags);

export function parseQuickAdd(text, { today, subjects = [], words, defaultMinutes = 30 }) {
  // "5 p.m." (as speech recognition writes it) reads as 5pm
  const clean = String(text || '').replace(/(\d)\s*([ap])\.\s?m\.?/gi, '$1$2m');
  let rest = ` ${clean.replace(/\s+/g, ' ').trim()} `;
  const found = {};
  const take = (re, fn) => {
    const m = rest.match(re);
    if (!m) return false;
    if (fn(m) === false) return false;
    rest = `${rest.slice(0, m.index)} ${rest.slice(m.index + m[0].length)}`;
    return true;
  };
  const filler = (words.before || []).filter(Boolean);
  const lead = filler.length ? `(?:(?:${filler.map(esc).join('|')})\\s+)?` : '';
  const dayWord = (alts) => new RegExp(`(^|[\\s,.;:!?(])${lead}(${alts.map(esc).join('|')})(?=$|[\\s,.;:!?)])`, 'iu');

  // priority: "!" on its own (or "!!")
  let priority = 'med';
  if (take(/(^|\s)!{1,3}(?=\s|$)/u, () => {})) {
    priority = 'high';
    found.priority = true;
  }

  // #subject: the subject whose name starts with it
  let subjectId = null;
  take(/(^|\s)#([^\s#]+)/u, (m) => {
    const tag = m[2].toLowerCase();
    const s = subjects.find((x) => x.name.toLowerCase() === tag) || subjects.find((x) => x.name.toLowerCase().replace(/\s+/g, '').startsWith(tag));
    if (!s) return false;
    subjectId = s.id;
    found.subject = s.name;
    return undefined;
  });

  // length: "30 min", "45m", "1.5 h", "2 hours"
  let estimate = null;
  const units = (list) => list.filter(Boolean).map(esc).join('|');
  take(new RegExp(`(^|\\s)(\\d+(?:[.,]\\d+)?)\\s*(${units(words.hours)})(?=$|[\\s,.;:!?)])`, 'iu'), (m) => {
    estimate = Math.round(parseFloat(m[2].replace(',', '.')) * 60);
  });
  if (estimate === null)
    take(new RegExp(`(^|\\s)(\\d+)\\s*(${units(words.minutes)})(?=$|[\\s,.;:!?)])`, 'iu'), (m) => {
      estimate = Number(m[2]);
    });
  if (estimate !== null) {
    estimate = Math.min(600, Math.max(5, estimate));
    found.estimate = estimate;
  }

  // time: "17:30", "5pm", "5:30 pm" (with an optional "at" before it)
  let time = null;
  const at = (words.at || []).filter(Boolean);
  const atLead = at.length ? `(?:(?:${at.map(esc).join('|')})\\s+)?` : '';
  take(new RegExp(`(^|\\s)${atLead}(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)(?=$|[\\s,.;:!?)])`, 'iu'), (m) => {
    let h = Number(m[2]) % 12;
    if (m[4].toLowerCase() === 'pm') h += 12;
    const mi = Number(m[3] || 0);
    if (h > 23 || mi > 59) return false;
    time = `${pad(h)}:${pad(mi)}`;
    return undefined;
  }) ||
    take(new RegExp(`(^|\\s)${atLead}([01]?\\d|2[0-3]):([0-5]\\d)(?=$|[\\s,.;:!?)])`, 'u'), (m) => {
      time = `${pad(Number(m[2]))}:${m[3]}`;
    });
  if (time) found.time = time;

  // the day: today, tomorrow or a weekday (the coming one, today included)
  let due = null;
  if (take(dayWord(words.tomorrow), () => {})) due = plusDays(today, 1);
  else if (take(dayWord(words.today), () => {})) due = today;
  else {
    const all = [];
    (words.weekdays || []).forEach((names, day) => (names || []).forEach((n) => n && all.push([n.toLowerCase(), day])));
    all.sort((a, b) => b[0].length - a[0].length); // "thursday" before "thu"
    if (all.length)
      take(dayWord(all.map(([n]) => n)), (m) => {
        const hit = all.find(([n]) => n === m[2].toLowerCase());
        if (!hit) return false;
        due = plusDays(today, (hit[1] - weekdayOf(today) + 7) % 7);
        return undefined;
      });
  }
  if (due) found.due = due;

  const title = rest.replace(/\s+/g, ' ').trim().replace(/^[,.;:\-–]+\s*|\s*[,.;:\-–]+$/g, '');

  // a subject named in the title ("Physics worksheet"): the longest name that appears as a whole word
  if (!subjectId && title) {
    const named = [...subjects].sort((a, b) => b.name.length - a.name.length).find((s) => s.name.trim() && wordRe([s.name.trim()]).test(` ${title} `));
    if (named) {
      subjectId = named.id;
      found.subject = named.name;
    }
  }

  return { title, due: due || today, time, estimate: estimate || defaultMinutes, priority, subjectId, found };
}
