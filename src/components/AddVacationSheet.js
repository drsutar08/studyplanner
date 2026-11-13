import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles } from '../theme';
import { t } from '../i18n';
import { dateKey } from '../dates';
import { PRESETS, presetEnd, presetOf, lengthLabel, validateVacation } from '../vacations';
import DateField from './DateField';

// Used by other screens as a fill; this sheet uses colors.teal for text and icons so it follows the theme.
export const BREAK_COLOR = '#0F8F85';

// Add or edit a vacation / break.
// `hasRotation`: explain that pausing bumps the rotating timetable (it resumes where it left off).
export default function AddVacationSheet({ visible, onClose, onSave, defaultDate, editing, hasRotation = false }) {
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(dateKey());
  const [end, setEnd] = useState(dateKey());
  const [preset, setPreset] = useState('day');
  const [pause, setPause] = useState(true);
  const [notes, setNotes] = useState('');

  // Fill the fields each time the sheet opens. This happens while rendering, as `visible` turns true (not
  // in an effect), so the sheet never shows the previous values for a frame.
  const [openFor, setOpenFor] = useState(false);
  if (visible !== openFor) {
    setOpenFor(visible);
    if (visible) prefill();
  }
  function prefill() {
    const s = editing ? editing.start : defaultDate || dateKey();
    const e = editing ? editing.end : s;
    setTitle(editing ? editing.title : '');
    setStart(s);
    setEnd(e);
    setPreset(presetOf(s, e));
    setPause(editing ? editing.pause !== false : true);
    setNotes(editing ? editing.notes || '' : '');
  }

  // A preset keeps its length when the start moves; picking an end by hand makes it "Custom"
  const pickPreset = (id) => {
    setPreset(id);
    const e = presetEnd(start, id);
    if (e) setEnd(e);
  };
  const pickStart = (k) => {
    setStart(k);
    const e = presetEnd(k, preset);
    if (e) setEnd(e);
    else if (end < k) setEnd(k);
  };
  const pickEnd = (k) => {
    setEnd(k);
    setPreset(presetOf(start, k));
  };

  const errorKey = validateVacation({ title, start, end }); // a translation key, or null
  const error = errorKey ? t(errorKey) : null;
  const length = lengthLabel(start, end);
  const canSave = !error;
  const save = () => {
    if (!canSave) return;
    onSave({ title: title.trim(), start, end, pause, notes: notes.trim() });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={[styles.headIcon, { backgroundColor: BREAK_COLOR }]}>
              <Ionicons name={editing ? 'create' : 'sunny'} size={21} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{editing ? t('vacationSheet.editTitle') : t('vacationSheet.newTitle')}</Text>
              <Text style={styles.headSub}>{t('vacationSheet.sub')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }}>
            <View style={styles.inputBox}>
              <Ionicons name="sunny-outline" size={20} color={colors.muted} />
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={t('vacationSheet.namePlaceholder')}
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoFocus
                maxLength={60}
                returnKeyType="done"
                onSubmitEditing={save}
                accessibilityLabel={t('vacationSheet.nameA11y')}
              />
            </View>

            <View style={styles.group}>
              <Text style={styles.groupTitle}>{t('vacationSheet.dates')}</Text>
              <View style={[styles.row, { marginTop: 10 }]}>
                {PRESETS.map(([id, labelKey]) => {
                  const on = preset === id;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => pickPreset(id)}
                      style={[styles.chip, on && styles.chipOn]}
                      accessibilityRole="button"
                      aria-pressed={!!on} accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.chipText, on && { color: colors.onAccent }]}>{t(labelKey)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.rangeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('sheet.start')}</Text>
                  <DateField value={start} onChange={pickStart} accent={colors.teal} background={colors.surface} label={t('vacationSheet.startA11y')} />
                </View>
                <Ionicons name="arrow-forward" size={18} color={colors.muted} style={styles.arrow} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('sheet.end')}</Text>
                  <DateField value={end} onChange={pickEnd} accent={colors.teal} background={colors.surface} label={t('vacationSheet.endA11y')} minKey={start} />
                </View>
              </View>
              {end >= start && <Text style={styles.length}>{t(length.key, length.params)}</Text>}
            </View>

            <View style={styles.group}>
              <Text style={styles.groupTitle}>{t('vacationSheet.routines')}</Text>
              <View style={styles.behaviour}>
                <View style={styles.behaviourIcon}>
                  <Ionicons name={pause ? 'pause' : 'play'} size={16} color={colors.teal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.behaviourTitle}>{pause ? t('vacationSheet.pauseTitle') : t('vacationSheet.keepTitle')}</Text>
                  <Text style={styles.behaviourSub}>
                    {pause ? t('vacationSheet.pauseSub') : t('vacationSheet.keepSub')}
                  </Text>
                  {hasRotation ? (
                    <Text style={styles.rotationNote}>
                      <Ionicons name="sync" size={11} color={colors.violet} /> {pause ? t('rotation.bumpOn') : t('rotation.bumpOff')}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.segment}>
                {[
                  [true, hasRotation ? 'rotation.bumpLabel' : 'vacationSheet.pause'],
                  [false, 'vacationSheet.dontPause'],
                ].map(([v, labelKey]) => {
                  const on = pause === v;
                  return (
                    <Pressable key={labelKey} onPress={() => setPause(v)} style={[styles.segItem, on && styles.segOn]} accessibilityRole="button" aria-pressed={!!on} accessibilityState={{ selected: on }}>
                      <Text style={[styles.segText, on && { color: colors.teal }]}>{t(labelKey)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Text style={styles.label}>
              {t('sheet.notes')} <Text style={styles.optional}>{t('common.optional')}</Text>
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t('vacationSheet.notesPlaceholder')}
              placeholderTextColor={colors.muted}
              style={styles.notes}
              multiline
              maxLength={500}
              textAlignVertical="top"
              accessibilityLabel={t('vacationSheet.notesA11y')}
            />
          </ScrollView>

          <Pressable onPress={save} disabled={!canSave} style={[styles.save, !canSave && { opacity: 0.4 }]}>
            <Ionicons name="checkmark-circle" size={20} color={colors.onAccent} />
            <Text style={styles.saveText}>{editing ? t('common.saveChanges') : t('vacationSheet.save')}</Text>
          </Pressable>
          {error ? <Text style={styles.summary}>{error}</Text> : null}
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
  headIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: 14, height: 54 },
  input: { flex: 1, fontSize: 16, color: colors.ink, paddingVertical: 0, ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }) },
  label: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 18, marginBottom: 10 },
  optional: { fontSize: 11, fontWeight: '600', color: colors.muted },
  group: { marginTop: 18, backgroundColor: colors.bg, borderRadius: 18, padding: 14, paddingTop: 12 },
  groupTitle: { fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 1 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  chipOn: { backgroundColor: BREAK_COLOR, borderColor: BREAK_COLOR },
  chipText: { fontWeight: '700', color: colors.muted, fontSize: 14 },
  rangeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  arrow: { marginTop: 58 },
  length: { marginTop: 12, fontSize: 13, fontWeight: '800', color: colors.teal },
  behaviour: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  behaviourIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  behaviourTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  behaviourSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  rotationNote: { fontSize: 12, fontWeight: '700', color: colors.violet, marginTop: 4 },
  segment: { flexDirection: 'row', marginTop: 12, backgroundColor: colors.surface, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: colors.line },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  segOn: { backgroundColor: colors.tealSoft },
  segText: { fontSize: 14, fontWeight: '700', color: colors.muted },
  notes: {
    minHeight: 96,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
    ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }),
  },
  save: { marginTop: 18, borderRadius: radius.md, height: 52, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: BREAK_COLOR },
  saveText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
  summary: { textAlign: 'center', fontSize: 12, color: colors.muted, marginTop: 10 },
}));
