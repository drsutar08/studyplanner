import { t } from '../../i18n';
import { formatDue, formatTime } from '../../dates';
import { fromMin, toMin } from '../../freeTime';
import { useToast } from '../../toast';

// Drag and drop on the desktop Calendar: moveItem("t:<id>" | "e:<id>" | "c:<id>", dayKey, minute) moves a task,
// exam or one-off class to that day, and from the week view to that time (minute; null keeps the time).
// Says where it went, with Undo. `select(day)` shows the day it landed on.
export function useMoveItem({ state, dispatch, select }) {
  const { show } = useToast();
  return (drag, key, minute) => {
    const id = drag.slice(2);
    const time = minute == null ? undefined : fromMin(minute);
    const timed = time === undefined ? {} : { time };
    let title;
    let undo;
    if (drag.startsWith('t:')) {
      const tk = state.tasks.find((x) => x.id === id);
      if (!tk || (tk.due === key && (time === undefined || time === tk.time))) return;
      dispatch({ type: 'MOVE_TASK', id, due: key, ...timed });
      title = tk.title;
      undo = () => dispatch({ type: 'MOVE_TASK', id, due: tk.due, time: tk.time });
    } else if (drag.startsWith('e:')) {
      const ex = state.exams.find((x) => x.id === id);
      if (!ex || (ex.date === key && (time === undefined || time === ex.time))) return;
      dispatch({ type: 'MOVE_EXAM', id, date: key, ...timed });
      title = ex.title;
      undo = () => dispatch({ type: 'MOVE_EXAM', id, date: ex.date, time: ex.time });
    } else if (drag.startsWith('c:')) {
      const c = state.classes.find((x) => x.id === id);
      if (!c || c.repeat !== 'once' || (c.date === key && (time === undefined || time === c.start))) return;
      // keep the class's length when it moves to a new time
      const span = time !== undefined && c.start ? { start: time, end: c.end ? fromMin(Math.min(24 * 60 - 1, minute + toMin(c.end) - toMin(c.start))) : null } : {};
      dispatch({ type: 'MOVE_CLASS', id, date: key, ...span });
      title = c.title;
      undo = () => dispatch({ type: 'MOVE_CLASS', id, date: c.date, start: c.start, end: c.end });
    } else return;
    select(key);
    const when = time === undefined ? formatDue(key) : `${formatDue(key)} ${formatTime(time)}`;
    show({ message: t('calendar.moved', { title, when }), actionLabel: t('common.undo'), onAction: undo });
  };
}
