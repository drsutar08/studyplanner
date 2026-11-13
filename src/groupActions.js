import { useStore } from './store';
import { useToast } from './toast';
import { t } from './i18n';
import { dateKey } from './dates';
import { joinPlan, groupEntry, withoutGroup } from './share';
import { leaveGroup, joinGroup, groupErrorKind } from './cloud/liveGroups';

// The lists a group join or leave can change, as they are now (for Undo)
const snapshot = (state) => ({ subjects: state.subjects, tasks: state.tasks, classes: state.classes, exams: state.exams, vacations: state.vacations, rotation: state.rotation, groups: state.groups || [] });

// Joining a study group from a share (share.js), or leaving one, each with Undo. A live group (in the cloud)
// also keeps `version` (when it last changed) so the app can take each new one; `quiet` is such an update.
export function useGroupActions() {
  const { state, dispatch } = useStore();
  const { show } = useToast();

  const join = (share, { live = false, version = null, quiet = false } = {}) => {
    const batch = `grp${Date.now().toString(36)}`;
    const plan = joinPlan(share, withoutGroup(state, share.id), batch);
    const group = { ...groupEntry(share, plan, batch, dateKey()), ...(live ? { live: true, version } : {}) };
    const again = (state.groups || []).some((g) => g.id === group.id);
    const before = snapshot(state);
    dispatch({ type: 'JOIN_GROUP', group, plan });
    const count = plan.classes.length + plan.exams.length + plan.vacations.length;
    show({
      tone: 'success',
      ...(quiet ? { duration: 3000 } : {}),
      message: again ? t('groups.updated', { name: group.name }) : t('groups.joined', { name: group.name, count }),
      actionLabel: t('common.undo'),
      onAction: () => dispatch({ type: 'RESTORE_LISTS', lists: before }),
    });
  };

  const leave = (group) => {
    const before = snapshot(state);
    dispatch({ type: 'LEAVE_GROUP', id: group.id });
    if (group.live) leaveGroup(group.id).catch(() => {});
    show({ message: t('groups.left', { name: group.name }), actionLabel: t('common.undo'), onAction: () => dispatch({ type: 'RESTORE_LISTS', lists: before }) });
  };

  // a live group's link ({ id, code }): become a member, then take what it holds now
  const joinLive = async (ref) => {
    try {
      const row = await joinGroup(ref);
      if (!row) return show({ tone: 'error', message: t('groups.errors.notShare') });
      join({ ...row.payload, id: row.id, n: row.name, f: row.owner_name }, { live: true, version: row.updated_at });
    } catch (e) {
      show({ tone: 'error', message: t(`groups.errors.${groupErrorKind(e)}`) });
    }
  };

  return { join, joinLive, leave, groups: state.groups || [] };
}
