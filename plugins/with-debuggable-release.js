// The Development app only (app.config.js adds this plugin there): its APK is a release build marked debuggable.
// RevenueCat refuses its Test Store key in a non-debuggable build ("Wrong API Key" alert, then it closes the app), and
// the Development app buys through the Test Store. The JavaScript is still bundled in, so no dev server is needed.
// The Production app is unaffected: Play doesn't accept debuggable builds.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// studyplanner: debuggable release';

module.exports = (config) =>
  withAppBuildGradle(config, (c) => {
    if (c.modResults.contents.includes(MARK)) return c;
    const contents = c.modResults.contents.replace(/(buildTypes\s*\{[\s\S]*?\n\s*release\s*\{)/, `$1\n            debuggable true ${MARK}`);
    if (contents === c.modResults.contents) throw new Error('with-debuggable-release: no release build type in app/build.gradle');
    c.modResults.contents = contents;
    return c;
  });
