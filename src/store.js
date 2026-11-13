import React, { createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dateKey, addDays } from './dates';
import { reducer, initial } from './reducer';
import { subjectPalette } from './theme';
import { useAuth, LEGACY_USERS_KEY } from './auth';
import { sampleData } from './sampleData';
import { t as tr } from './i18n';
import { supabase } from './cloud/supabase';
import { fromRows } from './cloud/sync';
import { useCloudSync, fetchRows, writeSyncMeta, baseOfRows, dataOfRows, cursorOf } from './cloud/useCloudSync';

// a workspace started offline, before this device has ever had the account's data (LoadFailedScreen)
const EMPTY = { subjects: [], tasks: [], sessions: [], exams: [], recurring: [], classes: [], term: null, vacations: [], rotation: null, groups: [], archive: [], cards: [], achievements: [] };

// "Start with sample data" at signup: the next brand-new account gets the sample instead of the usual starter data
let sampleForNewAccount = false;
export const startNextAccountWithSample = (on) => {
  sampleForNewAccount = !!on;
};

const LEGACY_KEY = 'studyplanner:v1';
export const dataKey = (userId) => `studyplanner:v1:${userId}`;

// Signing out (or a deleted account) removes the account's copy from this device: the cloud has it
export const forgetDevice = (userId) =>
  AsyncStorage.multiRemove([dataKey(userId), `studyplanner:settings:${userId}`, `studyplanner:sync:${userId}`]).catch(() => {});

const seed = () => {
  const today = dateKey();
  return {
    subjects: [
      // Sample data for a new account, in the language in use when it is created
      { id: 's1', name: tr('seed.math'), color: subjectPalette[0] },
      { id: 's2', name: tr('seed.biology'), color: subjectPalette[1] },
      { id: 's3', name: tr('seed.history'), color: subjectPalette[3] },
    ],
    tasks: [
      { id: 't1', title: tr('seed.task1'), subjectId: 's1', due: today, estimate: 60, done: false, completedAt: null },
      { id: 't2', title: tr('seed.task2'), subjectId: 's2', due: addDays(today, 1), estimate: 45, done: false, completedAt: null },
    ],
    sessions: [],
  };
};

// Data this device kept before accounts moved to the cloud: the on-device account with the same email (left in
// place: a copy goes to the cloud account), or else the data from before there were accounts at all, which only
// the first account takes (it is removed once taken, as before).
const deviceDataFrom = async (email) => {
  try {
    const users = JSON.parse((await AsyncStorage.getItem(LEGACY_USERS_KEY)) || '[]');
    const mine = users.find((u) => u.email === String(email || '').toLowerCase());
    const own = mine && (await AsyncStorage.getItem(dataKey(mine.id)));
    if (own) return JSON.parse(own);
    const before = await AsyncStorage.getItem(LEGACY_KEY);
    if (!before) return null;
    await AsyncStorage.removeItem(LEGACY_KEY);
    return JSON.parse(before);
  } catch {
    return null;
  }
};

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const { user, ready: authReady, settings, replaceSettings, endSession } = useAuth();
  const userId = user ? user.id : null;
  const [state, dispatch] = useReducer(reducer, initial);
  const [attempt, setAttempt] = useState(0); // "Try again" after the account couldn't be reached

  // Each account has its own data. When the signed-in user changes, load that user's data: what this device
  // has, else (a device new to the account) what the cloud has, else a start for a brand-new account.
  useEffect(() => {
    if (!authReady) return undefined;
    let cancelled = false;
    dispatch({ type: 'UNLOAD' });
    if (!userId) {
      dispatch({ type: 'HYDRATE', data: { subjects: [], tasks: [], sessions: [] }, owner: null });
      return undefined;
    }
    (async () => {
      let data;
      try {
        const raw = await AsyncStorage.getItem(dataKey(userId));
        if (raw) {
          data = JSON.parse(raw);
        } else {
          const rows = supabase ? await fetchRows(null) : [];
          if (rows.some((r) => !r.deleted)) {
            const res = fromRows(rows);
            data = res.data;
            if (res.settings) replaceSettings(res.settings);
            await writeSyncMeta(userId, { base: baseOfRows(rows), data: dataOfRows(rows), cursor: cursorOf(rows) });
          } else {
            data = (await deviceDataFrom(user.email)) || (sampleForNewAccount ? sampleData(new Date()) : seed());
            sampleForNewAccount = false;
          }
        }
      } catch {
        // the account's data couldn't be read (offline on a new device): don't start empty, which would sync
        if (!cancelled) dispatch({ type: 'LOAD_FAILED', owner: userId });
        return;
      }
      if (!cancelled) dispatch({ type: 'HYDRATE', data, owner: userId });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, authReady, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save on every change, but only to the account that owns the loaded data
  useEffect(() => {
    if (!state.ready || !userId || state.owner !== userId) return;
    const { subjects, tasks, sessions, exams, recurring, classes, term, vacations, rotation, groups, archive, cards, achievements } = state;
    AsyncStorage.setItem(dataKey(userId), JSON.stringify({ subjects, tasks, sessions, exams, recurring, classes, term, vacations, rotation, groups, archive, cards, achievements })).catch(() => {});
  }, [state, userId]);

  // ... and keep it in step with the account's other devices
  const sync = useCloudSync({
    userId,
    state,
    dispatch,
    settings,
    replaceSettings,
    enabled: !!supabase && state.ready && !!userId && state.owner === userId,
    onAccountGone: async () => {
      const id = userId;
      await endSession('deleted');
      await forgetDevice(id);
    },
  });

  // Offline on a device new to the account: start with nothing and let the first sync bring the account's data in.
  // `pullFirst` makes that sync read before it sends, so the cloud's settings aren't replaced by this device's.
  const startOffline = async () => {
    if (!userId) return;
    await writeSyncMeta(userId, { base: {}, data: {}, cursor: null, pullFirst: true });
    dispatch({ type: 'HYDRATE', data: EMPTY, owner: userId });
  };

  const value = useMemo(() => ({ state, dispatch, sync, retryLoad: () => setAttempt((n) => n + 1), startOffline }), [state, sync]); // eslint-disable-line react-hooks/exhaustive-deps
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);
