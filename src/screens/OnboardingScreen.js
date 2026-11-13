import React, { useRef, useState } from 'react';
import { View, Text, Pressable, Animated, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, themedStyles, solid } from '../theme';
import { t } from '../i18n';
import { StarsDecor } from '../components/Illustrations';
import { PlanArt, FocusArt, GrowArt } from '../components/OnboardingArt';

const SLIDES = [
  {
    key: 'plan',
    Art: PlanArt,
    gradient: ['#151B33', '#2A3A9E', '#5B6CF0'],
    accent: '#5B6CF0',
    titleKey: 'onboarding.planTitle',
    bodyKey: 'onboarding.planBody',
  },
  {
    key: 'focus',
    Art: FocusArt,
    gradient: ['#151B33', '#3B2A8E', '#7A5CFA'],
    accent: '#7A5CFA',
    titleKey: 'onboarding.focusTitle',
    bodyKey: 'onboarding.focusBody',
  },
  {
    key: 'grow',
    Art: GrowArt,
    gradient: ['#151B33', '#0F6E78', '#17A398'],
    accent: '#17A398',
    titleKey: 'onboarding.growTitle',
    bodyKey: 'onboarding.growBody',
  },
];

export default function OnboardingScreen({ onDone }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 900;
  const pageW = Math.min(width, wide ? 520 : width);
  const listRef = useRef(null);
  const scrollX = useState(() => new Animated.Value(0))[0];
  const [index, setIndex] = useState(0);
  const artH = Math.max(220, height - insets.top - 56 - 330);
  const last = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  const goTo = (i) => {
    listRef.current && listRef.current.scrollToOffset({ offset: i * pageW, animated: true });
    setIndex(i);
  };

  const next = () => (last ? onDone() : goTo(index + 1));

  return (
    <View style={styles.root}>
      <LinearGradient colors={slide.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <StarsDecor width={300} height={height} />

      <View style={[styles.frame, { width: pageW }]}>
        <View style={[styles.topRow, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.step}>
            {index + 1}/{SLIDES.length}
          </Text>
          {!last ? (
            <Pressable onPress={onDone} hitSlop={10} accessibilityLabel={t('onboarding.skipA11y')}>
              <Text style={styles.skip}>{t('onboarding.skip')}</Text>
            </Pressable>
          ) : (
            <View />
          )}
        </View>

        <Animated.FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={(s) => s.key}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          // on the web the slides can be scrolled with the arrow keys once focused
          focusable={Platform.OS === 'web'}
          style={{ flexGrow: 0 }}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: false,
            listener: (e) => {
              const i = Math.round(e.nativeEvent.contentOffset.x / pageW);
              if (i !== index) setIndex(Math.max(0, Math.min(SLIDES.length - 1, i)));
            },
          })}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / pageW))}
          getItemLayout={(_, i) => ({ length: pageW, offset: pageW * i, index: i })}
          renderItem={({ item }) => (
            <View style={{ width: pageW, height: artH, alignItems: 'center', justifyContent: 'center' }}>
              <item.Art width={Math.min(pageW - 60, 300)} height={Math.min(pageW - 60, 300) * (230 / 280)} />
            </View>
          )}
        />

        <View style={[styles.sheet, wide && styles.sheetWide, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}>
          <Text style={styles.title}>{t(slide.titleKey)}</Text>
          <Text style={styles.body}>{t(slide.bodyKey)}</Text>

          <View style={styles.dots}>
            {SLIDES.map((s, i) => {
              const w = scrollX.interpolate({
                inputRange: [(i - 1) * pageW, i * pageW, (i + 1) * pageW],
                outputRange: [8, 26, 8],
                extrapolate: 'clamp',
              });
              const o = scrollX.interpolate({
                inputRange: [(i - 1) * pageW, i * pageW, (i + 1) * pageW],
                outputRange: [0.3, 1, 0.3],
                extrapolate: 'clamp',
              });
              return (
                <Pressable key={s.key} onPress={() => goTo(i)} hitSlop={6}>
                  <Animated.View style={[styles.dot, { width: w, opacity: o, backgroundColor: slide.accent }]} />
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={next} style={[styles.btn, { backgroundColor: solid(slide.accent) }]} accessibilityLabel={last ? t('onboarding.getStarted') : t('onboarding.next')}>
            <Text style={styles.btnText}>{last ? t('onboarding.getStarted') : t('onboarding.next')}</Text>
            <Ionicons name={last ? 'rocket' : 'arrow-forward'} size={18} color="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  root: { flex: 1, alignItems: 'center', backgroundColor: '#151B33', overflow: 'hidden' },
  frame: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 4 },
  step: { color: '#C9D0FF', fontWeight: '700', fontSize: 14, letterSpacing: 1 },
  skip: { color: '#fff', fontWeight: '700', fontSize: 15, opacity: 0.9 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 28,
    paddingTop: 30,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  sheetWide: { borderRadius: 36, marginBottom: 32, flexGrow: 0 },
  title: { fontSize: 28, fontWeight: '800', color: colors.ink, letterSpacing: -0.6 },
  body: { fontSize: 16, lineHeight: 24, color: colors.muted, marginTop: 10, minHeight: 72 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 18 },
  dot: { height: 8, borderRadius: 4 },
  btn: { marginTop: 4, height: 56, borderRadius: radius.md + 2, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
}));
