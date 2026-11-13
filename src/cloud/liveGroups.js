import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import { buildShare } from '../share';
import { stableJson } from './sync';
import { dateKey } from '../dates';
import { reloadStudyGroups } from './studyTogether';

// Live study groups (tables study_groups / study_group_members, see the 20261103 migration). The owner's app keeps
// a group's `payload` (a share, src/share.js) in step with their timetable; members' apps take each new version.
// A group's link carries its id and secret code: …#group=<id>.<code> on the web, studyplanner://share?g=<id>.<code>.

export const groupLink = (group, base) =>
  base.startsWith('http') ? `${base.replace(/#.*$/, '')}#group=${group.id}.${group.join_code}` : `${base}?g=${group.id}.${group.join_code}`;

// { id, code } from a pasted or opened link, or null
export const readGroupLink = (text) => {
  const m = String(text || '').match(/[#?&](?:group|g)=([0-9a-f-]{36})\.([0-9a-f]{16,64})/i);
  return m ? { id: m[1].toLowerCase(), code: m[2].toLowerCase() } : null;
};

// The share as the group shows it (the group's own id, so members' copies update in place)
const payloadFor = (state, group, user) =>
  buildShare(state, { id: group.id, name: group.name, from: (user && user.name) || '', today: dateKey(), include: group.include || { classes: true, exams: true, vacations: true } });
// what counts as a change (not the day it was made)
const contentOf = (payload) => stableJson({ ...payload, at: undefined });

export async function createGroup(state, user, { name, include }) {
  const { data, error } = await supabase.from('study_groups').insert({ name, owner_name: (user && user.name) || '', include }).select().single();
  if (error) throw error;
  const payload = payloadFor(state, data, user);
  const up = await supabase.from('study_groups').update({ payload }).eq('id', data.id).select().single();
  if (up.error) throw up.error;
  return up.data;
}

export const ownedGroups = async () => {
  const { data, error } = await supabase.from('study_groups').select('id,name,join_code,include,payload,updated_at,study_group_members(count)').order('created_at');
  if (error) throw error;
  return data.map((g) => ({ ...g, members: (g.study_group_members && g.study_group_members[0] && g.study_group_members[0].count) || 0 }));
};

export const stopSharing = async (id) => {
  const { error } = await supabase.from('study_groups').delete().eq('id', id);
  if (error) throw error;
};

// 'tooMany' | 'full' | 'offline': which message a failed create / join gets
export const groupErrorKind = (e) => {
  const m = String((e && e.message) || '');
  if (/group_limit/.test(m)) return 'tooMany';
  if (/group_full/.test(m)) return 'full';
  return 'offline';
};

const one = (data) => (Array.isArray(data) ? data[0] : data) || null;
// look before joining / join: the group's row ({ id, name, owner_name, payload, updated_at }) or null for a wrong code
export const openGroup = async ({ id, code }) => one((await supabase.rpc('open_study_group', { gid: id, code })).data);
export const joinGroup = async ({ id, code }) => {
  const { data, error } = await supabase.rpc('join_study_group', { gid: id, code });
  if (error) throw error;
  return one(data);
};
export const leaveGroup = async (id) => {
  await supabase.from('study_group_members').delete().eq('group_id', id);
};

// Keeps live groups going while signed in: publishes the owner's groups when their timetable changes, and takes
// new versions of joined groups (live, when the app comes back, and now and then). onUpdate(group, row) applies one.
// (the share sheet calls reloadOwnedGroups() after making or stopping one)
let reloadOwned = null;
export const reloadOwnedGroups = () => {
  if (reloadOwned) reloadOwned();
  reloadStudyGroups(); // and the groups' study-together channels
};

export function useLiveGroups({ enabled, state, user, joined, onUpdate }) {
  const owned = useRef(null); // [{ id, name, include, last }] once read
  const latest = useRef({ state, user, joined, onUpdate });
  useEffect(() => {
    latest.current = { state, user, joined, onUpdate };
  });

  // the owner's side: read the groups once, then publish (3 s after the last change) when the content differs
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const load = () =>
      ownedGroups()
        .then((list) => {
          if (alive) owned.current = list.map((g) => ({ id: g.id, name: g.name, include: g.include, last: contentOf(g.payload || {}) }));
        })
        .catch(() => {});
    reloadOwned = load;
    load();
    return () => {
      alive = false;
      owned.current = null;
      reloadOwned = null;
    };
  }, [enabled, user && user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setTimeout(async () => {
      for (const g of owned.current || []) {
        const payload = payloadFor(latest.current.state, g, latest.current.user);
        const c = contentOf(payload);
        if (c === g.last) continue;
        const { error } = await supabase.from('study_groups').update({ payload }).eq('id', g.id);
        if (!error) g.last = c;
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [enabled, state.classes, state.exams, state.vacations, state.subjects, state.term, state.rotation]);

  // the members' side
  const liveIds = (joined || []).filter((g) => g.live).map((g) => g.id).sort().join(',');
  useEffect(() => {
    if (!enabled || !liveIds) return undefined;
    const check = async () => {
      const { data } = await supabase.from('study_groups').select('id,name,owner_name,payload,updated_at').in('id', liveIds.split(','));
      for (const row of data || []) take(row);
    };
    const take = (row) => {
      const g = (latest.current.joined || []).find((x) => x.id === row.id);
      if (g && row.updated_at && row.updated_at !== g.version && row.payload && row.payload.id) latest.current.onUpdate(g, row);
    };
    check();
    const channel = supabase
      .channel(`groups:${liveIds}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'study_groups', filter: `id=in.(${liveIds})` }, (p) => p.new && take(p.new))
      .subscribe();
    const app = AppState.addEventListener('change', (s) => s === 'active' && check());
    const poll = setInterval(check, 5 * 60 * 1000);
    return () => {
      supabase.removeChannel(channel);
      app.remove();
      clearInterval(poll);
    };
  }, [enabled, liveIds]);
}
