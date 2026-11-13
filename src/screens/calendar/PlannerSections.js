import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, type } from '../../theme';
import { t } from '../../i18n';
import { formatDue, dayLetters } from '../../dates';
import TaskRow from '../../components/TaskRow';
import ExamItem from '../../components/ExamItem';
import VacationRow from '../../components/VacationRow';
import { SelectBar, SelectButton, PickRow } from '../../components/BulkActions';
import { describeDays } from './helpers';
import { styles } from './styles';

// The Calendar's planner sections (below the month on a phone, as tabs on the desktop): the selected day's
// tasks, upcoming exams, breaks and repeating tasks. Each is a heading with an "add" link, the list, and a
// way to clear past items.

const Head = ({ title, icon, label, a11y, onAdd, extra }) => (
  <View style={styles.sectionHead}>
    <Text style={[type.h2, { flex: 1 }]}>{title}</Text>
    {extra}
    {onAdd ? (
      <Pressable style={styles.linkBtn} onPress={onAdd} accessibilityLabel={a11y || label}>
        <Ionicons name={icon} size={16} color={colors.accent} />
        <Text style={styles.linkText}>{label}</Text>
      </Pressable>
    ) : null}
  </View>
);

const Empty = ({ icon, text, onPress, tint = colors.accent }) => (
  <Pressable style={styles.examEmpty} onPress={onPress}>
    <Ionicons name={icon} size={20} color={tint} />
    <Text style={styles.examEmptyText}>{text}</Text>
  </Pressable>
);

const ClearPast = ({ text, onPress }) => (
  <Pressable onPress={onPress}>
    <Text style={styles.clear}>{text}</Text>
  </Pressable>
);

// The selected day's tasks. `chip` is TaskRow's addStepChip (true, or 'hover' on the desktop). `sel` (a
// useTaskSelection()) picks several to complete, move or delete together.
export function TasksSection({ day, tasks, subjectById, chip, onAdd, onToggle, onDelete, onEdit, onFocus, sel }) {
  const row = (tk) => <TaskRow key={tk.id} task={tk} subject={subjectById[tk.subjectId]} onToggle={() => onToggle(tk)} onDelete={() => onDelete(tk)} onEdit={() => onEdit(tk)} onFocus={() => onFocus(tk)} addStepChip={chip} />;
  return (
    <>
      {sel && sel.selecting ? (
        <View style={{ marginTop: 28, marginBottom: 12 }}>
          <SelectBar count={sel.picked.length} total={tasks.length} onAll={() => sel.pickAll(tasks.map((tk) => tk.id))} onNone={() => sel.pickAll([])} onCancel={sel.stop} />
        </View>
      ) : (
        <Head
          title={t('tasksSection.title', { day: formatDue(day) })}
          icon="checkbox-outline"
          label={t('tasksSection.add')}
          a11y={t('tasksSection.addA11y')}
          onAdd={onAdd}
          extra={sel && tasks.length > 1 ? <SelectButton onPress={sel.start} /> : null}
        />
      )}
      {tasks.length === 0 ? (
        <Empty icon="checkbox-outline" text={t('tasksSection.empty', { day: formatDue(day) })} onPress={onAdd} />
      ) : (
        tasks.map((tk) => (sel && sel.selecting ? <PickRow key={tk.id} sel={sel} task={tk}>{row(tk)}</PickRow> : row(tk)))
      )}
    </>
  );
}

// Upcoming exams; past ones without a score or attendance can be cleared. `examMark(e)` gives an exam's
// attendance strip props (for today's and earlier exams).
export function ExamsSection({ upcoming, past, subjectById, examMark, onAdd, onOpenDay, onEdit, onDelete, onClearPast }) {
  return (
    <>
      <Head title={t('calendar.upcomingExams')} icon="flag-outline" label={t('calendar.addExam')} onAdd={onAdd} />
      {upcoming.length === 0 ? (
        <Empty icon="flag-outline" text={t('calendar.noExams')} onPress={onAdd} />
      ) : (
        upcoming.map((e) => <ExamItem key={e.id} exam={e} subject={subjectById[e.subjectId]} onPress={() => onOpenDay(e.date)} {...examMark(e)} onEdit={() => onEdit(e)} onDelete={() => onDelete(e)} />)
      )}
      {past.length > 0 ? <ClearPast text={t('calendar.clearPastExams', { count: past.length })} onPress={() => onClearPast(past)} /> : null}
    </>
  );
}

// Breaks (vacations): upcoming and current ones; past ones can be cleared
export function VacationsSection({ upcoming, past, onAdd, onEdit, onDelete, onClearPast }) {
  return (
    <>
      <Head title={t('calendar.vacations')} icon="sunny-outline" label={t('calendar.addVacation')} onAdd={onAdd} />
      {upcoming.length === 0 ? (
        <Empty icon="sunny-outline" text={t('calendar.noBreaks')} onPress={onAdd} tint={colors.teal} />
      ) : (
        upcoming.map((v) => <VacationRow key={v.id} vacation={v} onEdit={() => onEdit(v)} onDelete={() => onDelete(v)} />)
      )}
      {past.length > 0 ? <ClearPast text={t('calendar.clearPastBreaks', { count: past.length })} onPress={() => onClearPast(past)} /> : null}
    </>
  );
}

// Repeating tasks (the templates): their days as letters, edit and stop
export function RepeatsSection({ recurring, subjectById, onEdit, onStop }) {
  return (
    <>
      <Head title={t('calendar.repeating')} />
      {recurring.length === 0 ? (
        <Text style={styles.hint}>{t('calendar.repeatingHint')}</Text>
      ) : (
        recurring.map((r) => {
          const s = subjectById[r.subjectId];
          const tint = s ? s.color : colors.accent;
          return (
            <View key={r.id} style={styles.recRow}>
              <View style={[styles.recIcon, { backgroundColor: tint + '22' }]}>
                <Ionicons name="repeat" size={20} color={tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.recTitle} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={styles.recSub}>{[describeDays(r.days), t('common.minutes', { count: r.estimate }), s && s.name].filter(Boolean).join(' · ')}</Text>
                <View style={styles.weekRow}>
                  {dayLetters().map((l, d) => {
                    const on = r.days.includes(d);
                    return (
                      <View key={d} style={[styles.weekDot, on && { backgroundColor: tint }]}>
                        <Text style={[styles.weekDotText, on && { color: colors.onAccent }]}>{l}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Pressable onPress={() => onEdit(r)} hitSlop={10} accessibilityLabel={t('calendar.editRepeatingA11y', { title: r.title })} style={styles.iconBtn}>
                  <Ionicons name="create-outline" size={17} color={colors.muted} />
                </Pressable>
                <Pressable onPress={() => onStop(r)} hitSlop={10} accessibilityLabel={t('calendar.stopRepeatingA11y', { title: r.title })} style={styles.iconBtn}>
                  <Ionicons name="trash-outline" size={17} color={colors.muted} />
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </>
  );
}
