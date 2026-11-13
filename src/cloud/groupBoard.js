import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import { reconcileGroupTasks } from '../groupTasks';

// A live group's board (table study_group_posts, see the 20261105 migration): notes and shared tasks the owner posts.

export const BOARD_LIMIT = 100;

export async function listPosts(groupIds) {
  if (!groupIds.length) return [];
  const { data, error } = await supabase.from('study_group_posts').select('*').in('group_id', groupIds).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
export async function addPost(post) {
  const { data, error } = await supabase.from('study_group_posts').insert(post).select().single();
  if (error) throw error;
  return data;
}
export async function updatePost(id, patch) {
  const { data, error } = await supabase.from('study_group_posts').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
export async function deletePost(id) {
  const { error } = await supabase.from('study_group_posts').delete().eq('id', id);
  if (error) throw error;
}
// 'full' | 'offline': which message a failed post gets
export const boardErrorKind = (e) => (/board_full/.test(String((e && e.message) || '')) ? 'full' : 'offline');

// Replies under a board's posts (table study_group_replies, see the 20261109 migration): anyone in the group writes
// them; the server fills in the group and the author's name
export const REPLY_MAX = 500;
export async function listReplies(groupId) {
  const { data, error } = await supabase.from('study_group_replies').select('*').eq('group_id', groupId).order('created_at');
  if (error) throw error;
  return data;
}
export async function addReply(postId, body) {
  const { data, error } = await supabase.from('study_group_replies').insert({ post_id: postId, body }).select().single();
  if (error) throw error;
  return data;
}
export async function deleteReply(id) {
  const { error } = await supabase.from('study_group_replies').delete().eq('id', id);
  if (error) throw error;
}
// 'repliesFull' | 'offline'
export const replyErrorKind = (e) => (/replies_full/.test(String((e && e.message) || '')) ? 'repliesFull' : 'offline');
export function watchReplies(groupId, onChange) {
  const channel = supabase
    .channel(`replies:${groupId}:${Math.random().toString(36).slice(2, 7)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'study_group_replies', filter: `group_id=eq.${groupId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// Changes to these groups' boards as they happen: onChange(payload) for each
export function watchBoards(groupIds, onChange) {
  if (!groupIds.length) return () => {};
  const channel = supabase
    .channel(`board:${groupIds.join(',')}:${Math.random().toString(36).slice(2, 7)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'study_group_posts', filter: `group_id=in.(${groupIds.join(',')})` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// A member's side, while signed in: the shared tasks of the live groups they've joined become (and stay) their own
// copies; a new note calls onNote(group, post) (a toast)
export function useGroupBoards({ enabled, joined, state, dispatch, onNote }) {
  const latest = useRef({ state, joined, onNote });
  useEffect(() => {
    latest.current = { state, joined, onNote };
  });
  const ids = (joined || [])
    .filter((g) => g.live)
    .map((g) => g.id)
    .sort()
    .join(',');
  useEffect(() => {
    if (!enabled || !ids) return undefined;
    const groupIds = ids.split(',');
    let alive = true;
    let timer = null;
    const check = async () => {
      let posts;
      try {
        posts = await listPosts(groupIds);
      } catch {
        return; // offline: next time
      }
      if (!alive) return;
      for (const g of latest.current.joined || []) {
        if (!groupIds.includes(g.id)) continue;
        const r = reconcileGroupTasks({ tasks: latest.current.state.tasks, group: g, posts });
        if (r) dispatch({ type: 'SYNC_GROUP_TASKS', groupId: g.id, ...r });
      }
    };
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(check, 500);
    };
    check();
    const stop = watchBoards(groupIds, (p) => {
      soon();
      if (p.eventType === 'INSERT' && p.new && p.new.kind === 'note') {
        const g = (latest.current.joined || []).find((x) => x.id === p.new.group_id);
        if (g && latest.current.onNote) latest.current.onNote(g, p.new);
      }
    });
    const app = AppState.addEventListener('change', (s) => s === 'active' && check());
    const poll = setInterval(check, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearTimeout(timer);
      stop();
      app.remove();
      clearInterval(poll);
    };
  }, [enabled, ids, dispatch]);
}
