// Where Supabase keeps the sign-in session on a phone: expo-sqlite's localStorage (as Expo's Supabase guide uses)
import 'expo-sqlite/localStorage/install';

export default globalThis.localStorage;
