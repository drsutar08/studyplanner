import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { materialPath, mimeFor } from '../classrooms';
import { fileBody } from '../materialFile';

// Classrooms on the server (the 20261117 migration): a teacher's classrooms, the students' requests and the
// materials. Files live in the private "materials" bucket and are opened through short-lived signed addresses.

export const BUCKET = 'materials';
const SIGNED_FOR = 3600;

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// ---------- the list everyone shares (the Settings row, the sheet, the alerts) ----------
let list = null; // null until loaded
const listeners = new Set();
const setList = (l) => {
  list = l;
  listeners.forEach((f) => f());
};
const subscribe = (f) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
export const useClassroomList = () => useSyncExternalStore(subscribe, () => list, () => list);
export async function reloadClassrooms() {
  if (!supabase) return list;
  try {
    setList(must(await supabase.rpc('my_classrooms')) || []);
  } catch {
    // offline: keep what's known
  }
  return list;
}
export const forgetClassrooms = () => setList(null);

// ---------- classrooms ----------
export const createClassroom = async ({ name, subject }) =>
  must(await supabase.from('classrooms').insert({ name, subject }).select('id,name,subject,teacher_name,join_code,created_at').single());
export const renameClassroom = async (id, { name, subject }) => must(await supabase.from('classrooms').update({ name, subject }).eq('id', id));
export const resetCode = async (id) => must(await supabase.rpc('reset_classroom_code', { cid: id }));
export const classroomQuota = async () => must(await supabase.rpc('classroom_quota'));

// The files first (Storage can't be cleared from the database side), then the classroom and all in it
export async function deleteClassroom(id) {
  await removeFolder(id).catch(() => {});
  must(await supabase.from('classrooms').delete().eq('id', id));
}
async function removeFolder(id) {
  for (;;) {
    const files = must(await supabase.storage.from(BUCKET).list(id, { limit: 1000 }));
    if (!files || !files.length) return;
    must(await supabase.storage.from(BUCKET).remove(files.map((f) => `${id}/${f.name}`)));
    if (files.length < 1000) return;
  }
}
// Deleting the account: the files of every classroom it teaches
export async function removeAllClassroomFiles(uid) {
  const { data } = await supabase.from('classrooms').select('id').eq('owner', uid);
  for (const c of data || []) await removeFolder(c.id).catch(() => {});
}

// ---------- joining ----------
// The classroom ({ id, name, subject, teacher_name, status }) or null for a wrong code
export async function joinClassroom(code) {
  const rows = must(await supabase.rpc('join_classroom', { code }));
  return (rows && rows[0]) || null;
}
export async function leaveClassroom(classroomId, userId) {
  must(await supabase.from('classroom_members').delete().eq('classroom_id', classroomId).eq('user_id', userId));
}

// ---------- the teacher's students ----------
export const listMembers = async (classroomId) =>
  must(await supabase.from('classroom_members').select('user_id,student_name,status,requested_at,approved_at').eq('classroom_id', classroomId).order('requested_at'));
export const approveMember = async (classroomId, userId) =>
  must(await supabase.from('classroom_members').update({ status: 'approved' }).eq('classroom_id', classroomId).eq('user_id', userId));
export const removeMember = async (classroomId, userId) => leaveClassroom(classroomId, userId);

// ---------- materials ----------
export const listMaterials = async (classroomId) =>
  must(await supabase.from('classroom_materials').select('*').eq('classroom_id', classroomId).order('created_at', { ascending: false }));
export const addLink = async (classroomId, { title, body, url }) =>
  must(await supabase.from('classroom_materials').insert({ classroom_id: classroomId, kind: 'link', title, body, url }).select().single());
export const addNote = async (classroomId, { title, body, pinned }) =>
  must(await supabase.from('classroom_materials').insert({ classroom_id: classroomId, kind: 'note', title, body, pinned: !!pinned }).select().single());
export const updateMaterial = async (id, patch) => must(await supabase.from('classroom_materials').update(patch).eq('id', id));

// A picked file ({ uri, name, size, mimeType, file? }): uploaded, then listed. If listing fails the file goes again.
export async function addFile(classroomId, asset, { title, body }) {
  const id = Crypto.randomUUID();
  const mime = mimeFor(asset.mimeType, asset.name);
  const path = materialPath(classroomId, id, asset.name, mime);
  const data = await fileBody(asset);
  must(await supabase.storage.from(BUCKET).upload(path, data, { contentType: mime, upsert: false }));
  try {
    return must(
      await supabase
        .from('classroom_materials')
        .insert({ id, classroom_id: classroomId, kind: 'file', title, body, file_path: path, file_name: String(asset.name || '').slice(0, 200), mime_type: mime, size: asset.size || data.byteLength || data.size || 1 })
        .select()
        .single()
    );
  } catch (e) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw e;
  }
}

export async function deleteMaterial(m) {
  if (m.file_path) await supabase.storage.from(BUCKET).remove([m.file_path]).catch(() => {});
  must(await supabase.from('classroom_materials').delete().eq('id', m.id));
}

// A signed address for a file (works for an hour)
export async function fileUrl(path) {
  const data = must(await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_FOR));
  return data.signedUrl;
}

export const reportClassroom = async ({ classroomId, materialId, reason }) =>
  must(await supabase.from('classroom_reports').insert({ classroom_id: classroomId, material_id: materialId || null, reason }));

// ---------- live changes ----------
export function watchClassroom(classroomId, onChange) {
  const channel = supabase
    .channel(`classroom:${classroomId}:${Math.random().toString(36).slice(2, 7)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'classroom_materials', filter: `classroom_id=eq.${classroomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'classroom_members', filter: `classroom_id=eq.${classroomId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ---------- when the student last looked at each classroom ("New" badges) ----------
const seenKey = (uid) => `studyplanner:classroomSeen:${uid}`;
let seen = {};
const seenListeners = new Set();
const setSeen = (s) => {
  seen = s;
  seenListeners.forEach((f) => f());
};
export const useClassroomSeen = () =>
  useSyncExternalStore(
    (f) => {
      seenListeners.add(f);
      return () => seenListeners.delete(f);
    },
    () => seen,
    () => seen
  );
export async function loadSeen(uid) {
  try {
    setSeen(JSON.parse((await AsyncStorage.getItem(seenKey(uid))) || '{}') || {});
  } catch {
    setSeen({});
  }
}
export function markSeen(uid, classroomId) {
  const next = { ...seen, [classroomId]: new Date().toISOString() };
  setSeen(next);
  AsyncStorage.setItem(seenKey(uid), JSON.stringify(next)).catch(() => {});
}

// ---------- while signed in: keep the list fresh and say what's new ----------
// onEvent({ type: 'material' | 'request' | 'approved', classroom, row }) for a toast
export function useClassroomAlerts({ enabled, userId, onEvent }) {
  const latest = useRef(onEvent);
  useEffect(() => {
    latest.current = onEvent;
  });
  useEffect(() => {
    if (!enabled || !userId || !supabase) {
      forgetClassrooms();
      return undefined;
    }
    let alive = true;
    let channel = null;
    const find = (id) => (list || []).find((c) => c.id === id);
    const listen = () => {
      if (channel) supabase.removeChannel(channel);
      const rooms = list || [];
      const reading = rooms.filter((c) => c.role === 'student' && c.status === 'approved').map((c) => c.id);
      const teaching = rooms.filter((c) => c.role === 'teacher').map((c) => c.id);
      channel = supabase.channel(`classrooms:${userId}:${Math.random().toString(36).slice(2, 7)}`);
      // my own requests: approved or removed
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'classroom_members', filter: `user_id=eq.${userId}` }, (p) => {
        const before = find((p.old && p.old.classroom_id) || (p.new && p.new.classroom_id));
        refresh().then(() => {
          if (p.eventType === 'UPDATE' && p.new && p.new.status === 'approved' && before && before.status !== 'approved') {
            latest.current && latest.current({ type: 'approved', classroom: find(p.new.classroom_id) || before, row: p.new });
          }
        });
      });
      if (reading.length) {
        channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'classroom_materials', filter: `classroom_id=in.(${reading.join(',')})` }, (p) => {
          const c = find(p.new.classroom_id);
          if (c && latest.current) latest.current({ type: 'material', classroom: c, row: p.new });
          refresh();
        });
      }
      if (teaching.length) {
        channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'classroom_members', filter: `classroom_id=in.(${teaching.join(',')})` }, (p) => {
          const c = find(p.new.classroom_id);
          if (c && latest.current) latest.current({ type: 'request', classroom: c, row: p.new });
          refresh();
        });
      }
      channel.subscribe();
    };
    let shape = '';
    const refresh = async () => {
      await reloadClassrooms();
      if (!alive) return;
      // listen again only when the classrooms (or what this account can read) changed
      const next = (list || []).map((c) => `${c.id}:${c.role}:${c.status}`).sort().join(',');
      if (next !== shape) {
        shape = next;
        listen();
      }
    };
    loadSeen(userId);
    refresh();
    const app = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    const poll = setInterval(refresh, 5 * 60 * 1000);
    return () => {
      alive = false;
      app.remove();
      clearInterval(poll);
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, userId]);
}
