import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles, readable } from '../theme';
import { t } from '../i18n';
import { dateKey, daysBetween, formatDue, formatTime } from '../dates';
import { examTone } from './ExamItem';
import { useStore } from '../store';
import { stepProgress } from '../subtasks';
import StepList from './StepList';

const PRIORITY_COLOR = { high: '#D6336C', low: '#17A398' };
const THRESHOLD = 90; // how far to drag before the action fires
const MAX_DRAG = 130;

// One task, laid out like ExamItem / ClassRow: subject stripe, a time column, a tag, the title and short
// meta lines. Tap = edit, drag right = complete, drag left = delete (with undo), long-press = delete.
// `addStepChip`: when the "+ Subtask" chip shows on a task without subtasks: true (always), 'hover' (only while
// the pointer is over the card, on the web) or false. The dashboard keeps it to one card so the list stays calm.
// Lists re-render with new callbacks on every change; the card itself redraws only when its task, subject or chip
// setting does. The callbacks are read when they're called, so they're always the latest.
export default function TaskRow({ onToggle, onFocus, onDelete, onEdit, ...props }) {
  const { state, dispatch } = useStore();
  // the exam this task is for (linked by hand or by a prep plan); the same object until the exam changes, so the card still skips redraws
  const examId = props.task.examId || props.task.prepFor;
  const exam = examId ? (state.exams || []).find((e) => e.id === examId) || null : null;
  const latest = useRef({ onToggle, onFocus, onDelete, onEdit });
  useEffect(() => {
    latest.current = { onToggle, onFocus, onDelete, onEdit };
  });
  const handlers = useMemo(
    () => ({
      onToggle: (...a) => latest.current.onToggle && latest.current.onToggle(...a),
      onFocus: (...a) => latest.current.onFocus && latest.current.onFocus(...a),
      onDelete: (...a) => latest.current.onDelete && latest.current.onDelete(...a),
      onEdit: (...a) => latest.current.onEdit && latest.current.onEdit(...a),
    }),
    []
  );
  return <TaskCard {...props} {...handlers} exam={exam} dispatch={dispatch} />;
}

const TaskCard = memo(function TaskCard({ task, subject, exam, onToggle, onFocus, onDelete, onEdit, addStepChip = true, dispatch }) {
  const [hovered, setHovered] = useState(false);
  const tab = subject ? subject.color : colors.accent;
  const late = !task.done && task.due < dateKey();
  // time column tint: done green, overdue red, otherwise the subject colour
  const tone = task.done ? colors.success : late ? colors.danger : tab;
  const prio = !task.done && PRIORITY_COLOR[task.priority];
  // Steps: a progress line under the card that opens a checklist (ticked here, straight into the store)
  const [stepsOpen, setStepsOpen] = useState(false);
  const steps = task.subtasks || [];
  const prog = stepProgress(steps);
  const allDone = prog.total > 0 && prog.done === prog.total; // "0 of 0" doesn't count as done

  // The pan responder is created once, so it reads the latest callbacks from a ref (updated after each render)
  const latest = useRef({ onToggle, onDelete });
  useEffect(() => {
    latest.current = { onToggle, onDelete };
  });
  const [x] = useState(() => new Animated.Value(0));
  // A drag ends with a click on the web; ignore presses for a moment after dragging so a swipe never also taps
  const draggedAt = useRef(0);
  const unlessDragged = (fn) => () => {
    if (Date.now() - draggedAt.current < 400) return;
    if (fn) fn();
  };

  const springBack = () => Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 6, speed: 18 }).start();

  // PanResponder.create only keeps the callbacks; they read the refs during a gesture, never while rendering
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      // only take over for clear sideways drags so vertical scrolling and taps keep working
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        draggedAt.current = Date.now();
        x.setValue(Math.max(-MAX_DRAG, Math.min(MAX_DRAG, g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        draggedAt.current = Date.now();
        springBack();
        if (g.dx > THRESHOLD) latest.current.onToggle();
        else if (g.dx < -THRESHOLD) latest.current.onDelete();
      },
      onPanResponderTerminate: springBack,
    })
  );

  const completeOpacity = x.interpolate({ inputRange: [0, 40, THRESHOLD], outputRange: [0, 0.6, 1], extrapolate: 'clamp' });
  const deleteOpacity = x.interpolate({ inputRange: [-THRESHOLD, -40, 0], outputRange: [1, 0.6, 0], extrapolate: 'clamp' });
  // the icon grows as the row is dragged, with a little pop once letting go will act
  const completeScale = x.interpolate({ inputRange: [0, THRESHOLD - 1, THRESHOLD], outputRange: [0.6, 1, 1.18], extrapolate: 'clamp' });
  const deleteScale = x.interpolate({ inputRange: [-THRESHOLD, -THRESHOLD + 1, 0], outputRange: [1.18, 1, 0.6], extrapolate: 'clamp' });

  return (
    <View
      style={styles.wrap}
      // hover is followed on the whole card: pointer enter/leave don't fire when moving onto the chip inside it
      onPointerEnter={addStepChip === 'hover' ? () => setHovered(true) : undefined}
      onPointerLeave={addStepChip === 'hover' ? () => setHovered(false) : undefined}
    >
      {/* what the swipe will do, revealed behind the row */}
      <View style={styles.actions} pointerEvents="none">
        {/* each in a box as wide as the drag that acts, so it's all in view by then */}
        <Animated.View style={[styles.action, styles.actionDone, { opacity: completeOpacity }]}>
          <View style={styles.actionBox}>
            <Animated.View style={{ transform: [{ scale: completeScale }] }}>
              <Ionicons name={task.done ? 'arrow-undo' : 'checkmark-circle'} size={24} color={colors.onAccent} />
            </Animated.View>
            <Text style={styles.actionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {task.done ? t('taskRow.reopen') : t('taskRow.complete')}
            </Text>
          </View>
        </Animated.View>
        <Animated.View style={[styles.action, styles.actionDelete, { opacity: deleteOpacity }]}>
          <View style={styles.actionBox}>
            <Animated.View style={{ transform: [{ scale: deleteScale }] }}>
              <Ionicons name="trash" size={22} color={colors.onAccent} />
            </Animated.View>
            <Text style={styles.actionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {t('common.delete')}
            </Text>
          </View>
        </Animated.View>
      </View>

      <Animated.View style={[{ transform: [{ translateX: x }] }, Platform.OS === 'web' && styles.noSelect]} {...pan.panHandlers}>
        <Pressable
          onPress={unlessDragged(onEdit)}
          onLongPress={onDelete}
          style={styles.row}
          accessibilityLabel={t('taskRow.editA11y', { title: task.title })}
          accessibilityActions={[
            { name: 'toggle', label: task.done ? t('taskRow.markNotDone') : t('taskRow.markDone') },
            { name: 'delete', label: t('taskRow.deleteTask') },
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'toggle') onToggle();
            if (e.nativeEvent.actionName === 'delete') onDelete();
          }}
        >
          <View style={[styles.tab, { backgroundColor: tab }]} />

          <View style={[styles.timeCol, { backgroundColor: tone + '17' }]}>
            {task.done ? (
              <Ionicons name="checkmark-circle" size={20} color={tone} />
            ) : (
              <Text style={[task.time ? styles.time : styles.timeWord, { color: readable(tone) }]} numberOfLines={task.time ? 1 : 2}>
                {task.time ? formatTime(task.time) : late ? t('taskRow.late') : t('taskRow.anyTime')}
              </Text>
            )}
            <Text style={[styles.est, { color: readable(tone) }]}>{t('common.minutes', { count: task.estimate })}</Text>
          </View>

          <View style={[styles.body, task.done && styles.bodyDone]}>
            <View style={styles.tagRow}>
              <Ionicons name={task.classId ? 'document-text' : task.recurId ? 'repeat' : 'checkbox'} size={10} color={tab} />
              <Text style={[styles.tag, { color: readable(tab) }]}>
                {task.classId ? t('taskRow.tagHomework') : t('taskRow.tag')}
                {task.recurId ? t('taskRow.tagRepeats') : ''}
              </Text>
              {prio ? (
                <View style={[styles.prio, { backgroundColor: prio + '1F' }]}>
                  <Ionicons name={task.priority === 'high' ? 'arrow-up' : 'arrow-down'} size={10} color={prio} />
                  <Text style={[styles.prioText, { color: prio }]}>{task.priority === 'high' ? t('taskRow.high') : t('taskRow.low')}</Text>
                </View>
              ) : null}
              {!task.done && prog.total === 0 && !stepsOpen && addStepChip ? (
                // on hover only: always in place (so the row never shifts), just invisible and not tappable off hover
                <Pressable
                  onPress={unlessDragged(() => setStepsOpen(true))}
                  hitSlop={8}
                  pointerEvents={addStepChip === 'hover' && !hovered ? 'none' : 'auto'}
                  accessibilityElementsHidden={addStepChip === 'hover' && !hovered}
                  style={[styles.subChip, { borderColor: tab + '66' }, addStepChip === 'hover' && !hovered && { opacity: 0 }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('steps.addFirstA11y', { title: task.title })}
                >
                  <Ionicons name="add" size={11} color={tab} />
                  <Text style={[styles.subChipText, { color: readable(tab) }]}>{t('steps.addChip')}</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={[styles.title, task.done && styles.titleDone]} numberOfLines={2}>
              {task.title}
            </Text>
            <View style={styles.metaRow}>
              {subject ? <View style={[styles.dot, { backgroundColor: subject.color }]} /> : null}
              <Text style={styles.meta} numberOfLines={1}>
                {[subject ? subject.name : t('common.noSubject'), task.done ? null : formatDue(task.due)].filter(Boolean).join(' · ')}
              </Text>
              {task.attachments && task.attachments.length ? (
                <View style={styles.clip} accessibilityLabel={t('attachments.countA11y', { count: task.attachments.length })}>
                  <Ionicons name="attach" size={12} color={colors.muted} />
                  <Text style={styles.clipText}>{task.attachments.length}</Text>
                </View>
              ) : null}
            </View>
            {exam ? (
              <View style={styles.metaRow} accessibilityLabel={t('taskRow.forExam', { title: exam.title, when: formatDue(exam.date) })}>
                <Ionicons name="flag" size={11} color={examTone(daysBetween(dateKey(), exam.date))} />
                <Text style={[styles.examText, { color: readable(examTone(daysBetween(dateKey(), exam.date))) }]} numberOfLines={1}>
                  {t('taskRow.forExam', { title: exam.title, when: formatDue(exam.date) })}
                </Text>
              </View>
            ) : null}
            {task.moreCopies ? (
              <View style={styles.metaRow}>
                <Ionicons name="repeat" size={11} color={colors.muted} />
                <Text style={styles.notes} numberOfLines={1}>{t('taskRow.moreCopies', { count: task.moreCopies })}</Text>
              </View>
            ) : null}
            {!!task.notes && (
              <View style={styles.metaRow}>
                <Ionicons name="reader-outline" size={11} color={colors.muted} />
                <Text style={styles.notes} numberOfLines={1}>
                  {task.notes}
                </Text>
              </View>
            )}
          </View>

          <Pressable
            onPress={unlessDragged(onToggle)}
            hitSlop={10}
            style={styles.checkWrap}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!task.done }}
            aria-checked={!!task.done}
            accessibilityLabel={t(task.done ? 'taskRow.reopenA11y' : 'taskRow.completeA11y', { title: task.title })}
          >
            <Ionicons name={task.done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={task.done ? colors.success : late ? colors.danger : colors.muted} />
          </Pressable>

          {!task.done && (
            <Pressable onPress={unlessDragged(onFocus)} hitSlop={10} style={styles.play} accessibilityRole="button" accessibilityLabel={t('taskRow.focusA11y', { title: task.title })}>
              <Ionicons name="play" size={15} color={colors.accent} />
            </Pressable>
          )}
        </Pressable>
        {(prog.total > 0 || stepsOpen) && (
          <View style={styles.steps}>
            <Pressable
              onPress={unlessDragged(() => setStepsOpen((o) => !o))}
              style={styles.stepsHead}
              accessibilityRole="button"
              accessibilityState={{ expanded: stepsOpen }}
              accessibilityLabel={t(stepsOpen ? 'steps.hideA11y' : 'steps.showA11y', { title: task.title, done: prog.done, count: prog.total })}
            >
              <Ionicons name="list" size={13} color={allDone ? colors.success : tab} />
              <Text style={styles.stepsText} numberOfLines={1}>
                {prog.total === 0
                  ? t('steps.firstHint')
                  : allDone
                  ? t('steps.allDone', { count: prog.total })
                  : prog.next
                    ? t('steps.progressNext', { done: prog.done, count: prog.total, next: prog.next.title })
                    : t('steps.progress', { done: prog.done, count: prog.total })}
              </Text>
              <Ionicons name={stepsOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} />
            </Pressable>
            {prog.total > 0 ? (
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${Math.round((prog.done / prog.total) * 100)}%`, backgroundColor: allDone ? colors.success : tab }]} />
              </View>
            ) : null}
            {stepsOpen && (
              <View style={styles.stepsList}>
                <StepList
                  steps={steps}
                  onToggle={(stepId) => dispatch({ type: 'TOGGLE_SUBTASK', id: task.id, stepId })}
                  onAdd={task.done ? undefined : (title) => dispatch({ type: 'ADD_SUBTASK', id: task.id, title })}
                  autoFocusAdd={prog.total === 0}
                  tint={tab}
                />
                {allDone && !task.done ? (
                  <Pressable onPress={unlessDragged(onToggle)} style={styles.finish} accessibilityRole="button" accessibilityLabel={t('steps.finishA11y', { title: task.title })}>
                    <Ionicons name="checkmark-done" size={15} color={colors.success} />
                    <Text style={styles.finishText}>{t('steps.finish')}</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        )}
      </Animated.View>
    </View>
  );
});

const styles = themedStyles(() => ({
  wrap: { marginBottom: 10, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line },
  actions: { ...StyleSheet.absoluteFill, flexDirection: 'row', justifyContent: 'space-between' },
  action: { width: '50%', flexDirection: 'row', alignItems: 'center' },
  actionBox: { width: THRESHOLD, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 6 },
  actionDone: { backgroundColor: colors.success, justifyContent: 'flex-start' },
  actionDelete: { backgroundColor: colors.danger, justifyContent: 'flex-end' },
  actionText: { color: colors.onAccent, fontWeight: '800', fontSize: 12 },
  noSelect: { userSelect: 'none' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingRight: 8, minHeight: 72, borderRadius: 15, overflow: 'hidden' }, // rounded as it slides away
  tab: { width: 6, alignSelf: 'stretch' },
  timeCol: { width: 66, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, gap: 2 },
  time: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  timeWord: { fontSize: 11, fontWeight: '800', textAlign: 'center', lineHeight: 13 },
  est: { fontSize: 10, fontWeight: '700' },
  body: { flex: 1, paddingVertical: 11, paddingLeft: 12 },
  bodyDone: { opacity: 0.6 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tag: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  prio: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 7, marginLeft: 4 },
  prioText: { fontSize: 10, fontWeight: '800' },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 2 },
  titleDone: { textDecorationLine: 'line-through', color: colors.muted },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  meta: { flexShrink: 1, fontSize: 12, color: colors.muted },
  clip: { flexDirection: 'row', alignItems: 'center', gap: 1, marginLeft: 4 },
  clipText: { fontSize: 11, fontWeight: '700', color: colors.muted },
  examText: { flexShrink: 1, fontSize: 11, fontWeight: '700' },
  notes: { flexShrink: 1, fontSize: 11, color: colors.muted, fontStyle: 'italic' },
  checkWrap: { paddingHorizontal: 6 },
  subChip: { flexDirection: 'row', alignItems: 'center', gap: 1, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 7, borderWidth: 1, borderStyle: 'dashed', marginLeft: 4 },
  subChipText: { fontSize: 10, fontWeight: '800' },
  steps: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, paddingLeft: 18, paddingRight: 12 },
  stepsHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8, paddingBottom: 6 },
  stepsText: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.muted },
  bar: { height: 3, borderRadius: 2, backgroundColor: colors.line, overflow: 'hidden', marginBottom: 8 },
  barFill: { height: 3, borderRadius: 2 },
  stepsList: { paddingBottom: 6 },
  finish: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.successSoft, marginTop: 4, marginBottom: 4 },
  finishText: { fontSize: 12, fontWeight: '800', color: colors.success },
  play: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
}));
