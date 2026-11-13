// Which build this is (app.config.js sets extra.variant for the Development app). Things for testing only, like
// sample data, show in the Development app and on this computer's dev server (__DEV__: also the browser tests and
// the screenshot scripts), never in the Production app or a production web build.
import Constants from 'expo-constants';

const variant = (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.variant) || 'production';
export const isDevelopment = variant === 'development' || (typeof __DEV__ !== 'undefined' && __DEV__);

// "Start with sample data" at sign-up and "Load sample data" in Settings
export const showSampleData = isDevelopment;
