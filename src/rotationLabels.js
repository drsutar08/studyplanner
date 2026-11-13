// Display text for a rotating timetable ("Day B", "Week 2"), in the app language.
import { t } from './i18n';
import { rotationIndexOn, rotationLetter } from './classes';

export const slotLabel = (rotation, index) =>
  rotation && rotation.type === 'weeks' ? t('rotation.week', { n: index + 1 }) : t('rotation.day', { letter: rotationLetter(index) });

// "Day B" for a date, or null (no rotation, or not a school day / a paused break day)
export const dayRotationLabel = (rotation, key, vacations = []) => {
  const i = rotationIndexOn(rotation, key, vacations);
  return i === null ? null : slotLabel(rotation, i);
};

// "Day A, Day C" for a rotation class's letters, "Week 1" for a weekly class limited to some weeks
export const slotsLabel = (rotation, indices = []) => indices.map((i) => slotLabel(rotation, i)).join(', ');
