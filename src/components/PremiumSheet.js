import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles, readable } from '../theme';
import { t } from '../i18n';
import { formatDate } from '../dates';
import { usePlan, refreshPlan, planNow } from '../cloud/plan';
import { useToast } from '../toast';
import { purchasesReady, loadPlans, buy, restore, manage } from '../purchases';
import { COMPARISON, PRICES, PREMIUM, limited } from '../plans';

// Study Planner Premium: the account's plan, Free and Premium side by side, and the prices. Opened from Settings
// or from a "limit reached" message with openPremium(why). <PremiumHost /> is rendered once, in App.js.
// Buying is through the stores (purchases.native.js, RevenueCat); where that isn't set up the page says it's coming.
let state = { open: false, why: null };
const listeners = new Set();
const setState = (s) => {
  state = s;
  listeners.forEach((f) => f());
};
const subscribe = (f) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
// why: what led here ('ai' | 'cards' | 'photos' | 'groups' | 'report'), shown at the top; null from Settings
export const openPremium = (why = null) => setState({ open: true, why });

// gold: #94600F behind white text (5.3:1); as text it goes through readable(), so it holds up on the dark theme too
const GOLD = '#94600F';
const HIGHLIGHTS = [['sparkles', 'ai'], ['eye-off-outline', 'ads'], ['albums-outline', 'room']];
const value = (v) => (typeof v === 'string' ? t(`premium.values.${v}`) : v.per ? t(`premium.values.per${v.per === 'week' ? 'Week' : 'Day'}`, { count: v.n }) : t('premium.values.upTo', { count: v.n }));

export function PremiumHost() {
  const { open, why } = useSyncExternalStore(subscribe, () => state, () => state);
  const plan = usePlan();
  if (!open) return null;
  const close = () => setState({ open: false, why: null });
  const premium = plan.plan === 'premium';
  const prices = PRICES;
  const status = premium
    ? plan.expiresAt
      ? t(plan.source === 'gift' ? 'premium.giftUntil' : 'premium.premiumUntil', { date: formatDate(new Date(plan.expiresAt), { day: 'numeric', month: 'long', year: 'numeric' }) })
      : t('premium.premiumOn')
    : limited(plan)
      ? t('premium.freeNow')
      : t('premium.allFreeForNow');

  return (
    <Modal visible animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1, alignSelf: 'stretch' }} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={styles.headIcon}>
              <Ionicons name="diamond" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading} accessibilityRole="header">
                {t('premium.title')}
              </Text>
              <Text style={styles.headSub}>{t('premium.sub')}</Text>
            </View>
            <Pressable onPress={close} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 540 }}>
            {why ? (
              <View style={styles.why}>
                <Ionicons name="lock-closed" size={16} color={readable(GOLD)} />
                <Text style={styles.whyText}>{t(`premium.why.${why}`)}</Text>
              </View>
            ) : null}
            <View style={[styles.status, premium && styles.statusOn]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusLabel}>{t('premium.yourPlan')}</Text>
                <Text style={styles.statusText}>{status}</Text>
              </View>
              <View style={[styles.badge, premium && styles.badgeOn]}>
                <Text style={[styles.badgeText, premium && { color: '#fff' }]}>{premium ? t('premium.premium') : t('premium.free')}</Text>
              </View>
            </View>

            {!premium ? (
              <View style={styles.highlights}>
                {HIGHLIGHTS.map(([icon, key]) => (
                  <View key={key} style={styles.highlight}>
                    <View style={styles.highlightIcon}>
                      <Ionicons name={icon} size={18} color={readable(GOLD)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.highlightTitle}>{t(`premium.highlights.${key}.title`)}</Text>
                      <Text style={styles.highlightText}>{t(`premium.highlights.${key}.text`, { count: PREMIUM.ai })}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <BuyBox premium={premium} plan={plan} fallbackPrices={prices} />

            <Text style={styles.compare} accessibilityRole="header">{t('premium.compare')}</Text>

            <View style={styles.table}>
              <View style={[styles.tr, styles.th]}>
                <Text style={[styles.cell, styles.feature, styles.thText]}>{t('premium.feature')}</Text>
                <Text style={[styles.cell, styles.thText]}>{t('premium.free')}</Text>
                <Text style={[styles.cell, styles.thText, styles.paidCol, { color: readable(GOLD) }]}>{t('premium.premium')}</Text>
              </View>
              {COMPARISON.map(([key, free, paid]) => (
                <View key={key} style={styles.tr}>
                  <Text style={[styles.cell, styles.feature]}>{t(`premium.features.${key}`)}</Text>
                  <Cell v={free} />
                  <Cell v={paid} paid />
                </View>
              ))}
            </View>

            <Text style={styles.fine}>{t('premium.fine')}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// one cell of the comparison: a tick for "included", a dash for "none", else the words
function Cell({ v, paid }) {
  const mark = v === 'all' ? 'checkmark-circle' : v === 'none' ? 'remove' : null;
  return (
    <View style={[styles.cell, styles.cellBox, paid && styles.paidCol]}>
      {mark ? (
        <Ionicons name={mark} size={mark === 'remove' ? 18 : 20} color={v === 'all' ? (paid ? readable(GOLD) : colors.success) : colors.muted} accessibilityLabel={value(v)} />
      ) : (
        <Text style={[styles.cellText, paid && styles.paid]}>{value(v)}</Text>
      )}
    </View>
  );
}

// Buying: the store's plans and prices (local currency), a purchase, restoring, and managing a subscription.
// After a purchase the server learns of it from RevenueCat (a few seconds): the plan is read again until it shows.
function BuyBox({ premium, plan, fallbackPrices }) {
  const { show } = useToast();
  const [plans, setPlans] = useState(null); // null while loading; [] when the store offers none
  const [pick, setPick] = useState('year');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const canBuy = purchasesReady();
  useEffect(() => {
    if (!canBuy || premium) return undefined;
    let alive = true;
    loadPlans()
      .then((p) => alive && setPlans(p))
      .catch(() => alive && setPlans([]));
    return () => {
      alive = false;
    };
  }, [canBuy, premium]);

  // the server's plan, read again until it says Premium (RevenueCat's message can take a few seconds)
  const waitForPremium = async () => {
    for (let i = 0; i < 10; i++) {
      await refreshPlan();
      if (planNow().plan === 'premium') return true;
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  };
  const finish = async (result, doneKey) => {
    if (result.cancelled) return;
    if (result.error) {
      setNote(t('premium.buyFailed'));
      return;
    }
    if (!result.premium) {
      setNote(t('premium.nothingToRestore'));
      return;
    }
    setNote(t('premium.activating'));
    const on = await waitForPremium();
    setNote(on ? '' : t('premium.activatingSlow'));
    if (on) show({ tone: 'success', message: t(doneKey) });
  };
  const run = async (fn, doneKey) => {
    if (busy) return;
    setBusy(true);
    setNote('');
    try {
      await finish(await fn(), doneKey);
    } finally {
      setBusy(false);
    }
  };

  // already Premium through a store: the store's own page to change or cancel it
  if (premium) {
    if (!canBuy || (plan.source !== 'play' && plan.source !== 'app_store')) return null;
    return (
      <Pressable onPress={manage} style={styles.manage} accessibilityRole="button">
        <Ionicons name="settings-outline" size={16} color={colors.accent} />
        <Text style={styles.manageText}>{t('premium.manage')}</Text>
      </Pressable>
    );
  }

  const choices = canBuy && plans && plans.length ? plans : null;
  const priceOf = (period) => (choices ? (choices.find((c) => c.period === period) || {}).price : fallbackPrices[period]);
  const chosen = choices ? choices.find((c) => c.period === pick) || choices[0] : null;
  return (
    <>
      <View style={styles.prices} accessibilityRole="radiogroup">
        {['month', 'year'].map((period) =>
          priceOf(period) ? (
            <Pressable
              key={period}
              onPress={() => setPick(period)}
              disabled={!choices}
              style={[styles.price, pick === period && choices && styles.priceBest]}
              accessibilityRole="radio"
              aria-checked={pick === period}
              accessibilityState={{ checked: pick === period, disabled: !choices }}
            >
              <Text style={styles.priceAmount}>{priceOf(period)}</Text>
              <Text style={styles.priceLabel}>{t(period === 'month' ? 'premium.perMonth' : 'premium.perYear')}</Text>
              {period === 'year' ? <Text style={styles.save}>{t('premium.saveYear')}</Text> : null}
            </Pressable>
          ) : null
        )}
      </View>
      {chosen ? (
        <Pressable onPress={() => run(() => buy(chosen), 'premium.welcome')} disabled={busy} style={[styles.buy, busy && styles.buyOff]} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buyText}>{t(chosen.period === 'month' ? 'premium.getMonth' : 'premium.getYear', { price: chosen.price })}</Text>}
        </Pressable>
      ) : (
        <View style={[styles.buy, styles.buyOff]} accessibilityRole="button" aria-disabled accessibilityState={{ disabled: true }}>
          {canBuy && plans === null ? <ActivityIndicator color="#fff" /> : <Text style={styles.buyText}>{t('premium.get')}</Text>}
        </View>
      )}
      {note ? (
        <Text style={styles.note} accessibilityLiveRegion="polite">
          {note}
        </Text>
      ) : null}
      {choices ? (
        <Pressable onPress={() => run(restore, 'premium.restored')} disabled={busy} style={styles.restore} accessibilityRole="button">
          <Text style={styles.restoreText}>{t('premium.restore')}</Text>
        </Pressable>
      ) : (
        <Text style={styles.soon}>{canBuy && plans === null ? t('premium.loadingPlans') : t('premium.soon')}</Text>
      )}
    </>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 600, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 10, paddingBottom: 28 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  headIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  why: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: GOLD + '1F', marginBottom: 12 },
  whyText: { flex: 1, fontSize: 13, color: colors.ink, lineHeight: 18 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.line, marginBottom: 14 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.bg },
  badgeOn: { backgroundColor: GOLD },
  badgeText: { fontSize: 12, fontWeight: '800', color: colors.ink },
  highlights: { gap: 10, marginBottom: 6 },
  highlight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  highlightIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: GOLD + '1F', alignItems: 'center', justifyContent: 'center' },
  highlightTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  highlightText: { fontSize: 12.5, color: colors.muted, lineHeight: 17, marginTop: 1 },
  compare: { fontSize: 15, fontWeight: '800', color: colors.ink, marginTop: 22, marginBottom: 8 },
  cellBox: { justifyContent: 'center' },
  cellText: { fontSize: 13, color: colors.ink, lineHeight: 17 },
  paidCol: { backgroundColor: GOLD + '12' },
  statusOn: { borderColor: GOLD },
  statusLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.muted, textTransform: 'uppercase' },
  statusText: { fontSize: 13, color: colors.ink, marginTop: 2, lineHeight: 18 },
  table: { borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  tr: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line },
  th: { borderTopWidth: 0, backgroundColor: colors.bg },
  cell: { flex: 1, fontSize: 13, color: colors.ink, paddingVertical: 9, paddingHorizontal: 10, lineHeight: 17 },
  feature: { flex: 1.5, fontWeight: '600' },
  thText: { fontWeight: '800', fontSize: 12 },
  paid: { fontWeight: '700' },
  prices: { flexDirection: 'row', gap: 10, marginTop: 16 },
  price: { flex: 1, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  priceBest: { borderColor: GOLD, borderWidth: 2 },
  priceAmount: { fontSize: 22, fontWeight: '800', color: colors.ink },
  priceLabel: { fontSize: 12, color: colors.muted },
  save: { fontSize: 11, fontWeight: '800', color: readable(GOLD), marginTop: 4 },
  buy: { marginTop: 14, paddingVertical: 14, borderRadius: 14, backgroundColor: GOLD, alignItems: 'center' },
  buyOff: { opacity: 0.55 },
  buyText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  soon: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 8, lineHeight: 17 },
  fine: { fontSize: 11, color: colors.muted, marginTop: 14, lineHeight: 16 },
  note: { fontSize: 13, color: colors.ink, textAlign: 'center', marginTop: 10, lineHeight: 18 },
  restore: { alignSelf: 'center', marginTop: 10, paddingVertical: 6, paddingHorizontal: 10 },
  restoreText: { fontSize: 13, fontWeight: '700', color: colors.accent },
  manage: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', marginTop: 16, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  manageText: { fontSize: 14, fontWeight: '700', color: colors.accent },
}));
