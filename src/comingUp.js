// The Dashboard's "Coming up": a repeating task's copies fold into its next one (with how many more there are),
// so a daily task doesn't fill the list with a row per day. Pure, unit-tested in e2e/comingUp.test.mjs.

// tasks: upcoming tasks, soonest first. Returns the same order with only the first copy of each repeat,
// that copy given `moreCopies` (how many later copies were folded in).
export const foldRepeats = (tasks) => {
  const first = new Map(); // recurId -> index in out
  const out = [];
  for (const t of tasks) {
    if (!t.recurId) {
      out.push(t);
      continue;
    }
    if (first.has(t.recurId)) {
      const i = first.get(t.recurId);
      out[i] = { ...out[i], moreCopies: (out[i].moreCopies || 0) + 1 };
      continue;
    }
    first.set(t.recurId, out.length);
    out.push(t);
  }
  return out;
};

// Where a day label goes in a list of tasks (soonest first): before the first task of each day
export const startsDay = (list, index) => index === 0 || list[index - 1].due !== list[index].due;
