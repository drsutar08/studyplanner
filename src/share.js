// Study groups without a server: a share link carries a timetable, exam dates and breaks inside it (compact
// JSON, base64url). Opening it shows what it holds and adds it, remembering the group so a newer link from
// the same person updates it and leaving removes what it added. Nothing private goes in: no attendance,
// scores, notes, homework or tasks. Pure, unit-tested in e2e/share.test.mjs.
import { deflateRaw, inflateRaw } from 'pako';
import { onlyClasses } from './classes';

export const SHARE_VERSION = 1;
const MAX_CODE = 60000; // characters; a whole term's timetable is a few KB

// ---- base64url over UTF-8 (no Buffer / btoa needed, so it is the same everywhere) ----
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const utf8 = (str) => {
  const out = [];
  for (const ch of str) {
    let c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
};
const fromUtf8 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    // the first byte says how many bytes the character takes
    const size = b < 0x80 ? 1 : b < 0xe0 ? 2 : b < 0xf0 ? 3 : 4;
    let c = size === 1 ? b : b & (0xff >> (size + 1));
    for (let k = 1; k < size; k++) c = (c << 6) | (bytes[i + k] & 63);
    s += String.fromCodePoint(c);
    i += size;
  }
  return s;
};
const bytesToBase64Url = (bytes) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '') + (i + 2 < bytes.length ? B64[n & 63] : '');
  }
  return out;
};
const base64UrlToBytes = (code) => {
  const bytes = [];
  let buf = 0;
  let bits = 0;
  for (const ch of code) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('bad code');
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 255);
    }
  }
  return bytes;
};
export const toBase64Url = (str) => bytesToBase64Url(utf8(str));
export const fromBase64Url = (code) => fromUtf8(base64UrlToBytes(code));

// ---- building a share ----
// What a share can hold, counted for the "Share" sheet: { classes, exams, vacations } of the given state.
export const shareable = ({ classes = [], exams = [], vacations = [] }, today) => ({
  classes: onlyClasses(classes).filter((c) => (c.repeat === 'once' ? c.date >= today : !(c.range === 'manual' && c.rangeEnd && c.rangeEnd < today))),
  exams: exams.filter((e) => e.date >= today),
  vacations: vacations.filter((v) => v.end >= today),
});

// The share itself (an object; `shareCode` turns it into text). `id` stays the same for one person's group, so
// a newer link replaces the older one for whoever joined. include: { classes, exams, vacations } booleans.
export const buildShare = (state, { id, name, from, today, include = { classes: true, exams: true, vacations: true } }) => {
  const { classes, exams, vacations } = shareable(state, today);
  const subjects = state.subjects || [];
  const used = [];
  const subj = (sid) => {
    const s = subjects.find((x) => x.id === sid);
    if (!s) return undefined;
    let i = used.findIndex((x) => x.id === sid);
    if (i < 0) i = used.push(s) - 1;
    return i;
  };
  const term = state.term;
  const cls = include.classes
    ? classes.map((c) => {
        // "for the term" becomes the sharer's own term dates, so it means the same for everyone
        const range = c.range === 'term' ? (term ? 'manual' : 'none') : c.range || 'none';
        return clean({
          t: c.title,
          s: subj(c.subjectId),
          r: c.repeat,
          d: c.repeat === 'once' ? c.date : undefined,
          w: c.repeat === 'weekly' ? c.days : undefined,
          rd: c.repeat === 'rotation' ? c.rotationDays : undefined,
          rw: c.rotationWeeks && c.rotationWeeks.length ? c.rotationWeeks : undefined,
          a: c.start || undefined,
          b: c.end || undefined,
          g: range === 'none' ? undefined : range,
          gs: range === 'manual' ? (c.range === 'term' ? term.start : c.rangeStart) : undefined,
          ge: range === 'manual' ? (c.range === 'term' ? term.end : c.rangeEnd) : undefined,
          o: c.mode === 'online' ? 1 : undefined,
          l: c.mode === 'online' ? c.link || undefined : c.location || undefined,
          tc: c.teacher || undefined,
        });
      })
    : [];
  const ex = include.exams
    ? exams.map((e) => clean({ t: e.title, s: subj(e.subjectId), k: e.kind && e.kind !== 'Exam' ? e.kind : undefined, d: e.date, a: e.time || undefined, du: e.duration && e.duration !== 60 ? e.duration : undefined, o: e.mode === 'online' ? 1 : undefined, l: e.mode === 'online' ? e.link || undefined : [e.building, e.room].filter(Boolean).join(', ') || undefined }))
    : [];
  const va = include.vacations ? vacations.map((v) => clean({ t: v.title, a: v.start, b: v.end, p: v.pause === false ? 0 : undefined })) : [];
  const usesRotation = cls.some((c) => c.r === 'rotation' || c.rw);
  return clean({
    v: SHARE_VERSION,
    id,
    n: String(name || '').slice(0, 60),
    f: String(from || '').slice(0, 60),
    at: today,
    s: used.map((s) => clean({ n: s.name, c: s.color })),
    c: cls,
    e: ex,
    h: va,
    ro: usesRotation && state.rotation ? state.rotation : undefined,
  });
};
function clean(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

// A share as text: "Z" + the JSON deflated and base64url'd (about a third of the size, so the link is short and
// fits a QR code). The first links were the plain JSON in base64url, which always starts "eyJ" ('{"'), and still read.
export const shareCode = (share) => `Z${bytesToBase64Url(Array.from(deflateRaw(Uint8Array.from(utf8(JSON.stringify(share))), { level: 9 })))}`;
const decodeShare = (code) => {
  if (!code.startsWith('Z')) return fromBase64Url(code);
  const bytes = inflateRaw(Uint8Array.from(base64UrlToBytes(code.slice(1))));
  if (!bytes || !bytes.length) throw new Error('bad code');
  return fromUtf8(Array.from(bytes));
};
// web: base is the page address (…/#share=CODE); on a phone the app's own link (studyplanner://share?d=CODE)
export const shareLink = (share, base) => (base.startsWith('http') ? `${base.replace(/#.*$/, '')}#share=${shareCode(share)}` : `${base}?d=${shareCode(share)}`);

// ---- reading one ----
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s) => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
const str = (s, max = 80) => (typeof s === 'string' ? s.slice(0, max) : '');
const days = (list) => (Array.isArray(list) ? [...new Set(list.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : []);

// A pasted link or code -> { share } or { error: 'empty' | 'notShare' | 'newer' | 'tooBig' }
export const readShare = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return { error: 'empty' };
  const m = raw.match(/(?:[#?&](?:share|d)=)([A-Za-z0-9_-]+)/);
  const code = m ? m[1] : /^[A-Za-z0-9_-]+$/.test(raw) ? raw : null;
  if (!code) return { error: 'notShare' };
  if (code.length > MAX_CODE) return { error: 'tooBig' };
  let share;
  try {
    share = JSON.parse(decodeShare(code));
  } catch {
    return { error: 'notShare' };
  }
  if (!share || typeof share !== 'object' || typeof share.id !== 'string' || !share.v) return { error: 'notShare' };
  if (share.v > SHARE_VERSION) return { error: 'newer' };
  return { share };
};

// What joining adds, as records for the IMPORT_RECORDS action with ids `${batch}-…` (so leaving removes
// exactly these): { subjects (new ones), classes, exams, vacations, rotation (to adopt, or null), skipped }.
// Subjects are matched by name to the joiner's own; things already there (same title, day and time) are skipped.
export const joinPlan = (share, existing = {}, batch) => {
  const mine = existing.subjects || [];
  const subjects = [];
  const map = (share.s || []).map((s, i) => {
    const name = str(s.n, 40).trim();
    if (!name) return null;
    const have = mine.find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
    if (have) return have.id;
    const id = `${batch}-s${i + 1}`;
    subjects.push({ id, name, color: /^#[0-9a-f]{6}$/i.test(s.c) ? s.c : '#3B4CCA' });
    return id;
  });
  const subjectOf = (i) => (Number.isInteger(i) && map[i]) || null;

  const have = new Set([
    ...(existing.classes || []).map((c) => `${c.title.toLowerCase()}|${c.repeat === 'once' ? c.date : (c.days || []).join(',')}|${c.start || ''}`),
    ...(existing.exams || []).map((e) => `${e.title.toLowerCase()}|${e.date}|${e.time || ''}`),
    ...(existing.vacations || []).map((v) => `${v.title.toLowerCase()}|${v.start}`),
  ]);
  const out = { subjects, classes: [], exams: [], vacations: [], rotation: null, skipped: 0 };
  const add = (list, key, record) => {
    if (have.has(key)) {
      out.skipped += 1;
      return;
    }
    have.add(key);
    out[list].push(record);
  };
  let n = 0;
  const id = (kind) => `${batch}-${kind}${(n += 1)}`;

  for (const c of Array.isArray(share.c) ? share.c : []) {
    const title = str(c.t, 70).trim();
    const repeat = ['once', 'weekly', 'rotation'].includes(c.r) ? c.r : 'once';
    if (!title || (repeat === 'once' && !isDate(c.d))) continue;
    const record = {
      id: id('c'),
      title,
      subjectId: subjectOf(c.s),
      teacher: str(c.tc, 60),
      repeat,
      date: repeat === 'once' ? c.d : null,
      days: repeat === 'weekly' ? days(c.w) : [],
      rotationDays: repeat === 'rotation' ? (Array.isArray(c.rd) ? c.rd.filter(Number.isInteger) : [0]) : undefined,
      rotationWeeks: Array.isArray(c.rw) ? c.rw.filter(Number.isInteger) : undefined,
      start: isTime(c.a) ? c.a : null,
      end: isTime(c.b) ? c.b : null,
      range: c.g === 'manual' && isDate(c.gs) && isDate(c.ge) ? 'manual' : 'none',
      rangeStart: isDate(c.gs) ? c.gs : null,
      rangeEnd: isDate(c.ge) ? c.ge : null,
      mode: c.o ? 'online' : 'inPerson',
      location: c.o ? '' : str(c.l, 120),
      link: c.o ? str(c.l, 300) : '',
      notes: '',
    };
    if (repeat === 'weekly' && !record.days.length) continue;
    add('classes', `${title.toLowerCase()}|${repeat === 'once' ? record.date : record.days.join(',')}|${record.start || ''}`, record);
  }
  for (const e of Array.isArray(share.e) ? share.e : []) {
    const title = str(e.t, 70).trim();
    if (!title || !isDate(e.d)) continue;
    const online = !!e.o;
    add('exams', `${title.toLowerCase()}|${e.d}|${isTime(e.a) ? e.a : ''}`, {
      id: id('e'),
      title,
      subjectId: subjectOf(e.s),
      kind: str(e.k, 30) || 'Exam',
      date: e.d,
      time: isTime(e.a) ? e.a : null,
      duration: Number.isInteger(e.du) && e.du > 0 ? e.du : 60,
      mode: online ? 'online' : 'inPerson',
      building: online ? '' : str(e.l, 120),
      room: '',
      link: online ? str(e.l, 300) : '',
      notes: '',
    });
  }
  for (const v of Array.isArray(share.h) ? share.h : []) {
    const title = str(v.t, 70).trim();
    if (!title || !isDate(v.a) || !isDate(v.b) || v.b < v.a) continue;
    add('vacations', `${title.toLowerCase()}|${v.a}`, { id: id('v'), title, start: v.a, end: v.b, pause: v.p !== 0, notes: '' });
  }
  // the rotation (Day A / Day B…) comes along only when the joiner has none of their own
  const ro = share.ro;
  if (!existing.rotation && ro && (ro.type === 'days' || ro.type === 'weeks') && Number.isInteger(ro.length) && ro.length >= 2 && isDate(ro.startDate)) out.rotation = ro;
  // classes using a rotation are only useful with one
  if (!existing.rotation && !out.rotation) out.classes = out.classes.filter((c) => c.repeat !== 'rotation' && !(c.rotationWeeks && c.rotationWeeks.length));
  return out;
};

// The planner without what a group added before (ids `${batch}-…`): joining the same group again from a newer
// link is compared against this, so its own earlier copies don't count as "already there".
export const withoutGroup = (state, groupId) => {
  const old = (state.groups || []).find((g) => g.id === groupId);
  if (!old) return state;
  const keep = (r) => !String(r.id).startsWith(`${old.batch}-`);
  return { ...state, subjects: (state.subjects || []).filter(keep), classes: (state.classes || []).filter(keep), exams: (state.exams || []).filter(keep), vacations: (state.vacations || []).filter(keep) };
};

// The group as remembered by whoever joined: { id, name, from, batch, joinedAt, sharedAt, counts }
export const groupEntry = (share, plan, batch, today) => ({
  id: share.id,
  name: str(share.n, 60) || 'Study group',
  from: str(share.f, 60),
  batch,
  joinedAt: today,
  sharedAt: isDate(share.at) ? share.at : today,
  counts: { classes: plan.classes.length, exams: plan.exams.length, vacations: plan.vacations.length, subjects: plan.subjects.length },
});
