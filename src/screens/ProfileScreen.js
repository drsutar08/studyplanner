import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, shadow, type, themedStyles } from '../theme';
import { t, LANGUAGES, LANGUAGE_CHOICE } from '../i18n';
import { useStore } from '../store';
import { useAuth } from '../auth';
import { dateKey } from '../dates';
import { useAccountActions } from '../actions';
import Field from '../components/Field';
import Avatar, { AVATAR_COLORS } from '../components/Avatar';
import { StarsDecor } from '../components/Illustrations';
import { protectedStreak, bestStreak, focusMinutes } from '../stats';
import { overallAverage, overallGpa } from '../grades';
import { attendanceSummary } from '../attendance';
import { onlyClasses } from '../classes';
import { pickAvatarPhoto } from '../avatarPhoto';
import { useTwoColumns } from '../layout';

// The grade average on the scale chosen on Progress: "84%", "3.0" or "8.8"
const gradeValue = (exams, scale) => {
  const avg = overallAverage(exams);
  if (avg === null) return null;
  if (scale === 'gpa4' || scale === 'gpa10') return overallGpa(exams, scale).toFixed(1);
  return `${Math.round(avg)}%`;
};

export default function ProfileScreen({ navigation }) {
  const { state } = useStore();
  const { user, settings, updateProfile, updateSettings, changePassword } = useAuth();
  const { signOut } = useAccountActions();
  const twoColumns = useTwoColumns();

  // personal details: the name lives on the account, the student details in the per-user settings
  const saved = { name: user.name, school: settings.school || '', course: settings.course || '', studyYear: settings.studyYear || '' };
  const [form, setForm] = useState(saved);
  const [nameMsg, setNameMsg] = useState(null);
  const dirty = Object.keys(saved).some((k) => form[k].trim() !== saved[k]);
  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setNameMsg(null);
  };

  const [pwOpen, setPwOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [pwMsg, setPwMsg] = useState(null);
  const [photoMsg, setPhotoMsg] = useState(null);

  // this term at a glance: focus, streak, grades, attendance
  const stats = useMemo(() => {
    const mins = focusMinutes(state.sessions);
    const att = attendanceSummary(onlyClasses(state.classes));
    return {
      hours: (mins / 60).toFixed(mins >= 600 ? 0 : 1),
      streak: protectedStreak(state.sessions, dateKey(), settings.weekStart || 0).days,
      best: bestStreak(state.sessions),
      grade: gradeValue(state.exams, settings.gradeScale || 'percent'),
      attendance: att.pct === null ? null : `${Math.round(att.pct)}%`,
    };
  }, [state.sessions, state.classes, state.exams, settings.gradeScale, settings.weekStart]);

  const saveDetails = async () => {
    if (form.name.trim() !== user.name) {
      const res = await updateProfile({ name: form.name });
      if (res.error) return setNameMsg({ error: res.error });
    }
    await updateSettings({ school: form.school.trim(), course: form.course.trim(), studyYear: form.studyYear.trim() });
    setForm((f) => ({ name: f.name.trim(), school: f.school.trim(), course: f.course.trim(), studyYear: f.studyYear.trim() }));
    setNameMsg({ ok: t('profile.nameSaved') });
    return undefined;
  };

  const savePassword = async () => {
    const res = await changePassword({ current: cur, next });
    if (res.error) setPwMsg({ error: res.error });
    else {
      setPwMsg({ ok: t('profile.passwordSaved') });
      setCur('');
      setNext('');
    }
  };

  const choosePhoto = async () => {
    setPhotoMsg(null);
    try {
      const uri = await pickAvatarPhoto();
      if (uri) await updateSettings({ avatarPhoto: uri });
    } catch {
      setPhotoMsg({ error: t('profile.photoError') });
    }
  };

  const studentLine = [settings.course, settings.studyYear].filter(Boolean).join(' · ');
  const langName = settings.language && settings.language !== 'system' ? (LANGUAGES.find((l) => l.code === settings.language) || {}).name : t('appearance.languageSystem');
  const themeName = t(settings.theme === 'dark' ? 'appearance.themeDark' : settings.theme === 'light' ? 'appearance.themeLight' : 'appearance.themeSystem');

  // the photo, name and this term's numbers
  const heroBlock = (
    <>
        <LinearGradient colors={['#151B33', '#2A3A9E', '#7A5CFA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <StarsDecor width={300} height={260} />
          <View style={styles.glow} pointerEvents="none" />
          <Pressable onPress={choosePhoto} style={styles.avatarRing} accessibilityRole="button" accessibilityLabel={t('profile.photoA11y')}>
            <Avatar size={84} name={user.name} />
            <View style={styles.camera}>
              <Ionicons name="camera" size={13} color="#fff" />
            </View>
          </Pressable>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
          {settings.school || studentLine ? (
            <View style={styles.chip}>
              <Ionicons name="school" size={12} color="#C9D0FF" />
              <Text style={styles.chipText} numberOfLines={1}>{[settings.school, studentLine].filter(Boolean).join(' · ')}</Text>
            </View>
          ) : null}
        </LinearGradient>

        <Pressable style={styles.strip} onPress={() => navigation.navigate('Progress')} accessibilityRole="button" accessibilityLabel={t('profile.termA11y')}>
          <Stat icon="time" tint={colors.accent} bg={colors.accentSoft} value={t('profile.hours', { hours: stats.hours })} label={t('profile.statFocused')} />
          <View style={styles.stripDivider} />
          <Stat icon="flame" tint="#EA580C" bg={colors.warnSoft} value={stats.streak} label={t('profile.statStreak')} sub={stats.best ? t('profile.best', { count: stats.best }) : null} />
          <View style={styles.stripDivider} />
          <Stat icon="school" tint={colors.violet} bg={colors.violetSoft} value={stats.grade || '–'} label={t('profile.statGrade')} />
          <View style={styles.stripDivider} />
          <Stat icon="hand-left" tint="#17A398" bg={colors.tealSoft} value={stats.attendance || '–'} label={t('profile.statAttendance')} />
        </Pressable>

    </>
  );
  // personal info
  const personalCard = (
    <>
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.cardIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="person" size={16} color={colors.accent} />
            </View>
            <Text style={type.h2}>{t('profile.personal')}</Text>
          </View>

          <Text style={[styles.label, { marginTop: 14 }]}>{t('profile.picture')}</Text>
          <View style={styles.pictureRow}>
            {settings.avatarPhoto ? (
              <>
                <Pressable onPress={choosePhoto} style={styles.pillBtn} accessibilityRole="button">
                  <Ionicons name="image-outline" size={15} color={colors.accent} />
                  <Text style={styles.pillText}>{t('profile.changePhoto')}</Text>
                </Pressable>
                <Pressable onPress={() => updateSettings({ avatarPhoto: null })} style={styles.pillBtn} accessibilityRole="button">
                  <Ionicons name="trash-outline" size={15} color={colors.muted} />
                  <Text style={[styles.pillText, { color: colors.muted }]}>{t('profile.removePhoto')}</Text>
                </Pressable>
              </>
            ) : (
              <>
                {Object.entries(AVATAR_COLORS).map(([id, grad]) => {
                  const on = (settings.avatarColor || 'indigo') === id;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => updateSettings({ avatarColor: id })}
                      style={[styles.swatchRing, on && { borderColor: grad[0] }]}
                      accessibilityRole="button"
                      aria-pressed={!!on} accessibilityState={{ selected: on }}
                      accessibilityLabel={t('profile.colorA11y', { n: Object.keys(AVATAR_COLORS).indexOf(id) + 1 })}
                    >
                      <LinearGradient colors={grad} style={styles.swatch} />
                    </Pressable>
                  );
                })}
                <Pressable onPress={choosePhoto} style={styles.pillBtn} accessibilityRole="button">
                  <Ionicons name="image-outline" size={15} color={colors.accent} />
                  <Text style={styles.pillText}>{t('profile.addPhoto')}</Text>
                </Pressable>
              </>
            )}
          </View>
          <Msg m={photoMsg} />

          <Field label={t('profile.fullName')} icon="person-outline" value={form.name} onChangeText={set('name')} accessibilityLabel={t('profile.fullName')} style={{ marginTop: 14 }} />
          <Field label={t('profile.email')} icon="mail-outline" value={user.email} editable={false} style={{ marginBottom: 4 }} />
          <Text style={styles.hint}>{t('profile.emailHint')}</Text>
          <Field label={t('profile.school')} icon="business-outline" value={form.school} onChangeText={set('school')} placeholder={t('profile.schoolPlaceholder')} maxLength={80} accessibilityLabel={t('profile.school')} />
          <View style={styles.twoCol}>
            <Field label={t('profile.course')} icon="book-outline" value={form.course} onChangeText={set('course')} placeholder={t('profile.coursePlaceholder')} maxLength={60} accessibilityLabel={t('profile.course')} style={{ flex: 1.4 }} />
            <Field label={t('profile.year')} icon="calendar-outline" value={form.studyYear} onChangeText={set('studyYear')} placeholder={t('profile.yearPlaceholder')} maxLength={30} accessibilityLabel={t('profile.year')} style={{ flex: 1 }} />
          </View>
          <Msg m={nameMsg} />
          {dirty ? (
            <Pressable onPress={saveDetails} disabled={!form.name.trim()} style={[styles.btn, !form.name.trim() && { opacity: 0.4 }]}>
              <Text style={styles.btnText}>{t('common.saveChanges')}</Text>
            </Pressable>
          ) : null}
        </View>

    </>
  );
  // change password (folded)
  const passwordCard = (
    <>
        <View style={styles.card}>
          <Pressable onPress={() => setPwOpen((o) => !o)} style={styles.cardHead} accessibilityRole="button" accessibilityState={{ expanded: pwOpen }}>
            <View style={[styles.cardIcon, { backgroundColor: colors.warnSoft }]}>
              <Ionicons name="shield-checkmark" size={16} color="#EA580C" />
            </View>
            <Text style={[type.h2, { flex: 1 }]}>{t('profile.changePassword')}</Text>
            <Ionicons name={pwOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
          </Pressable>
          {pwOpen ? (
            <>
              <Field label={t('profile.currentPassword')} icon="lock-closed-outline" secure value={cur} onChangeText={(v) => { setCur(v); setPwMsg(null); }} autoCapitalize="none" style={{ marginTop: 14 }} />
              <Field label={t('profile.newPassword')} icon="key-outline" secure value={next} onChangeText={(v) => { setNext(v); setPwMsg(null); }} autoCapitalize="none" placeholder={t('profile.newPasswordHint')} />
              <Msg m={pwMsg} />
              <Pressable onPress={savePassword} disabled={!cur || !next} style={[styles.btn, (!cur || !next) && { opacity: 0.4 }]}>
                <Text style={styles.btnText}>{t('profile.updatePassword')}</Text>
              </Pressable>
            </>
          ) : null}
        </View>

    </>
  );
  // shortcuts to the app settings
  const appCard = (
    <>
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.cardIcon, { backgroundColor: colors.violetSoft }]}>
              <Ionicons name="settings" size={16} color={colors.violet} />
            </View>
            <Text style={type.h2}>{t('profile.appSettings')}</Text>
          </View>
          {[
            ...(LANGUAGE_CHOICE ? [['language', 'language-outline', t('appearance.language'), langName]] : []),
            ['theme', 'contrast-outline', t('appearance.theme'), themeName],
            ['backup', 'cloud-upload-outline', t('profile.backup'), null],
          ].map(([id, icon, label, value], i) => (
            <Pressable key={id} onPress={() => navigation.navigate('Settings')} style={[styles.linkRow, i === 0 && { marginTop: 10 }]} accessibilityRole="button" accessibilityLabel={value ? `${label}: ${value}` : label}>
              <Ionicons name={icon} size={18} color={colors.muted} />
              <Text style={styles.linkLabel}>{label}</Text>
              {value ? <Text style={styles.linkValue}>{value}</Text> : null}
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
        </View>

    </>
  );
  // sign out
  const signOutButton = (
    <>
        <Pressable style={styles.signOut} onPress={signOut} accessibilityRole="button">
          <Ionicons name="log-out-outline" size={20} color={colors.ink} />
          <Text style={styles.signOutText}>{t('profile.signOut')}</Text>
        </Pressable>
    </>
  );

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <ScrollView contentContainerStyle={[styles.content, twoColumns && styles.contentWide]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {twoColumns ? (
          // desktop: who you are and the app shortcuts on the left, the forms on the right
          <View style={styles.wideRow}>
            <View style={styles.col}>
              {heroBlock}
              {appCard}
            </View>
            <View style={[styles.col, styles.colSide]}>
              {personalCard}
              {passwordCard}
              {signOutButton}
            </View>
          </View>
        ) : (
          <>
            {heroBlock}
            {personalCard}
            {passwordCard}
            {appCard}
            {signOutButton}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Msg({ m }) {
  if (!m) return null;
  return (
    <View style={[styles.msgBox, { backgroundColor: m.error ? colors.dangerSoft : colors.successSoft }]}>
      <Ionicons name={m.error ? 'alert-circle' : 'checkmark-circle'} size={16} color={m.error ? colors.danger : colors.success} />
      <Text style={[styles.msg, { color: m.error ? colors.danger : colors.success }]}>{m.error || m.ok}</Text>
    </View>
  );
}

function Stat({ icon, tint, bg, value, label, sub }) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 16, paddingBottom: 120, maxWidth: 720, width: '100%', alignSelf: 'center' },
  contentWide: { maxWidth: 1240 },
  wideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  col: { flex: 1, minWidth: 0 },
  colSide: { marginTop: -16 }, // the first card's own top margin: line it up with the hero
  hero: { borderRadius: 28, padding: 24, paddingBottom: 46, alignItems: 'center', overflow: 'hidden', ...shadow },
  glow: { position: 'absolute', right: -50, top: -60, width: 190, height: 190, borderRadius: 95, backgroundColor: '#8D9BFF', opacity: 0.2 },
  avatarRing: { width: 98, height: 98, borderRadius: 49, borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
  camera: { position: 'absolute', right: 0, bottom: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: '#2A3A9E', borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  name: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 12 },
  email: { color: '#C9D0FF', fontSize: 14, marginTop: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, maxWidth: '100%', backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 11, paddingVertical: 5, borderRadius: 12 },
  chipText: { color: '#E6E9FF', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  strip: { flexDirection: 'row', alignItems: 'center', marginTop: -28, marginHorizontal: 10, backgroundColor: colors.surface, borderRadius: 22, paddingVertical: 14, ...shadow, shadowOpacity: 0.12 },
  stripDivider: { width: 1, height: 52, backgroundColor: colors.line },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  statIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.ink },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 1 },
  statSub: { fontSize: 10, fontWeight: '700', color: '#EA580C', marginTop: 1 },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 18, marginTop: 16, borderWidth: 1, borderColor: colors.line },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  hint: { fontSize: 11, color: colors.muted, marginBottom: 14 },
  pictureRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  swatchRing: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 26, height: 26, borderRadius: 13 },
  pillBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.accentSoft },
  pillText: { fontSize: 13, fontWeight: '800', color: colors.accent },
  twoCol: { flexDirection: 'row', gap: 10 },
  btn: { height: 48, borderRadius: radius.md, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  btnText: { color: colors.onAccent, fontWeight: '800', fontSize: 15 },
  msgBox: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10, marginBottom: 10, marginTop: 6 },
  msg: { fontSize: 13, fontWeight: '700', flex: 1 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line },
  linkLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink },
  linkValue: { fontSize: 13, color: colors.muted },
  signOut: { marginTop: 16, height: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  signOutText: { color: colors.ink, fontWeight: '800', fontSize: 15 },
}));
