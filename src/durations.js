// Minutes as a short length of time in the app language: "45m", "2h", "1h 20m"
import { t } from './i18n';

export const hoursText = (min) => {
  const hours = Math.floor(min / 60);
  const mins = Math.round(min % 60);
  if (hours > 0) return mins ? t('progress.hoursMinutes', { hours, mins }) : t('progress.hoursShort', { hours });
  return t('progress.minutesShort', { mins });
};
