import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, subjectPalette, themedStyles } from '../theme';
import { t } from '../i18n';
import { validateSubjectName } from '../subjects';
import { GOAL_OPTIONS } from '../report';
import { hoursText } from '../durations';

// Add or edit a subject: its name, colour and weekly focus goal (minutes, 0 = none). `editing` is the subject being changed (null for a new one);
// `subjects` is used to stop two subjects having the same name. onSave({ name, color, weeklyGoal }); onDelete() for an
// existing subject. `nextColor` is the colour a new subject starts with.
export default function SubjectSheet({ visible, onClose, editing, subjects, onSave, onDelete, nextColor }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(subjectPalette[0]);
  const [goal, setGoal] = useState(0);
  const [tried, setTried] = useState(false); // show the name error only after a save attempt

  // Fill the fields each time the sheet opens. This happens while rendering, as `visible` turns true (not
  // in an effect), so the sheet never shows the previous values for a frame.
  const [openFor, setOpenFor] = useState(false);
  if (visible !== openFor) {
    setOpenFor(visible);
    if (visible) prefill();
  }
  function prefill() {
    setName(editing ? editing.name : '');
    setColor(editing ? editing.color : nextColor || subjectPalette[0]);
    setGoal(editing && editing.weeklyGoal > 0 ? editing.weeklyGoal : 0);
    setTried(false);
  }

  const errorKey = validateSubjectName(name, subjects, editing ? editing.id : null);
  // a duplicate name is pointed out at once; an empty one only after trying to save
  const error = errorKey && (tried || errorKey === 'subjects.errors.duplicate') ? t(errorKey, { name: name.trim() }) : null;
  const unchanged = editing && name.trim() === editing.name && color === editing.color && goal === (editing.weeklyGoal || 0);

  const save = () => {
    setTried(true);
    if (errorKey || unchanged) return;
    onSave({ name: name.trim(), color, weeklyGoal: goal });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={[styles.headIcon, { backgroundColor: color }]}>
              <Text style={styles.headLetter}>{(name.trim() || '?').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{editing ? t('subjects.editTitle') : t('subjects.new')}</Text>
              <Text style={styles.headSub}>{editing ? t('subjects.editSub') : t('subjects.newSub')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <View style={[styles.inputBox, error && styles.inputError]}>
            <View style={[styles.inputSwatch, { backgroundColor: color }]} />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('subjects.namePlaceholder')}
              placeholderTextColor={colors.muted}
              style={styles.input}
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={save}
              autoFocus={!editing}
              accessibilityLabel={t('subjects.nameA11y')}
            />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.label}>{t('subjects.colour')}</Text>
          <View style={styles.swatches}>
            {subjectPalette.map((c, i) => {
              const on = color === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={[styles.swatch, { backgroundColor: c }, on && styles.swatchOn]}
                  accessibilityRole="button"
                  aria-pressed={!!on} accessibilityState={{ selected: on }}
                  accessibilityLabel={t('subjects.colourA11y', { n: i + 1 })}
                >
                  {on ? <Ionicons name="checkmark" size={16} color={colors.onAccent} /> : null}
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>{t('subjects.goal')}</Text>
          <View style={styles.goals}>
            {GOAL_OPTIONS.map((g) => {
              const on = goal === g;
              return (
                <Pressable
                  key={g}
                  onPress={() => setGoal(g)}
                  style={[styles.goalChip, on && { backgroundColor: color, borderColor: color }]}
                  accessibilityRole="button"
                  aria-pressed={!!on} accessibilityState={{ selected: on }}
                  accessibilityLabel={g ? t('subjects.goalA11y', { time: hoursText(g) }) : t('subjects.goalOff')}
                >
                  <Text style={[styles.goalText, on && { color: colors.onAccent }]}>{g ? hoursText(g) : t('subjects.goalOff')}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.goalHint}>{t('subjects.goalHint')}</Text>

          <Pressable onPress={save} disabled={!!unchanged} style={[styles.save, { backgroundColor: color }, unchanged && { opacity: 0.4 }]} accessibilityRole="button">
            <Ionicons name="checkmark-circle" size={20} color={colors.onAccent} />
            <Text style={styles.saveText}>{editing ? t('common.saveChanges') : t('subjects.add')}</Text>
          </Pressable>
          {editing && onDelete ? (
            <Pressable
              onPress={() => {
                onClose();
                onDelete();
              }}
              style={styles.delete}
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={styles.deleteText}>{t('subjects.deleteSubject')}</Text>
            </Pressable>
          ) : null}
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
  headLetter: { color: colors.onAccent, fontSize: 18, fontWeight: '800' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: 14, height: 54, borderWidth: 1.5, borderColor: 'transparent' },
  inputError: { borderColor: colors.danger },
  inputSwatch: { width: 14, height: 14, borderRadius: 7 },
  input: { flex: 1, fontSize: 16, color: colors.ink, paddingVertical: 0, ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }) },
  error: { color: colors.danger, fontSize: 12, fontWeight: '700', marginTop: 6 },
  label: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 18, marginBottom: 10 },
  goals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  goalChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  goalText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  goalHint: { fontSize: 12, color: colors.muted, marginTop: 8 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { borderWidth: 3, borderColor: colors.surface, ...Platform.select({ web: { boxShadow: `0 0 0 2px ${colors.ink}` }, default: {} }) },
  save: { marginTop: 22, borderRadius: radius.md, height: 52, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
  delete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingVertical: 6 },
  deleteText: { color: colors.danger, fontSize: 14, fontWeight: '800' },
}));
