// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions run on Deno (npm: imports), not in the app
    ignores: ['dist/*', 'supabase/functions/*'],
  },
  {
    rules: {
      // gone from React Native 0.88 (it still works on the web, so the mistake only shows on phones)
      'no-restricted-properties': ['error', { object: 'StyleSheet', property: 'absoluteFillObject', message: 'Use StyleSheet.absoluteFill: absoluteFillObject was removed from React Native.' }],
    },
  },
]);
