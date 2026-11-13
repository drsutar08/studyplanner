// Shared tasks from a live group's board: each member gets a copy of their own (with `groupTaskId` and `fromGroup`)
// to tick off. The board decides what the copies say until they're done; a copy deleted by its member stays deleted
// (the group entry remembers which tasks were copied). Pure.

const DEFAULT_ESTIMATE = 30;
const copyOf = (post, groupId) => ({
  id: `gt-${post.id}`,
  title: post.title,
  subjectId: null,
  due: post.due,
  time: null,
  notes: post.body || '',
  estimate: post.estimate || DEFAULT_ESTIMATE,
  priority: 'med',
  done: false,
  completedAt: null,
  groupTaskId: post.id,
  fromGroup: groupId,
});

// What to change for one group, given all of its board's posts: { add, update: [{ id, patch }], remove, copied }
// (copied: the board's tasks this member has had a copy of, kept with the group). Done copies are left as they are.
export function reconcileGroupTasks({ tasks = [], group, posts = [] }) {
  const board = posts.filter((p) => p.kind === 'task' && p.group_id === group.id);
  const mine = tasks.filter((t) => t.fromGroup === group.id && t.groupTaskId);
  const had = new Set(group.copied || []);
  const add = [];
  const update = [];
  for (const post of board) {
    const copy = mine.find((t) => t.groupTaskId === post.id);
    if (!copy) {
      if (!had.has(post.id)) add.push(copyOf(post, group.id));
      continue;
    }
    if (copy.done) continue;
    const want = copyOf(post, group.id);
    const patch = {};
    for (const k of ['title', 'due', 'notes', 'estimate']) if (copy[k] !== want[k]) patch[k] = want[k];
    if (Object.keys(patch).length) update.push({ id: copy.id, patch });
  }
  const live = new Set(board.map((p) => p.id));
  const remove = mine.filter((t) => !t.done && !live.has(t.groupTaskId)).map((t) => t.id);
  const copied = [...live].filter((id) => had.has(id) || add.some((t) => t.groupTaskId === id) || mine.some((t) => t.groupTaskId === id));
  const changed = add.length || update.length || remove.length || copied.length !== had.size || copied.some((id) => !had.has(id));
  return changed ? { add, update, remove, copied } : null;
}

// The board in the order it's shown: pinned notes, then the other notes newest first; tasks by due date
export const boardNotes = (posts) =>
  posts.filter((p) => p.kind === 'note').sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.created_at).localeCompare(String(a.created_at)));
export const boardTasks = (posts) => posts.filter((p) => p.kind === 'task').sort((a, b) => String(a.due).localeCompare(String(b.due)) || String(a.created_at).localeCompare(String(b.created_at)));
