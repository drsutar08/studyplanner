import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t, getLanguage } from './i18n';
import { supabase, cloudConfigured } from './cloud/supabase';
import { DEVICE_SETTINGS } from './cloud/sync';
import { removeAllPhotos } from './cloud/photos';
import { removeAllClassroomFiles } from './cloud/classrooms';
import { LEGAL_VERSION } from './legal';
import { appUrl } from './appScheme';

// Accounts are Supabase accounts (email and password). The session is kept by supabase-js; settings are cached
// on the device per account and synced like the rest of the data (src/cloud/useCloudSync.js).

const settingsKey = (id) => `studyplanner:settings:${id}`;
// Before cloud accounts, accounts lived on the device: their list (to bring old data over, see store.js)
export const LEGACY_USERS_KEY = 'studyplanner:auth:users';

export const DEFAULT_SETTINGS = {
  dailyGoal: 60, // minutes
  focusMinutes: 25,
  reminders: true,
  vibration: true,
  pushEnabled: false, // phone notifications; turned on from Settings (asks the OS for permission)
  dailyReminder: true,
  reminderHour: 18,
  weekStart: 0, // 0 = Sunday, 1 = Monday
  keepAwake: true, // keep the screen on while a focus session runs
  theme: 'light', // 'light' (the default) | 'dark' | 'system' (follows the device)
  language: 'system', // 'system' | a code from i18n LANGUAGES
  calendarView: 'month', // 'month' | 'week'
  gradeScale: 'percent', // 'percent' | 'gpa4' | 'gpa10'
  attendanceTarget: 75, // minimum attendance, percent
  workHourLimit: null, // weekly limit on work activities, hours (null = none)
  shortBreak: 5, // focus timer: minutes, see focusTimer.js
  longBreak: 15,
  focusRound: 4, // focus sessions before a long break
  attendanceNudge: true, // evening reminder when today's classes aren't marked
  weeklyReport: true, // the weekly report notification, 7 PM on the last day of the week
  smartReminders: true, // a nudge at the usual study time (from focus sessions) about what's due soon
  textSize: 'standard', // 'standard' | 'large' | 'larger' (theme.js TEXT_SIZES)
  readingFont: false, // the easier-to-read font (Lexend)
  shareStudying: true, // study together: the study groups see when this account's focus timer runs (and its subject)
  archiveAfter: 60, // days after which done tasks move to the archive (0 = never)
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const normEmail = (e) => e.trim().toLowerCase();

export const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || '?';

// A Supabase error as a sentence for the person using the app
const errorText = (error, fallback = 'auth.errors.generic') => {
  const code = error && (error.code || '');
  const msg = String((error && error.message) || '').toLowerCase();
  if (error && (error.name === 'AuthRetryableFetchError' || error.status === 0 || /failed to fetch|network/.test(msg))) return t('auth.errors.network');
  if (code === 'invalid_credentials' || /invalid login credentials/.test(msg)) return t('auth.errors.incorrect');
  if (code === 'email_not_confirmed' || /email not confirmed/.test(msg)) return t('auth.errors.notConfirmed');
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered/.test(msg)) return t('auth.errors.emailTaken');
  if (code === 'weak_password' || /password should be/.test(msg)) return t('auth.errors.passwordLength');
  if (/rate limit|too many/.test(msg) || /^over_/.test(code)) return t('auth.errors.tooManyCloud');
  return t(fallback);
};

const toUser = (u) => (u ? { id: u.id, email: u.email, name: (u.user_metadata && u.user_metadata.name) || (u.email || '').split('@')[0] } : null);

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(!cloudConfigured); // without a project there is nothing to wait for
  const [user, setUser] = useState(null); // { id, name, email }
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [recovering, setRecovering] = useState(false); // opened from a "reset password" link: ask for a new one
  const [endedBecause, setEndedBecause] = useState(null); // 'deleted': the account was deleted on another device

  const loadSettings = useCallback(async (id) => {
    try {
      const raw = await AsyncStorage.getItem(settingsKey(id));
      setSettings({ ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) });
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
  }, []);

  // The session: restored on launch, then followed (sign in / out, token refresh, password recovery)
  useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;
    const take = async (session) => {
      const u = toUser(session && session.user);
      if (u) await loadSettings(u.id);
      if (!alive) return;
      setUser((cur) => (cur && u && cur.id === u.id && cur.name === u.name && cur.email === u.email ? cur : u));
      setReady(true);
    };
    supabase.auth
      .getSession()
      .then(({ data }) => take(data.session))
      .catch(() => alive && setReady(true));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      // run outside the callback: supabase-js holds a lock while it is called
      setTimeout(() => take(session), 0);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [loadSettings]);

  // On a phone, the reset email opens studyplanner://reset#access_token=…&refresh_token=…: sign in with those
  // and ask for a new password (on the web supabase-js reads the page address itself)
  useEffect(() => {
    if (!supabase || Platform.OS === 'web') return undefined;
    const open = async (url) => {
      if (!url || !url.startsWith(appUrl('reset'))) return;
      const params = Object.fromEntries(new URLSearchParams(url.split('#')[1] || url.split('?')[1] || ''));
      if (!params.access_token || !params.refresh_token) return;
      const { error } = await supabase.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token });
      if (!error) setRecovering(true);
    };
    Linking.getInitialURL().then(open).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => open(url));
    return () => sub.remove();
  }, []);

  // consent: { age: 'adult' | 'minor', guardian, agreed } from the sign-up form (checked after the fields, so their
  // messages come first); kept on the account with the date and the version of the terms agreed to
  const signup = useCallback(async ({ name, email, password, consent = {} }) => {
    if (name.trim().length < 2) return { error: t('auth.errors.fullName') };
    if (!EMAIL_RE.test(email.trim())) return { error: t('auth.errors.email') };
    if (password.length < 6) return { error: t('auth.errors.passwordLength') };
    if (consent.age !== 'adult' && consent.age !== 'minor') return { error: t('auth.consent.pickAge') };
    if (consent.age === 'minor' && !consent.guardian) return { error: t('auth.consent.needGuardian') };
    if (!consent.agreed) return { error: t('auth.consent.needAgree') };
    if (!supabase) return { error: t('auth.errors.noCloud') };
    const agreed = { age: consent.age, guardian: consent.age === 'minor', terms: LEGAL_VERSION, at: new Date().toISOString() };
    const { data, error } = await supabase.auth.signUp({ email: normEmail(email), password, options: { data: { name: name.trim(), language: getLanguage(), consent: agreed } } }); // the language: the welcome email's
    if (error) return { error: errorText(error) };
    // with "Confirm email" on, there is no session until the link in the email is opened
    if (!data.session) return { ok: true, confirm: true };
    return { ok: true };
  }, []);

  const login = useCallback(async ({ email, password }) => {
    if (!email.trim() || !password) return { error: t('auth.errors.missing') };
    if (!supabase) return { error: t('auth.errors.noCloud') };
    const { error } = await supabase.auth.signInWithPassword({ email: normEmail(email), password });
    if (error) return { error: errorText(error) };
    setEndedBecause(null);
    return { ok: true };
  }, []);

  const resetPassword = useCallback(async (email) => {
    if (!EMAIL_RE.test(email.trim())) return { error: t('auth.errors.email') };
    if (!supabase) return { error: t('auth.errors.noCloud') };
    const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : appUrl('reset');
    const { error } = await supabase.auth.resetPasswordForEmail(normEmail(email), { redirectTo });
    if (error) return { error: errorText(error) };
    return { ok: true };
  }, []);

  // After a reset link: the new password
  const setNewPassword = useCallback(async (next) => {
    if (next.length < 6) return { error: t('auth.errors.newPasswordLength') };
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) return { error: errorText(error) };
    setRecovering(false);
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    if (supabase) await supabase.auth.signOut().catch(() => {});
    setUser(null);
  }, []);

  // Signed out by the app itself (the account is gone): only this device's session, and say why
  const endSession = useCallback(async (reason) => {
    if (supabase) await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    setEndedBecause(reason);
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    async ({ name }) => {
      if (name.trim().length < 2) return { error: t('auth.errors.nameLength') };
      const { error } = await supabase.auth.updateUser({ data: { name: name.trim() } });
      if (error) return { error: errorText(error) };
      setUser((cur) => ({ ...cur, name: name.trim() }));
      return { ok: true };
    },
    []
  );

  const changePassword = useCallback(
    async ({ current, next }) => {
      if (next.length < 6) return { error: t('auth.errors.newPasswordLength') };
      // the current password is checked by signing in with it again
      const check = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (check.error) return { error: check.error.code === 'invalid_credentials' || /invalid login/i.test(check.error.message) ? t('auth.errors.currentIncorrect') : errorText(check.error) };
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) return { error: errorText(error) };
      return { ok: true };
    },
    [user]
  );

  const updateSettings = useCallback(
    (patch) => {
      setSettings((cur) => {
        const next = { ...cur, ...patch };
        if (user) AsyncStorage.setItem(settingsKey(user.id), JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [user]
  );

  // Settings from another device (cloud sync): the account's ones replace these; this device's own stay
  const replaceSettings = useCallback(
    (remote) => {
      setSettings((cur) => {
        const next = { ...DEFAULT_SETTINGS, ...remote, ...Object.fromEntries(DEVICE_SETTINGS.map((k) => [k, cur[k]])) };
        if (user) AsyncStorage.setItem(settingsKey(user.id), JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [user]
  );

  const deleteAccount = useCallback(async () => {
    // the photos first (Storage files can't be removed from the database side)
    await removeAllPhotos(user.id).catch(() => {});
    await removeAllClassroomFiles(user.id).catch(() => {});
    const { error } = await supabase.rpc('delete_my_account');
    if (error) return { error: errorText(error) };
    await AsyncStorage.multiRemove([settingsKey(user.id), `studyplanner:v1:${user.id}`, `studyplanner:sync:${user.id}`]).catch(() => {});
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    setUser(null);
    return { ok: true };
  }, [user]);

  const value = useMemo(
    () => ({ ready, user, settings, recovering, endedBecause, cloudConfigured, signup, login, logout, endSession, resetPassword, setNewPassword, updateProfile, changePassword, updateSettings, replaceSettings, deleteAccount }),
    [ready, user, settings, recovering, endedBecause, signup, login, logout, endSession, resetPassword, setNewPassword, updateProfile, changePassword, updateSettings, replaceSettings, deleteAccount]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
