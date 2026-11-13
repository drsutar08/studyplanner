// Accounts from the older version of the app, which lived on this device (no cloud): finding them, checking an
// old password (the same iterated SHA-256 the old version stored), and remembering which were brought in.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { LEGACY_USERS_KEY } from './auth';
import { dataKey } from './store';
import { legacyCounts } from './legacyImport';

const importedKey = (oldId) => `studyplanner:imported:${oldId}`;
const HASH_VERSION = 2;
const HASH_ROUNDS = 5000;
const sha256 = (s) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);

// [{ id, name, email, counts, data }] for the old accounts on this device that have data and weren't brought in
export async function findLegacyAccounts() {
  try {
    const users = JSON.parse((await AsyncStorage.getItem(LEGACY_USERS_KEY)) || '[]');
    const out = [];
    for (const u of users) {
      if (!u || !u.id || (await AsyncStorage.getItem(importedKey(u.id)))) continue;
      const raw = await AsyncStorage.getItem(dataKey(u.id));
      if (!raw) continue;
      const data = JSON.parse(raw);
      out.push({ id: u.id, name: u.name, email: u.email, counts: legacyCounts(data), data, user: u });
    }
    return out;
  } catch {
    return [];
  }
}

// The old account's password, checked as the old version did
export async function checkLegacyPassword(user, password) {
  let h = await sha256(`${user.salt}:${password}`);
  if (user.v === HASH_VERSION) for (let i = 1; i < HASH_ROUNDS; i++) h = await sha256(`${user.salt}:${h}`);
  return h === user.pass;
}

export const markLegacyImported = (oldId) => AsyncStorage.setItem(importedKey(oldId), new Date().toISOString()).catch(() => {});
export const unmarkLegacyImported = (oldId) => AsyncStorage.removeItem(importedKey(oldId)).catch(() => {});
