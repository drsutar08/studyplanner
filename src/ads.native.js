// Google AdMob in the phone apps (react-native-google-mobile-ads). Who sees ads is the server's decision (my_plan's
// `ads`: every account that is not Premium; see the 20261114 migration), so nothing
// here shows an ad on its own. Ads are never personalised; under-18s and unknown ages get G-rated ads only.
// The ad units come from app.json → expo.extra.ads, in store builds only; elsewhere, or while a unit is empty,
// Google's test ads show (they earn nothing).
// Only in development and store builds: Expo Go has no ads module, so everything here does nothing there.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { colors, themedStyles } from './theme';
import { t } from './i18n';
import { supabase } from './cloud/supabase';
import { usePlan, refreshPlan } from './cloud/plan';

let Ads = null;
try {
  Ads = require('react-native-google-mobile-ads');
} catch {
  Ads = null; // Expo Go
}

const NPA = { requestNonPersonalizedAdsOnly: true };
const units = (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.ads) || {};
// Real ad units only in store builds (the 'production' channel): seeing or tapping your own real ads while testing
// can get the AdMob account suspended, so test builds always get Google's test ads.
const storeBuild = Updates.channel === 'production';
// kind: 'banner' | 'rewarded' | 'interstitial' | 'native' (app.json keys androidBanner, iosRewarded, androidNative...)
const TEST = { banner: 'ADAPTIVE_BANNER', rewarded: 'REWARDED', interstitial: 'INTERSTITIAL', native: 'NATIVE' };
const unit = (kind) => {
  const id = storeBuild ? units[`${Platform.OS}${kind[0].toUpperCase()}${kind.slice(1)}`] : '';
  return id || Ads.TestIds[TEST[kind]];
};

// Consent (Google's form where the law asks for one) and the settings, once, before the first ad
// age: the account's age group (my_plan). Adults: non-personalised ads rated up to PG. Under-18s and accounts with no
// age recorded: tagged "under the age of consent", so Google serves only non-personalised ads, rated G.
const settingsFor = (age) =>
  age === 'adult'
    ? { maxAdContentRating: Ads.MaxAdContentRating.PG, tagForChildDirectedTreatment: false, tagForUnderAgeOfConsent: false }
    : { maxAdContentRating: Ads.MaxAdContentRating.G, tagForChildDirectedTreatment: false, tagForUnderAgeOfConsent: true };
let started = null;
let configuredFor = null;
export function prepareAds(age = 'unknown') {
  if (!Ads) return Promise.resolve(false);
  started =
    started ||
    (async () => {
      try {
        const info = await Ads.AdsConsent.gatherConsent({ tagForUnderAgeOfConsent: age !== 'adult' });
        if (info && info.canRequestAds === false) return false;
      } catch {
        // no consent form needed or available here: non-personalised ads only either way
      }
      await Ads.default().setRequestConfiguration(settingsFor(age));
      configuredFor = age;
      await Ads.default().initialize();
      return true;
    })().catch(() => false);
  return started.then(async (ok) => {
    // another account signed in on this phone: its age group's settings
    if (ok && configuredFor !== age) {
      await Ads.default().setRequestConfiguration(settingsFor(age));
      configuredFor = age;
    }
    return ok;
  });
}

// A banner with a small "Ad" label, for an account that is shown ads; nothing otherwise (or if no ad comes)
export function AdBanner({ style }) {
  const plan = usePlan();
  const [ok, setOk] = useState(false);
  const [failed, setFailed] = useState(false);
  const want = !!Ads && plan.ads;
  useEffect(() => {
    if (want) prepareAds(plan.age).then(setOk);
  }, [want, plan.age]);
  if (!want || !ok || failed) return null;
  return (
    <View style={[styles.wrap, style]} accessibilityLabel={t('ads.label')}>
      <Text style={styles.label}>{t('ads.label')}</Text>
      <Ads.BannerAd unitId={unit('banner')} size={Ads.BannerAdSize.ANCHORED_ADAPTIVE_BANNER} requestOptions={NPA} onAdFailedToLoad={() => setFailed(true)} />
    </View>
  );
}

// A native ad styled as a card, with an "Ad" label, for an account that is shown ads; nothing otherwise (or if no ad comes)
export function AdCard({ style }) {
  const plan = usePlan();
  const [ok, setOk] = useState(false);
  const want = !!Ads && plan.ads;
  useEffect(() => {
    if (want) prepareAds(plan.age).then(setOk);
  }, [want, plan.age]);
  const { status, nativeAd } = Ads.useNativeAd({ adUnitId: want ? unit('native') : null, requestOptions: NPA, autoLoad: want && ok });
  if (!want || status !== 'loaded' || !nativeAd) return null;
  const T = Ads.NativeAssetType;
  return (
    <Ads.NativeAdView nativeAd={nativeAd} style={[styles.card, style]} accessibilityLabel={t('ads.label')}>
      <View style={styles.cardHead}>
        <Text style={styles.adBadge}>{t('ads.label')}</Text>
        {nativeAd.advertiser ? (
          <Text style={styles.advertiser} numberOfLines={1}>
            {nativeAd.advertiser}
          </Text>
        ) : null}
      </View>
      <View style={styles.cardRow}>
        {nativeAd.icon ? (
          <Ads.NativeAsset assetType={T.ICON}>
            <Image source={{ uri: nativeAd.icon.url }} style={styles.icon} />
          </Ads.NativeAsset>
        ) : null}
        <View style={{ flex: 1 }}>
          <Ads.NativeAsset assetType={T.HEADLINE}>
            <Text style={styles.headline} numberOfLines={2}>
              {nativeAd.headline}
            </Text>
          </Ads.NativeAsset>
          {nativeAd.body ? (
            <Ads.NativeAsset assetType={T.BODY}>
              <Text style={styles.body} numberOfLines={2}>
                {nativeAd.body}
              </Text>
            </Ads.NativeAsset>
          ) : null}
        </View>
      </View>
      {nativeAd.mediaContent ? <Ads.NativeMediaView style={styles.media} resizeMode="cover" /> : null}
      {nativeAd.callToAction ? (
        <Ads.NativeAsset assetType={T.CALL_TO_ACTION}>
          <Text style={styles.cta}>{nativeAd.callToAction}</Text>
        </Ads.NativeAsset>
      ) : null}
    </Ads.NativeAdView>
  );
}

// A rewarded ad for one more AI request (at most 3 a day): { available, watch }. onReward(left) once it's added.
function useRealAdReward(onReward) {
  const plan = usePlan();
  const [ok, setOk] = useState(false);
  const want = plan.ads && plan.adRewardsLeft > 0;
  useEffect(() => {
    if (want) prepareAds(plan.age).then(setOk);
  }, [want, plan.age]);
  const ad = Ads.useRewardedAd({ adUnitId: unit('rewarded'), requestOptions: NPA, autoLoad: want && ok });
  const granted = useRef(false);
  const latest = useRef(onReward);
  useEffect(() => {
    latest.current = onReward;
  });
  useEffect(() => {
    if (!ad.earnedReward || granted.current) return;
    granted.current = true;
    supabase
      .rpc('ad_reward')
      .then(({ data }) => {
        refreshPlan();
        if (typeof data === 'number' && data >= 0 && latest.current) latest.current(data);
      })
      .catch(() => {});
  }, [ad.earnedReward]);
  // ready for the next one once this one is closed
  useEffect(() => {
    if (ad.status !== 'closed') return;
    granted.current = false;
    if (want && ok) ad.load();
  }, [ad.status]); // eslint-disable-line react-hooks/exhaustive-deps
  return { available: want && ad.status === 'loaded', left: plan.adRewardsLeft, watch: () => ad.show() };
}
const useNoAdReward = () => ({ available: false, left: 0, watch: () => {} });
export const useAdReward = Ads ? useRealAdReward : useNoAdReward;

// A full-screen ad at a natural break (a break starting after a focus session, a finished review closing), never in
// the middle of one, and at most once every 10 minutes: atBreak() shows one if it's loaded and allowed.
const BREAK_GAP_MS = 10 * 60 * 1000;
let lastBreakAd = 0;
function useRealBreakAd() {
  const plan = usePlan();
  const [ok, setOk] = useState(false);
  const want = plan.ads;
  useEffect(() => {
    if (want) prepareAds(plan.age).then(setOk);
  }, [want, plan.age]);
  const ad = Ads.useInterstitialAd({ adUnitId: unit('interstitial'), requestOptions: NPA, autoLoad: want && ok });
  useEffect(() => {
    if (ad.status === 'closed' && want && ok) ad.load();
  }, [ad.status]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    atBreak: () => {
      if (!want || ad.status !== 'loaded' || Date.now() - lastBreakAd < BREAK_GAP_MS) return false;
      lastBreakAd = Date.now();
      ad.show();
      return true;
    },
  };
}
const useNoBreakAd = () => ({ atBreak: () => false });
export const useBreakAd = Ads ? useRealBreakAd : useNoBreakAd;

const styles = themedStyles(() => ({
  wrap: { alignItems: 'center', marginTop: 14, gap: 4 },
  card: { marginTop: 14, padding: 14, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  adBadge: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: colors.muted, textTransform: 'uppercase' },
  advertiser: { flex: 1, fontSize: 12, color: colors.muted },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 10 },
  headline: { fontSize: 15, fontWeight: '700', color: colors.ink },
  body: { fontSize: 13, color: colors.muted, marginTop: 2 },
  media: { width: '100%', borderRadius: 12, overflow: 'hidden' },
  cta: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.accentFill, color: '#fff', fontWeight: '700', fontSize: 13 },
  label: { alignSelf: 'flex-start', fontSize: 10, fontWeight: '800', letterSpacing: 1, color: colors.muted, textTransform: 'uppercase' },
}));
