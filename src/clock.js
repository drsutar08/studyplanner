import { useEffect, useState } from 'react';

// The time now as 'HH:MM'
export const hhmmNow = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 'HH:MM' that ticks over just after each new minute starts. Only the component using it re-renders.
export function useClock() {
  const [now, setNow] = useState(hhmmNow);
  useEffect(() => {
    let timer;
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(hhmmNow());
        schedule();
      }, 60000 - (Date.now() % 60000) + 50);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return now;
}
