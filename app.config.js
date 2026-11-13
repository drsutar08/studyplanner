// Two builds of the app, installable side by side (eas.json profiles set APP_VARIANT):
//   production   StudyPlanner      com.studyly.studyplanner.app        studyplanner://       the Production Supabase project
//   development  StudyPlanner Dev  com.studyly.studyplanner.app.dev    studyplanner-dev://   the Development Supabase project
// app.json holds the Production settings; the Development app changes only what has to differ. Each build gets its
// Supabase address and key from the EAS environment of the same name (docs/environments.md).
// The Development APK is also debuggable (plugins/with-debuggable-release.js), for RevenueCat's Test Store.
// Google's published test AdMob app ids: the Development app is not registered in AdMob, so it only ever gets test ads.
const TEST_ADMOB = { androidAppId: 'ca-app-pub-3940256099942544~3347511713', iosAppId: 'ca-app-pub-3940256099942544~1458002511' };

module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'development') return config;
  return {
    ...config,
    name: 'Studyly Dev',
    scheme: 'studyplanner-dev',
    icon: './assets/icon-dev.png',
    ios: { ...config.ios, bundleIdentifier: 'com.studyly.studyplanner.app.dev' },
    android: {
      ...config.android,
      package: 'com.studyly.studyplanner.app.dev',
      adaptiveIcon: { ...config.android.adaptiveIcon, foregroundImage: './assets/android-icon-foreground-dev.png' },
    },
    plugins: [
      ...config.plugins.map((p) => (Array.isArray(p) && p[0] === 'react-native-google-mobile-ads' ? [p[0], { ...p[1], ...TEST_ADMOB }] : p)),
      // RevenueCat's Test Store key only works in a debuggable build
      './plugins/with-debuggable-release',
    ],
    extra: {
      ...config.extra,
      variant: 'development',
      ads: {},
      // the iPhone widget extension and its app group must sit under the app's own id
      eas: JSON.parse(JSON.stringify(config.extra.eas).split('com.studyly.studyplanner.app').join('com.studyly.studyplanner.app.dev')),
    },
  };
};
