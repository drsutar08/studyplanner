import React, { useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles, readable } from '../theme';
import { t } from '../i18n';
import { useAuth } from '../auth';
import AuthLayout from '../components/AuthLayout';
import Field from '../components/Field';
import { startNextAccountWithSample } from '../store';
import { showSampleData } from '../variant';
import PrivacySheet from '../components/PrivacySheet';
import { privacyUrl, termsUrl, openUrl } from '../legal';

const strength = (pw) => {
  let s = 0;
  if (pw.length >= 6) s += 1;
  if (pw.length >= 10) s += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s += 1;
  return s; // 0..4
};
// Built when drawn, so the colours follow the theme and the labels the language
const strengthLevels = () => [
  { label: t('auth.strength.tooShort'), color: colors.line },
  { label: t('auth.strength.weak'), color: colors.danger },
  { label: t('auth.strength.okay'), color: '#F2A541' },
  { label: t('auth.strength.good'), color: '#17A398' },
  { label: t('auth.strength.strong'), color: colors.success },
];

export default function SignupScreen({ onSwitch, onConfirmSent }) {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [withSample, setWithSample] = useState(false); // start with example classes, exams and tasks
  // consent: the age group, a parent's or guardian's agreement for under-18s, and the terms (see legal.js)
  const [age, setAge] = useState(null); // 'adult' | 'minor'
  const [guardian, setGuardian] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [readingPrivacy, setReadingPrivacy] = useState(false);
  const emailRef = useRef(null);
  const passRef = useRef(null);
  const confirmRef = useRef(null);

  const s = password ? strength(password) : -1;
  const mismatch = confirm.length > 0 && confirm !== password;
  const STRENGTH = strengthLevels();
  // "Already registered? {link}": the link part is the tappable Sign in text
  const [haveBefore, haveAfter = ''] = t('auth.signup.haveAccount').split('{link}');

  const fail = (msg) => {
    setError(msg);
    setShakeKey((k) => k + 1);
    setBusy(false);
  };

  const submit = async () => {
    if (busy) return;
    if (password !== confirm) return fail(t('auth.signup.mismatchError'));
    setBusy(true);
    setError('');
    startNextAccountWithSample(showSampleData && withSample);
    const res = await signup({ name, email, password, consent: { age, guardian, agreed } });
    if (res.error) {
      startNextAccountWithSample(false);
      fail(res.error);
    } else if (res.confirm) {
      // the project asks new accounts to confirm their email first
      onConfirmSent && onConfirmSent(email.trim());
    }
  };

  return (
    <AuthLayout mode="signup" onSwitch={onSwitch} shakeKey={shakeKey} title={t('auth.signup.title')} subtitle={t('auth.signup.subtitle')}>
      <Field
        label={t('auth.signup.fullName')}
        icon="person-outline"
        value={name}
        onChangeText={(v) => {
          setName(v);
          setError('');
        }}
        placeholder={t('auth.signup.namePlaceholder')}
        autoComplete="name"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current && emailRef.current.focus()}
        blurOnSubmit={false}
      />
      <Field
        label={t('auth.email')}
        icon="mail-outline"
        inputRef={emailRef}
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          setError('');
        }}
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
        onChangeText={(v) => {
          setPassword(v);
          setError('');
        }}
        placeholder={t('auth.signup.passwordPlaceholder')}
        autoCapitalize="none"
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current && confirmRef.current.focus()}
        blurOnSubmit={false}
        style={{ marginBottom: s >= 0 ? 6 : 14 }}
      />
      {s >= 0 && (
        <View style={styles.meter}>
          <View style={styles.bars}>
            {[1, 2, 3, 4].map((i) => (
              <View key={i} style={[styles.bar, { backgroundColor: i <= s ? STRENGTH[s].color : colors.line }]} />
            ))}
          </View>
          <Text style={[styles.meterText, { color: readable(STRENGTH[s].color) }]}>{STRENGTH[s].label}</Text>
        </View>
      )}
      <Field
        label={t('auth.signup.confirm')}
        icon="shield-checkmark-outline"
        secure
        inputRef={confirmRef}
        value={confirm}
        onChangeText={(v) => {
          setConfirm(v);
          setError('');
        }}
        placeholder={t('auth.signup.confirmPlaceholder')}
        autoCapitalize="none"
        returnKeyType="go"
        onSubmitEditing={submit}
        error={mismatch ? t('auth.signup.mismatch') : undefined}
      />

      {error ? (
        <View style={styles.error}>
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* consent: required before the account is made */}
      <Text style={styles.ageLabel}>{t('auth.consent.ageLabel')}</Text>
      <View style={styles.ageRow} accessibilityRole="radiogroup">
        {[
          ['adult', t('auth.consent.adult')],
          ['minor', t('auth.consent.minor')],
        ].map(([v, label]) => (
          <Pressable
            key={v}
            testID={'consent-' + v}
            onPress={() => setAge(v)}
            style={[styles.ageBtn, age === v && styles.ageOn]}
            accessibilityRole="radio"
            aria-checked={age === v}
            accessibilityState={{ checked: age === v }}
          >
            <Text style={[styles.ageText, age === v && { color: colors.onAccent }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {age === 'minor' ? (
        <Pressable
          testID="consent-guardian"
          onPress={() => setGuardian((v) => !v)}
          style={styles.check}
          accessibilityRole="checkbox"
          aria-checked={!!guardian}
          accessibilityState={{ checked: guardian }}
          accessibilityLabel={t('auth.consent.guardian')}
        >
          <Ionicons name={guardian ? 'checkbox' : 'square-outline'} size={22} color={guardian ? colors.accent : colors.muted} />
          <Text style={styles.checkText}>{t('auth.consent.guardian')}</Text>
        </Pressable>
      ) : null}
      <View style={styles.check}>
        <Pressable
          testID="consent-agree"
          onPress={() => setAgreed((v) => !v)}
          hitSlop={6}
          accessibilityRole="checkbox"
          aria-checked={!!agreed}
          accessibilityState={{ checked: agreed }}
          accessibilityLabel={t('auth.consent.agreeA11y')}
        >
          <Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={22} color={agreed ? colors.accent : colors.muted} />
        </Pressable>
        <Text style={styles.checkText}>
          {t('auth.consent.agreeStart')}
          <Text style={termsUrl ? styles.legalLink : styles.checkStrong} onPress={termsUrl ? () => openUrl(termsUrl) : undefined} accessibilityRole={termsUrl ? 'link' : undefined}>
            {t('auth.consent.terms')}
          </Text>
          {t('auth.consent.agreeAnd')}
          <Text style={styles.legalLink} onPress={() => (privacyUrl ? openUrl(privacyUrl) : setReadingPrivacy(true))} accessibilityRole="link">
            {t('auth.consent.privacy')}
          </Text>
          {t('auth.consent.agreeEnd')}
        </Text>
      </View>
      <PrivacySheet visible={readingPrivacy} onClose={() => setReadingPrivacy(false)} />

      {/* sample data: the Development app only (variant.js) */}
      {showSampleData ? (
        <Pressable
          onPress={() => setWithSample((v) => !v)}
          style={[styles.sample, withSample && styles.sampleOn]}
          accessibilityRole="checkbox"
          aria-checked={!!withSample}
          accessibilityState={{ checked: withSample }}
          accessibilityLabel={t('auth.signup.sample')}
        >
          <Ionicons name={withSample ? 'checkbox' : 'square-outline'} size={22} color={withSample ? colors.accent : colors.muted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.sampleTitle}>{t('auth.signup.sample')}</Text>
            <Text style={styles.sampleSub}>{t('auth.signup.sampleSub')}</Text>
          </View>
        </Pressable>
      ) : null}

      <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [styles.btn, (busy || pressed) && { opacity: 0.8 }]}>
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <>
            <Text style={styles.btnText}>{t('auth.createAccount')}</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.onAccent} />
          </>
        )}
      </Pressable>

      <Text style={styles.terms}>
        {haveBefore}
        <Text style={styles.link} onPress={onSwitch}>
          {t('auth.signIn')}
        </Text>
        {haveAfter}
      </Text>
    </AuthLayout>
  );
}

const styles = themedStyles(() => ({
  sample: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    marginBottom: 12,
  },
  sampleOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  ageLabel: { fontSize: 13, fontWeight: '700', color: colors.ink, marginTop: 6, marginBottom: 6 },
  ageRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  ageBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, alignItems: 'center', backgroundColor: colors.surface },
  ageOn: { backgroundColor: colors.accentFill, borderColor: colors.accentFill },
  ageText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  checkText: { flex: 1, fontSize: 13, color: colors.ink, lineHeight: 19 },
  checkStrong: { fontWeight: '700' },
  legalLink: { color: colors.accent, fontWeight: '700', textDecorationLine: 'underline' },
  sampleTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  sampleSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  btn: {
    marginTop: 6,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.accentFill,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: colors.onAccent, fontSize: 16, fontWeight: '700' },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.dangerSoft,
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600', flex: 1 },
  terms: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 14,
    marginTop: 16,
  },
  link: { color: colors.accent, fontWeight: '700' },
  meter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  bars: { flex: 1, flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  meterText: { fontSize: 12, fontWeight: '700', width: 64, textAlign: 'right' },
}));
