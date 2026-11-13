import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import sessionStorage from './sessionStorage';

// The project's address and publishable key (both public by design). Set them in .env.local:
//   EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
//   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const cloudConfigured = !!(url && key);

// The page address the app was opened with, read before supabase-js tidies it (it looks there for sign-in links),
// so a study-group link (#share=…) still reaches the app
export const launchUrl = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : null;

export const supabase = cloudConfigured
  ? createClient(url, key, {
      auth: {
        storage: sessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        // a phone has no page address to read a session from; on the web a reset-password link does
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : null;

// Refresh the session only while the app is in front (as Expo's guide recommends)
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
