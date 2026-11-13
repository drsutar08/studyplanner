import React, { useRef, useState } from 'react';
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
import { colors, radius, themedStyles, readable, solid } from '../theme';
import { t } from '../i18n';
import { addDays, dateKey, monthOf, formatDue, formatTime, countdownLabel } from '../dates';
import MonthGrid from './MonthGrid';
import TimeField from './TimeField';
import { validateResult, letterOf } from '../grades';

const WEIGHTS = [1, 2, 3];
const toNumber = (text) => Number(String(text).trim().replace(',', '.'));

// Saved on the exam in English (kind: 'Midterm'); only the label is translated.
export const EXAM_KINDS = ['Exam', 'Midterm', 'Final', 'Quiz', 'Test', 'Practical', 'Oral'];
export const examKindLabel = (kind) => (EXAM_KINDS.includes(kind) ? t(`exam.kinds.${kind}`) : kind);
const DURATIONS = [30, 45, 60, 90, 120, 180];
const DEFAULT_DURATION = 60;

export const formatDuration = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? t('examSheet.durationHM', { h, m }) : h ? t('examSheet.durationH', { h }) : t('examSheet.durationM', { m });
};

// 'HH:MM' + minutes -> 'HH:MM' (wraps past midnight)
export const endTime = (hhmm, minutes) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (h * 60 + m + minutes) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

// One-line "9:00 AM – 10:00 AM · Hall B, Seat 42" summary for lists ('' when nothing is set).
export const examWhenWhere = (exam) => {
  const when = exam.time ? t('calendar.range', { start: formatTime(exam.time), end: formatTime(endTime(exam.time, exam.duration || 60)) }) : '';
  const where = exam.mode === 'online' ? t('sheet.online') : [exam.building, exam.room].filter(Boolean).join(', ');
  return [when, where].filter(Boolean).join(' · ');
};

// focus="result" opens the sheet scrolled to Result with the cursor in Score (used by "Add score" on Progress)
export default function AddExamSheet({ visible, onClose, subjects, onSave, defaultDate, editing, focus }) {
  const scrollRef = useRef(null);
  const scoreRef = useRef(null);
  const [jumpToResult, setJumpToResult] = useState(false); // set on open, used once the Result group has been laid out
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState(null);
  const [kind, setKind] = useState('Exam');
  const [date, setDate] = useState(addDays(dateKey(), 14));
  const [month, setMonth] = useState(monthOf(addDays(dateKey(), 14)));
  const [time, setTime] = useState(null);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [mode, setMode] = useState('inPerson'); // inPerson | online
  const [building, setBuilding] = useState('');
  const [room, setRoom] = useState('');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  // result (grades); typed as text so a half-typed "8," is fine
  const [score, setScore] = useState('');
  const [outOf, setOutOf] = useState('100');
  const [weight, setWeight] = useState(1);

  // Fill the fields each time the sheet opens. This happens while rendering, as `visible` turns true (not
  // in an effect), so the sheet never shows the previous values for a frame.
  const [openFor, setOpenFor] = useState(false);
  if (visible !== openFor) {
    setOpenFor(visible);
    if (visible) prefill();
  }
  function prefill() {
    setJumpToResult(focus === 'result');
    if (editing) {
      setTitle(editing.title);
      setSubjectId(editing.subjectId ?? null);
      setKind(editing.kind || 'Exam');
      setDate(editing.date);
      setMonth(monthOf(editing.date));
      setTime(editing.time || null);
      setDuration(editing.duration || DEFAULT_DURATION);
      setMode(editing.mode === 'online' ? 'online' : 'inPerson');
      setBuilding(editing.building || '');
      setRoom(editing.room || '');
      setLink(editing.link || '');
      setNotes(editing.notes || '');
      setScore(typeof editing.score === 'number' ? String(editing.score) : '');
      setOutOf(String(editing.outOf || 100));
      setWeight(editing.weight || 1);
      return;
    }
    const d = defaultDate && defaultDate >= dateKey() ? defaultDate : addDays(dateKey(), 14);
    setTitle('');
    setSubjectId(subjects[0] ? subjects[0].id : null);
    setKind('Exam');
    setDate(d);
    setMonth(monthOf(d));
    setTime(null);
    setDuration(DEFAULT_DURATION);
    setMode('inPerson');
    setBuilding('');
    setRoom('');
    setLink('');
    setNotes('');
    setScore('');
    setOutOf('100');
    setWeight(1);
  }

  const subject = subjects.find((s) => s.id === subjectId);
  const accent = subject ? subject.color : colors.danger;
  const resultError = validateResult(score, outOf);
  const missing = !title.trim() ? t('examSheet.errors.name') : !time ? t('examSheet.errors.time') : resultError ? t(resultError) : null;
  const graded = score.trim() !== '' && !resultError;
  const pct = graded ? (toNumber(score) / (toNumber(outOf || '100') || 100)) * 100 : null;
  const canSave = !missing;
  const bumpDuration = (d) => setDuration((v) => Math.min(360, Math.max(15, v + d)));

  const save = () => {
    if (!canSave) return;
    const online = mode === 'online';
    onSave({
      title: title.trim(),
      subjectId,
      kind,
      date,
      time,
      duration,
      mode,
      building: online ? '' : building.trim(),
      room: online ? '' : room.trim(),
      link: online ? link.trim() : '',
      notes: notes.trim(),
      ...(graded ? { score: toNumber(score), outOf: toNumber(outOf || '100') || 100, weight } : {}),
    });
    onClose();
  };

  const field = (value, onChange, placeholder, extra = {}) => (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      style={styles.field}
      {...extra}
    />
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={[styles.headIcon, { backgroundColor: solid(accent) }]}>
              <Ionicons name={editing ? 'create' : 'flag'} size={20} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{editing ? t('examSheet.editTitle') : t('examSheet.newTitle')}</Text>
              <Text style={styles.headSub}>{editing ? t('examSheet.editSub') : t('examSheet.newSub')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }}>
            <View style={styles.inputBox}>
              <Ionicons name="school-outline" size={20} color={colors.muted} />
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={t('examSheet.namePlaceholder')}
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoFocus
                maxLength={70}
                returnKeyType="done"
                onSubmitEditing={save}
              />
            </View>

            {subjects.length > 0 && (
              <>
                <Text style={styles.label}>{t('sheet.subject')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {subjects.map((s) => {
                    const on = subjectId === s.id;
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => setSubjectId(on ? null : s.id)}
                        style={[styles.subj, on && { backgroundColor: solid(s.color), borderColor: solid(s.color) }]}
                      >
                        <View style={[styles.subjDot, { backgroundColor: on ? colors.onAccent : s.color }]} />
                        <Text style={[styles.subjText, on && { color: colors.onAccent }]} numberOfLines={1}>{s.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}

            <Text style={styles.label}>{t('examSheet.type')}</Text>
            <View style={styles.row}>
              {EXAM_KINDS.map((k) => {
                const on = kind === k;
                return (
                  <Pressable key={k} onPress={() => setKind(k)} style={[styles.chip, on && styles.chipOn]}>
                    <Text style={[styles.chipText, on && { color: colors.accent }]}>{examKindLabel(k)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.group}>
              <Text style={styles.groupTitle}>{t('sheet.when')}</Text>
              <View style={styles.labelRow}>
                <Text style={styles.label}>{t('sheet.date')}</Text>
                <Text style={[styles.labelValue, { color: readable(accent) }]}>
                  {formatDue(date)} · {countdownLabel(date)}
                </Text>
              </View>
              <View style={styles.cal}>
                <MonthGrid month={month} onMonthChange={setMonth} selected={date} onSelect={setDate} minKey={editing ? undefined : dateKey()} />
              </View>

              <Text style={styles.label}>
                {t('examSheet.startTime')} <Text style={styles.required}>*</Text>
              </Text>
              <TimeField value={time} onChange={setTime} accent={accent} background={colors.surface} />

              <View style={styles.labelRow}>
                <Text style={styles.label}>{t('examSheet.duration')}</Text>
                <View style={styles.stepper}>
                  <Pressable onPress={() => bumpDuration(-15)} hitSlop={6} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel={t('examSheet.shorter')}>
                    <Ionicons name="remove" size={16} color={colors.accent} />
                  </Pressable>
                  <Text style={styles.stepVal}>{formatDuration(duration)}</Text>
                  <Pressable onPress={() => bumpDuration(15)} hitSlop={6} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel={t('examSheet.longer')}>
                    <Ionicons name="add" size={16} color={colors.accent} />
                  </Pressable>
                </View>
              </View>
              <View style={styles.row}>
                {DURATIONS.map((m) => {
                  const on = duration === m;
                  return (
                    <Pressable key={m} onPress={() => setDuration(m)} style={[styles.chip, styles.chipLight, on && styles.chipOn]}>
                      <Text style={[styles.chipText, on && { color: colors.accent }]}>{formatDuration(m)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.hintRow}>
                <Ionicons name="time-outline" size={13} color={colors.muted} />
                <Text style={styles.hint}>
                  {time ? t('calendar.range', { start: formatTime(time), end: formatTime(endTime(time, duration)) }) : t('examSheet.pickTimeHint')}
                </Text>
              </View>
            </View>

            <View style={styles.group}>
              <Text style={styles.groupTitle}>{t('sheet.where')}</Text>
              <View style={[styles.row, { marginTop: 10 }]}>
                {[
                  ['inPerson', 'sheet.inPerson'],
                  ['online', 'sheet.online'],
                ].map(([id, labelKey]) => {
                  const on = mode === id;
                  return (
                    <Pressable key={id} onPress={() => setMode(id)} style={[styles.chip, styles.chipLight, on && styles.chipOn]}>
                      <Text style={[styles.chipText, on && { color: colors.accent }]}>{t(labelKey)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {mode === 'inPerson' ? (
                <View style={styles.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>
                      {t('examSheet.building')} <Text style={styles.optional}>{t('common.optional')}</Text>
                    </Text>
                    {field(building, setBuilding, t('examSheet.buildingPlaceholder'), { maxLength: 60, accessibilityLabel: t('examSheet.buildingA11y') })}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>
                      {t('examSheet.room')} <Text style={styles.optional}>{t('common.optional')}</Text>
                    </Text>
                    {field(room, setRoom, t('examSheet.roomPlaceholder'), { maxLength: 40, accessibilityLabel: t('examSheet.roomA11y') })}
                  </View>
                </View>
              ) : (
                <>
                  <Text style={styles.label}>
                    {t('sheet.linkOrPlatform')} <Text style={styles.optional}>{t('common.optional')}</Text>
                  </Text>
                  {field(link, setLink, t('examSheet.linkPlaceholder'), {
                    maxLength: 200,
                    autoCapitalize: 'none',
                    keyboardType: 'url',
                    accessibilityLabel: t('examSheet.linkA11y'),
                  })}
                </>
              )}
            </View>

            <View
              style={styles.group}
              onLayout={(ev) => {
                if (!jumpToResult) return;
                setJumpToResult(false);
                const y = ev.nativeEvent.layout.y;
                setTimeout(() => {
                  scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
                  scoreRef.current?.focus();
                }, 50);
              }}
            >
              <View style={styles.resultHead}>
                <Text style={styles.groupTitle}>{t('grades.resultTitle')}</Text>
                {pct !== null ? (
                  <Text style={styles.resultPct}>{t('grades.preview', { pct: Math.round(pct), letter: letterOf(pct) })}</Text>
                ) : (
                  <Text style={styles.optional}>{t('common.optional')}</Text>
                )}
              </View>
              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('grades.score')}</Text>
                  {field(score, setScore, t('grades.scorePlaceholder'), { ref: scoreRef, keyboardType: 'decimal-pad', maxLength: 7, accessibilityLabel: t('grades.scoreA11y') })}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('grades.outOf')}</Text>
                  {field(outOf, setOutOf, '100', { keyboardType: 'decimal-pad', maxLength: 7, accessibilityLabel: t('grades.outOfA11y') })}
                </View>
              </View>
              <Text style={styles.label}>{t('grades.weight')}</Text>
              <View style={styles.row}>
                {WEIGHTS.map((w) => {
                  const on = weight === w;
                  return (
                    <Pressable
                      key={w}
                      onPress={() => setWeight(w)}
                      style={[styles.chip, styles.chipLight, on && styles.chipOn]}
                      accessibilityRole="button"
                      aria-pressed={!!on} accessibilityState={{ selected: on }}
                      accessibilityLabel={t('grades.weightA11y', { n: w })}
                    >
                      <Text style={[styles.chipText, on && { color: colors.accent }]}>{t('grades.weightChip', { n: w })}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.hint, { marginTop: 10 }]}>{t('grades.resultHint')}</Text>
            </View>

            <Text style={styles.label}>
              {t('sheet.notes')} <Text style={styles.optional}>{t('common.optional')}</Text>
            </Text>
            {field(notes, setNotes, t('examSheet.notesPlaceholder'), {
              multiline: true,
              maxLength: 500,
              textAlignVertical: 'top',
              style: [styles.field, styles.notes],
              accessibilityLabel: t('examSheet.notesA11y'),
            })}
          </ScrollView>

          <Pressable onPress={save} disabled={!canSave} style={[styles.save, { backgroundColor: solid(accent) }, !canSave && { opacity: 0.4 }]}>
            <Ionicons name="checkmark-circle" size={20} color={colors.onAccent} />
            <Text style={styles.saveText}>{editing ? t('common.saveChanges') : t('examSheet.add')}</Text>
          </Pressable>
          {missing && <Text style={styles.summary}>{missing}</Text>}
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
  label: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 20, marginBottom: 10 },
  optional: { fontSize: 11, fontWeight: '600', color: colors.muted },
  required: { color: colors.danger },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelValue: { fontSize: 13, fontWeight: '800', marginTop: 10 },
  subj: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, marginRight: 8, maxWidth: 200 },
  subjDot: { width: 9, height: 9, borderRadius: 5 },
  subjText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.bg, borderWidth: 1.5, borderColor: 'transparent' },
  chipLight: { backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { fontWeight: '700', color: colors.muted, fontSize: 14 },
  group: { marginTop: 20, backgroundColor: colors.bg, borderRadius: 18, padding: 14, paddingTop: 12 },
  groupTitle: { fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 1 },
  cal: { backgroundColor: colors.surface, borderRadius: 16, padding: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  stepBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  stepVal: { minWidth: 58, textAlign: 'center', fontWeight: '800', color: colors.ink, fontSize: 13 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  hint: { fontSize: 12, color: colors.muted },
  resultHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultPct: { fontSize: 13, fontWeight: '800', color: colors.accent },
  twoCol: { flexDirection: 'row', gap: 10 },
  field: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 15,
    color: colors.ink,
    ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }),
  },
  notes: { backgroundColor: colors.bg, height: undefined, minHeight: 96, paddingVertical: 12 },
  save: { marginTop: 18, borderRadius: radius.md, height: 52, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
  summary: { textAlign: 'center', fontSize: 12, color: colors.muted, marginTop: 10 },
}));
