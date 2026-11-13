// Cloud sync, the pure part: a user's data as rows (one per task, exam, class…), what changed since the last
// sync, and putting rows from the server back into the data. The engine (useCloudSync.js) does the network
// side. Unit-tested in e2e/sync.test.mjs.
//
// A row: { kind, id, data, deleted }. Lists are rows of their kind; the term, the rotation and the settings are
// one row each of kind 'singleton'. `base` is what was last synced: { 'kind:id': fingerprint }.

export const LISTS = { subjects: 'subject', tasks: 'task', sessions: 'session', exams: 'exam', recurring: 'recurring', classes: 'class', vacations: 'vacation', groups: 'group', archive: 'archive', cards: 'card', achievements: 'achievement' };
const LIST_OF = Object.fromEntries(Object.entries(LISTS).map(([list, kind]) => [kind, list]));
export const SINGLE = 'singleton';
const DATA_SINGLES = ['term', 'rotation'];
// settings that belong to one device, not the account
export const DEVICE_SETTINGS = ['pushEnabled'];

// JSON with keys in order, so the same data always gives the same text
export const stableJson = (v) => {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  return `{${Object.keys(v)
    .filter((k) => v[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`)
    .join(',')}}`;
};

// A short fingerprint of a value (cyrb53: 53 bits, as base 36). Records are never changed in place (the reducer
// makes a new object), so an object's fingerprint is worked out once.
const fingerprints = new WeakMap();
export const fingerprint = (v) => {
  const known = v !== null && typeof v === 'object' ? fingerprints.get(v) : undefined;
  if (known) return known;
  const fp = hash(stableJson(v));
  if (v !== null && typeof v === 'object') fingerprints.set(v, fp);
  return fp;
};
const hash = (s) => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

export const keyOf = (kind, id) => `${kind}:${id}`;

const accountSettings = (settings) => {
  if (!settings) return undefined;
  const out = { ...settings };
  for (const k of DEVICE_SETTINGS) delete out[k];
  return out;
};

// A task as it is in the cloud: photos as their Storage path only (not the picture), and only once uploaded;
// a photo still waiting for its upload stays on this device until then (cloud/photos.js)
export const cloudShape = (kind, r) => {
  if (kind !== 'task' || !Array.isArray(r.attachments) || !r.attachments.some((a) => a.kind === 'photo')) return r;
  const attachments = r.attachments.filter((a) => a.kind !== 'photo' || a.path).map((a) => (a.kind === 'photo' ? { id: a.id, kind: 'photo', path: a.path, name: a.name || '' } : a));
  return { ...r, attachments };
};

// A task coming in from another device, keeping this device's own photo data: the picture of an uploaded
// photo (so it shows without a download) and photos not uploaded yet
export const keepLocalPhotos = (local, incoming) => {
  const mine = (local && local.attachments) || [];
  if (!mine.some((a) => a.kind === 'photo')) return incoming;
  const theirs = incoming.attachments || [];
  const byPath = new Map(mine.filter((a) => a.kind === 'photo' && a.path && a.url).map((a) => [a.path, a.url]));
  const merged = theirs.map((a) => (a.kind === 'photo' && byPath.has(a.path) ? { ...a, url: byPath.get(a.path) } : a));
  const waiting = mine.filter((a) => a.kind === 'photo' && !a.path && !theirs.some((b) => b.id === a.id));
  return { ...incoming, attachments: [...merged, ...waiting] };
};

// Everything that syncs, as a Map: 'kind:id' -> data
export const toRecords = (data, settings) => {
  const m = new Map();
  for (const [list, kind] of Object.entries(LISTS)) {
    for (const r of data[list] || []) if (r && r.id != null) m.set(keyOf(kind, String(r.id)), cloudShape(kind, r));
  }
  // an empty term / rotation is no row (clearing one goes up as a deletion)
  for (const name of DATA_SINGLES) if (data[name] != null) m.set(keyOf(SINGLE, name), data[name]);
  if (settings) m.set(keyOf(SINGLE, 'settings'), accountSettings(settings));
  return m;
};

// What to send: rows whose fingerprint differs from the base, and deletion markers for what has gone
export const diffRecords = (base, current) => {
  const upserts = [];
  const deletes = [];
  for (const [key, data] of current) {
    const fp = fingerprint(data);
    if (base[key] !== fp) {
      const at = key.indexOf(':');
      upserts.push({ key, kind: key.slice(0, at), id: key.slice(at + 1), data, fp });
    }
  }
  for (const key of Object.keys(base)) {
    if (!current.has(key) && base[key] !== DELETED) {
      const at = key.indexOf(':');
      deletes.push({ key, kind: key.slice(0, at), id: key.slice(at + 1) });
    }
  }
  return { upserts, deletes };
};
export const DELETED = '-';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => stableJson(a) === stableJson(b);
// a list of things with ids (an empty list counts: the last subtask removed on one side)
const idList = (v) => Array.isArray(v) && v.every((x) => isObj(x) && x.id != null);

// Two edits of one thing, field by field, against the version both started from: a field changed on one side
// takes that side's value; changed on both, this device's (`mine`) wins. Lists of things with ids (subtasks,
// attachments) merge item by item, so a subtask added on each device keeps both.
export const merge3 = (base, mine, theirs) => {
  if (same(mine, theirs)) return mine;
  if (same(mine, base)) return theirs;
  if (same(theirs, base)) return mine;
  if (isObj(base) && isObj(mine) && isObj(theirs)) {
    const out = {};
    for (const k of new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)])) {
      const v = merge3(base[k], mine[k], theirs[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if ((base == null || idList(base)) && idList(mine) && idList(theirs) && (mine.length || theirs.length)) {
    const was = new Map((base || []).map((x) => [String(x.id), x]));
    const m = new Map(mine.map((x) => [String(x.id), x]));
    const th = new Map(theirs.map((x) => [String(x.id), x]));
    const out = [];
    // in this device's order, then what only the other side added
    for (const x of [...mine, ...theirs.filter((y) => !m.has(String(y.id)))]) {
      const id = String(x.id);
      const inMine = m.has(id);
      const inTheirs = th.has(id);
      if (inMine && inTheirs) out.push(merge3(was.get(id), m.get(id), th.get(id)));
      else if (!was.has(id)) out.push(x); // added on one side
      // in the base but gone from one side: removed, unless the other side changed it since
      else if (inMine && !same(m.get(id), was.get(id))) out.push(m.get(id));
      else if (inTheirs && !same(th.get(id), was.get(id))) out.push(th.get(id));
    }
    return out;
  }
  return mine;
};

// Rows from the server into the data. When the local copy also changed since it was last synced (not sent yet),
// the two are merged field by field (merge3) against `baseData`, the last synced version, and the merge goes up
// next; without that version the local change wins. Returns { data, settings (or undefined), base, baseData,
// changed }: the new data, account settings when they came down, the base (fingerprints and versions) with what
// was taken in, and whether the data changed.
const GONE = Symbol('gone');
export const applyRows = (data, rows, base, settings, baseData = {}) => {
  const current = toRecords(data, settings);
  const nextBase = { ...base };
  const nextData = { ...baseData };
  const lists = {};
  const where = {};
  let next = { ...data };
  let nextSettings;
  let changed = false;
  const put = (row, value) => {
    if (row.kind === SINGLE) {
      if (DATA_SINGLES.includes(row.id)) {
        next[row.id] = value === undefined ? null : value;
        changed = true;
      } else if (row.id === 'settings' && value) nextSettings = value;
      return;
    }
    const list = LIST_OF[row.kind];
    if (!list) return;
    // each list copied once, with its records found by id (thousands of rows can come in at once)
    if (!lists[list]) {
      lists[list] = [...(next[list] || [])];
      where[list] = new Map(lists[list].map((r, i) => [String(r.id), i]));
    }
    changed = true;
    const i = where[list].get(row.id);
    if (value === undefined) {
      if (i !== undefined) {
        lists[list][i] = GONE;
        where[list].delete(row.id);
      }
    } else if (i !== undefined) lists[list][i] = row.kind === 'task' ? keepLocalPhotos(lists[list][i], value) : value;
    else {
      where[list].set(row.id, lists[list].length);
      lists[list].push(value);
    }
  };
  for (const row of rows) {
    const key = keyOf(row.kind, row.id);
    const mine = current.has(key) ? fingerprint(current.get(key)) : DELETED;
    const pending = (base[key] ?? DELETED) !== mine;
    const theirs = row.deleted ? DELETED : fingerprint(row.data);
    if (pending && mine !== theirs) {
      // both sides changed it: merge field by field when both still have it and the starting version is known
      const was = baseData[key];
      if (was === undefined || mine === DELETED || theirs === DELETED || !isObj(row.data)) continue;
      const merged = merge3(was, current.get(key), row.data);
      nextBase[key] = theirs;
      nextData[key] = row.data;
      if (fingerprint(merged) !== mine) put(row, merged);
      continue;
    }
    nextBase[key] = theirs;
    if (row.deleted) delete nextData[key];
    else nextData[key] = row.data;
    if (mine === theirs) continue;
    put(row, row.deleted ? undefined : row.data);
  }
  for (const l of Object.keys(lists)) lists[l] = lists[l].filter((r) => r !== GONE);
  next = { ...next, ...lists };
  return { data: next, settings: nextSettings, base: nextBase, baseData: nextData, changed };
};

// All the rows into a whole set of data (a new device signing in): lists, term, rotation and settings
export const fromRows = (rows) => {
  const empty = { ...Object.fromEntries(Object.keys(LISTS).map((l) => [l, []])), term: null, rotation: null };
  // the empty term / rotation count as synced, so the server's take their place
  const base = Object.fromEntries([...toRecords(empty)].map(([k, v]) => [k, fingerprint(v)]));
  return applyRows(empty, rows, base, undefined);
};

// The last synced versions after sending: what the server now has
export const dataAfterPush = (baseData, { upserts, deletes }) => {
  const next = { ...baseData };
  for (const u of upserts) next[u.key] = u.data;
  for (const d of deletes) delete next[d.key];
  return next;
};

// The base after sending: what the server now has
export const baseAfterPush = (base, { upserts, deletes }) => {
  const next = { ...base };
  for (const u of upserts) next[u.key] = u.fp;
  for (const d of deletes) next[d.key] = DELETED;
  return next;
};
