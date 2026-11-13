import React, { useState } from 'react';
import { Modal, View, Text, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles } from '../theme';
import { t, weekdayName } from '../i18n';
import { dateKey, addDays, formatDue, dayLetters, parseKey } from '../dates';
import { slotLabel } from '../rotationLabels';

const DEFAULT_SCHOOL = [1, 2, 3, 4, 5];
const MAX = { days: 8, weeks: 4 };

// The day the cycle is counted from: today, or the next school day (lettered days skip weekends).
const referenceDay = (type, schoolDays) => {
  const today = dateKey();
  if (type === 'weeks') return today;
  for (let i = 0; i < 14; i += 1) {
    const k = addDays(today, i);
    if (schoolDays.includes(parseKey(k).getDay())) return k;
  }
  return today;
};

// Set up, change or turn off the rotating timetable. You say what today (or the next school day) is,
// e.g. "Day B", and the app counts every other date from there.
export default function RotationSheet({ visible, onClose, rotation, onSave, weekStart = 0, current }) {
  const [type, setType] = useState('off');
  const [length, setLength] = useState(2);
  const [schoolDays, setSchoolDays] = useState(DEFAULT_SCHOOL);
  const [todayIndex, setTodayIndex] = useState(0);

  // Fill the fields each time the sheet opens. This happens while rendering, as `visible` turns true (not
  // in an effect), so the sheet never shows the previous values for a frame.
  const [openFor, setOpenFor] = useState(false);
  if (visible !== openFor) {
    setOpenFor(visible);
    if (visible) prefill();
  }
  function prefill() {
    setType(rotation ? rotation.type : 'off');
    setLength(rotation ? rotation.length : 2);
    setSchoolDays(rotation && rotation.schoolDays ? rotation.schoolDays : DEFAULT_SCHOOL);
    // start from what the existing rotation says about the reference day
    setTodayIndex(typeof current === 'number' ? current : 0);
  }

  const ref = type === 'off' ? null : referenceDay(type, schoolDays);
  const max = type === 'off' ? 2 : MAX[type];
  const bump = (d) => {
    const n = Math.max(2, Math.min(max, length + d));
    setLength(n);
    if (todayIndex >= n) setTodayIndex(0);
  };
  const pickType = (v) => {
    setType(v);
    if (v !== 'off' && length > MAX[v]) setLength(MAX[v]);
    setTodayIndex(0);
  };
  const toggleDay = (d) => setSchoolDays((cur) => (cur.includes(d) ? (cur.length > 1 ? cur.filter((x) => x !== d) : cur) : [...cur, d].sort()));
  const preview = { type: type === 'off' ? 'days' : type };

  const save = () => {
    onSave(type === 'off' ? null : { type, length, startDate: ref, startIndex: todayIndex, schoolDays, weekStart });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={styles.headIcon}>
              <Ionicons name="sync" size={20} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{t('rotation.sheetTitle')}</Text>
              <Text style={styles.headSub}>{t('rotation.sheetSub')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
            <Text style={styles.label}>{t('rotation.typeLabel')}</Text>
            <View style={styles.row}>
              {[
                ['off', t('rotation.off')],
                ['days', t('rotation.typeDays')],
                ['weeks', t('rotation.typeWeeks')],
              ].map(([v, text]) => {
                const on = type === v;
                return (
                  <Pressable key={v} onPress={() => pickType(v)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" aria-pressed={!!on} accessibilityState={{ selected: on }} accessibilityLabel={t('rotation.typeA11y', { name: text })}>
                    <Text style={[styles.chipText, on && { color: colors.accent }]}>{text}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>{type === 'days' ? t('rotation.daysHint') : type === 'weeks' ? t('rotation.weeksHint') : t('rotation.offHint')}</Text>

            {type !== 'off' && (
              <>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>{type === 'days' ? t('rotation.lengthDays') : t('rotation.lengthWeeks')}</Text>
                  <View style={styles.stepper}>
                    <Pressable onPress={() => bump(-1)} hitSlop={6} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel={t('rotation.fewerA11y')}>
                      <Ionicons name="remove" size={16} color={colors.accent} />
                    </Pressable>
                    <Text style={styles.stepVal}>{length}</Text>
                    <Pressable onPress={() => bump(1)} hitSlop={6} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel={t('rotation.moreA11y')}>
                      <Ionicons name="add" size={16} color={colors.accent} />
                    </Pressable>
                  </View>
                </View>
                <Text style={styles.cycle}>{Array.from({ length }, (_, i) => slotLabel(preview, i)).join(' → ')} → …</Text>

                <Text style={styles.label}>{t('rotation.schoolDays')}</Text>
                <View style={styles.dayRow}>
                  {dayLetters().map((l, d) => {
                    const on = schoolDays.includes(d);
                    return (
                      <Pressable key={d} onPress={() => toggleDay(d)} style={[styles.dayDot, on && styles.dayDotOn]} accessibilityRole="checkbox" aria-checked={!!on} accessibilityState={{ checked: on }} accessibilityLabel={t('rotation.schoolDayA11y', { day: weekdayName(d, 'long') })}>
                        <Text style={[styles.dayDotText, on && { color: colors.onAccent }]}>{l}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.hint}>{type === 'days' ? t('rotation.schoolDaysHintDays') : t('rotation.schoolDaysHintWeeks')}</Text>

                <Text style={styles.label}>
                  {ref === dateKey() ? (type === 'weeks' ? t('rotation.thisWeekIs') : t('rotation.todayIs')) : t('rotation.dayIs', { day: formatDue(ref) })}
                </Text>
                <View style={styles.row}>
                  {Array.from({ length }, (_, i) => {
                    const on = todayIndex === i;
                    return (
                      <Pressable key={i} onPress={() => setTodayIndex(i)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" aria-pressed={!!on} accessibilityState={{ selected: on }} accessibilityLabel={t('rotation.todayA11y', { name: slotLabel(preview, i) })}>
                        <Text style={[styles.chipText, on && { color: colors.accent }]}>{slotLabel(preview, i)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.hint}>{t('rotation.bumpHint')}</Text>
              </>
            )}
          </ScrollView>

          <Pressable onPress={save} style={styles.save} accessibilityRole="button">
            <Ionicons name="checkmark-circle" size={20} color={colors.onAccent} />
            <Text style={styles.saveText}>{type === 'off' && rotation ? t('rotation.turnOff') : t('rotation.save')}</Text>
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
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  headIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violet },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 18, marginBottom: 10 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hint: { fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 17 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.bg, borderWidth: 1.5, borderColor: 'transparent' },
  chipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { fontWeight: '700', color: colors.muted, fontSize: 14 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  stepBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  stepVal: { minWidth: 24, textAlign: 'center', fontWeight: '800', color: colors.ink, fontSize: 15 },
  cycle: { fontSize: 13, fontWeight: '700', color: colors.violet },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayDot: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  dayDotOn: { backgroundColor: colors.violet, borderColor: colors.violet },
  dayDotText: { fontWeight: '800', color: colors.muted },
  save: { marginTop: 18, borderRadius: radius.md, height: 52, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violet },
  saveText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
}));
