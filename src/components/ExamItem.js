import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles, readable } from '../theme';
import { t } from '../i18n';
import { dateKey, daysBetween, formatDue, formatTime } from '../dates';
import { endTime, examKindLabel } from './AddExamSheet';
import { isGraded, percentOf, letterOf } from '../grades';
import AttendanceStrip from './AttendanceStrip';
import ExamPrepSheet from './ExamPrepSheet';
import ExamTasksSheet from './ExamTasksSheet';
import { useStore } from '../store';
import { planTasks } from '../examPrep';

// how a past exam without a score reads in the count column
const MARK_TONE = { attended: 'success', missed: 'danger', excused: 'warn', cancelled: 'muted' };

export const examTone = (days) => (days < 0 ? colors.muted : days <= 3 ? colors.danger : days <= 7 ? '#F2A541' : '#17A398');

// On the exam day: "in 2h 15m", "In progress" or "Finished" (null when the exam has no time)
export const examDayStatus = (exam, now = new Date()) => {
  if (!exam.time) return null;
  const [h, m] = exam.time.split(':').map(Number);
  const mins = h * 60 + m - (now.getHours() * 60 + now.getMinutes());
  if (mins > 0) return mins >= 60 ? t('exam.inHoursMinutes', { h: Math.floor(mins / 60), m: mins % 60 }) : t('exam.inMinutes', { m: mins });
  return -mins < (exam.duration || 60) ? t('exam.inProgress') : t('exam.finished');
};

// One exam, laid out like ClassRow: subject stripe, countdown column, tag, title, then "when" and "where" lines.
// Without onEdit / onDelete it is a plain row (dashboard). `flat` drops the card border for use inside another card.
// `onMark(status)` adds the attendance strip (sat / missed / excused / cancelled), `attendance` being the current mark.
// An exam still to come shows its prep plan's progress, and (where it can be edited) a button to make one.
export default function ExamItem({ exam, subject, onEdit, onDelete, onPress, flat = false, attendance = null, onMark }) {
  const n = daysBetween(dateKey(), exam.date);
  const { state } = useStore();
  const [prepping, setPrepping] = useState(false);
  const [linking, setLinking] = useState(false);
  const plan = n >= 0 ? planTasks(state.tasks, exam.id) : [];
  const planDone = plan.filter((x) => x.done).length;
  const tone = examTone(n);
  const stripe = subject ? subject.color : colors.danger;
  const status = n === 0 ? examDayStatus(exam) : null;
  const time = exam.time ? t('calendar.range', { start: formatTime(exam.time), end: formatTime(endTime(exam.time, exam.duration || 60)) }) : '';
  const where = exam.mode === 'online' ? t('sheet.online') : [exam.building, exam.room].filter(Boolean).join(', ');
  const when = [subject && subject.name, formatDue(exam.date)].filter(Boolean).join(' · ');
  const Wrap = onPress ? Pressable : View;

  const mark = n < 0 && !isGraded(exam) && MARK_TONE[exam.attendance] ? exam.attendance : null;
  const row = (
    <Wrap
      onPress={onPress}
      style={[styles.row, flat && styles.flat, n === 0 && !flat && { borderColor: tone + '55' }, onMark && styles.inCard]}
      accessibilityLabel={onPress ? t('exam.openA11y', { title: exam.title }) : undefined}
    >
      <View style={[styles.bar, { backgroundColor: stripe }]} />
      <View style={[styles.count, { backgroundColor: tone + '17' }]}>
        {n === 0 ? (
          <>
            <Text style={[styles.today, { color: readable(tone) }]}>{t('common.today')}</Text>
            {status ? <Text style={[styles.unit, { color: readable(tone) }]} numberOfLines={1}>{status}</Text> : null}
          </>
        ) : n < 0 && isGraded(exam) ? (
          <>
            <Text style={[styles.num, { color: colors.accent, fontSize: 18 }]}>{Math.round(percentOf(exam))}%</Text>
            <Text style={[styles.unit, { color: colors.accent }]}>{letterOf(percentOf(exam))}</Text>
          </>
        ) : mark ? (
          <Text style={[styles.unit, { color: colors[MARK_TONE[mark]] }]} numberOfLines={2}>{t(`attendance.${mark}`)}</Text>
        ) : n < 0 ? (
          <Text style={[styles.unit, { color: readable(tone) }]}>{t('exam.past')}</Text>
        ) : (
          <>
            <Text style={[styles.num, { color: readable(tone) }]}>{n}</Text>
            <Text style={[styles.unit, { color: readable(tone) }]}>{t('exam.daysUnit', { count: n })}</Text>
          </>
        )}
      </View>
      <View style={styles.body}>
        <View style={styles.tag}>
          <Ionicons name="flag" size={10} color={colors.danger} />
          <Text style={styles.tagText}>{examKindLabel(exam.kind || 'Exam').toUpperCase()}</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>{exam.title}</Text>
        <Text style={styles.meta} numberOfLines={1}>{when}</Text>
        {time || where ? (
          <View style={styles.whereRow}>
            {time ? (
              <>
                <Ionicons name="time-outline" size={11} color={colors.muted} />
                <Text style={[styles.meta, styles.noShrink]}>{time}</Text>
              </>
            ) : null}
            {where ? (
              <>
                <Ionicons name={exam.mode === 'online' ? 'videocam-outline' : 'location-outline'} size={11} color={colors.muted} style={time ? { marginLeft: 6 } : null} />
                <Text style={[styles.meta, { marginTop: 0 }]} numberOfLines={1}>{where}</Text>
              </>
            ) : null}
          </View>
        ) : null}
        {plan.length ? (
          <View style={styles.whereRow}>
            <Ionicons name="school-outline" size={11} color={colors.accent} />
            <Text style={[styles.meta, styles.prep]} numberOfLines={1}>{t('prep.progress', { done: planDone, count: plan.length })}</Text>
          </View>
        ) : null}
      </View>
      {onEdit && n >= 0 && (
        <Pressable onPress={() => setLinking(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('examTasks.openA11y', { title: exam.title })} style={styles.iconBtn}>
          <Ionicons name="link-outline" size={17} color={colors.accent} />
        </Pressable>
      )}
      {onEdit && n > 0 && (
        <Pressable onPress={() => setPrepping(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('prep.openA11y', { title: exam.title })} style={styles.iconBtn}>
          <Ionicons name="school-outline" size={17} color={colors.accent} />
        </Pressable>
      )}
      {onEdit && (
        <Pressable onPress={onEdit} hitSlop={10} accessibilityLabel={t('exam.editA11y', { title: exam.title })} style={styles.iconBtn}>
          <Ionicons name="create-outline" size={17} color={colors.muted} />
        </Pressable>
      )}
      {onDelete && (
        <Pressable onPress={onDelete} hitSlop={10} accessibilityLabel={t('exam.deleteA11y', { title: exam.title })} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={17} color={colors.muted} />
        </Pressable>
      )}
    </Wrap>
  );
  const sheet = (
    <>
      {prepping ? <ExamPrepSheet visible exam={exam} subject={subject} onClose={() => setPrepping(false)} /> : null}
      {linking ? <ExamTasksSheet visible exam={exam} subject={subject} onClose={() => setLinking(false)} /> : null}
    </>
  );
  if (!onMark)
    return (
      <>
        {row}
        {sheet}
      </>
    );
  return (
    <View style={[styles.card, n === 0 && { borderColor: tone + '55' }]}>
      {row}
      <AttendanceStrip title={exam.title} status={attendance} onMark={onMark} />
      {sheet}
    </View>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, paddingRight: 6 },
  card: { backgroundColor: colors.surface, borderRadius: 16, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  inCard: { borderWidth: 0, borderRadius: 0, marginBottom: 0 },
  flat: { borderWidth: 0, borderRadius: 14, marginBottom: 6, backgroundColor: colors.bg },
  bar: { width: 6, alignSelf: 'stretch' },
  count: { width: 64, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, marginLeft: 0 },
  num: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, lineHeight: 24 },
  today: { fontSize: 14, fontWeight: '800' },
  unit: { fontSize: 10, fontWeight: '700', marginTop: 1, textAlign: 'center' },
  body: { flex: 1, paddingVertical: 12, paddingLeft: 12 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tagText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: colors.danger },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 2 },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2, flexShrink: 1 },
  noShrink: { marginTop: 0, flexShrink: 0 },
  whereRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  iconBtn: { padding: 7 },
  prep: { marginTop: 0, color: colors.accent, fontWeight: '700' },
}));
