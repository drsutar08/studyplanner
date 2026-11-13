import { useAuth } from './auth';
import { useStore, forgetDevice } from './store';
import { useToast } from './toast';
import { t } from './i18n';

const GRACE_MS = 6000;

// Account actions that talk through the toast instead of pop-up dialogs.
export function useAccountActions() {
  const { logout, deleteAccount, user } = useAuth();
  const { sync } = useStore();
  const { show } = useToast();

  // Signing out sends what's left to the cloud, then removes the account's copy from this device (it's in the
  // cloud). If some changes can't be sent (offline), it says so instead, and can still sign out.
  const finishSignOut = async () => {
    const id = user && user.id;
    await logout();
    if (id) await forgetDevice(id);
    show({ tone: 'success', message: t('account.signedOut') });
  };
  const signOut = async () => {
    const left = sync ? await sync.flush() : 0;
    if (left > 0) {
      show({ tone: 'error', duration: 10000, message: t('account.unsent', { count: left }), actionLabel: t('account.signOutAnyway'), onAction: finishSignOut });
      return;
    }
    await finishSignOut();
  };

  // Deleting an account cannot be taken back, so it waits a few seconds and can be cancelled from the toast.
  // Closing the app during that time cancels it.
  const deleteAccountWithUndo = () => {
    show({
      icon: 'trash-outline',
      message: t('account.deleting'),
      actionLabel: t('common.undo'),
      duration: GRACE_MS,
      onAction: () => show({ tone: 'success', message: t('account.kept') }),
      onExpire: async () => {
        const res = await deleteAccount();
        if (res && res.error) show({ tone: 'error', message: t('account.deleteFailed', { error: res.error }) });
        else show({ tone: 'success', message: t('account.deleted') });
      },
    });
  };

  return { signOut, deleteAccountWithUndo };
}
