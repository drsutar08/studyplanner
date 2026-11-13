import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles } from '../theme';
import { t } from '../i18n';
import { formatTime } from '../dates';
import { classWhen, classWhere } from './AddClassSheet';
import ClassHomework from './ClassHomework';
import AttendanceStrip from './AttendanceStrip';
import { isActivity } from '../classes';
import { activityLook, activityCategoryLabel } from '../activityKinds';

// One class. `showSchedule` swaps the time column for the full "Mon, Wed · 9:00 AM" line.
// `status` ('now' | 'done') marks today's classes; `note` adds a small extra line (e.g. the date range).
// `onAddHomework` shows a "+ homework" button (a task due at the class's next session). `homework`
// (from classHomework()) shows that class's homework under the row; tapping the class opens or closes the list.
// onToggleTask / onEditTask act on a homework task.
// `onMark(status)` shows the attendance strip for this session ('attended' / 'missed', and behind ⋯ 'excused' /
// 'cancelled'; the same again clears),
// with `attendance` the session's current status. `stats` (attendanceOf()) adds the class's attendance %.
export default function ClassRow({
  cls,
  subject,
  onEdit,
  onDelete,
  onAddHomework,
  homework,
  subjectById,
  onToggleTask,
  onEditTask,
  onFocusTask,
  onDeleteTask,
  showSchedule = false,
  status = null,
  note = '',
  attendance = null,
  attendanceLabel,
  attendanceTitle, // what screen readers hear in the strip's buttons (says which session when not obvious)
  onMark,
  stats,
}) {
  const act = isActivity(cls); // an activity: category colour and icon, no subject
  const color = act ? activityLook(cls).color : subject ? subject.color : colors.accent;
  const where = classWhere(cls);
  // Day list: "Subject · where · teacher". Timetable: "Subject · when", then "where · teacher" below.
  const meta = (showSchedule ? [subject && subject.name, classWhen(cls)] : [subject && subject.name, where, cls.teacher]).filter(Boolean).join(' · ');
  const meta2 = showSchedule ? [where, cls.teacher].filter(Boolean).join(' · ') : '';
  const [expanded, setExpanded] = useState(false);
  const toggle = () => setExpanded((e) => !e);
  const Body = homework ? Pressable : View;
  return (
    <View style={[styles.card, status === 'now' && { borderColor: color }]}>
    <View style={[styles.row, status === 'done' && styles.done]}>
      <View style={[styles.bar, { backgroundColor: color }]} />
      {!showSchedule && (
        <View style={styles.timeCol}>
          <Text style={styles.time}>{cls.start ? formatTime(cls.start) : t('classRow.anyTime')}</Text>
          {cls.end ? <Text style={styles.timeEnd}>{formatTime(cls.end)}</Text> : null}
        </View>
      )}
      <Body
        style={styles.body}
        {...(homework
          ? {
              onPress: toggle,
              accessibilityRole: 'button',
              accessibilityState: { expanded },
              accessibilityLabel: t(expanded ? 'classHomework.hideA11y' : 'classHomework.showA11y', { title: cls.title }),
            }
          : {})}
      >
        <View style={styles.tag}>
          <Ionicons name={act ? activityLook(cls).icon : cls.mode === 'online' ? 'videocam' : 'easel'} size={10} color={color} />
          <Text style={[styles.tagText, { color }]} numberOfLines={1}>{act
              ? t('activities.tag', { category: activityCategoryLabel(cls).toUpperCase() })
              : cls.repeat === 'weekly'
                ? t('classRow.tagWeekly')
                : t('classRow.tag')}</Text>
          {status === 'now' ? <Text style={styles.now}>{t('classRow.now')}</Text> : status === 'done' ? <Text style={styles.doneTag}>{t('classRow.done')}</Text> : null}
          {!onMark && stats && stats.total > 0 ? (
            <Text style={styles.pctTag} accessibilityLabel={t('attendance.classPctA11y', { pct: Math.round(stats.pct), attended: stats.attended, total: stats.total })}>
              {t('attendance.pctShort', { pct: Math.round(stats.pct) })}
            </Text>
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={1}>{cls.title}</Text>
        {meta ? <Text style={styles.meta} numberOfLines={1}>{meta}</Text> : null}
        {meta2 ? <Text style={styles.meta} numberOfLines={1}>{meta2}</Text> : null}
        {note ? <Text style={styles.note} numberOfLines={1}>{note}</Text> : null}
      </Body>
      {onAddHomework && (
        <Pressable onPress={onAddHomework} hitSlop={8} accessibilityLabel={t('homework.addA11y', { title: cls.title })} style={[styles.hwBtn, { backgroundColor: color + '1A' }]}>
          <Ionicons name="add" size={14} color={color} />
          <Ionicons name="document-text-outline" size={14} color={color} />
        </Pressable>
      )}
      {onEdit && (
        <Pressable onPress={onEdit} hitSlop={10} accessibilityLabel={t(act ? 'activities.editA11y' : 'classRow.editA11y', { title: cls.title })} style={styles.iconBtn}>
          <Ionicons name="create-outline" size={17} color={colors.muted} />
        </Pressable>
      )}
      {onDelete && (
        <Pressable onPress={onDelete} hitSlop={10} accessibilityLabel={t(act ? 'activities.deleteA11y' : 'classRow.deleteA11y', { title: cls.title })} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={17} color={colors.muted} />
        </Pressable>
      )}
    </View>
    {onMark ? <AttendanceStrip title={attendanceTitle || cls.title} status={attendance} onMark={onMark} stats={stats} label={attendanceLabel} /> : null}
    {homework ? (
      <ClassHomework
        classTitle={cls.title}
        homework={homework}
        tint={color}
        expanded={expanded}
        onToggleExpanded={toggle}
        subjectById={subjectById}
        onToggleTask={onToggleTask}
        onEditTask={onEditTask}
        onFocusTask={onFocusTask}
        onDeleteTask={onDeleteTask}
        onAdd={onAddHomework}
      />
    ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  card: { backgroundColor: colors.surface, borderRadius: 16, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: 6 },
  bar: { width: 6, alignSelf: 'stretch' },
  timeCol: { width: 72, paddingLeft: 12, paddingVertical: 12 },
  time: { fontSize: 13, fontWeight: '800', color: colors.ink },
  timeEnd: { fontSize: 12, color: colors.muted, marginTop: 2 },
  body: { flex: 1, paddingVertical: 12, paddingLeft: 12 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tagText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, flexShrink: 1 }, // one line: shortened in a narrow column
  title: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 2 },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  iconBtn: { padding: 7 },
  hwBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 6, borderRadius: 12, marginRight: 2 },
  done: { opacity: 0.55 },
  now: { marginLeft: 4, fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.onAccent, backgroundColor: colors.success, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
  doneTag: { marginLeft: 4, fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.muted },
  pctTag: { marginLeft: 4, fontSize: 9, fontWeight: '800', color: colors.muted, backgroundColor: colors.bg, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
  note: { fontSize: 11, color: colors.muted, marginTop: 3, fontStyle: 'italic' },
}));
