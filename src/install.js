// Installing the web app (public/manifest.json): Chrome and Edge offer it through the beforeinstallprompt event,
// which is caught here as soon as the app loads (App.js imports this file) and kept for the Settings button. Safari
// on an iPhone or iPad has no prompt: the button explains Share → Add to Home Screen instead. Already installed
// (opened from the home screen) or on the phone apps (install.native.js), there's nothing to offer.
import { useSyncExternalStore } from 'react';

let deferred = null;
const listeners = new Set();
const emit = () => listeners.forEach((f) => f());

const standalone = () =>
  typeof window !== 'undefined' && ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true);
const appleMobile = () => typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // our own button, not the browser's mini bar
    deferred = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

// 'prompt' (the browser can install it), 'ios' (show how), or null (installed, or not offered)
const stateNow = () => (standalone() ? null : deferred ? 'prompt' : appleMobile() ? 'ios' : null);
let snapshot = stateNow();
listeners.add(() => {
  snapshot = stateNow();
});
const subscribe = (f) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
export const useInstall = () => useSyncExternalStore(subscribe, () => snapshot, () => snapshot);

// Shows the browser's install dialog; true if it was installed
export async function installApp() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  e.prompt();
  const choice = await e.userChoice.catch(() => null);
  emit();
  return !!choice && choice.outcome === 'accepted';
}
