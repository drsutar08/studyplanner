import React, { useMemo, useState } from 'react';
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
import TimeField from './TimeField';
import StepList from './StepList';
import { stepProgress } from '../subtasks';
import AttachmentList from './AttachmentList';
import { onlyClasses } from '../classes';
import { dateKey, addDays, formatDue, formatTime, formatDate, daysBetween, dayLetters } from '../dates';

const ESTIMATES = [15, 30, 45, 60, 90];
const DAYS_AHEAD = 14;
// Priority and repeat ids are stored values; their labels are looked up at render time.
const PRIORITIES = [
  { id: 'low', color: '#17A398', icon: 'arrow-down' },
  { id: 'med', color: '#F2A541', icon: 'remove' },
  { id: 'high', color: '#D6336C', icon: 'arrow-up' },
];
const REPEAT_MODES = ['none', 'daily', 'weekdays', 'custom'];

const parts = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    wk: formatDate(dt, { weekday: 'short' }),
    day: d,
    mon: formatDate(dt, { month: 'short' }),
  };
};

// `editing` = a repeating task template, `editTask` = one ordinary task. Both reuse the same sheet.
// `homework` ({ classId, classTitle, subjectId, due }) opens it for a class: its subject is picked and the task is due
// at the class's next session (`due` null when the class doesn't meet again).
// `classes` lets a task be linked to a class (it then shows under that class as its homework).
// `exams` lets a task be linked to an upcoming exam (it then counts in that exam's prep progress).
export default function AddTaskSheet({ visible, onClose, subjects, classes: allClasses = [], exams: allExams = [], onSave, defaultDue, editing, editTask, homework }) {
  const classes = useMemo(() => onlyClasses(allClasses), [allClasses]); // homework belongs to classes, not activities
  const [examId, setExamId] = useState(null); // exam link, optional
  const [startOff, setStartOff] = useState(0); // first day shown in the date strip (negative for overdue tasks)
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState(null);
  const [offset, setOffset] = useState(0);
  const [estimate, setEstimate] = useState(30);
  const [priority, setPriority] = useState('med');
  const [repeatMode, setRepeatMode] = useState('none'); // none | daily | weekdays | custom
  const [repeatDays, setRepeatDays] = useState([]);
  const [time, setTime] = useState(null); // optional 'HH:MM'
  const [notes, setNotes] = useState('');
  const [classId, setClassId] = useState(null); // homework link, optional
  const [steps, setSteps] = useState([]); // subtasks
  const [attachments, setAttachments] = useState([]); // links and photos

  // Reset each time the sheet opens (or prefill when editing a repeating task)
  // Fill the fields each time the sheet opens. This happens while rendering, as `visible` turns true (not
  // in an effect), so the sheet never shows the previous values for a frame.
  const [openFor, setOpenFor] = useState(false);
  if (visible !== openFor) {
    setOpenFor(visible);
    if (visible) prefill();
  }
  function prefill() {
    if (editing) {
      setTitle(editing.title);
      setSubjectId(editing.subjectId ?? null);
      setOffset(0);
      setEstimate(editing.estimate);
      setPriority(editing.priority || 'med');
      setTime(editing.time || null);
      setNotes(editing.notes || '');
      setClassId(editing.classId || null);
      setExamId(null);
      setSteps(editing.subtasks || []);
      setAttachments([]);
      const d =[...editing.days].sort();
      if (d.length === 7) setRepeatMode('daily');
      else if (d.length === 5 && [1, 2, 3, 4, 5].every((x) => d.includes(x))) setRepeatMode('weekdays');
      else setRepeatMode('custom');
      setRepeatDays(d);
      return;
    }
    if (editTask) {
      const off = daysBetween(dateKey(), editTask.due);
      setTitle(editTask.title);
      setSubjectId(editTask.subjectId ?? null);
      setStartOff(Math.min(0, off));
      setOffset(off);
      setEstimate(editTask.estimate);
      setPriority(editTask.priority || 'med');
      setTime(editTask.time || null);
      setNotes(editTask.notes || '');
      setClassId(editTask.classId || null);
      setExamId(editTask.examId || editTask.prepFor || null);
      setSteps(editTask.subtasks || []);
      setAttachments(editTask.attachments || []);
      setRepeatMode('none');
      setRepeatDays([]);
      return;
    }
    setStartOff(0);
    setTitle('');
    const presetSubject = homework && subjects.some((x) => x.id === homework.subjectId) ? homework.subjectId : null;
    setSubjectId(presetSubject || (subjects[0] ? subjects[0].id : null));
    const presetDue = (homework && homework.due) || defaultDue;
    const off = presetDue ? Math.max(0, daysBetween(dateKey(), presetDue)) : 0;
    setOffset(off);
    setRepeatMode('none');
    setRepeatDays([]);
    setEstimate(30);
    setPriority('med');
    setTime(null);
    setNotes('');
    setClassId((homework && homework.classId) || null);
    setExamId(null);
    setSteps([]);
    setAttachments([]);
  }

  const today = dateKey();
  const endOff = Math.max(startOff + DAYS_AHEAD, offset + 1);
  const days = useMemo(
    () => Array.from({ length: endOff - startOff }, (_, i) => ({ off: startOff + i, key: addDays(today, startOff + i) })),
    [today, startOff, endOff]
  );
  const due = addDays(today, offset);
  const subject = subjects.find((s) => s.id === subjectId);
  const accent = subject ? subject.color : colors.accent;
  const canSave = title.trim().length > 0 && !(repeatMode === 'custom' && repeatDays.length === 0);
  // a repeating task makes a new copy each time; attachments go on single tasks (and on one copy, when editing it)
  const canAttach = !editing && (!!editTask || repeatMode === 'none');
  // exams still to come (and the one this task is already linked to), this subject's first; not for repeating tasks
  const examChoices = useMemo(() => {
    if (editing || repeatMode !== 'none') return [];
    return allExams
      .filter((e) => e.date >= today || e.id === examId)
      .sort((a, b) => (b.subjectId === subjectId) - (a.subjectId === subjectId) || a.date.localeCompare(b.date));
  }, [allExams, today, examId, subjectId, editing, repeatMode]);
  const linkedExam = examChoices.some((e) => e.id === examId) ? examId : null;
  const toggleDay = (d) => setRepeatDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  const save = () => {
    if (!canSave) return;
    const repeat =
      repeatMode === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : repeatMode === 'weekdays' ? [1, 2, 3, 4, 5] : repeatMode === 'custom' ? repeatDays : null;
    if (repeatMode === 'custom' && repeatDays.length === 0) return;
    onSave({
      title: title.trim(),
      subjectId,
      due,
      time,
      notes: notes.trim(),
      estimate,
      priority,
      repeat: editTask ? null : repeat,
      classId: classes.some((c) => c.id === classId) ? classId : null,
      ...(editing ? {} : { examId: linkedExam }),
      // steps renamed to nothing are dropped
      subtasks: steps.map((x) => ({ ...x, title: x.title.trim() })).filter((x) => x.title),
      ...(canAttach ? { attachments } : {}),
    });
    onClose();
  };
  const bumpEstimate = (d) => setEstimate((e) => Math.min(240, Math.max(5, e + d)));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />

          <View style={styles.head}>
            <View style={[styles.headIcon, { backgroundColor: solid(accent) }]}>
              <Ionicons name={editing || editTask ? 'create' : 'add'} size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{editing ? t('taskSheet.editRepeating') : editTask ? t('taskSheet.editTask') : homework ? t('homework.sheetTitle') : t('taskSheet.newTask')}</Text>
              <Text style={styles.headSub} numberOfLines={2}>
                {editing
                  ? t('taskSheet.editRepeatingSub')
                  : editTask
                    ? t('taskSheet.editTaskSub')
                    : homework
                      ? homework.due
                        ? t('homework.sheetSub', { title: homework.classTitle, day: formatDue(homework.due) })
                        : t('homework.sheetSubNoNext', { title: homework.classTitle })
                      : t('taskSheet.newTaskSub')}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }}>
            <View style={styles.inputBox}>
              <Ionicons name="create-outline" size={20} color={colors.muted} />
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={t('taskSheet.titlePlaceholder')}
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoFocus
                maxLength={90}
                returnKeyType="done"
                onSubmitEditing={save}
              />
              {title.length > 0 && <Text style={styles.count}>{title.length}/90</Text>}
            </View>

            <Text style={styles.label}>{t('taskSheet.subject')}</Text>
            {subjects.length === 0 ? (
              <Text style={styles.hint}>{t('taskSheet.noSubjects')}</Text>
            ) : (
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
            )}

            {classes.length > 0 && (
              <>
                <Text style={styles.label}>
                  {t('homework.classLabel')} <Text style={styles.optional}>{t('common.optional')}</Text>
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {[null, ...[...classes].sort((a, b) => (b.subjectId === subjectId) - (a.subjectId === subjectId) || a.title.localeCompare(b.title))].map((c) => {
                    const on = (c ? c.id : null) === (classes.some((x) => x.id === classId) ? classId : null);
                    return (
                      <Pressable
                        key={c ? c.id : 'none'}
                        onPress={() => {
                          setClassId(c ? c.id : null);
                          if (c && c.subjectId && subjects.some((x) => x.id === c.subjectId)) setSubjectId(c.subjectId);
                        }}
                        style={[styles.subj, on && styles.classOn]}
                        accessibilityRole="button"
                        aria-pressed={!!on} accessibilityState={{ selected: on }}
                        accessibilityLabel={c ? t('homework.classA11y', { title: c.title }) : t('homework.noClassA11y')}
                      >
                        <Ionicons name={c ? 'easel-outline' : 'remove-circle-outline'} size={13} color={on ? colors.accent : colors.muted} />
                        <Text style={[styles.subjText, on && { color: colors.accent }]} numberOfLines={1}>{c ? c.title : t('homework.noClass')}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {examChoices.length > 0 && (
              <>
                <Text style={styles.label}>
                  {t('taskSheet.examLabel')} <Text style={styles.optional}>{t('common.optional')}</Text>
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {[null, ...examChoices].map((e) => {
                    const on = (e ? e.id : null) === linkedExam;
                    return (
                      <Pressable
                        key={e ? e.id : 'none'}
                        onPress={() => {
                          setExamId(e ? e.id : null);
                          if (e && e.subjectId && subjects.some((x) => x.id === e.subjectId)) setSubjectId(e.subjectId);
                        }}
                        style={[styles.subj, styles.examChip, on && styles.classOn]}
                        accessibilityRole="button"
                        aria-pressed={!!on} accessibilityState={{ selected: on }}
                        accessibilityLabel={e ? t('taskSheet.examA11y', { title: e.title }) : t('taskSheet.noExamA11y')}
                      >
                        <Ionicons name={e ? 'flag-outline' : 'remove-circle-outline'} size={13} color={on ? colors.accent : colors.muted} />
                        <Text style={[styles.subjText, on && { color: colors.accent }]} numberOfLines={1}>
                          {e ? `${e.title} · ${formatDue(e.date)}` : t('taskSheet.noExam')}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {!editing && (
            <>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{t('taskSheet.dueDate')}</Text>
              <Text style={[styles.labelValue, { color: readable(accent) }]}>{formatDue(due)}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {days.map(({ key: k, off }) => {
                const p = parts(k);
                const on = offset === off;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setOffset(off)}
                    style={[styles.day, on && { backgroundColor: solid(accent), borderColor: solid(accent) }]}
                  >
                    <Text style={[styles.dayWk, on && styles.dayOn]}>{off === 0 ? t('common.today') : p.wk}</Text>
                    <Text style={[styles.dayNum, on && styles.dayOn]}>{p.day}</Text>
                    <Text style={[styles.dayMon, on && styles.dayOn]}>{p.mon}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            </>
            )}

            <Text style={styles.label}>
              {t('taskSheet.time')} <Text style={styles.optional}>{t('common.optional')}</Text>
            </Text>
            <TimeField value={time} onChange={setTime} accent={accent} />

            <Text style={styles.label}>{t('taskSheet.priority')}</Text>
            <View style={styles.row}>
              {PRIORITIES.map((p) => {
                const on = priority === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setPriority(p.id)}
                    style={[styles.prio, on && { backgroundColor: p.color + '1F', borderColor: p.color }]}
                  >
                    <Ionicons name={p.icon} size={14} color={on ? p.color : colors.muted} />
                    <Text style={[styles.prioText, on && { color: readable(p.color) }]}>{t(`taskSheet.priorities.${p.id}`)}</Text>
                  </Pressable>
                );
              })}
            </View>

            {!editTask && (
            <>
            <Text style={styles.label}>{t('taskSheet.repeat')}</Text>
            <View style={styles.row}>
              {REPEAT_MODES.filter((id) => !editing || id !== "none").map((id) => {
                const on = repeatMode === id;
                return (
                  <Pressable key={id} onPress={() => setRepeatMode(id)} style={[styles.est, on && styles.estOn]}>
                    <Text style={[styles.estText, on && { color: colors.accent }]}>{t(`taskSheet.repeatModes.${id}`)}</Text>
                  </Pressable>
                );
              })}
            </View>
            {repeatMode === "custom" && (
              <View style={styles.dayRow}>
                {dayLetters().map((l, d) => {
                  const on = repeatDays.includes(d);
                  return (
                    <Pressable key={d} onPress={() => toggleDay(d)} accessibilityLabel={t('taskSheet.repeatDayA11y', { day: d })} style={[styles.dayDot, on && { backgroundColor: solid(accent), borderColor: solid(accent) }]}>
                      <Text style={[styles.dayDotText, on && { color: colors.onAccent }]}>{l}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {repeatMode !== "none" && (
              <Text style={styles.repeatNote}>
                {repeatMode === "custom" && repeatDays.length === 0 ? t('taskSheet.pickOneDay') : editing ? t('taskSheet.repeatEditNote') : t(`taskSheet.repeatStarts.${repeatMode}`, { date: formatDue(due) })}
              </Text>
            )}
            </>
            )}

            <View style={styles.labelRow}>
              <Text style={styles.label}>{t('taskSheet.timeNeeded')}</Text>
              <View style={styles.stepper}>
                <Pressable onPress={() => bumpEstimate(-5)} hitSlop={6} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel={t('taskSheet.decreaseA11y')}>
                  <Ionicons name="remove" size={16} color={colors.accent} />
                </Pressable>
                <Text style={styles.stepVal}>{t('common.minutes', { count: estimate })}</Text>
                <Pressable onPress={() => bumpEstimate(5)} hitSlop={6} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel={t('taskSheet.increaseA11y')}>
                  <Ionicons name="add" size={16} color={colors.accent} />
                </Pressable>
              </View>
            </View>
            <View style={styles.row}>
              {ESTIMATES.map((m) => {
                const on = estimate === m;
                return (
                  <Pressable key={m} onPress={() => setEstimate(m)} style={[styles.est, on && styles.estOn]}>
                    <Text style={[styles.estText, on && { color: colors.accent }]}>{t('taskSheet.minutesShort', { count: m })}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.labelRow}>
              <Text style={styles.label}>
                {t('steps.label')} <Text style={styles.optional}>{t('common.optional')}</Text>
              </Text>
              {steps.length > 0 ? (
                <Text style={[styles.labelValue, { color: readable(accent) }]}>{t('steps.progress', { done: stepProgress(steps).done, count: steps.length })}</Text>
              ) : null}
            </View>
            <View style={styles.stepsBox}>
              <StepList steps={steps} editable onChange={setSteps} tint={accent} />
            </View>

            <Text style={styles.label}>
              {t('taskSheet.details')} <Text style={styles.optional}>{t('common.optional')}</Text>
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t('taskSheet.notesPlaceholder')}
              placeholderTextColor={colors.muted}
              style={styles.notes}
              multiline
              maxLength={500}
              textAlignVertical="top"
              accessibilityLabel={t('taskSheet.detailsA11y')}
            />

            {canAttach ? (
              <>
                <Text style={styles.label}>
                  {t('attachments.label')} <Text style={styles.optional}>{t('common.optional')}</Text>
                </Text>
                <AttachmentList list={attachments} onChange={setAttachments} editable tint={accent} />
              </>
            ) : null}
          </ScrollView>

          <Pressable
            onPress={save}
            disabled={!canSave}
            style={[styles.save, { backgroundColor: solid(accent) }, !canSave && { opacity: 0.4 }]}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.saveText}>{editing || editTask ? t('common.saveChanges') : t('taskSheet.addTask')}</Text>
          </Pressable>
          <Text style={styles.summary} numberOfLines={1}>
            {canSave ? [subject && subject.name, !editing && formatDue(due), time && formatTime(time), t('common.minutes', { count: estimate })].filter(Boolean).join(' · ') : t('taskSheet.enterTitle')}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.scrim },
  dismiss: { flex: 1, alignSelf: 'stretch' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: 14, height: 54 },
  input: { flex: 1, fontSize: 16, color: colors.ink, paddingVertical: 0, ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }) },
  count: { fontSize: 11, color: colors.muted },
  label: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 20, marginBottom: 10 },
  optional: { fontSize: 11, fontWeight: '600', color: colors.muted },
  stepsBox: { backgroundColor: colors.bg, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
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
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelValue: { fontSize: 13, fontWeight: '800', marginTop: 10 },
  hint: { fontSize: 13, color: colors.muted },
  subj: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, marginRight: 8, maxWidth: 200 },
  examChip: { maxWidth: 300 }, // room for the title and the date
  classOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  subjDot: { width: 9, height: 9, borderRadius: 5 },
  subjText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  day: { width: 62, alignItems: 'center', paddingVertical: 10, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, marginRight: 8, backgroundColor: colors.surface },
  dayWk: { fontSize: 11, fontWeight: '700', color: colors.muted },
  dayNum: { fontSize: 20, fontWeight: '800', color: colors.ink, marginVertical: 1 },
  dayMon: { fontSize: 11, color: colors.muted },
  dayOn: { color: colors.onAccent },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  prio: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line },
  prioText: { fontSize: 14, fontWeight: '700', color: colors.muted },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  stepBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  stepVal: { minWidth: 58, textAlign: 'center', fontWeight: '800', color: colors.ink, fontSize: 13 },
  est: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.bg, borderWidth: 1.5, borderColor: 'transparent' },
  estOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  estText: { fontWeight: '700', color: colors.muted, fontSize: 14 },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  dayDot: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  dayDotText: { fontWeight: '800', color: colors.muted },
  repeatNote: { fontSize: 12, color: colors.muted, marginTop: 10 },
  save: { marginTop: 18, borderRadius: radius.md, height: 52, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
  summary: { textAlign: 'center', fontSize: 12, color: colors.muted, marginTop: 10 },
}));
