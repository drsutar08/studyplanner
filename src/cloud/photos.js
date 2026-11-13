import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Task photos in Supabase Storage (bucket "attachments", private, a folder per user). A photo is added on a
// device as a data URI; the sync engine uploads it and gives it a `path`. The synced task keeps only the path
// (cloud/sync.js), and other devices show the file through a short-lived signed address.

export const BUCKET = 'attachments';
const SIGNED_FOR = 3600; // seconds a signed address works

export const photoPath = (uid, attachmentId) => `${uid}/${attachmentId}.jpg`;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
// base64 (as in a data URI) to bytes, without atob / Buffer
export const base64Bytes = (b64) => {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let n = 0;
  for (const ch of clean) {
    buf = (buf << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (buf >> bits) & 255;
    }
  }
  return out.subarray(0, n);
};

// Photos on this device's tasks that aren't in Storage yet: [{ taskId, att }]
export const photosToUpload = (tasks) =>
  tasks.flatMap((t) => (t.attachments || []).filter((a) => a.kind === 'photo' && !a.path && /^data:image\//.test(a.url || '')).map((att) => ({ taskId: t.id, att })));

// Every Storage path the data still uses
export const photoPathsIn = (tasks) => new Set(tasks.flatMap((t) => (t.attachments || []).filter((a) => a.kind === 'photo' && a.path).map((a) => a.path)));

export async function uploadPhoto(uid, att) {
  const m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(att.url);
  if (!m) throw new Error('not a photo');
  const path = photoPath(uid, att.id);
  const { error } = await supabase.storage.from(BUCKET).upload(path, base64Bytes(m[2]), { contentType: m[1], upsert: true });
  if (error) throw error;
  return path;
}

export async function removePhotos(paths) {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw error;
}

// Everything in a user's folder (deleting the account)
export async function removeAllPhotos(uid) {
  const { data, error } = await supabase.storage.from(BUCKET).list(uid, { limit: 1000 });
  if (error || !data || !data.length) return;
  await supabase.storage.from(BUCKET).remove(data.map((f) => `${uid}/${f.name}`));
}

// The address to show a photo: its own data on the device that took it, else a signed address (cached)
const signed = new Map(); // path -> { url, until }
export function usePhotoUrl(att) {
  const local = att && att.url;
  const path = att && att.path;
  const cached = path && signed.get(path);
  // a cached address to start with; the effect renews it once it is about to run out
  const [url, setUrl] = useState(local || (cached ? cached.url : null));
  useEffect(() => {
    if (local || !path || !supabase) return undefined;
    const c = signed.get(path);
    if (c && c.until > Date.now()) return undefined;
    let alive = true;
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_FOR)
      .then(({ data }) => {
        if (!data || !alive) return;
        signed.set(path, { url: data.signedUrl, until: Date.now() + (SIGNED_FOR - 120) * 1000 });
        setUrl(data.signedUrl);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [local, path]);
  return local || url;
}
