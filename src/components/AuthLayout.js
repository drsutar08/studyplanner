import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, shadow, themedStyles } from '../theme';
import { t } from '../i18n';
import { HeroIllustration, StarsDecor } from './Illustrations';

// Translation keys, looked up at render time
const FEATURES = [
  { icon: 'calendar', title: 'auth.featurePlanTitle', sub: 'auth.featurePlanSub' },
  { icon: 'timer', title: 'auth.featureFocusTitle', sub: 'auth.featureFocusSub' },
  { icon: 'stats-chart', title: 'auth.featureProgressTitle', sub: 'auth.featureProgressSub' },
];

function Brand({ left = false }) {
  return (
    <View style={[styles.brand, left && { justifyContent: 'flex-start' }]}>
      <View style={styles.logo}>
        <Ionicons name="school" size={22} color="#fff" />
      </View>
      <Text style={styles.brandName}>Studyly</Text>
    </View>
  );
}

function Toggle({ mode, onSwitch }) {
  return (
    <View style={styles.toggle}>
      {[
        ['login', t('auth.signIn')],
        ['signup', t('auth.createAccount')],
      ].map(([m, label]) => (
        <Pressable key={m} onPress={() => mode !== m && onSwitch()} style={[styles.toggleItem, mode === m && styles.toggleOn]}>
          <Text style={[styles.toggleText, mode === m && styles.toggleTextOn]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// Shared frame for the login and signup screens.
export default function AuthLayout({ mode, onSwitch, title, subtitle, children, shakeKey }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const appear = useState(() => new Animated.Value(0))[0];
  const shake = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    appear.setValue(0);
    Animated.timing(appear, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!shakeKey) return;
    Animated.sequence([
      Animated.timing(shake, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 5, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [shakeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const card = (
    <Animated.View
      style={[
        styles.card,
        wide && styles.cardWide,
        {
          opacity: appear,
          transform: [
            { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
            { translateX: shake },
          ],
        },
      ]}
    >
      <Toggle mode={mode} onSwitch={onSwitch} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={{ marginTop: 20 }}>{children}</View>
    </Animated.View>
  );

  if (wide) {
    return (
      <View style={styles.split}>
        <LinearGradient
          colors={['#151B33', '#2A3A9E', '#7A5CFA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.panel}
        >
          <StarsDecor width={560} height={900} />
          <Brand left />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={styles.headline}>{t('auth.headline')}</Text>
            <Text style={styles.headSub}>{t('auth.headSub')}</Text>
            <View style={{ marginTop: 28, gap: 16 }}>
              {FEATURES.map((f) => (
                <View key={f.icon} style={styles.feature}>
                  <View style={styles.featureIcon}>
                    <Ionicons name={f.icon} size={18} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>{t(f.title)}</Text>
                    <Text style={styles.featureSub}>{t(f.sub)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <HeroIllustration width={230} height={172} />
          </View>
        </LinearGradient>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.formSide} keyboardShouldPersistTaps="handled">
          {card}
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#151B33', '#2A3A9E', '#7A5CFA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 20 }]}
        >
          <StarsDecor width={300} height={300} />
          <Brand />
          <Text style={styles.heroLine}>{t('auth.heroLine')}</Text>
          <View style={{ alignItems: 'center', marginTop: 2 }}>
            <HeroIllustration width={170} height={127} />
          </View>
        </LinearGradient>
        {card}
        <Text style={styles.foot}>{t('auth.localOnly')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => ({
  scroll: { flexGrow: 1, alignItems: 'center', paddingBottom: 32 },
  hero: { alignSelf: 'stretch', paddingBottom: 54, paddingHorizontal: 24, overflow: 'hidden', borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  heroLine: { color: '#C9D0FF', textAlign: 'center', marginTop: 6, fontSize: 14, fontWeight: '600', letterSpacing: 0.6 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' },
  logo: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  brandName: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  card: {
    width: '92%',
    maxWidth: 440,
    marginTop: -34,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 22,
    ...shadow,
  },
  cardWide: { marginTop: 0, width: '100%', shadowOpacity: 0.08 },
  toggle: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 14, padding: 4, marginBottom: 22 },
  toggleItem: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  toggleOn: { backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  toggleText: { fontSize: 14, fontWeight: '700', color: colors.muted },
  toggleTextOn: { color: colors.accent },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 4 },
  foot: { marginTop: 18, color: colors.muted, fontSize: 12 },
  split: { flex: 1, flexDirection: 'row', backgroundColor: colors.bg },
  panel: { flex: 1.05, padding: 48, overflow: 'hidden' },
  headline: { color: '#fff', fontSize: 44, fontWeight: '800', letterSpacing: -1, lineHeight: 50 },
  headSub: { color: '#C9D0FF', fontSize: 16, marginTop: 14, maxWidth: 420, lineHeight: 23 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featureIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  featureTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  featureSub: { color: '#B5BDF0', fontSize: 13, marginTop: 1 },
  formSide: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
}));
