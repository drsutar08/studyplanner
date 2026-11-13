import React, { useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles } from '../theme';
import { t } from '../i18n';
import { useAuth } from '../auth';
import AuthLayout from '../components/AuthLayout';
import Field from '../components/Field';

// `notice`: a message to show above the form (e.g. "check your email" after signing up)
export default function LoginScreen({ onSwitch, notice = '' }) {
  const { login, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [info, setInfo] = useState(notice);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const passRef = useRef(null);

  // a reset link to the email typed above
  const forgot = async () => {
    setError('');
    setInfo('');
    const res = await resetPassword(email);
    if (res.error) setError(res.error);
    else setInfo(t('auth.login.resetSent', { email: email.trim() }));
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setInfo('');
    const res = await login({ email, password });
    if (res.error) {
      setError(res.error);
      setShakeKey((k) => k + 1);
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      mode="login"
      onSwitch={onSwitch}
      shakeKey={shakeKey}
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
    >
      <Field
        label={t('auth.email')}
        icon="mail-outline"
        value={email}
        onChangeText={(v) => { setEmail(v); setError(''); }}
        placeholder={t('auth.emailPlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        returnKeyType="next"
        onSubmitEditing={() => passRef.current && passRef.current.focus()}
        blurOnSubmit={false}
      />
      <Field
        label={t('auth.password')}
        icon="lock-closed-outline"
        secure
        inputRef={passRef}
        value={password}
        onChangeText={(v) => { setPassword(v); setError(''); }}
        placeholder={t('auth.login.passwordPlaceholder')}
        autoCapitalize="none"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Pressable onPress={forgot} hitSlop={6} style={styles.forgot} accessibilityRole="button">
        <Text style={styles.forgotText}>{t('auth.login.forgot')}</Text>
      </Pressable>

      {info ? (
        <View style={styles.info} accessibilityLiveRegion="polite">
          <Ionicons name="mail-unread-outline" size={16} color={colors.success} />
          <Text style={styles.infoText}>{info}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.error}>
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [styles.btn, (busy || pressed) && { opacity: 0.8 }]}>
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <>
            <Text style={styles.btnText}>{t('auth.signIn')}</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.onAccent} />
          </>
        )}
      </Pressable>

      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.dividerText}>{t('auth.login.newHere')}</Text>
        <View style={styles.line} />
      </View>

      <Pressable onPress={onSwitch} style={styles.ghost}>
        <Text style={styles.ghostText}>{t('auth.login.createFree')}</Text>
      </Pressable>
    </AuthLayout>
  );
}

const styles = themedStyles(() => ({
  btn: { marginTop: 6, height: 52, borderRadius: radius.md, backgroundColor: colors.accentFill, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: colors.onAccent, fontSize: 16, fontWeight: '700' },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.dangerSoft, padding: 10, borderRadius: 10, marginBottom: 10 },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600', flex: 1 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.successSoft, padding: 10, borderRadius: 10, marginBottom: 10 },
  infoText: { color: colors.success, fontSize: 13, fontWeight: '600', flex: 1 },
  forgot: { alignSelf: 'flex-end', marginTop: -4, marginBottom: 12 },
  forgotText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18 },
  line: { flex: 1, height: 1, backgroundColor: colors.line },
  dividerText: { color: colors.muted, fontSize: 12 },
  ghost: { height: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.accentSoft, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: colors.accent, fontWeight: '700', fontSize: 15 },
}));
