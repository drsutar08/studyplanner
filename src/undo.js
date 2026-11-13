import { useStore } from './store';
import { useToast } from './toast';
import { dateKey } from './dates';
import { t } from './i18n';

const short = (s, n = 34) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const TRASH = 'trash-outline';

// Anything that removes data happens at once and can be reversed from the toast for a few seconds.
// There are no pop-up dialogs: the toast is the only message the app shows.
export function useUndoableDelete() {
  const { state, dispatch } = useStore();
  const { show } = useToast();

  const deleteTask = (task) => {
    dispatch({ type: 'DELETE_TASK', id: task.id });
    show({ icon: TRASH, message: t('undo.taskDeleted', { title: short(task.title) }), actionLabel: t('common.undo'), onAction: () => dispatch({ type: 'RESTORE_TASK', task }) });
  };

  const deleteExam = (exam) => {
    dispatch({ type: 'DELETE_EXAM', id: exam.id });
    show({ icon: TRASH, message: t('undo.examDeleted', { title: short(exam.title) }), actionLabel: t('common.undo'), onAction: () => dispatch({ type: 'RESTORE_EXAM', exam }) });
  };

  const deleteClass = (cls) => {
    dispatch({ type: 'DELETE_CLASS', id: cls.id });
    show({ icon: TRASH, message: t(cls.kind === 'activity' ? 'undo.activityDeleted' : 'undo.classDeleted', { title: short(cls.title) }), actionLabel: t('common.undo'), onAction: () => dispatch({ type: 'RESTORE_CLASS', cls }) });
  };

  const deleteSubject = (subject) => {
    const taskIds = state.tasks.filter((t) => t.subjectId === subject.id).map((t) => t.id);
    const classIds = state.classes.filter((c) => c.subjectId === subject.id).map((c) => c.id);
    dispatch({ type: 'DELETE_SUBJECT', id: subject.id });
    show({
      icon: TRASH,
      message: t('undo.subjectDeleted', { title: short(subject.name) }),
      actionLabel: t('common.undo'),
      onAction: () => dispatch({ type: 'RESTORE_SUBJECT', subject, taskIds, classIds }),
    });
  };

  // Stop a repeating task: its upcoming unfinished copies go too, and Undo brings back the repeat and those copies
  const stopRepeating = (rec) => {
    const today = dateKey();
    const removed = state.tasks.filter((t) => t.recurId === rec.id && !t.done && t.due >= today);
    dispatch({ type: 'DELETE_RECURRING', id: rec.id });
    show({
      icon: TRASH,
      message: t('undo.stoppedRepeating', { title: short(rec.title) }),
      actionLabel: t('common.undo'),
      onAction: () => dispatch({ type: 'RESTORE_RECURRING', recurring: rec, tasks: removed }),
    });
  };

  const clearPastExams = (exams) => {
    exams.forEach((e) => dispatch({ type: 'DELETE_EXAM', id: e.id }));
    show({
      icon: TRASH,
      message: t('undo.pastExamsCleared', { count: exams.length }),
      actionLabel: t('common.undo'),
      onAction: () => exams.forEach((exam) => dispatch({ type: 'RESTORE_EXAM', exam })),
    });
  };

  const clearPastClasses = (classes) => {
    classes.forEach((c) => dispatch({ type: 'DELETE_CLASS', id: c.id }));
    show({
      icon: TRASH,
      message: t('undo.pastClassesCleared', { count: classes.length }),
      actionLabel: t('common.undo'),
      onAction: () => classes.forEach((cls) => dispatch({ type: 'RESTORE_CLASS', cls })),
    });
  };

  const deleteVacation = (vacation) => {
    dispatch({ type: 'DELETE_VACATION', id: vacation.id });
    show({ icon: TRASH, message: t('undo.vacationDeleted', { title: short(vacation.title) }), actionLabel: t('common.undo'), onAction: () => dispatch({ type: 'RESTORE_VACATION', vacation }) });
  };

  const clearPastVacations = (vacations) => {
    vacations.forEach((v) => dispatch({ type: 'DELETE_VACATION', id: v.id }));
    show({
      icon: TRASH,
      message: t('undo.pastBreaksCleared', { count: vacations.length }),
      actionLabel: t('common.undo'),
      onAction: () => vacations.forEach((vacation) => dispatch({ type: 'RESTORE_VACATION', vacation })),
    });
  };

  // Wipe every task, subject, session, exam and repeat; Undo puts everything back
  const resetAllData = () => {
    const previous = { subjects: state.subjects, tasks: state.tasks, sessions: state.sessions, exams: state.exams, recurring: state.recurring, classes: state.classes, term: state.term, vacations: state.vacations, rotation: state.rotation, groups: state.groups, archive: state.archive, cards: state.cards, achievements: state.achievements };
    dispatch({ type: 'RESET' });
    show({ icon: TRASH, message: t('undo.allCleared'), actionLabel: t('common.undo'), onAction: () => dispatch({ type: 'REPLACE_DATA', data: previous }) });
  };

  return { deleteTask, deleteExam, deleteClass, deleteSubject, stopRepeating, clearPastExams, clearPastClasses, deleteVacation, clearPastVacations, resetAllData };
}
