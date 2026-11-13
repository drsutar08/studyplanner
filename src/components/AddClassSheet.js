import React, { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles } from '../theme';
import { t, weekdayName } from '../i18n';
import { dateKey, formatDue, formatTime, dayLetters } from '../dates';
import { addMinutes, describeDays, validateClass, validateTerm, ACTIVITY_CATEGORIES } from '../classes';
import { ACTIVITY_LOOK } from '../activityKinds';
import TimeField from './TimeField';
import { slotLabel, slotsLabel } from '../rotationLabels';
import DateField from './DateField';

// class messages that read differently for an activity
const ACTIVITY_ERRORS = ['classes.errors.name', 'classes.errors.endAfterStart', 'classes.errors.range'];

// [id, label key]: translated when drawn, so a language change shows up
const RANGES = [
  ['none', 'classSheet.rangeNone'],
  ['term', 'classSheet.rangeTerm'],
  ['manual', 'classSheet.rangeManual'],
];

// "Mon, Wed", "Weekdays" or "Every day" in the app language.
export const daysLabel = (days) => {
  const d = describeDays(days);
  return d.key ? t(d.key) : d.days.map((x) => weekdayName(x, 'short')).join(', ');
};

// "Day A, Day C" for a rotation class; "Mon, Wed · Week 1" for a weekly class limited to some weeks
const cycleLabel = (cls) =>
  cls.repeat === 'rotation' ? slotsLabel({ type: 'days' }, cls.rotationDays || []) : [daysLabel(cls.days), cls.rotationWeeks && cls.rotationWeeks.length ? slotsLabel({ type: 'weeks' }, cls.rotationWeeks) : null].filter(Boolean).join(' · ');

// "Mon, Wed · 9:00 AM – 10:30 AM" style summary for lists.
export const classWhen = (cls) => {
  const day = cls.repeat === 'once' ? formatDue(cls.date) : cycleLabel(cls);
  const time = cls.start
    ? cls.end
      ? t('calendar.range', {
          start: formatTime(cls.start),
          end: formatTime(cls.end),
        })
      : formatTime(cls.start)
    : '';
  return [day, time].filter(Boolean).join(' · ');
};

export const classWhere = (cls) => (cls.mode === 'online' ? t('sheet.online') : cls.location || '');

// Add or edit a class. `term` is the shared term ({ start, end } or null); onSave(cls, term) gets the
// class fields and, when the class follows the term, the term dates to keep.
// `rotation` (the rotating timetable, or null) adds a "Rotation" option (Day A / Day B classes) for a lettered-day
// cycle, and a "Weeks" choice for weekly classes in a week cycle.
// `activity` makes it the activity sheet (club, sport, work...): a category instead of a subject, no teacher.
// Editing an activity opens it that way too.
export default function AddClassSheet({ visible, onClose, subjects, onSave, defaultDate, editing, term, rotation = null, activity = false }) {
  const isAct = activity || (!!editing && editing.kind === 'activity');
  const [category, setCategory] = useState('club');
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState(null);
  const [teacher, setTeacher] = useState('');
  const [repeat, setRepeat] = useState('once');
  const [date, setDate] = useState(dateKey());
  const [days, setDays] = useState([]);
  const [rotationDays, setRotationDays] = useState([]);
  const [rotationWeeks, setRotationWeeks] = useState([]); // empty = every week
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [range, setRange] = useState('none');
  const [rangeStart, setRangeStart] = useState(null);
  const [rangeEnd, setRangeEnd] = useState(null);
  const [termStart, setTermStart] = useState(null);
  const [termEnd, setTermEnd] = useState(null);
  const [mode, setMode] = useState('inPerson');
  const [location, setLocation] = useState('');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');

  // Fill the fields each time the sheet opens. This happens while rendering, as `visible` turns true (not
  // in an effect), so the sheet never shows the previous values for a frame.
  const [openFor, setOpenFor] = useState(false);
  if (visible !== openFor) {
    setOpenFor(visible);
    if (visible) prefill();
  }
  function prefill() {
    const c = editing || {};
    const d = defaultDate || dateKey();
    setTitle(c.title || '');
    setSubjectId(isAct ? null : editing ? (c.subjectId ?? null) : subjects[0] ? subjects[0].id : null);
    setCategory(ACTIVITY_CATEGORIES.includes(c.category) ? c.category : 'club');
    setTeacher(c.teacher || '');
    setRepeat(c.repeat === 'weekly' || c.repeat === 'rotation' ? c.repeat : 'once');
    setRotationDays(c.rotationDays || [0]);
    setRotationWeeks(c.rotationWeeks || []);
    setDate(c.date || d);
    // A new repeating class starts on the weekday of the chosen date
    const [y, m, dd] = d.split('-').map(Number);
    setDays(c.days && c.days.length ? c.days : [new Date(y, m - 1, dd).getDay()]);
    setStart(c.start || null);
    setEnd(c.end || null);
    setRange(c.range || 'none');
    setRangeStart(c.rangeStart || null);
    setRangeEnd(c.rangeEnd || null);
    setTermStart(term ? term.start : null);
    setTermEnd(term ? term.end : null);
    setMode(c.mode === 'online' ? 'online' : 'inPerson');
    setLocation(c.location || '');
    setLink(c.link || '');
    setNotes(c.notes || '');
  }

  const subject = subjects.find((s) => s.id === subjectId);
  const look = isAct ? ACTIVITY_LOOK[category] : null;
  const accent = look ? look.color : subject ? subject.color : colors.accent;
  const weekly = repeat === 'weekly';
  const repeating = repeat !== 'once'; // weekly or rotation: both can follow the term or a date range
  const usesTerm = repeating && range === 'term';
  const dayCycle = rotation && rotation.type === 'days';
  const weekCycle = rotation && rotation.type === 'weeks';
  const showRotation = dayCycle || repeat === 'rotation';
  // letters to offer: the cycle's, or enough for a class saved under an earlier, longer cycle
  const letterCount = Math.max(dayCycle ? rotation.length : 0, ...rotationDays.map((x) => x + 1), 2);
  const draftTerm = termStart && termEnd ? { start: termStart, end: termEnd } : null;

  const cls = {
    title,
    subjectId,
    teacher,
    repeat,
    date,
    days,
    rotationDays: repeat === 'rotation' ? rotationDays : undefined,
    rotationWeeks: weekly && weekCycle ? rotationWeeks : undefined,
    start,
    end,
    range,
    rangeStart,
    rangeEnd,
    mode,
    location,
    link,
    notes,
    ...(isAct ? { kind: 'activity', category, subjectId: null } : {}),
  };
  // validateTerm / validateClass return translation keys
  const errorKey = (usesTerm && validateTerm(draftTerm) && 'classes.errors.term') || validateClass(cls, draftTerm);
  const error = errorKey ? t(isAct && ACTIVITY_ERRORS.includes(errorKey) ? errorKey.replace('classes.', 'activities.') : errorKey) : null;
  const canSave = !error;

  const toggleDay = (d) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  const toggleIn = (setter) => (i) => setter((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort()));
  // Picking a start time on an empty class fills in a one-hour slot (never past midnight)
  const pickStart = (t) => {
    setStart(t);
    if (t && (!end || end <= t)) setEnd(t >= '23:00' ? '23:59' : addMinutes(t, 60));
    if (!t) setEnd(null);
  };

  const save = () => {
    if (!canSave) return;
    onSave(
      {
        ...cls,
        title: title.trim(),
        teacher: teacher.trim(),
        location: location.trim(),
        link: link.trim(),
        notes: notes.trim(),
      },
      usesTerm ? draftTerm : null
    );
    onClose();
  };

  const field = (value, onChange, placeholder, extra = {}) => <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} style={styles.field} {...extra} />;

  const segment = (options, value, onChange, light) => (
    <View style={styles.row}>
      {options.map(([id, text]) => {
        const on = value === id;
        return (
          <Pressable key={id} onPress={() => onChange(id)} style={[styles.chip, light && styles.chipLight, styles.segment, on && styles.chipOn]} accessibilityRole="button" aria-pressed={!!on} accessibilityState={{ selected: on }}>
            <Text style={[styles.chipText, on && { color: colors.accent }]}>{t(text)}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={[styles.headIcon, { backgroundColor: accent }]}>
              <Ionicons name={editing ? 'create' : look ? look.icon : 'easel'} size={20} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{t(`${isAct ? 'activities.sheet' : 'classSheet'}.${editing ? 'editTitle' : 'newTitle'}`)}</Text>
              <Text style={styles.headSub}>{t(`${isAct ? 'activities.sheet' : 'classSheet'}.${editing ? 'editSub' : 'newSub'}`)}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }}>
            <View style={styles.inputBox}>
              <Ionicons name={look ? `${look.icon}-outline` : 'easel-outline'} size={20} color={colors.muted} />
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={t(isAct ? 'activities.sheet.namePlaceholder' : 'classSheet.namePlaceholder')}
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoFocus
                maxLength={70}
                returnKeyType="done"
                onSubmitEditing={save}
                accessibilityLabel={t(isAct ? 'activities.sheet.nameA11y' : 'classSheet.nameA11y')}
              />
            </View>

            {isAct && (
              <>
                <Text style={styles.label}>{t('activities.sheet.category')}</Text>
                <View style={[styles.row, { flexWrap: 'wrap', gap: 8 }]}>
                  {ACTIVITY_CATEGORIES.map((k) => {
                    const on = category === k;
                    const { icon, color } = ACTIVITY_LOOK[k];
                    return (
                      <Pressable
                        key={k}
                        onPress={() => setCategory(k)}
                        style={[styles.subj, { marginRight: 0 }, on && { backgroundColor: color, borderColor: color }]}
                        accessibilityRole="button"
                        aria-pressed={!!on} accessibilityState={{ selected: on }}
                        accessibilityLabel={t('activities.sheet.categoryA11y', {
                          name: t(`activities.categories.${k}`),
                        })}
                      >
                        <Ionicons name={icon} size={14} color={on ? colors.onAccent : color} />
                        <Text style={[styles.subjText, on && { color: colors.onAccent }]}>{t(`activities.categories.${k}`)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {!isAct && subjects.length > 0 && (
              <>
                <Text style={styles.label}>{t('sheet.subject')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {subjects.map((s) => {
                    const on = subjectId === s.id;
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => setSubjectId(on ? null : s.id)}
                        style={[
                          styles.subj,
                          on && {
                            backgroundColor: s.color,
                            borderColor: s.color,
                          },
                        ]}
                      >
                        <View style={[styles.subjDot, { backgroundColor: on ? colors.onAccent : s.color }]} />
                        <Text style={[styles.subjText, on && { color: colors.onAccent }]} numberOfLines={1}>
                          {s.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}

            <Text style={styles.label}>
              {t(isAct ? 'activities.sheet.with' : 'classSheet.teacher')} <Text style={styles.optional}>{t('common.optional')}</Text>
            </Text>
            {field(teacher, setTeacher, t(isAct ? 'activities.sheet.withPlaceholder' : 'classSheet.teacherPlaceholder'), {
              maxLength: 60,
              accessibilityLabel: t(isAct ? 'activities.sheet.with' : 'classSheet.teacher'),
              style: [styles.field, styles.fieldGrey],
            })}

            <View style={styles.group}>
              <Text style={styles.groupTitle}>{t('sheet.when')}</Text>
              <View style={{ marginTop: 10 }}>{segment([['once', 'classSheet.once'], ['weekly', 'classSheet.repeating'], ...(showRotation ? [['rotation', 'rotation.classOption']] : [])], repeat, setRepeat, true)}</View>

              {repeat === 'rotation' ? (
                <>
                  <Text style={styles.label}>
                    {t('rotation.classDays')} <Text style={styles.required}>*</Text>
                  </Text>
                  <View style={styles.row}>
                    {Array.from({ length: letterCount }, (_, i) => {
                      const on = rotationDays.includes(i);
                      return (
                        <Pressable
                          key={i}
                          onPress={() => toggleIn(setRotationDays)(i)}
                          style={[
                            styles.chip,
                            styles.chipLight,
                            on && {
                              backgroundColor: accent,
                              borderColor: accent,
                            },
                          ]}
                          accessibilityRole="checkbox"
                          aria-checked={!!on}
                          accessibilityState={{ checked: on }}
                          accessibilityLabel={t('rotation.classDayA11y', {
                            name: slotLabel({ type: 'days' }, i),
                          })}
                        >
                          <Text style={[styles.chipText, on && { color: colors.onAccent }]}>{slotLabel({ type: 'days' }, i)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {!dayCycle ? <Text style={styles.hint}>{t('rotation.classNeedsRotation')}</Text> : null}
                </>
              ) : weekly ? (
                <>
                  <Text style={styles.label}>
                    {t('classSheet.days')} <Text style={styles.required}>*</Text>
                  </Text>
                  <View style={styles.dayRow}>
                    {dayLetters().map((l, d) => {
                      const on = days.includes(d);
                      return (
                        <Pressable
                          key={d}
                          onPress={() => toggleDay(d)}
                          accessibilityLabel={t('classSheet.dayA11y', {
                            day: d,
                          })}
                          accessibilityRole="button" aria-pressed={!!on} accessibilityState={{ selected: on }}
                          style={[
                            styles.dayDot,
                            on && {
                              backgroundColor: accent,
                              borderColor: accent,
                            },
                          ]}
                        >
                          <Text style={[styles.dayDotText, on && { color: colors.onAccent }]}>{l}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {weekCycle ? (
                    <>
                      <Text style={styles.label}>{t('rotation.classWeeks')}</Text>
                      <View style={styles.row}>
                        <Pressable
                          onPress={() => setRotationWeeks([])}
                          style={[styles.chip, styles.chipLight, rotationWeeks.length === 0 && styles.chipOn]}
                          accessibilityRole="button"
                          aria-pressed={!!(rotationWeeks.length === 0)} accessibilityState={{
                            selected: rotationWeeks.length === 0,
                          }}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              rotationWeeks.length === 0 && {
                                color: colors.accent,
                              },
                            ]}
                          >
                            {t('rotation.everyWeek')}
                          </Text>
                        </Pressable>
                        {Array.from({ length: rotation.length }, (_, i) => {
                          const on = rotationWeeks.includes(i);
                          return (
                            <Pressable
                              key={i}
                              onPress={() => toggleIn(setRotationWeeks)(i)}
                              style={[styles.chip, styles.chipLight, on && styles.chipOn]}
                              accessibilityRole="checkbox"
                              aria-checked={!!on}
                              accessibilityState={{ checked: on }}
                              accessibilityLabel={t('rotation.classDayA11y', {
                                name: slotLabel(rotation, i),
                              })}
                            >
                              <Text style={[styles.chipText, on && { color: colors.accent }]}>{slotLabel(rotation, i)}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={styles.label}>
                    {t('sheet.date')} <Text style={styles.required}>*</Text>
                  </Text>
                  <DateField value={date} onChange={setDate} accent={accent} background={colors.surface} label={t('classSheet.dateA11y')} />
                </>
              )}

              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('sheet.start')}</Text>
                  <TimeField value={start} onChange={pickStart} accent={accent} background={colors.surface} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('sheet.end')}</Text>
                  <TimeField value={end} onChange={setEnd} accent={accent} background={colors.surface} />
                </View>
              </View>

              {repeating && (
                <>
                  <Text style={styles.label}>{t('classSheet.dateRange')}</Text>
                  {segment(RANGES, range, setRange, true)}
                  {range === 'term' && (
                    <>
                      <Text style={styles.hint}>{t('classSheet.termHint')}</Text>
                      <View style={styles.twoCol}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>{t('classSheet.termStarts')}</Text>
                          <DateField value={termStart} onChange={setTermStart} accent={accent} background={colors.surface} label={t('classSheet.termStarts')} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>{t('classSheet.termEnds')}</Text>
                          <DateField value={termEnd} onChange={setTermEnd} accent={accent} background={colors.surface} label={t('classSheet.termEnds')} minKey={termStart || undefined} />
                        </View>
                      </View>
                    </>
                  )}
                  {range === 'manual' && (
                    <View style={styles.twoCol}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>{t('classSheet.firstDay')}</Text>
                        <DateField value={rangeStart} onChange={setRangeStart} accent={accent} background={colors.surface} label={t('classSheet.firstDay')} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>{t('classSheet.lastDay')}</Text>
                        <DateField value={rangeEnd} onChange={setRangeEnd} accent={accent} background={colors.surface} label={t('classSheet.lastDay')} minKey={rangeStart || undefined} />
                      </View>
                    </View>
                  )}
                  {range === 'none' && weekly && days.length > 0 && <Text style={styles.hint}>{t('classSheet.repeatsHint', { days: daysLabel(days) })}</Text>}
                  {range === 'none' && repeat === 'rotation' && rotationDays.length > 0 && (
                    <Text style={styles.hint}>
                      {t('rotation.classRepeatsHint', {
                        days: slotsLabel({ type: 'days' }, rotationDays),
                      })}
                    </Text>
                  )}
                </>
              )}
            </View>

            <View style={styles.group}>
              <Text style={styles.groupTitle}>{t('sheet.where')}</Text>
              <View style={{ marginTop: 10 }}>
                {segment(
                  [
                    ['inPerson', 'sheet.inPerson'],
                    ['online', 'sheet.online'],
                  ],
                  mode,
                  setMode,
                  true
                )}
              </View>
              {mode === 'inPerson' ? (
                <>
                  <Text style={styles.label}>
                    {t('classSheet.location')} <Text style={styles.optional}>{t('common.optional')}</Text>
                  </Text>
                  {field(location, setLocation, t('classSheet.locationPlaceholder'), {
                    maxLength: 80,
                    accessibilityLabel: t('classSheet.locationA11y'),
                  })}
                </>
              ) : (
                <>
                  <Text style={styles.label}>
                    {t('sheet.linkOrPlatform')} <Text style={styles.optional}>{t('common.optional')}</Text>
                  </Text>
                  {field(link, setLink, t('classSheet.linkPlaceholder'), {
                    maxLength: 200,
                    autoCapitalize: 'none',
                    keyboardType: 'url',
                    accessibilityLabel: t('classSheet.linkA11y'),
                  })}
                </>
              )}
            </View>

            <Text style={styles.label}>
              {t('sheet.notes')} <Text style={styles.optional}>{t('common.optional')}</Text>
            </Text>
            {field(notes, setNotes, t('classSheet.notesPlaceholder'), {
              multiline: true,
              maxLength: 500,
              textAlignVertical: 'top',
              style: [styles.field, styles.fieldGrey, styles.notes],
              accessibilityLabel: t('classSheet.notesA11y'),
            })}
          </ScrollView>

          <Pressable onPress={save} disabled={!canSave} style={[styles.save, { backgroundColor: accent }, !canSave && { opacity: 0.4 }]}>
            <Ionicons name="checkmark-circle" size={20} color={colors.onAccent} />
            <Text style={styles.saveText}>{editing ? t('common.saveChanges') : t(isAct ? 'activities.sheet.save' : 'classSheet.save')}</Text>
          </Pressable>
          <Text style={styles.summary} numberOfLines={1}>
            {error || [isAct ? t(`activities.categories.${category}`) : subject && subject.name, classWhen(cls), classWhere(cls)].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </KeyboardAvoidingView>
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
  grab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 14,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
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
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    height: 54,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.ink,
    paddingVertical: 0,
    ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }),
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 20,
    marginBottom: 10,
  },
  optional: { fontSize: 11, fontWeight: '600', color: colors.muted },
  required: { color: colors.danger },
  hint: { fontSize: 12, color: colors.muted, marginTop: 10, lineHeight: 17 },
  subj: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    marginRight: 8,
    maxWidth: 200,
  },
  subjDot: { width: 9, height: 9, borderRadius: 5 },
  subjText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipLight: { backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: {
    fontWeight: '700',
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
  },
  segment: { flex: 1 },
  group: {
    marginTop: 20,
    backgroundColor: colors.bg,
    borderRadius: 18,
    padding: 14,
    paddingTop: 12,
  },
  groupTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 1,
  },
  twoCol: { flexDirection: 'row', gap: 10 },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotText: { fontWeight: '800', color: colors.muted },
  field: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 15,
    color: colors.ink,
    ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }),
  },
  fieldGrey: { backgroundColor: colors.bg },
  notes: { height: undefined, minHeight: 96, paddingVertical: 12 },
  save: {
    marginTop: 18,
    borderRadius: radius.md,
    height: 52,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
  summary: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.muted,
    marginTop: 10,
  },
}));
