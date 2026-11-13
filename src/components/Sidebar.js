import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles } from '../theme';
import { t } from '../i18n';
import { ProgressRing } from './Illustrations';
import Avatar from './Avatar';
import { LinearGradient } from 'expo-linear-gradient';

// `label` is looked up each time it is read, so it always follows the current language.
const navItem = (item) => ({
  ...item,
  get label() {
    return t(item.labelKey);
  },
});

export const NAV = [
  { name: 'Today', labelKey: 'nav.today', icon: ['grid', 'grid-outline'] },
  { name: 'Calendar', labelKey: 'nav.calendar', icon: ['calendar', 'calendar-outline'] },
  { name: 'Focus', labelKey: 'nav.focus', icon: ['timer', 'timer-outline'] },
  { name: 'Subjects', labelKey: 'nav.subjects', icon: ['library', 'library-outline'] },
  { name: 'Flashcards', labelKey: 'nav.flashcards', icon: ['albums', 'albums-outline'] },
  { name: 'Progress', labelKey: 'nav.progress', icon: ['stats-chart', 'stats-chart-outline'] },
  { name: 'Profile', labelKey: 'nav.profile', icon: ['person', 'person-outline'], hidden: true },
  { name: 'Settings', labelKey: 'nav.settings', icon: ['settings', 'settings-outline'], hidden: true },
].map(navItem);

const MAX_DOTS = 5;
const MAX_LIST = 4;

// Light sidebar that matches the rest of the app: brand, one primary action, navigation,
// subjects, today's goal and the signed-in user.
export default function Sidebar({
  route,
  onNavigate,
  onAddTask,
  user = { name: t('nav.guest') },
  badges = {},
  subjects = [],
  topInset = 0,
  today = { done: 0, total: 0, minutes: 0 },
}) {
  const pct = today.total ? today.done / today.total : 0;
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.wrap, { paddingTop: topInset + 18 }]}>
      <View style={styles.brand}>
        <LinearGradient colors={['#5B6CF0', '#7A5CFA']} style={styles.logo}>
          <Ionicons name="school" size={20} color="#fff" />
        </LinearGradient>
        <View>
          <Text style={styles.brandName}>Studyly</Text>
          <Text style={styles.brandSub}>{t('brand.tagline')}</Text>
        </View>
      </View>

      {onAddTask ? (
        <Pressable onPress={onAddTask} accessibilityLabel={t('nav.newTaskA11y')} style={styles.ctaWrap}>
          <LinearGradient colors={['#5B6CF0', '#7A5CFA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.ctaText}>{t('nav.newTask')}</Text>
          </LinearGradient>
        </Pressable>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
        <Text style={styles.section}>{t('nav.menu')}</Text>
        {NAV.filter((n) => !n.hidden).map((item) => {
          const active = route === item.name;
          const badge = badges[item.name];
          return (
            <Pressable
              key={item.name}
              onPress={() => onNavigate(item.name)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              aria-current={active ? 'page' : undefined}
              accessibilityLabel={badge ? t('nav.pageBadgeA11y', { label: item.label, count: badge }) : t('nav.pageA11y', { label: item.label })}
              style={({ hovered }) => [styles.item, active && styles.itemActive, hovered && !active && styles.itemHover]}
            >
              {active && <View style={styles.activeBar} />}
              <Ionicons name={item.icon[active ? 0 : 1]} size={20} color={active ? colors.accent : colors.muted} />
              <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>
                {item.label}
                {badge ? ' ' : ''}
              </Text>
              {badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}

        {subjects.length > 0 && (
          <>
            <Pressable style={styles.subjectsHead} onPress={() => setOpen((v) => !v)}>
              <Text style={[styles.section, { marginBottom: 0, marginTop: 0 }]}>{t('nav.mySubjects')}</Text>
              <View style={styles.dots}>
                {!open &&
                  subjects.slice(0, MAX_DOTS).map((s) => <View key={s.id} style={[styles.miniDot, { backgroundColor: s.color }]} />)}
                {!open && subjects.length > MAX_DOTS && <Text style={styles.more}>+{subjects.length - MAX_DOTS}</Text>}
                <Text style={styles.sectionCount}>{subjects.length}</Text>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} />
              </View>
            </Pressable>
            {open && (
              <View style={styles.subjectBox}>
                {subjects.slice(0, MAX_LIST).map((s) => (
                  <Pressable key={s.id} onPress={() => onNavigate('Subjects')} style={({ hovered }) => [styles.subject, hovered && styles.itemHover]}>
                    <View style={[styles.dot, { backgroundColor: s.color }]} />
                    <Text style={styles.subjectName} numberOfLines={1}>{s.name}</Text>
                    {s.open > 0 && <Text style={styles.subjectOpen}>{s.open}</Text>}
                  </Pressable>
                ))}
                <Pressable onPress={() => onNavigate('Subjects')} style={styles.viewAll}>
                  <Text style={styles.viewAllText}>
                    {subjects.length > MAX_LIST ? t('nav.viewAllSubjects', { count: subjects.length }) : t('nav.manageSubjects')}
                  </Text>
                  <Ionicons name="arrow-forward" size={13} color={colors.accent} />
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <View style={styles.goal}>
        <View style={styles.ringBox}>
          <ProgressRing size={46} stroke={5} value={pct} color={colors.accent} trackColor={colors.accentBorder} />
          <Text style={styles.goalPct}>{Math.round(pct * 100)}%</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.goalTitle}>{t('nav.todaysGoal')}</Text>
          <Text style={styles.goalSub}>
            {today.total === 0 ? t('nav.noTasksDue') : t('nav.goalProgress', { done: today.done, total: today.total, minutes: today.minutes })}
          </Text>
        </View>
      </View>

      <View style={[styles.user, route === 'Profile' && styles.userActive]}>
        <Pressable style={styles.userMain} onPress={() => onNavigate('Profile')}>
          <Avatar size={38} name={user.name} />
          <View style={{ flex: 1 }}>
            <Text style={styles.userName} numberOfLines={1}>{user.name}</Text>
            <Text style={styles.userRole}>{t('nav.viewProfile')}</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => onNavigate('Settings')}
          hitSlop={8}
          accessibilityLabel={t('nav.settingsA11y')}
          style={[styles.gear, route === 'Settings' && styles.gearActive]}
        >
          <Ionicons name="settings-outline" size={18} color={route === 'Settings' ? colors.accent : colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: {
    width: 264,
    flexGrow: 0,
    flexShrink: 0,
    height: '100%',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.line,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, marginBottom: 20 },
  logo: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  brandName: { color: colors.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  brandSub: { color: colors.muted, fontSize: 11, marginTop: 1 },
  ctaWrap: { borderRadius: 14, overflow: 'hidden', marginBottom: 22 },
  cta: { height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  ctaText: { color: colors.onAccent, fontSize: 15, fontWeight: '800' },
  section: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8, marginLeft: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, marginBottom: 3, overflow: 'hidden' },
  itemActive: { backgroundColor: colors.accentSoft },
  itemHover: { backgroundColor: colors.surfaceAlt },
  activeBar: { position: 'absolute', left: 0, top: 9, bottom: 9, width: 3, borderRadius: 2, backgroundColor: colors.accentFill },
  itemLabel: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '600' },
  itemLabelActive: { color: colors.accent, fontWeight: '800' },
  badge: { backgroundColor: colors.danger, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.onAccent, fontSize: 11, fontWeight: '800' },
  subjectsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, paddingVertical: 6, paddingRight: 8 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniDot: { width: 8, height: 8, borderRadius: 4 },
  more: { color: colors.muted, fontSize: 11, fontWeight: '700', marginLeft: 2 },
  sectionCount: { color: colors.accent, fontSize: 11, fontWeight: '800', backgroundColor: colors.accentSoft, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8, overflow: 'hidden', marginLeft: 6 },
  subjectBox: { backgroundColor: colors.surfaceAlt, borderRadius: 14, padding: 6, marginTop: 4 },
  subject: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  subjectName: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '500' },
  subjectOpen: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10 },
  viewAllText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.accentSoft, marginBottom: 10 },
  ringBox: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  goalPct: { position: 'absolute', color: colors.ink, fontSize: 11, fontWeight: '800' },
  goalTitle: { color: colors.ink, fontWeight: '800', fontSize: 14 },
  goalSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  user: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  userActive: { borderColor: colors.accent, backgroundColor: colors.surfaceAlt },
  userMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.onAccent, fontWeight: '700', fontSize: 13 },
  userName: { color: colors.ink, fontWeight: '800', fontSize: 14 },
  userRole: { color: colors.muted, fontSize: 12 },
  gear: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  gearActive: { backgroundColor: colors.accentSoft },
}));
