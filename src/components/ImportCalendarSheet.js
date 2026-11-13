import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles } from '../theme';
import { t, weekdayName } from '../i18n';
import { formatTime } from '../dates';
import { parseIcs, importPlan } from '../ics';

// One line per record that will be added: "Physics · Mon, Wed 09:00"
const describe = (kind, r) => {
  if (kind === 'vacations') return r.start === r.end ? r.start : `${r.start} – ${r.end}`;
  const when = r.repeat === 'weekly' ? r.days.map((d) => weekdayName(d, 'short')).join(', ') : r.date;
  const time = r.start || r.time;
  return time ? `${when} ${formatTime(time)}` : when;
};

const ICONS = { classes: 'school-outline', exams: 'document-text-outline', vacations: 'airplane-outline' };

// Choose (web) or paste a calendar file (.ics) and add its classes, exams and breaks to the app.
export default function ImportCalendarSheet({ visible, onClose, onImport, existing, today }) {
  const [text, setText] = useState('');
  // the sheet opens empty next time
  const close = () => {
    setText('');
    onClose();
  };

  const plan = useMemo(() => {
    if (!text.trim()) return null;
    const events = parseIcs(text);
    return events.length ? importPlan(events, existing, { today }) : { error: true };
  }, [text, existing, today]);
  const total = plan && !plan.error ? plan.classes.length + plan.exams.length + plan.vacations.length : 0;

  const chooseFile = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ics,text/calendar';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setText(String(reader.result || ''));
      reader.readAsText(file);
    };
    input.click();
  };

  const rows = plan && !plan.error ? ['classes', 'exams', 'vacations'].flatMap((kind) => plan[kind].map((r, i) => ({ kind, r, key: `${kind}-${i}` }))) : [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.dismiss} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={styles.headIcon}>
              <Ionicons name="calendar" size={20} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{t('ics.title')}</Text>
              <Text style={styles.headSub}>{t('ics.sub')}</Text>
            </View>
            <Pressable onPress={close} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
            {Platform.OS === 'web' ? (
              <Pressable onPress={chooseFile} style={styles.fileBtn} accessibilityLabel={t('ics.chooseFileA11y')}>
                <Ionicons name="document-attach-outline" size={18} color={colors.accent} />
                <Text style={styles.fileBtnText}>{t('ics.chooseFile')}</Text>
              </Pressable>
            ) : (
              <Text style={styles.help}>{t('ics.pasteHelp')}</Text>
            )}

            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="BEGIN:VCALENDAR…"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={6}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t('ics.textA11y')}
            />

            {plan && plan.error ? (
              <View style={[styles.note, { backgroundColor: colors.dangerSoft }]}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={[styles.noteText, { color: colors.danger }]}>{t('ics.noEvents')}</Text>
              </View>
            ) : null}

            {plan && !plan.error ? (
              <View style={[styles.note, { backgroundColor: total ? colors.successSoft : colors.bg }]}>
                <Ionicons name={total ? 'checkmark-circle' : 'information-circle'} size={16} color={total ? colors.success : colors.muted} />
                <Text style={[styles.noteText, { color: total ? colors.success : colors.muted }]}>
                  {total
                    ? t('ics.found', {
                        classes: t('restore.counts.classes', { count: plan.classes.length }),
                        exams: t('restore.counts.exams', { count: plan.exams.length }),
                        breaks: t('restore.counts.breaks', { count: plan.vacations.length }),
                      })
                    : t('ics.nothingNew')}
                  {plan.skipped ? ` ${t('ics.skipped', { count: plan.skipped })}` : ''}
                </Text>
              </View>
            ) : null}

            {rows.slice(0, 12).map(({ kind, r, key }) => (
              <View key={key} style={styles.item}>
                <Ionicons name={r.kind === 'activity' ? 'football-outline' : ICONS[kind]} size={15} color={colors.muted} />
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={styles.itemWhen} numberOfLines={1}>
                  {describe(kind, r)}
                </Text>
              </View>
            ))}
            {rows.length > 12 ? <Text style={styles.more}>{t('calendar.moreItems', { count: rows.length - 12 })}</Text> : null}
          </ScrollView>

          <Pressable onPress={() => {
              if (!total) return;
              setText('');
              onImport(plan);
            }} disabled={!total} accessibilityLabel={t('ics.importA11y')} style={[styles.save, !total && { opacity: 0.4 }]}>
            <Ionicons name="add-circle" size={20} color={colors.onAccent} />
            <Text style={styles.saveText}>{t('ics.add', { count: total })}</Text>
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
  headIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#2E86DE', alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  fileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.accentSoft },
  fileBtnText: { color: colors.accent, fontWeight: '800', fontSize: 14 },
  help: { marginTop: 18, fontSize: 13, color: colors.muted, lineHeight: 19 },
  input: {
    marginTop: 12,
    minHeight: 110,
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
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  itemTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.ink },
  itemWhen: { fontSize: 12, color: colors.muted, maxWidth: '50%' },
  more: { fontSize: 12, color: colors.muted, marginTop: 8, fontWeight: '700' },
  save: { marginTop: 16, borderRadius: radius.md, height: 52, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2E86DE' },
  saveText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
}));
