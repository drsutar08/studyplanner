// How each activity category looks: icon and colour. Fixed colours, like the subject palette, so they read
// the same in light and dark mode. The ids live in classes.js (ACTIVITY_CATEGORIES).
import { t } from './i18n';

export const ACTIVITY_LOOK = {
  club: { icon: 'people', color: '#8B5CF6' },
  sport: { icon: 'football', color: '#16A34A' },
  work: { icon: 'briefcase', color: '#0EA5E9' },
  volunteer: { icon: 'heart', color: '#E11D48' },
  arts: { icon: 'musical-notes', color: '#F59E0B' },
  other: { icon: 'star', color: '#64748B' },
};

export const activityLook = (cls) => ACTIVITY_LOOK[cls && cls.category] || ACTIVITY_LOOK.other;
export const activityCategoryLabel = (cls) => t(`activities.categories.${ACTIVITY_LOOK[cls && cls.category] ? cls.category : 'other'}`);
