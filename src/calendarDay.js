import { createContext, useContext } from 'react';

// The day selected on the Calendar, shared with the app shell so the centre "+" adds the task on that
// day while you're on the Calendar (the day list has no add buttons of its own).
export const CalendarDayContext = createContext({ setDay: () => {} });
export const useCalendarDay = () => useContext(CalendarDayContext);
