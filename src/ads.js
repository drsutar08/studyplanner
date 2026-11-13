// The web has no ads (see ads.native.js for the phone apps): the same exports, doing nothing
export const prepareAds = () => Promise.resolve(false);
export const AdBanner = () => null;
export const AdCard = () => null;
export const useAdReward = () => ({ available: false, left: 0, watch: () => {} });
export const useBreakAd = () => ({ atBreak: () => false });
