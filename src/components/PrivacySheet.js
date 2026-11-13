import React from 'react';
import { Modal, View, Text, Pressable, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles } from '../theme';
import { t } from '../i18n';
import { formatDate, parseKey } from '../dates';

// Settings → Privacy & data: in plain words, what the app keeps, where, who can see it and for how long, with the
// controls for it in one place. The full privacy policy is docs/privacy-policy.md; keep the two in step.
// onExport: save a copy of everything (Settings' export); onDelete: delete the account (with its countdown and Undo).
// Without onExport (the sign-up screen) it is the explanation only.
// when this page (and docs/privacy-policy.md) last changed
const UPDATED = '2026-11-10';
const SECTIONS = [
  { key: 'yours', icon: 'person-circle-outline', tint: '#3B4CCA' },
  { key: 'device', icon: 'phone-portrait-outline', tint: '#2E86DE' },
  { key: 'shared', icon: 'people-outline', tint: '#157A52' },
  { key: 'ai', icon: 'sparkles-outline', tint: '#5B3FD9' },
  { key: 'errors', icon: 'bug-outline', tint: '#B5650D' },
  { key: 'backups', icon: 'time-outline', tint: '#2E86DE' },
  { key: 'never', icon: 'shield-checkmark-outline', tint: '#157A52' },
];

export default function PrivacySheet({ visible, onClose, onExport, onDelete, shareStudying, onShareStudying }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1, alignSelf: 'stretch' }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={styles.headIcon}>
              <Ionicons name="shield-checkmark" size={20} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading} accessibilityRole="header">
                {t('privacy.title')}
              </Text>
              <Text style={styles.headSub}>{t('privacy.sub')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 520 }}>
            {SECTIONS.map((s) => (
              <View key={s.key} style={styles.section}>
                <View style={[styles.icon, { backgroundColor: s.tint + '1A' }]}>
                  <Ionicons name={s.icon} size={18} color={s.tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle} accessibilityRole="header">
                    {t(`privacy.${s.key}.title`)}
                  </Text>
                  <Text style={styles.text}>{t(`privacy.${s.key}.text`)}</Text>
                </View>
              </View>
            ))}

            {/* the controls need an account: left out where the page is read before signing up */}
            {onExport ? (
              <>
                <Text style={styles.controlsHead}>{t('privacy.controls')}</Text>
                <Pressable onPress={onExport} style={({ hovered }) => [styles.control, hovered && styles.controlHover]} accessibilityRole="button">
                  <Ionicons name="download-outline" size={18} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.controlTitle}>{t('privacy.export')}</Text>
                    <Text style={styles.controlSub}>{t('privacy.exportSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
                {onShareStudying ? (
                  <Pressable
                    onPress={() => onShareStudying(!shareStudying)}
                    style={({ hovered }) => [styles.control, hovered && styles.controlHover]}
                    accessibilityRole="switch"
                    aria-checked={!!shareStudying}
                    accessibilityState={{ checked: !!shareStudying }}
                  >
                    <Ionicons name="people-circle-outline" size={18} color={colors.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.controlTitle}>{t('together.setting')}</Text>
                      <Text style={styles.controlSub}>{shareStudying ? t('privacy.sharingOn') : t('privacy.sharingOff')}</Text>
                    </View>
                    <Ionicons name={shareStudying ? 'toggle' : 'toggle-outline'} size={26} color={shareStudying ? colors.accent : colors.muted} />
                  </Pressable>
                ) : null}
                <Pressable onPress={onDelete} style={({ hovered }) => [styles.control, styles.danger, hovered && styles.controlHover]} accessibilityRole="button">
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.controlTitle, { color: colors.danger }]}>{t('privacy.delete')}</Text>
                    <Text style={styles.controlSub}>{t('privacy.deleteSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              </>
            ) : null}

            <Pressable onPress={() => Linking.openURL('https://www.anthropic.com/legal/privacy').catch(() => {})} accessibilityRole="link" style={styles.linkRow}>
              <Text style={styles.link}>{t('privacy.anthropicLink')}</Text>
            </Pressable>
            <Text style={styles.updated}>
              {t('privacy.updated', {
                date: formatDate(parseKey(UPDATED), {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }),
              })}
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: colors.scrim,
  },
  sheet: {
    width: '100%',
    maxWidth: 600,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  grab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 14,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  headIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#157A52',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  text: { fontSize: 13, color: colors.ink, lineHeight: 19, marginTop: 3 },
  controlsHead: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.muted,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
  },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 8,
  },
  controlHover: { borderColor: colors.accentBorder },
  danger: { borderColor: colors.danger + '55' },
  controlTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  controlSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    lineHeight: 16,
  },
  linkRow: { marginTop: 8, alignSelf: 'flex-start' },
  link: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  updated: { fontSize: 11, color: colors.muted, marginTop: 10 },
}));
