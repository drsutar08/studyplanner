import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase, cloudConfigured } from './cloud/supabase';

// Single place every unexpected error goes through. It logs, keeps the last few on the device (a tester can read
// them back), and sends them to the project's client_errors table (see docs/reliability.md for reading them).
// Another service (Sentry, Crashlytics...) would be called from `send` too.
const KEY = 'studyplanner:errors';
const KEEP = 20;
const SEND_MAX = 10; // per app session: a loop of the same failure sends a handful, not thousands

const sent = new Set();
const send = (entry) => {
  if (!cloudConfigured || sent.size >= SEND_MAX) return;
  const once = `${entry.context}|${entry.message}`;
  if (sent.has(once)) return;
  sent.add(once);
  // the server fills in who and when; a failed send (offline) is let go: the device copy is still there
  supabase
    .from('client_errors')
    .insert({
      context: entry.context.slice(0, 300),
      message: entry.message.slice(0, 1000),
      stack: entry.stack.slice(0, 4000),
      platform: Platform.OS,
      app_version: String((Constants.expoConfig && Constants.expoConfig.version) || '').slice(0, 40),
    })
    .then(
      () => {},
      () => {}
    );
};

export async function reportError(error, context = '') {
  const entry = {
    at: new Date().toISOString(),
    context,
    message: String((error && error.message) || error),
    stack: String((error && error.stack) || '').split('\n').slice(0, 8).join('\n'),
  };
   
  console.error('[StudyPlanner]', context, entry.message);
  try {
    send(entry);
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(KEY, JSON.stringify([entry, ...list].slice(0, KEEP)));
  } catch {
    // never let reporting itself crash the app
  }
}

export async function readErrors() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearErrors() {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}

// Also catch errors thrown outside React rendering (timers, promises): on native through ErrorUtils, on the web
// through the window's error events.
export function installGlobalHandlers() {
  const g = globalThis;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('error', (e) => reportError(e.error || e.message, 'uncaught'));
    window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'unhandled promise'));
  }
  if (g.ErrorUtils && g.ErrorUtils.setGlobalHandler) {
    const previous = g.ErrorUtils.getGlobalHandler && g.ErrorUtils.getGlobalHandler();
    g.ErrorUtils.setGlobalHandler((err, isFatal) => {
      reportError(err, isFatal ? 'fatal' : 'uncaught');
      if (previous) previous(err, isFatal);
    });
  }
}
