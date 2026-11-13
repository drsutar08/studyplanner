// The web has no in-app buying yet (Razorpay or Stripe, later): the same exports as purchases.native.js, doing nothing
export const ENTITLEMENT = 'premium';
export const purchasesReady = () => false;
export const startPurchases = async () => {};
export const endPurchases = async () => {};
export const loadPlans = async () => [];
export const buy = async () => ({ error: 'not available' });
export const restore = async () => ({ error: 'not available' });
export const manage = async () => {};
