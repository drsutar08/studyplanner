// Buying Premium in the phone apps, through RevenueCat (react-native-purchases): Google Play Billing on Android,
// in-app purchase on iPhone. The store account is linked to the Study Planner account id, and RevenueCat tells the
// server (the revenuecat-webhook Edge Function), which writes `subscriptions`: the server stays the one that decides
// who is Premium (see plans.js and the 20261112 migration).
// The public SDK keys come from app.json → expo.extra.revenuecat (the Development app uses its own, e.g. RevenueCat's
// Test Store). Without a key, or in Expo Go, buying isn't offered and the Premium page says it's coming soon.
import { Platform } from 'react-native';
import Constants from 'expo-constants';

let Purchases = null;
try {
  Purchases = require('react-native-purchases').default;
} catch {
  Purchases = null;
}

const extra = (Constants.expoConfig && Constants.expoConfig.extra) || {};
const keys = extra.revenuecat || {};
const dev = extra.variant === 'development';
const apiKey = Platform.OS === 'ios' ? (dev ? keys.devIosKey : keys.iosKey) : dev ? keys.devAndroidKey : keys.androidKey;
export const ENTITLEMENT = 'premium';

export const purchasesReady = () => !!Purchases && !!apiKey;

let configured = false;
let currentUser = null;
// after sign-in: link purchases to this account (and keep them apart from other accounts on the same phone)
export async function startPurchases(userId) {
  if (!purchasesReady() || !userId || userId === currentUser) return;
  try {
    if (!configured) {
      Purchases.configure({ apiKey, appUserID: userId });
      configured = true;
    } else await Purchases.logIn(userId);
    currentUser = userId;
  } catch {
    // the store is unreachable: buying shows an error when tried
  }
}
export async function endPurchases() {
  if (!configured || !currentUser) return;
  currentUser = null;
  try {
    await Purchases.logOut();
  } catch {
    // already anonymous
  }
}

// The plans the store offers: [{ period: 'month' | 'year', price: '$2.99', pkg }] (prices in the local currency)
export async function loadPlans() {
  if (!configured) return [];
  const offerings = await Purchases.getOfferings();
  const current = offerings && offerings.current;
  if (!current) return [];
  const pick = (type, period) => {
    const pkg = current.availablePackages.find((p) => p.packageType === type);
    return pkg ? { period, price: pkg.product.priceString, pkg } : null;
  };
  return [pick('MONTHLY', 'month'), pick('ANNUAL', 'year')].filter(Boolean);
}

// { ok: true, premium } | { cancelled: true } | { error: message }
export async function buy(plan) {
  try {
    const { customerInfo } = await Purchases.purchasePackage(plan.pkg);
    return { ok: true, premium: !!customerInfo.entitlements.active[ENTITLEMENT] };
  } catch (e) {
    if (e && (e.userCancelled || e.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR)) return { cancelled: true };
    return { error: String((e && e.message) || e) };
  }
}

// { ok: true, premium } | { error }
export async function restore() {
  try {
    const info = await Purchases.restorePurchases();
    return { ok: true, premium: !!info.entitlements.active[ENTITLEMENT] };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

export async function manage() {
  try {
    await Purchases.showManageSubscriptions();
  } catch {
    // the store's own subscription page couldn't open
  }
}
