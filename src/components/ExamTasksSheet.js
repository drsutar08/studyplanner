import React, { useMemo } from 'react';
import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles, solid } from '../theme';
import { t } from '../i18n';
import { formatDue } from '../dates';
import { useStore } from '../store';
import { planTasks } from '../examPrep';

const MAX_OTHERS = 60; // tasks offered to add, so the list stays short

// An exam's tasks: the ones linked to it at the top (tap to unlink) and the other tasks to add (tap to link), this
// subject's first. Each tap is saved straight away, like a checklist.
export default function ExamTasksSheet({ visible, exam, subject, onClose }) {
  const { state, dispatch } = useStore();
  const linked = useMemo(
    () => (exam ? planTasks(state.tasks, exam.id).sort((a, b) => !!a.done - !!b.done || a.due.localeCompare(b.due)) : []),
    [state.tasks, exam]
  );
  const others = useMemo(() => {
    if (!exam) return [];
    const mine = new Set(linked.map((x) => x.id));
    return state.tasks
      .filter((x) => !x.done && !mine.has(x.id))
      .sort((a, b) => (b.subjectId === exam.subjectId) - (a.subjectId === exam.subjectId) || a.due.localeCompare(b.due))
      .slice(0, MAX_OTHERS);
  }, [state.tasks, linked, exam]);
  if (!exam) return null;

  const tint = solid(subject ? subject.color : colors.accentFill);
  const done = linked.filter((x) => x.done).length;
  const subjectOf = (task) => state.subjects.find((s) => s.id === task.subjectId);
  const examTitleOf = (task) => {
    const id = task.examId || task.prepFor;
    const e = id && id !== exam.id ? state.exams.find((x) => x.id === id) : null;
    return e ? e.title : null;
  };
  const toggle = (task, on) => dispatch({ type: 'SET_TASK_EXAM', ids: [task.id], examId: on ? null : exam.id });

  const row = (task, on) => {
    const other = on ? null : examTitleOf(task);
    return (
      <Pressable
        key={task.id}
        onPress={() => toggle(task, on)}
        style={styles.row}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        aria-checked={on}
        accessibilityLabel={t(on ? 'examTasks.unlinkA11y' : 'examTasks.linkA11y', { title: task.title })}
      >
        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? tint : colors.muted} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.taskTitle, task.done && styles.taskDone]} numberOfLines={2}>{task.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {[subjectOf(task) ? subjectOf(task).name : null, task.done ? t('examTasks.done') : formatDue(task.due), other ? t('examTasks.linkedElsewhere', { title: other }) : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1, alignSelf: 'stretch' }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={[styles.headIcon, { backgroundColor: tint }]}>
              <Ionicons name="link" size={20} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{t('examTasks.title')}</Text>
              <Text style={styles.headSub} numberOfLines={1}>{t('prep.sub', { title: exam.title, when: formatDue(exam.date) })}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>
              {linked.length ? t('examTasks.linkedHead', { done, count: linked.length }) : t('examTasks.linkedNone')}
            </Text>
            {linked.map((x) => row(x, true))}

            <Text style={[styles.label, { marginTop: 18 }]}>{t('examTasks.addHead')}</Text>
            {others.length ? others.map((x) => row(x, false)) : <Text style={styles.empty}>{t('examTasks.noOthers')}</Text>}
          </ScrollView>

          <Pressable onPress={onClose} style={[styles.save, { backgroundColor: tint }]} accessibilityRole="button">
            <Text style={styles.saveText}>{t('examTasks.finish')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 10, paddingBottom: 28 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  headIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 12, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
  taskTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  taskDone: { textDecorationLine: 'line-through', color: colors.muted },
  meta: { fontSize: 12, color: colors.muted, marginTop: 1 },
  empty: { fontSize: 13, color: colors.muted, paddingVertical: 8 },
  save: { marginTop: 16, borderRadius: radius.md, height: 52, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
}));
