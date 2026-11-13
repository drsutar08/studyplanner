// Data from the older version of the app, whose accounts lived on the device (no cloud), into the signed-in cloud
// account. The merge is pure (unit-tested in e2e/legacyImport.test.mjs); reading the device and checking the old
// password are in legacyAccounts.js.

const LISTS = ['subjects', 'tasks', 'sessions', 'exams', 'recurring', 'classes', 'vacations', 'archive'];

// The old account's data added to `current`: subjects with the same name become one; a task already there (same
// title and due day) is skipped; everything else is added with an id of its own ("old-…") so nothing collides,
// and its links (subject, repeat, class) follow. The term and rotation are taken only when there are none.
// Returns { data, added } (added: how many records came in).
export const mergeLegacy = (current, old) => {
  const out = Object.fromEntries(LISTS.map((l) => [l, [...(current[l] || [])]]));
  const taken = new Set(LISTS.flatMap((l) => out[l].map((r) => String(r.id))));
  const fresh = (id) => {
    let n = `old-${id}`;
    for (let i = 2; taken.has(n); i++) n = `old-${id}-${i}`;
    taken.add(n);
    return n;
  };
  let added = 0;

  // subjects: by name
  const subjectMap = {};
  for (const s of old.subjects || []) {
    const same = out.subjects.find((x) => x.name.trim().toLowerCase() === String(s.name || '').trim().toLowerCase());
    if (same) subjectMap[s.id] = same.id;
    else {
      const id = fresh(s.id);
      subjectMap[s.id] = id;
      out.subjects.push({ ...s, id });
      added += 1;
    }
  }
  const subj = (id) => (id == null ? null : subjectMap[id] ?? null);

  const ids = {}; // list -> { oldId: newId }
  const move = (list, map) => {
    ids[list] = {};
    for (const r of old[list] || []) {
      const id = fresh(r.id);
      ids[list][r.id] = id;
      out[list].push(map({ ...r, id }));
      added += 1;
    }
  };
  move('recurring', (r) => ({ ...r, subjectId: subj(r.subjectId), generatedUntil: null }));
  move('classes', (c) => ({ ...c, subjectId: subj(c.subjectId) }));
  move('exams', (e) => ({ ...e, subjectId: subj(e.subjectId) }));
  move('vacations', (v) => v);

  // tasks: not the ones already here; links follow the new ids
  const here = new Map(out.tasks.map((t) => [`${String(t.title).toLowerCase()}|${t.due}`, t.id]));
  const taskMap = {};
  for (const t of old.tasks || []) {
    const same = here.get(`${String(t.title).toLowerCase()}|${t.due}`);
    if (same) {
      taskMap[t.id] = same;
      continue;
    }
    const recurId = t.recurId ? ids.recurring[t.recurId] : undefined;
    const classId = t.classId ? ids.classes[t.classId] : undefined;
    const { recurId: _r, classId: _c, ...rest } = t;
    const id = fresh(t.id);
    taskMap[t.id] = id;
    out.tasks.push({ ...rest, id, subjectId: subj(t.subjectId), ...(recurId ? { recurId } : {}), ...(classId ? { classId } : {}) });
    added += 1;
  }
  // focus sessions, pointing at the tasks' new ids
  move('sessions', (x) => ({ ...x, subjectId: subj(x.subjectId), taskId: x.taskId ? taskMap[x.taskId] || null : null }));
  move('archive', (x) => ({ ...x, subjectId: subj(x.subjectId) }));

  return {
    data: { ...current, ...out, term: current.term || old.term || null, rotation: current.rotation || old.rotation || null },
    added,
  };
};

// What an old account holds, for the list to pick from: { tasks, exams, classes, sessions }
export const legacyCounts = (data) => ({
  tasks: (data.tasks || []).length,
  exams: (data.exams || []).length,
  classes: (data.classes || []).length,
  sessions: (data.sessions || []).length,
});
