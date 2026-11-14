// Classrooms (see the 20261117 migration): a teacher shares study materials with approved students.
// Pure logic, so e2e/classrooms.test.mjs can run it in Node.

export const CODE_LENGTH = 8;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const TITLE_MAX = 120;
export const BODY_MAX = 2000;

// What a student types: letters and digits only, upper case, at most 8 ("abcd-efgh" -> "ABCDEFGH")
export const cleanCode = (text) =>
  String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);
// How the teacher sees and shares it: ABCD-EFGH
export const formatCode = (code) => {
  const c = cleanCode(code);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
};
export const codeComplete = (text) => cleanCode(text).length === CODE_LENGTH;

// The files a teacher can upload (the bucket accepts exactly these), by kind
const TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'doc',
  'application/vnd.ms-powerpoint': 'slides',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'slides',
  'application/vnd.ms-excel': 'sheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'sheet',
};
const BY_EXTENSION = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
export const PICKER_TYPES = Object.keys(TYPES);

export const extensionOf = (name) => {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
};
// The file's type: the picker's when it is one we take, else from its name (phones often say octet-stream)
export const mimeFor = (mime, name) => (TYPES[mime] ? mime : BY_EXTENSION[extensionOf(name)] || null);
// 'pdf' | 'image' | 'doc' | 'slides' | 'sheet', or null for a type that can't be uploaded
export const fileKind = (mime, name) => {
  const m = mimeFor(mime, name);
  return m ? TYPES[m] : null;
};
// Why a picked file can't be uploaded: 'type' | 'tooBig' | null (fine)
export const fileProblem = ({ mimeType, name, size }) => {
  if (!fileKind(mimeType, name)) return 'type';
  if (size && size > MAX_FILE_BYTES) return 'tooBig';
  return null;
};

// Where a file goes in the bucket: <classroom id>/<material id>.<ext> (the database checks the folder)
export const materialPath = (classroomId, materialId, name, mime) => {
  const ext = extensionOf(name) || Object.keys(BY_EXTENSION).find((e) => BY_EXTENSION[e] === mime) || 'bin';
  return `${classroomId}/${materialId}.${ext}`;
};

// "1.2 MB", "350 KB"
export const formatSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
};

// A link as typed: "khanacademy.org/x" -> "https://khanacademy.org/x"; null when it isn't a web address
export const cleanUrl = (text) => {
  const s = String(text || '').trim();
  if (!s || /\s/.test(s)) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : /^[a-z][a-z0-9+.-]*:/i.test(s) ? null : `https://${s}`;
  if (!withScheme || withScheme.length > 2000) return null;
  const m = /^https?:\/\/([^/?#]+)/i.exec(withScheme);
  if (!m || !/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?$/i.test(m[1].replace(/^[^@]*@/, ''))) return null;
  return withScheme;
};
export const linkHost = (url) => {
  const m = /^https?:\/\/(?:www\.)?([^/?#:]+)/i.exec(String(url || ''));
  return m ? m[1].toLowerCase() : '';
};

// Pinned first, then newest first
export const sortMaterials = (list) =>
  [...(list || [])].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.created_at).localeCompare(String(a.created_at)));

// "New" until the student has opened the classroom since it was added
export const isNew = (material, seenAt) => !!material && (!seenAt || String(material.created_at) > String(seenAt));
export const hasNew = (classroom, seenAt) =>
  !!classroom && classroom.role === 'student' && classroom.status === 'approved' && !!classroom.latest && (!seenAt || String(classroom.latest) > String(seenAt));

// Which message a failed action gets
export const classroomErrorKind = (e) => {
  const s = String((e && (e.message || e.error || e.statusCode)) || e || '');
  if (/classroom_limit/.test(s)) return 'limit';
  if (/classroom_full/.test(s)) return 'full';
  if (/own_classroom/.test(s)) return 'own';
  if (/materials_full/.test(s)) return 'materialsFull';
  if (/row-level security|violates row-level|unauthorized|403/i.test(s)) return 'storage';
  if (/too large|exceeded the maximum|payload too large|413/i.test(s)) return 'tooBig';
  if (/mime type|invalid_mime/i.test(s)) return 'type';
  return 'offline';
};

// The Settings row's line: "Teaching 2 · Joined 1 · 3 waiting"
export const summary = (list) => {
  const all = list || [];
  return {
    teaching: all.filter((c) => c.role === 'teacher').length,
    joined: all.filter((c) => c.role === 'student').length,
    waiting: all.filter((c) => c.role === 'teacher').reduce((n, c) => n + (c.pending || 0), 0),
  };
};
