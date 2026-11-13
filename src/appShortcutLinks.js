// The long-press shortcuts on the app icon (appShortcuts.js): which ones, and the studyplanner:// link each opens.
// Pure, so it is unit tested (e2e/appShortcuts.test.mjs).

// labelKey: i18n; symbol: the iOS SF Symbol (Android shows the app icon)
export const SHORTCUTS = [
  { id: 'new-task', labelKey: 'appShortcuts.newTask', symbol: 'plus' },
  { id: 'focus', labelKey: 'appShortcuts.focus', symbol: 'timer' },
  { id: 'cards', labelKey: 'appShortcuts.cards', symbol: 'rectangle.stack' },
];

export const shortcutUrl = (id, scheme = 'studyplanner') => `${scheme}://do/${id}`;

// the shortcut a link is for ('new-task' | 'focus' | 'cards'), or null for any other link
export function shortcutFromUrl(url) {
  const m = String(url || '').match(/^studyplanner(?:-dev)?:\/\/do\/([a-z-]+)\/?(?:[?#].*)?$/);
  return m && SHORTCUTS.some((s) => s.id === m[1]) ? m[1] : null;
}

// what the native side gets, with the labels in the app's language
export const shortcutItems = (t, scheme = 'studyplanner') => SHORTCUTS.map((s) => ({ id: s.id, title: t(s.labelKey), url: shortcutUrl(s.id, scheme), symbol: s.symbol }));
