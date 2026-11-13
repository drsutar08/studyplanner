// Steps (subtasks) inside a task: a small checklist stored on the task as `subtasks: [{ id, title, done }]`.
// Pure functions with no imports, so they can be unit tested: `npm run test:subtasks`.

export const MAX_STEPS = 30;
export const MAX_STEP_LENGTH = 80;

const newId = () => `st${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Adds a step at the end. Blank titles, duplicates of the last step and lists that are full are ignored.
export const addStep = (steps, title, id = newId()) => {
  const clean = String(title || '').trim().slice(0, MAX_STEP_LENGTH);
  if (!clean || steps.length >= MAX_STEPS) return steps;
  return [...steps, { id, title: clean, done: false }];
};

export const toggleStep = (steps, id) => steps.map((s) => (s.id === id ? { ...s, done: !s.done } : s));

export const renameStep = (steps, id, title) => {
  const clean = String(title || '').trim().slice(0, MAX_STEP_LENGTH);
  return clean ? steps.map((s) => (s.id === id ? { ...s, title: clean } : s)) : steps;
};

export const removeStep = (steps, id) => steps.filter((s) => s.id !== id);

// { done, total, next } where `next` is the first step not done yet (null when all are done or none exist)
export const stepProgress = (steps = []) => {
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, next: steps.find((s) => !s.done) || null };
};

// For a new copy of a repeating task: same steps, fresh ids, nothing ticked.
export const freshSteps = (steps = []) => steps.map((s, i) => ({ id: `${newId()}${i}`, title: s.title, done: false }));

// Cleans steps from a backup or old data: keeps well-formed ones, trims titles, caps the count.
export const cleanSteps = (raw) =>
  (Array.isArray(raw) ? raw : [])
    .filter((s) => s && typeof s.title === 'string' && s.title.trim())
    .slice(0, MAX_STEPS)
    .map((s, i) => ({ id: typeof s.id === 'string' && s.id ? s.id : `st${i}`, title: s.title.trim().slice(0, MAX_STEP_LENGTH), done: !!s.done }));
