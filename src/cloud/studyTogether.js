import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import { stableJson } from './sync';

// Study together (see ../studyTogether.js and the 20261108 migration). While signed in, the app joins a private
// Realtime Presence channel for each study group it owns or has joined ("study:<group id>"), and shares this device's
// focus timer there (the Focus screen calls setMyStudyStatus). Screens read the groups' presence with
// useStudyPresence(). Nothing is stored: a status goes when the timer stops or the app closes.

let mine = null; // this device's timer, as myStatus() gives it
let snapshot = []; // [{ id, name, presence }]
const listeners = new Set();
const emit = () => listeners.forEach((f) => f());
const subscribe = (f) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

export function setMyStudyStatus(status) {
  if (stableJson(status) === stableJson(mine)) return;
  mine = status;
  emit();
}

export const useStudyPresence = () => useSyncExternalStore(subscribe, () => snapshot, () => snapshot);

// a group was made or stopped (the share sheet, through reloadOwnedGroups): look at the list again now
let reload = null;
export const reloadStudyGroups = () => reload && reload();

// share = false (Settings) keeps this device's timer to itself; it still sees who else is studying
export function useStudyTogether({ enabled, user, share, groupsKey }) {
  const userId = user && user.id;
  const name = (user && user.name) || '';
  useEffect(() => {
    if (!enabled || !userId) return undefined;
    let alive = true;
    const channels = {}; // group id -> { ch, name, ready }
    const payload = () => ({ name, status: share ? mine : null });
    const publish = () => {
      const at = Date.now(); // when this was heard: a screen counts "min left" from no earlier than this
      snapshot = Object.entries(channels).map(([id, c]) => ({ id, name: c.name, presence: c.ch.presenceState(), at }));
      emit();
    };
    const send = (c) => {
      const p = payload();
      (p.status ? c.ch.track(p) : c.ch.untrack()).catch(() => {});
    };
    const open = (g) => {
      const ch = supabase.channel(`study:${g.id}`, { config: { private: true, presence: { key: userId } } });
      const c = { ch, name: g.name, ready: false };
      channels[g.id] = c;
      ch.on('presence', { event: 'sync' }, publish).subscribe((status) => {
        if (!alive) return;
        if (status === 'CHANNEL_ERROR' && !c.ready) {
          // refused (not a member any more, or the migration isn't applied): stop here rather than retry every few
          // seconds; the next look at the list (in 5 minutes, or when the app comes back) tries again
          supabase.removeChannel(ch);
          if (channels[g.id] === c) delete channels[g.id];
          publish();
          return;
        }
        if (status !== 'SUBSCRIBED') return;
        c.ready = true;
        if (payload().status) send(c);
      });
    };
    // the groups this account owns or belongs to (the table's policies return just those)
    const load = async () => {
      const { data, error } = await supabase.from('study_groups').select('id,name');
      if (!alive || error) return;
      const ids = new Set(data.map((g) => g.id));
      for (const [id, c] of Object.entries(channels)) {
        if (ids.has(id)) continue;
        supabase.removeChannel(c.ch);
        delete channels[id];
      }
      for (const g of data) {
        if (channels[g.id]) channels[g.id].name = g.name;
        else open(g);
      }
      publish();
    };
    load();
    reload = load;

    // this device's timer changed: tell every group
    let last = stableJson(payload());
    const onChange = () => {
      const p = stableJson(payload());
      if (p === last) return;
      last = p;
      for (const c of Object.values(channels)) if (c.ready) send(c);
    };
    listeners.add(onChange);
    const app = AppState.addEventListener('change', (s) => s === 'active' && load());
    const poll = setInterval(load, 5 * 60 * 1000);
    return () => {
      alive = false;
      reload = null;
      listeners.delete(onChange);
      app.remove();
      clearInterval(poll);
      for (const c of Object.values(channels)) supabase.removeChannel(c.ch);
      snapshot = [];
      emit();
    };
  }, [enabled, userId, name, share, groupsKey]);
}
