// Shows a running focus session outside the app: the browser tab's title on the web, and a Live Activity
// (lock screen / Dynamic Island) on iOS development and store builds. Everything is best effort: where
// a platform has neither (Expo Go, Android), the calls do nothing.
import { Platform } from 'react-native';

let factory = null;
if (Platform.OS === 'ios') {
  try {
    factory = require('./widgets/FocusActivity').default;
  } catch {
    factory = null; // Expo Go: the native widget module isn't included
  }
}

// ---- the browser tab ("23:41 · Problem set 5") ----
let pageTitle = null; // the title before the timer took over the tab

export function showTabTimer(text) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (pageTitle === null) pageTitle = document.title;
  document.title = text;
}

export function clearTabTimer() {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || pageTitle === null) return;
  document.title = pageTitle;
  pageTitle = null;
}

// ---- the iOS Live Activity: updated when the session starts, pauses, resumes or ends (iOS counts down itself) ----
let instance = null;

const current = () => {
  if (instance) return instance;
  try {
    // after the app was relaunched, pick up the activity that is still on the lock screen
    instance = (factory && factory.getInstances && factory.getInstances()[0]) || null;
  } catch {
    instance = null;
  }
  return instance;
};

// props: { kicker, title, color, startAt, endAt, paused, pausedText } (see widgets/FocusActivity.ios.js)
export function showLiveActivity(props) {
  if (!factory) return;
  try {
    const live = current();
    if (live) live.update(props).catch(() => {});
    else instance = factory.start(props);
  } catch {
    instance = null; // Live Activities turned off for the app, or not supported on this iOS version
  }
}

export function endLiveActivity() {
  const live = current();
  instance = null;
  if (!live) return;
  try {
    live.end('immediate').catch(() => {});
  } catch {
    // already gone
  }
}
