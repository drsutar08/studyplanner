import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { toRecords, diffRecords, applyRows, baseAfterPush, dataAfterPush, fingerprint, DELETED } from './sync';
import { photosToUpload, photoPathsIn, uploadPhoto, removePhotos } from './photos';
import { reportError } from '../monitoring';

// Cloud sync, the network part (the rules are in sync.js). Besides fingerprints, `meta.data` keeps the last
// synced version of each item, so an item edited on two devices merges field by field. Changes go up a moment after they are made; changes
// from the account's other devices come down at start, when the app comes back to the front, live (Supabase
// Realtime) and every couple of minutes. What was last synced (`base`) and how far it has read (`cursor`) are
// kept per account, so a restart doesn't send everything again.

const metaKey = (uid) => `studyplanner:sync:${uid}`;
const PUSH_DELAY = 1200; // ms after the last change
const POLL_MS = 120000;
const OVERLAP_MS = 60000; // read a little before the cursor: a slow write can land with an earlier time
const CHUNK = 200; // rows per request
const SAVE_DELAY = 1000; // ms: what was last synced goes to storage once a burst of rounds is over
const INBOX_DELAY = 250; // ms: live rows are taken in batches
const STALE_AFTER = 8000; // ms: changes still waiting this long get the "not synced" dot
const PAGE = 1000;

export const readSyncMeta = async (uid) => {
  try {
    const raw = await AsyncStorage.getItem(metaKey(uid));
    return raw ? JSON.parse(raw) : { base: {}, cursor: null };
  } catch {
    return { base: {}, cursor: null };
  }
};
export const writeSyncMeta = (uid, meta) => AsyncStorage.setItem(metaKey(uid), JSON.stringify(meta)).catch(() => {});

// Every row changed at or after `since` (all of them without one), oldest first
export async function fetchRows(since) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from('records').select('kind,id,data,deleted,updated_at').order('updated_at', { ascending: true }).range(from, from + PAGE - 1);
    if (since) q = q.gte('updated_at', since);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

// The base for a set of rows just read from the server, and their versions (for merging later edits)
export const baseOfRows = (rows) => Object.fromEntries(rows.map((r) => [`${r.kind}:${r.id}`, r.deleted ? DELETED : fingerprint(r.data)]));
export const dataOfRows = (rows) => Object.fromEntries(rows.filter((r) => !r.deleted).map((r) => [`${r.kind}:${r.id}`, r.data]));
export const cursorOf = (rows, prev) => rows.reduce((max, r) => (!max || r.updated_at > max ? r.updated_at : max), prev || null);

const isOffline = (e) => {
  const msg = String((e && e.message) || e || '').toLowerCase();
  return /failed to fetch|network|fetch failed|load failed|timeout/.test(msg) || (e && e.status === 0);
};

// onAccountGone(): the account was deleted (on another device); the device should forget it and sign out
export function useCloudSync({ userId, state, dispatch, settings, replaceSettings, enabled, onAccountGone }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'syncing' | 'synced' | 'offline' | 'error'
  const [lastSynced, setLastSynced] = useState(null);
  const meta = useRef(null);
  const latest = useRef({ state, settings, onAccountGone });
  const busy = useRef(false);
  const again = useRef(false);
  const timer = useRef(null);

  useEffect(() => {
    latest.current = { state, settings, onAccountGone };
  });

  // what was last synced goes to storage a moment after it changes (one write for a burst of rounds), and at once
  // on flush()
  const saveTimer = useRef(null);
  const saveNow = useCallback(() => {
    clearTimeout(saveTimer.current);
    if (userId && meta.current) writeSyncMeta(userId, meta.current);
  }, [userId]);
  const save = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveNow, SAVE_DELAY);
  }, [saveNow]);

  // photos added on this device go to Storage first; their tasks then sync with the path (the next round)
  const upload = useCallback(async () => {
    for (const { taskId, att } of photosToUpload(latest.current.state.tasks || [])) {
      try {
        const path = await uploadPhoto(userId, att);
        dispatch({ type: 'SET_PHOTO_PATH', taskId, attachmentId: att.id, path });
      } catch {
        // stays on this device and is tried again next round; the rest of the sync goes on
      }
    }
  }, [userId, dispatch]);

  // files no task uses any more (a photo removed, its task deleted or archived) leave Storage
  const tidyPhotos = useCallback(async () => {
    const now = photoPathsIn([...(latest.current.state.tasks || [])]);
    const before = meta.current.paths || [];
    const gone = before.filter((p) => !now.has(p));
    if (gone.length) await removePhotos(gone);
    meta.current = { ...meta.current, paths: [...now] };
    save();
  }, [save]);

  const push = useCallback(async () => {
    const { state: s, settings: st } = latest.current;
    const diff = diffRecords(meta.current.base, toRecords(s, st));
    if (!diff.upserts.length && !diff.deletes.length) return;
    const rows = [
      ...diff.upserts.map((u) => ({ kind: u.kind, id: u.id, data: u.data ?? null, deleted: false })),
      ...diff.deletes.map((d) => ({ kind: d.kind, id: d.id, data: null, deleted: true })),
    ];
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase.from('records').upsert(rows.slice(i, i + CHUNK), { onConflict: 'user_id,kind,id' });
      if (error) throw error;
    }
    meta.current = { ...meta.current, base: baseAfterPush(meta.current.base, diff), data: dataAfterPush(meta.current.data || {}, diff) };
    save();
  }, [save]);

  // rows from the server into the data (and the settings); the base and cursor move on
  const take = useCallback(
    (rows) => {
      if (!rows.length) return;
      const { state: s, settings: st } = latest.current;
      const res = applyRows(s, rows, meta.current.base, st, meta.current.data || {});
      dispatch({ type: 'APPLY_REMOTE', rows, base: meta.current.base, baseData: meta.current.data || {} });
      if (res.settings) replaceSettings(res.settings);
      meta.current = { ...meta.current, base: res.base, data: res.baseData, cursor: cursorOf(rows, meta.current.cursor) };
      save();
    },
    [dispatch, replaceSettings, save]
  );

  const pull = useCallback(async () => {
    const c = meta.current.cursor;
    const since = c ? new Date(new Date(c).getTime() - OVERLAP_MS).toISOString() : null;
    take(await fetchRows(since));
  }, [take]);

  // one round: send, read, send what reading left behind (a local change kept over an older copy)
  const syncNow = useCallback(async () => {
    if (!enabled || !meta.current) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    setStatus('syncing');
    try {
      // a change made during a round gets a round of its own
      do {
        again.current = false;
        if (meta.current.pullFirst) {
          // started offline (store.js startOffline): the account's settings stay as they are; this device's are
          // counted as already synced, then everything is read before anything is sent
          const { settings: st } = latest.current;
          const mine = toRecords({}, st);
          meta.current = { ...meta.current, base: { ...meta.current.base, ...Object.fromEntries([...mine].map(([k, v]) => [k, fingerprint(v)])) } };
          await pull();
          meta.current = { ...meta.current, pullFirst: false };
          save();
        }
        await upload();
        await push();
        await pull();
        await push();
        await tidyPhotos();
      } while (again.current && meta.current);
      setStatus('synced');
      setLastSynced(new Date());
    } catch (e) {
      setStatus(isOffline(e) ? 'offline' : 'error');
      if (!isOffline(e)) reportError(e, 'sync');
      // is the account still there? (deleted on another device: the token works until it expires, writes don't)
      if (!isOffline(e)) {
        const { error } = await supabase.auth.getUser();
        if (error && (error.code === 'user_not_found' || /does not exist|user not found/i.test(error.message || ''))) latest.current.onAccountGone && latest.current.onAccountGone();
      }
    } finally {
      busy.current = false;
      again.current = false;
    }
  }, [enabled, upload, push, pull, tidyPhotos, save]);

  // start: read what was last synced, then a first round
  useEffect(() => {
    if (!enabled || !userId) return undefined;
    let alive = true;
    readSyncMeta(userId).then((m) => {
      if (!alive) return;
      meta.current = m;
      syncNow();
    });
    return () => {
      alive = false;
      meta.current = null;
    };
  }, [enabled, userId, syncNow]);

  // changes go up shortly after they are made
  useEffect(() => {
    if (!enabled || !meta.current) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => syncNow(), PUSH_DELAY);
    return () => clearTimeout(timer.current);
  }, [enabled, state, settings, syncNow]);

  // the account's other devices: live, on coming back to the front, and now and then
  useEffect(() => {
    if (!enabled || !userId) return undefined;
    let inbox = [];
    let inboxTimer = null;
    const takeInbox = () => {
      inboxTimer = null;
      const rows = inbox;
      inbox = [];
      if (meta.current) take(rows);
    };
    const channel = supabase
      .channel(`records:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${userId}` }, (payload) => {
        if (!payload.new || !payload.new.kind) return;
        // rows arrive one by one (thousands after a big change, this device's own among them): taken together
        inbox.push(payload.new);
        if (!inboxTimer) inboxTimer = setTimeout(takeInbox, INBOX_DELAY);
      })
      .subscribe();
    const app = AppState.addEventListener('change', (s) => s === 'active' && syncNow());
    const poll = setInterval(() => syncNow(), POLL_MS);
    const online = typeof window !== 'undefined' && window.addEventListener ? () => syncNow() : null;
    if (online) window.addEventListener('online', online);
    return () => {
      clearTimeout(inboxTimer);
      supabase.removeChannel(channel);
      app.remove();
      clearInterval(poll);
      if (online) window.removeEventListener('online', online);
    };
  }, [enabled, userId, take, syncNow]);

  // changes on this device not in the cloud yet
  const unsent = useCallback(() => {
    if (!meta.current) return 0;
    const { state: s, settings: st } = latest.current;
    const d = diffRecords(meta.current.base, toRecords(s, st));
    return d.upserts.length + d.deletes.length;
  }, []);
  // a last round (signing out): resolves to how many changes are still unsent
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!enabled || !meta.current) return 0;
    while (busy.current) await new Promise((r) => setTimeout(r, 100));
    await syncNow();
    saveNow();
    return unsent();
  }, [enabled, syncNow, unsent, saveNow]);

  // how many changes are waiting, and whether that's worth showing: they've waited a while (a change normally
  // goes up within a couple of seconds), or the device is offline / the last round failed
  const [pending, setPending] = useState(0);
  const [since, setSince] = useState(null); // when the waiting changes started waiting
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => {
      const n = enabled ? unsent() : 0;
      setPending(n);
      setSince((was) => (n ? was || Date.now() : null));
    }, 0);
    return () => clearTimeout(id);
  }, [enabled, state, settings, status, lastSynced, unsent]);
  useEffect(() => {
    if (!since) return undefined;
    const id = setTimeout(() => setNow(Date.now()), Math.max(0, since + STALE_AFTER - Date.now()));
    return () => clearTimeout(id);
  }, [since]);
  const unsynced = !!pending && (status === 'offline' || status === 'error' || (!!since && now - since >= STALE_AFTER));

  return { status, lastSynced, syncNow, flush, pending, unsynced };
}
