import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, type } from '../../theme';
import { t, weekdayName } from '../../i18n';
import { longDate, parseKey } from '../../dates';
import ClassRow from '../../components/ClassRow';
import ActivityHours from '../../components/ActivityHours';
import { formatDuration } from '../../components/AddExamSheet';
import { classHomework, onlyClasses, rotationIndexOn } from '../../classes';
import { attendanceOf } from '../../attendance';
import { dayRotationLabel, slotLabel } from '../../rotationLabels';
import { rangeNote } from './helpers';
import { styles } from './styles';

// The Calendar's timetable: classes (rotation days, weekdays, one-offs) or activities (with their hours),
// one tab at a time. `table` comes from timetable() and `activities` from activityList() (src/classes.js).
// `todayMark(c)` gives a class's attendance strip props for today's session; `on` holds the actions.
export default function TimetableSection({ tab, onTab, data, today, table, activities, hours, hoursWeek, onHoursWeek, workHourLimit, onWorkHourLimit, subjectById, todayMark, on }) {
  const { classes, tasks, term, vacations, rotation } = data;
  const activityTab = tab === 'activities';

  // one class in the timetable, with its homework and today's attendance
  const classRow = (c, note) => (
    <ClassRow
      key={c.id}
      cls={c}
      subject={subjectById[c.subjectId]}
      note={note}
      onAddHomework={() => on.addHomework(c)}
      stats={attendanceOf(c)}
      {...todayMark(c)}
      homework={classHomework(tasks, c.id, today)}
      onToggleTask={on.toggleTask}
      onEditTask={on.editTask}
      subjectById={subjectById}
      onFocusTask={on.focusTask}
      onDeleteTask={on.deleteTask}
      onEdit={() => on.editClass(c)}
      onDelete={() => on.deleteClass(c)}
    />
  );

  const group = (key, name, count, isToday, children) => (
    <View key={key} style={styles.weekGroup}>
      <View style={styles.weekHead}>
        <Text style={[styles.weekName, isToday && { color: colors.violet }]}>{name}</Text>
        {isToday ? <Text style={styles.weekToday}>{t('calendar.todayTag')}</Text> : null}
        <Text style={styles.weekCount}>{count}</Text>
      </View>
      {children}
    </View>
  );

  const empty = (icon, text, onPress) => (
    <Pressable style={styles.examEmpty} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text style={styles.examEmptyText}>{text}</Text>
    </Pressable>
  );

  return (
    <>
      <View style={styles.sectionHead}>
        <Text style={type.h2}>{activityTab ? t('activities.heading') : t('calendar.timetable')}</Text>
        <Pressable style={styles.linkBtn} onPress={activityTab ? on.addActivity : on.addClass} accessibilityLabel={activityTab ? t('activities.add') : t('calendar.addClassLink')}>
          <Ionicons name={activityTab ? 'football-outline' : 'easel-outline'} size={16} color={colors.accent} />
          <Text style={styles.linkText}>{activityTab ? t('activities.add') : t('calendar.addClassLink')}</Text>
        </Pressable>
      </View>
      <View style={styles.tabs} accessibilityRole="tablist">
        {[
          ['classes', 'easel-outline', t('activities.tabClasses'), onlyClasses(classes).length - table.past.length],
          ['activities', 'football-outline', t('activities.tabActivities'), activities.current.length],
        ].map(([id, icon, label, n]) => {
          const selected = tab === id;
          return (
            <Pressable key={id} onPress={() => onTab(id)} style={[styles.tab, selected && styles.tabOn]} accessibilityRole="tab" aria-selected={!!selected} accessibilityState={{ selected }} accessibilityLabel={label}>
              <Ionicons name={icon} size={14} color={selected ? colors.accent : colors.muted} />
              <Text style={[styles.tabText, selected && { color: colors.accent }]}>{label}</Text>
              {n ? <Text style={[styles.tabCount, selected && { backgroundColor: colors.accentFill, color: colors.onAccent }]}>{n}</Text> : null}
            </Pressable>
          );
        })}
      </View>

      {activityTab ? (
        <>
          {activities.current.length === 0 ? (
            empty('football-outline', t('activities.empty'), on.addActivity)
          ) : (
            <>
              <ActivityHours hours={hours} week={hoursWeek} onWeek={onHoursWeek} limit={workHourLimit} onLimit={onWorkHourLimit} />
              {activities.current.map((c) => (
                <ClassRow
                  key={c.id}
                  cls={c}
                  showSchedule
                  note={[hours.byId[c.id] ? t(hoursWeek === 'next' ? 'hours.rowNext' : 'hours.rowThis', { time: formatDuration(hours.byId[c.id]) }) : null, c.repeat === 'once' ? longDate(c.date) : rangeNote(c, term)]
                    .filter(Boolean)
                    .join(' · ')}
                  onEdit={() => on.editClass(c)}
                  onDelete={() => on.deleteClass(c)}
                />
              ))}
            </>
          )}
          {activities.past.length > 0 && (
            <Pressable onPress={() => on.clearPast(activities.past)}>
              <Text style={styles.clear}>{t('activities.clearPast', { count: activities.past.length })}</Text>
            </Pressable>
          )}
        </>
      ) : (
        <>
          <Pressable style={styles.rotationRow} onPress={on.rotation} accessibilityRole="button" accessibilityLabel={rotation ? t('rotation.changeA11y') : t('rotation.setUpA11y')}>
            <Ionicons name="sync" size={16} color={colors.violet} />
            <Text style={styles.rotationText} numberOfLines={1}>
              {rotation
                ? t('rotation.status', {
                    cycle: Array.from({ length: rotation.length }, (_, i) => slotLabel(rotation, i)).join(' / '),
                    today: dayRotationLabel(rotation, today, vacations) || t('rotation.noSchool'),
                  })
                : t('rotation.setUp')}
            </Text>
            <Text style={styles.rotationLink}>{rotation ? t('rotation.change') : t('rotation.setUpLink')}</Text>
          </Pressable>
          {table.weeks.length === 0 && table.oneOffs.length === 0 && table.cycle.length === 0 ? empty('easel-outline', t('calendar.noClasses'), on.addClass) : null}
          {table.cycle.map((g) =>
            group(
              `cycle${g.index}`,
              slotLabel({ type: 'days' }, g.index),
              t('calendar.classes', { count: g.classes.length }),
              !!rotation && rotation.type === 'days' && rotationIndexOn(rotation, today, vacations) === g.index,
              g.classes.map((c) => classRow(c, rangeNote(c, term)))
            )
          )}
          {table.weeks.map((g) =>
            group(g.day, weekdayName(g.day, 'long'), t('calendar.classes', { count: g.classes.length }), parseKey(today).getDay() === g.day, g.classes.map((c) => classRow(c, rangeNote(c, term))))
          )}
          {table.oneOffs.length > 0 && group('oneoffs', t('calendar.oneOffs'), table.oneOffs.length, false, table.oneOffs.map((c) => classRow(c, longDate(c.date))))}
          {table.past.length > 0 && (
            <Pressable onPress={() => on.clearPast(table.past)}>
              <Text style={styles.clear}>{t('calendar.clearPastClasses', { count: table.past.length })}</Text>
            </Pressable>
          )}
        </>
      )}
    </>
  );
}
