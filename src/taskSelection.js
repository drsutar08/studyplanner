import { useState } from 'react';
import { useStore } from './store';
import { useToast } from './toast';
import { useShortcuts } from './shortcuts';
import { t } from './i18n';
import { formatDue } from './dates';

// Picking several tasks to complete, move or delete together (the Dashboard and the Calendar's task list).
// Each change says what happened, with Undo (the task list as it was). Escape stops picking on the desktop.
export function useTaskSelection() {
  const { state, dispatch } = useStore();
  const { show } = useToast();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState([]); // task ids
  const [moving, setMoving] = useState(false); // the "Move to…" sheet

  const stop = () => {
    setSelecting(false);
    setPicked([]);
    setMoving(false);
  };
  const run = (action, message) => {
    const before = state.tasks;
    dispatch({ ...action, ids: picked });
    show({ tone: 'success', message, actionLabel: t('common.undo'), onAction: () => dispatch({ type: 'RESTORE_LISTS', lists: { tasks: before } }) });
    stop();
  };
  useShortcuts({ Escape: stop }, selecting);

  return {
    selecting,
    picked,
    moving,
    start: () => setSelecting(true),
    stop,
    toggle: (id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])),
    pickAll: (ids) => setPicked(ids),
    openMove: () => setMoving(true),
    closeMove: () => setMoving(false),
    complete: () => run({ type: 'COMPLETE_TASKS' }, t('select.doneToast', { count: picked.length })),
    remove: () => run({ type: 'DELETE_TASKS' }, t('select.deletedToast', { count: picked.length })),
    moveTo: (due) => run({ type: 'MOVE_TASKS', due }, t('select.movedToast', { count: picked.length, when: formatDue(due) })),
  };
}
