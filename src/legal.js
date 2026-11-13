// The terms of use and privacy policy: their version (the date they last changed, kept on each new account with its
// consent) and where they're published. The links come from app.json → expo.extra.legal ({ privacyUrl, termsUrl });
// until they're set the sign-up screen shows the privacy page in the app and the terms as plain text.
// The documents: docs/privacy-policy.md and docs/terms-of-use.md. Change LEGAL_VERSION when either changes.
import { Linking } from 'react-native';
import Constants from 'expo-constants';

export const LEGAL_VERSION = '2026-11-10';

const legal = (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.legal) || {};
export const privacyUrl = legal.privacyUrl || '';
export const termsUrl = legal.termsUrl || '';

export const openUrl = (url) => (url ? Linking.openURL(url).catch(() => {}) : null);
