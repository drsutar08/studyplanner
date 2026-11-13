import React, { useState } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles } from '../theme';
import { t } from '../i18n';
import Field from './Field';
import { checkLegacyPassword } from '../legacyAccounts';

// Bring an account from the older version (on this device) into the signed-in cloud account: pick it, prove it's
// yours with its old password, and its data is added (onImport(account)).
export default function LegacyImportSheet({ visible, onClose, accounts, onImport }) {
  const [picked, setPicked] = useState(null);
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [openFor, setOpenFor] = useState(false);
  if (visible !== openFor) {
    setOpenFor(visible);
    if (visible) {
      setPicked(accounts.length === 1 ? accounts[0] : null);
      setPw('');
      setError('');
      setBusy(false);
    }
  }

  const go = async () => {
    if (!picked || busy) return;
    setBusy(true);
    setError('');
    const ok = await checkLegacyPassword(picked.user, pw).catch(() => false);
    setBusy(false);
    if (!ok) return setError(t('legacy.wrongPassword'));
    onImport(picked);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1, alignSelf: 'stretch' }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={styles.headIcon}>
              <Ionicons name="archive" size={20} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{t('legacy.title')}</Text>
              <Text style={styles.headSub}>{t('legacy.sub')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          {accounts.map((a) => {
            const on = picked && picked.id === a.id;
            return (
              <Pressable key={a.id} onPress={() => { setPicked(a); setError(''); }} style={[styles.account, on && styles.accountOn]} accessibilityRole="radio" accessibilityState={{ checked: !!on }} accessibilityLabel={`${a.name} ${a.email}`}>
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? colors.accent : colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{a.name}</Text>
                  <Text style={styles.meta}>{a.email}</Text>
                  <Text style={styles.meta}>{t('legacy.holds', { tasks: a.counts.tasks, exams: a.counts.exams, classes: a.counts.classes })}</Text>
                </View>
              </Pressable>
            );
          })}

          {picked ? (
            <View style={{ marginTop: 12 }}>
              <Field label={t('legacy.passwordLabel', { email: picked.email })} icon="lock-closed-outline" secure value={pw} onChangeText={(v) => { setPw(v); setError(''); }} placeholder={t('legacy.passwordPlaceholder')} autoCapitalize="none" onSubmitEditing={go} />
            </View>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.note}>{t('legacy.note')}</Text>

          <Pressable onPress={go} disabled={!picked || !pw || busy} style={[styles.save, (!picked || !pw || busy) && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel={t('legacy.import')}>
            {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.saveText}>{t('legacy.import')}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 10, paddingBottom: 28 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  headIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#8E7DBE', alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  account: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.line, marginTop: 8 },
  accountOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  name: { fontSize: 15, fontWeight: '800', color: colors.ink },
  meta: { fontSize: 12, color: colors.muted, marginTop: 1 },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', marginTop: 4 },
  note: { fontSize: 12, color: colors.muted, marginTop: 10, lineHeight: 17 },
  save: { marginTop: 14, borderRadius: radius.md, height: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentFill },
  saveText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
}));
