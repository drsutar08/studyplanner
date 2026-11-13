import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles, readable } from '../theme';
import { t } from '../i18n';
import { formatDue } from '../dates';
import TaskRow from './TaskRow';

// Homework for one class, shown under it as its child records. The parent decides whether it is open
// (tapping the class toggles it). Closed: a single quiet summary line, only when there is open homework.
// Open: the homework as the usual task cards (tick, focus, edit, swipe to complete or delete), open ones
// first and then the last few finished, or "no homework yet", plus an "Add homework" link.
export default function ClassHomework({
  classTitle,
  homework,
  tint,
  expanded,
  onToggleExpanded,
  subjectById = {},
  onToggleTask,
  onEditTask,
  onFocusTask,
  onDeleteTask,
  onAdd,
}) {
  const { open: tasks, overdue, done = [] } = homework;
  if (!expanded && tasks.length === 0) return null;
  const next = tasks[0];

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onToggleExpanded}
        style={styles.summary}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={t('classHomework.toggleA11y', { title: classTitle, count: tasks.length })}
      >
        <Ionicons name="document-text-outline" size={13} color={overdue ? colors.danger : tint} />
        <Text style={[styles.summaryText, overdue > 0 && { color: colors.danger }]} numberOfLines={1}>
          {tasks.length === 0 && done.length > 0
            ? t('classHomework.allDone')
            : tasks.length === 0
            ? t('classHomework.empty')
            : overdue > 0
              ? t('classHomework.overdue', { count: overdue, total: tasks.length })
              : t('classHomework.summary', { count: tasks.length, title: next.title, day: formatDue(next.due) })}
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} />
      </Pressable>

      {expanded && (
        <View style={styles.list}>
          {[...tasks, ...done].map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              subject={subjectById[task.subjectId]}
              onToggle={() => onToggleTask(task)}
              onEdit={() => onEditTask(task)}
              onFocus={() => onFocusTask && onFocusTask(task)}
              onDelete={() => onDeleteTask && onDeleteTask(task)}
            />
          ))}
          {onAdd ? (
            <Pressable onPress={onAdd} style={styles.add} accessibilityRole="button" accessibilityLabel={t('homework.addA11y', { title: classTitle })}>
              <Ionicons name="add" size={15} color={tint} />
              <Text style={[styles.addText, { color: readable(tint) }]}>{t('classHomework.add')}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { borderTopWidth: 1, borderTopColor: colors.line },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingLeft: 18, paddingRight: 12 },
  summaryText: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.muted },
  // the homework cards sit on a soft panel inside the class card
  list: { backgroundColor: colors.surfaceAlt, paddingHorizontal: 8, paddingTop: 8 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4, paddingBottom: 10, paddingLeft: 6 },
  addText: { fontSize: 12, fontWeight: '800' },
}));
