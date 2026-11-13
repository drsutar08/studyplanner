// The app's own link scheme: studyplanner:// for the Production app, studyplanner-dev:// for the Development one
// (app.config.js), so the two can be installed side by side without Android asking which one opens a link.
import Constants from 'expo-constants';

export const SCHEME = (Constants.expoConfig && Constants.expoConfig.scheme) || 'studyplanner';
export const appUrl = (path) => `${SCHEME}://${path}`;
