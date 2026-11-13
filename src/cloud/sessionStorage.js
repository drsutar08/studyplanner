// Where Supabase keeps the sign-in session on the web: the browser's own localStorage (expo-sqlite's
// web build would need SharedArrayBuffer headers and a WebAssembly database for no gain)
export default typeof window !== 'undefined' ? window.localStorage : undefined;
