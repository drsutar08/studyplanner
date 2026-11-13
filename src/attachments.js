// Attachments on a task: links (a worksheet online, a video) and photos (of the homework sheet). A photo is
// stored in the task itself as a small JPEG data URI, so it works offline and goes into backups; that is why
// there are limits. Pure, unit-tested in e2e/attachments.test.mjs.
// An attachment: { id, kind: 'link' | 'photo', url, name }.

export const MAX_ATTACHMENTS = 5;
export const MAX_PHOTOS = 3;
export const MAX_PHOTO_CHARS = 300000; // about 220 KB of JPEG

const isPhotoUrl = (url) => typeof url === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(url) && url.length <= MAX_PHOTO_CHARS;
const isLinkUrl = (url) => typeof url === 'string' && /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url) && url.length <= 2000;

// What someone typed as a link: "khanacademy.org/x" -> { url: 'https://khanacademy.org/x', name: 'khanacademy.org/x' }.
// null when it isn't a web address.
export const parseLink = (text) => {
  const raw = String(text || '').trim();
  if (!raw || /\s/.test(raw)) return null;
  const url = /^https?:\/\//i.test(raw) ? raw : /^[a-z][a-z0-9+.-]*:/i.test(raw) ? null : `https://${raw}`;
  if (!url || !isLinkUrl(url)) return null;
  return { url, name: linkName(url) };
};

// A short name for a link: the address without the scheme, "www." and a trailing slash, cut to 40 characters
export const linkName = (url) => {
  const s = String(url).replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
};

// Whether another one can be added: null if it can, else the reason ('full' | 'photos')
export const cannotAdd = (list, kind) => {
  if ((list || []).length >= MAX_ATTACHMENTS) return 'full';
  if (kind === 'photo' && (list || []).filter((a) => a.kind === 'photo').length >= MAX_PHOTOS) return 'photos';
  return null;
};

let counter = 0;
const newId = () => `a${Date.now().toString(36)}${(counter += 1)}`;

// The list with one more (or unchanged when it can't take it, or it's the same link again)
export const addAttachment = (list, att) => {
  const cur = list || [];
  if (cannotAdd(cur, att.kind)) return cur;
  if (att.kind === 'link' && cur.some((a) => a.kind === 'link' && a.url === att.url)) return cur;
  return [...cur, { id: att.id || newId(), kind: att.kind, url: att.url, name: att.name || (att.kind === 'link' ? linkName(att.url) : '') }];
};

// A photo's place in cloud Storage (cloud/photos.js): "<user id>/<attachment id>.jpg"
const isPhotoPath = (p) => typeof p === 'string' && /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{1,80}\.jpg$/.test(p);

// Only well-formed attachments, within the limits (used when reading a backup). A photo has its picture, or
// only its Storage path when it was added on another device.
export const cleanAttachments = (list) => {
  if (!Array.isArray(list)) return [];
  let out = [];
  for (const a of list) {
    if (!a || (a.kind !== 'link' && a.kind !== 'photo')) continue;
    const path = a.kind === 'photo' && isPhotoPath(a.path) ? a.path : null;
    if (a.kind === 'link' ? !isLinkUrl(a.url) : !isPhotoUrl(a.url) && !path) continue;
    const before = out.length;
    out = addAttachment(out, { id: typeof a.id === 'string' ? a.id : undefined, kind: a.kind, url: isPhotoUrl(a.url) || a.kind === 'link' ? a.url : undefined, name: typeof a.name === 'string' ? a.name.slice(0, 80) : '' });
    if (path && out.length > before) out[out.length - 1] = { ...out[out.length - 1], path };
  }
  return out;
};
