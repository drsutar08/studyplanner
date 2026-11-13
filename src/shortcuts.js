import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

// Keyboard shortcuts on the desktop (web). One keydown listener for the whole app; each part registers a map
// of key -> handler while it is on screen: useShortcuts({ n: addTask, ArrowLeft: prev }, active). The most
// recently registered map that knows the key wins, so a screen's keys come before the app-wide ones.
// Keys are ignored while typing in a field, with Ctrl / ⌘ / Alt held, and while a dialog (sheet) is open.
// Letters are matched in lower case; the space bar is 'space'.
export const shortcutsSupported = Platform.OS === 'web' && typeof window !== 'undefined';

const layers = [];
let listening = false;

const typing = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const dialogOpen = () => typeof document !== 'undefined' && !!document.querySelector('[aria-modal="true"]');

// The name a map uses for a keyboard event
export const keyName = (e) => (e.key === ' ' ? 'space' : e.key.length === 1 ? e.key.toLowerCase() : e.key);

const onKey = (e) => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  if (typing(e.target) || dialogOpen()) return;
  const key = keyName(e);
  // space / Enter on a focused button presses that button
  if ((key === 'space' || key === 'Enter') && e.target && e.target.closest && e.target.closest('button,[role="button"],[role="tab"],[role="checkbox"],[role="switch"],a')) return;
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const fn = layers[i].current && layers[i].current[key];
    if (fn) {
      e.preventDefault();
      fn(e);
      return;
    }
  }
};

export function useShortcuts(map, active = true) {
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });
  useEffect(() => {
    if (!shortcutsSupported || !active) return undefined;
    if (!listening) {
      window.addEventListener('keydown', onKey);
      listening = true;
    }
    layers.push(ref);
    return () => {
      const at = layers.indexOf(ref);
      if (at >= 0) layers.splice(at, 1);
    };
  }, [active]);
}

// The "Keyboard shortcuts" list: "?" opens it anywhere, Settings has a row for it. The app shell listens.
const helpListeners = new Set();
export const showShortcutHelp = () => helpListeners.forEach((f) => f());
export const onShortcutHelp = (fn) => {
  helpListeners.add(fn);
  return () => helpListeners.delete(fn);
};
