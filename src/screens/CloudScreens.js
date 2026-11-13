import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles } from '../theme';
import { t } from '../i18n';
import { useAuth } from '../auth';
import Field from '../components/Field';

// The screens around cloud accounts that aren't the app itself: a build without a Supabase project, the
// account's data not reachable on a new device, and choosing a new password after a reset link.

function Card({ icon, tint, title, body, children }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <View style={[styles.icon, { backgroundColor: tint }]}>
          <Ionicons name={icon} size={26} color={colors.onAccent} />
        </View>
        <Text style={styles.title}>{title}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
        {children}
      </View>
    </SafeAreaView>
  );
}

// For developers: the build has no EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY
export function CloudSetupScreen() {
  return (
    <Card icon="cloud-offline" tint={colors.danger} title={t('cloud.setupTitle')} body={t('cloud.setupBody')}>
      <Text selectable style={styles.code}>{'EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…'}</Text>
    </Card>
  );
}

// A device new to the account couldn't read it (offline): try again, or sign out
export function LoadFailedScreen({ onRetry, onSignOut, onOffline }) {
  return (
    <Card icon="cloud-offline-outline" tint="#E67E22" title={t('cloud.loadFailedTitle')} body={t('cloud.loadFailedBody')}>
      <Pressable onPress={onRetry} style={styles.btn} accessibilityRole="button">
        <Ionicons name="refresh" size={18} color={colors.onAccent} />
        <Text style={styles.btnText}>{t('cloud.tryAgain')}</Text>
      </Pressable>
      {onOffline ? (
        <>
          <Pressable onPress={onOffline} style={styles.ghost} accessibilityRole="button">
            <Text style={styles.ghostText}>{t('cloud.startOffline')}</Text>
          </Pressable>
          <Text style={styles.offlineNote}>{t('cloud.startOfflineNote')}</Text>
        </>
      ) : null}
      <Pressable onPress={onSignOut} style={styles.ghost} accessibilityRole="button">
        <Text style={styles.ghostText}>{t('cloud.signOut')}</Text>
      </Pressable>
    </Card>
  );
}

// Opened from a "reset password" email: the new password, twice
export function NewPasswordScreen() {
  const { setNewPassword, logout } = useAuth();
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (pw !== again) return setError(t('auth.signup.mismatchError'));
    setBusy(true);
    const res = await setNewPassword(pw);
    setBusy(false);
    if (res.error) setError(res.error);
  };
  return (
    <Card icon="key" tint={colors.accent} title={t('cloud.newPasswordTitle')} body={t('cloud.newPasswordBody')}>
      <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
        <Field label={t('auth.password')} icon="lock-closed-outline" secure value={pw} onChangeText={(v) => { setPw(v); setError(''); }} placeholder={t('auth.signup.passwordPlaceholder')} autoCapitalize="none" />
        <Field label={t('auth.signup.confirm')} icon="lock-closed-outline" secure value={again} onChangeText={(v) => { setAgain(v); setError(''); }} placeholder={t('auth.signup.confirmPlaceholder')} autoCapitalize="none" onSubmitEditing={save} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={save} disabled={busy} style={[styles.btn, busy && { opacity: 0.7 }]} accessibilityRole="button">
        {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.btnText}>{t('cloud.savePassword')}</Text>}
      </Pressable>
      <Pressable onPress={logout} style={styles.ghost} accessibilityRole="button">
        <Text style={styles.ghostText}>{t('cloud.signOut')}</Text>
      </Pressable>
    </Card>
  );
}

const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 440, backgroundColor: colors.surface, borderRadius: 24, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  icon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  body: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20, marginTop: 8 },
  code: { alignSelf: 'stretch', marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: colors.bg, color: colors.ink, fontSize: 12, fontFamily: 'monospace' },
  btn: { alignSelf: 'stretch', marginTop: 18, height: 50, borderRadius: radius.md, backgroundColor: colors.accentFill, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: colors.onAccent, fontSize: 15, fontWeight: '800' },
  ghost: { alignSelf: 'stretch', marginTop: 10, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  offlineNote: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 8, lineHeight: 17, maxWidth: 320 },
  error: { alignSelf: 'stretch', color: colors.danger, fontSize: 13, fontWeight: '600', marginTop: 4 },
}));
