import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

// Drag and drop on the desktop (web) Calendar: move a task, exam or one-off class to another day. Plain HTML5
// drag events on one container, found by delegation: anything inside with data-drag="task:<id>" can be picked
// up, anything with data-daykey="YYYY-MM-DD" takes the drop. On phones (no DOM) this does nothing.
//
// useDayDrop(onDrop) -> { ref, over }: put `ref` on the container; `over` is the day key under the pointer while
// dragging (to highlight it). onDrop(drag, dayKey, at) gets the data-drag value, the day, and where in the day
// element it landed: { y, height, timeline } (y in px, from the top of the picked-up item, so a week-view block keeps
// its grab point).
export const dragProps = (value) => (Platform.OS === 'web' && value ? { dataSet: { drag: value } } : {});
// `timeline`: a week-view day column, where the drop height also picks the time
export const dropProps = (key, timeline = false) => (Platform.OS === 'web' ? { dataSet: { daykey: key, ...(timeline ? { timeline: '1' } : {}) } } : {});

export function useDayDrop(onDrop) {
  const ref = useRef(null);
  const handler = useRef(onDrop);
  const [over, setOver] = useState(null);

  useEffect(() => {
    handler.current = onDrop;
  });

  // RN Web doesn't pass `draggable` through, so set it on the tagged elements after each render
  useEffect(() => {
    const el = ref.current;
    if (Platform.OS !== 'web' || !el || !el.querySelectorAll) return;
    el.querySelectorAll('[data-drag]').forEach((n) => {
      if (n.getAttribute('draggable') !== 'true') n.setAttribute('draggable', 'true');
    });
  });

  useEffect(() => {
    const el = ref.current;
    if (Platform.OS !== 'web' || !el || !el.addEventListener) return undefined;
    let drag = null;
    let grab = 0;
    const dayOf = (target) => (target && target.closest ? target.closest('[data-daykey]') : null);
    const start = (e) => {
      const src = e.target && e.target.closest ? e.target.closest('[data-drag]') : null;
      if (!src) return;
      drag = src.getAttribute('data-drag');
      grab = e.clientY - src.getBoundingClientRect().top;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', drag);
    };
    const move = (e) => {
      const day = drag && dayOf(e.target);
      if (!day) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const key = day.getAttribute('data-daykey');
      setOver((k) => (k === key ? k : key));
    };
    const leave = (e) => {
      if (!e.relatedTarget || !el.contains(e.relatedTarget)) setOver(null);
    };
    const drop = (e) => {
      const day = drag && dayOf(e.target);
      if (day) {
        e.preventDefault();
        const r = day.getBoundingClientRect();
        handler.current(drag, day.getAttribute('data-daykey'), { y: e.clientY - r.top - grab, height: r.height, timeline: day.getAttribute('data-timeline') === '1' });
      }
      drag = null;
      setOver(null);
    };
    const end = () => {
      drag = null;
      setOver(null);
    };
    const events = [['dragstart', start], ['dragover', move], ['dragleave', leave], ['drop', drop], ['dragend', end]];
    events.forEach(([n, f]) => el.addEventListener(n, f));
    return () => events.forEach(([n, f]) => el.removeEventListener(n, f));
  }, []);

  return { ref, over };
}
