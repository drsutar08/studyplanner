// Long-press shortcuts on the app icon (New task, Start focus, Review flashcards), through the app's own native
// module (modules/app-shortcuts). Only in development and store builds: Expo Go and the web have no such module,
// so every call does nothing there.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { t } from './i18n';
import { shortcutItems, shortcutFromUrl } from './appShortcutLinks';
import { SCHEME } from './appScheme';

const Native = Platform.OS === 'ios' || Platform.OS === 'android' ? requireOptionalNativeModule('AppShortcuts') : null;

// Call at start and whenever the language changes
export function setAppShortcuts() {
  if (!Native) return;
  try {
    Native.setShortcuts(shortcutItems(t, SCHEME));
  } catch {
    // shortcuts must never break the app
  }
}

// onAction(id) for a pressed shortcut. Android brings it as a link (React Native's Linking, handled with the app's
// other links: see App.js); iOS through the module, including the one a cold start came from. Returns stop().
export function listenForAppShortcuts(onAction) {
  if (!Native || Platform.OS !== 'ios') return () => {};
  let last = { url: null, at: 0 };
  const take = (url) => {
    const id = shortcutFromUrl(url);
    if (!id) return;
    // the same press can arrive as an event and as the launch link: once is enough
    if (url === last.url && Date.now() - last.at < 3000) return;
    last = { url, at: Date.now() };
    onAction(id);
  };
  let sub = null;
  try {
    take(Native.takeLaunchUrl());
    sub = Native.addListener('onShortcut', (e) => {
      take(e && e.url);
      Native.takeLaunchUrl(); // it was kept for a cold start: clear it
    });
  } catch {
    // no module after all
  }
  return () => sub && sub.remove();
}

export { shortcutFromUrl };
