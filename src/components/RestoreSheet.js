import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles } from '../theme';
import { t } from '../i18n';
import { parseBackup } from '../backup';

// parseBackup returns { code, params } errors; turn one into a sentence in the current language.
export const backupErrorText = (error) => {
  if (!error) return '';
  const params = error.params && error.params.list ? { ...error.params, list: t(`backup.lists.${error.params.list}`) } : error.params;
  return t(`backup.errors.${error.code}`, params);
};

// "Found 3 tasks, 2 subjects, …" — each count picks its own plural form.
const summaryText = ({ counts, skipped }) => {
  const found = t('restore.found', {
    tasks: t('restore.counts.tasks', { count: counts.tasks }),
    subjects: t('restore.counts.subjects', { count: counts.subjects }),
    sessions: t('restore.counts.sessions', { count: counts.sessions }),
    exams: t('restore.counts.exams', { count: counts.exams }),
    classes: t('restore.counts.classes', { count: counts.classes }),
    breaks: t('restore.counts.breaks', { count: counts.vacations }),
  });
  return skipped > 0 ? `${found} ${t('restore.skipped', { count: skipped })}` : found;
};

// Paste (or, on the web, choose) a backup file and replace the current data with it.
export default function RestoreSheet({ visible, onClose, onRestore }) {
  const [text, setText] = useState('');

  // empty each time the sheet opens (while rendering, so the old text never flashes)
  const [openFor, setOpenFor] = useState(false);
  if (visible !== openFor) {
    setOpenFor(visible);
    if (visible) setText('');
  }

  const result = useMemo(() => (text.trim() ? parseBackup(text) : null), [text]);
  const ok = result && !result.error;

  const chooseFile = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setText(String(reader.result || ''));
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={styles.headIcon}>
              <Ionicons name="cloud-upload" size={20} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{t('restore.title')}</Text>
              <Text style={styles.headSub}>{t('restore.sub')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {Platform.OS === 'web' ? (
              <Pressable onPress={chooseFile} style={styles.fileBtn} accessibilityLabel={t('restore.chooseFileA11y')}>
                <Ionicons name="document-attach-outline" size={18} color={colors.accent} />
                <Text style={styles.fileBtnText}>{t('restore.chooseFile')}</Text>
              </Pressable>
            ) : (
              <Text style={styles.help}>{t('restore.pasteHelp')}</Text>
            )}

            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t('restore.placeholder')}
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={7}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t('restore.textA11y')}
            />

            {result && result.error ? (
              <View style={[styles.note, { backgroundColor: colors.dangerSoft }]}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={[styles.noteText, { color: colors.danger }]}>{backupErrorText(result.error)}</Text>
              </View>
            ) : null}

            {ok ? (
              <View style={[styles.note, { backgroundColor: colors.successSoft }]}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={[styles.noteText, { color: colors.success }]}>{summaryText(result)}</Text>
              </View>
            ) : null}
          </ScrollView>

          <Pressable
            onPress={() => ok && onRestore(result.data)}
            disabled={!ok}
            accessibilityLabel={t('restore.restoreA11y')}
            style={[styles.save, !ok && { opacity: 0.4 }]}
          >
            <Ionicons name="refresh-circle" size={20} color={colors.onAccent} />
            <Text style={styles.saveText}>{t('restore.replace')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.scrim },
  dismiss: { flex: 1, alignSelf: 'stretch' },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 10, paddingBottom: 28 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#7A5CFA', alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  fileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.accentSoft },
  fileBtnText: { color: colors.accent, fontWeight: '800', fontSize: 14 },
  help: { marginTop: 18, fontSize: 13, color: colors.muted, lineHeight: 19 },
  input: {
    marginTop: 12,
    minHeight: 130,
    textAlignVertical: 'top',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 14,
    fontSize: 12,
    color: colors.ink,
    ...Platform.select({ web: { outlineStyle: 'none', fontFamily: 'monospace' }, default: {} }),
  },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12, padding: 12, borderRadius: 12 },
  noteText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  save: { marginTop: 16, borderRadius: radius.md, height: 52, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7A5CFA' },
  saveText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
}));
