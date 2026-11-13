import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, themedStyles, readable } from '../theme';
import { t } from '../i18n';

// Floating pill-shaped bar with a raised "add task" button in the middle.
// Labels are translation keys, looked up at render time.
const TABS = {
  Today: { labelKey: 'tabBar.today', icon: ['home', 'home-outline'] },
  Focus: { labelKey: 'tabBar.focus', icon: ['timer', 'timer-outline'] },
  Calendar: { labelKey: 'tabBar.calendar', icon: ['calendar', 'calendar-outline'] },
  Progress: { labelKey: 'tabBar.progress', icon: ['stats-chart', 'stats-chart-outline'] },
};
const LEFT = ['Today', 'Calendar'];
const RIGHT = ['Focus', 'Progress'];
const FAB = 58;
const LIFT = 22; // how far the button rises above the bar

// A screen can hide the bar while it wants your full attention (the Focus timer's focus mode)
export default function TabBar({ state, navigation, descriptors, onAdd }) {
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index].name;
  const active = descriptors && descriptors[state.routes[state.index].key];
  if (active && active.options && active.options.focusMode) return null;

  const renderTab = (name) => {
    const tab = TABS[name];
    const focused = activeName === name;
    const tint = focused ? colors.accent : colors.muted;
    const label = t(tab.labelKey);
    return (
      <Pressable
        key={name}
        style={styles.tab}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        aria-selected={focused}
        accessibilityLabel={t('tabBar.tabA11y', { label })}
        onPress={() => {
          if (!focused) navigation.navigate(name);
        }}
      >
        <Ionicons name={tab.icon[focused ? 0 : 1]} size={22} color={tint} />
        <Text maxFontSizeMultiplier={1.2} style={[styles.label, { color: readable(tint) }, focused && { fontWeight: '700' }]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.outer} pointerEvents="box-none">
      {/* page-coloured backdrop that starts below the area the button rises into */}
      <View style={[styles.backdrop, { top: LIFT }]} />

      <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
        <View style={styles.bar} accessibilityRole="tablist">
          {LEFT.map(renderTab)}
          <View style={styles.slot} />
          {RIGHT.map(renderTab)}
        </View>

        <Pressable onPress={onAdd} style={styles.fabHit} accessibilityLabel={t('tabBar.addTask')}>
          <View style={styles.fab}>
            <Ionicons name="add" size={30} color={colors.onAccent} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  // Transparent top strip overlaps the screen so the raised button has room without a blank band.
  outer: { paddingTop: LIFT, marginTop: -LIFT },
  backdrop: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.bg },
  wrap: { paddingHorizontal: 16, paddingTop: 4 },
  bar: {
    height: 66,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 26,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, height: '100%' },
  label: { fontSize: 11, fontWeight: '500' },
  slot: { width: FAB + 20 },
  fabHit: {
    position: 'absolute',
    alignSelf: 'center',
    top: 8 - LIFT,
    width: FAB + 10,
    height: FAB + 10,
    borderRadius: (FAB + 10) / 2,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    backgroundColor: colors.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
}));
