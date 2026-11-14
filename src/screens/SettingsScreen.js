import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, Platform, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, shadow, getScheme, themedStyles } from '../theme';
import { t, LANGUAGES, LANGUAGE_CHOICE, weekdayName } from '../i18n';
import { formatTime, dateKey } from '../dates';
import { usualStudyTime } from '../smartReminders';
import { useStore } from '../store';
import { useAuth } from '../auth';
import { notificationsSupported, requestPermission } from '../notifications';
import { buildBackup, backupFileName } from '../backup';
import { useIntro } from '../intro';
import { useToast } from '../toast';
import { useAccountActions } from '../actions';
import { useUndoableDelete } from '../undo';
import RestoreSheet from '../components/RestoreSheet';
import ImportCalendarSheet from '../components/ImportCalendarSheet';
import ArchiveSheet from '../components/ArchiveSheet';
import GroupBoardSheet from '../components/GroupBoardSheet';
import ClassroomsSheet from '../components/ClassroomsSheet';
import { useClassroomList } from '../cloud/classrooms';
import { summary as classroomSummary } from '../classrooms';
import { cloudConfigured } from '../cloud/supabase';
import PrivacySheet from '../components/PrivacySheet';
import { openPremium } from '../components/PremiumSheet';
import { usePlan } from '../cloud/plan';
import { showSampleData } from '../variant';
import { useInstall, installApp } from '../install';
import LegacyImportSheet from '../components/LegacyImportSheet';
import { findLegacyAccounts, markLegacyImported, unmarkLegacyImported } from '../legacyAccounts';
import { mergeLegacy } from '../legacyImport';
import { ShareGroupSheet, JoinGroupSheet } from '../components/GroupSheets';
import { useGroupActions } from '../groupActions';
import { buildIcs } from '../ics';
import { shortcutsSupported, showShortcutHelp } from '../shortcuts';
import Avatar from '../components/Avatar';
import { useTwoColumns } from '../layout';
import { focusRules, SHORT_BREAK_OPTIONS, LONG_BREAK_OPTIONS, ROUND_OPTIONS } from '../focusTimer';
import { sampleData } from '../sampleData';

const hourLabel = (h) => formatTime(`${String(h).padStart(2, '0')}:00`);

const FOCUS_OPTIONS = [25, 45, 60];
const GOAL_MIN = 15;
const GOAL_MAX = 240;

// The cloud sync row's line: what it is doing, or when it last finished
const syncText = ({ status, lastSynced, pending, unsynced }) => {
  const line = syncState({ status, lastSynced });
  return unsynced && status !== 'syncing' ? `${line} · ${t('cloud.unsent', { count: pending })}` : line;
};
const syncState = ({ status, lastSynced }) => {
  if (status === 'syncing') return t('cloud.syncing');
  if (status === 'offline') return t('cloud.offline');
  if (status === 'error') return t('cloud.error');
  if (!lastSynced) return t('cloud.waiting');
  const hhmm = `${String(lastSynced.getHours()).padStart(2, '0')}:${String(lastSynced.getMinutes()).padStart(2, '0')}`;
  return t('cloud.synced', { time: Date.now() - lastSynced.getTime() < 60000 ? t('cloud.justNow') : formatTime(hhmm) });
};

export default function SettingsScreen({ navigation }) {
  const { state, dispatch, sync } = useStore();
  const { replay } = useIntro();
  const { show } = useToast();
  const install = useInstall(); // 'prompt' | 'ios' | null: whether the web app can be installed
  const plan = usePlan(); // Free or Premium, for the Premium row
  const { signOut, deleteAccountWithUndo } = useAccountActions();
  const { resetAllData } = useUndoableDelete();
  const [restoring, setRestoring] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false); // Privacy & data
  const [board, setBoard] = useState(null); // a joined live group whose board is open
  const [classroomsOpen, setClassroomsOpen] = useState(false);
  const classrooms = useClassroomList();
  const rooms = classroomSummary(classrooms);
  const [archiving, setArchiving] = useState(false);
  // accounts from the older (on-device) version still on this device
  const [legacy, setLegacy] = useState([]);
  const [importingOld, setImportingOld] = useState(false);
  useEffect(() => {
    let alive = true;
    findLegacyAccounts().then((list) => alive && setLegacy(list));
    return () => {
      alive = false;
    };
  }, []);
  const [joining, setJoining] = useState(false);
  const { join, joinLive, leave, groups } = useGroupActions();
  const { user, settings, updateSettings } = useAuth();
  const twoColumns = useTwoColumns();
  const rules = focusRules(settings);

  const setHour = (d) => updateSettings({ reminderHour: (settings.reminderHour + d + 24) % 24 });

  const togglePush = async (on) => {
    if (!on) return updateSettings({ pushEnabled: false });
    const ok = await requestPermission();
    if (ok) updateSettings({ pushEnabled: true });
    else show({ tone: 'error', duration: 8000, message: t('settings.pushBlocked') });
  };

  const setGoal = (delta) =>
    updateSettings({ dailyGoal: Math.min(GOAL_MAX, Math.max(GOAL_MIN, settings.dailyGoal + delta)) });

  const exportBackup = async () => {
    const json = buildBackup(state, user);
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFileName();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      show({ tone: 'success', message: t('settings.backupSaved') });
    } else {
      try {
        await Share.share({ title: backupFileName(), message: json });
      } catch {
        show({ tone: 'error', message: t('settings.backupShareFailed') });
      }
    }
  };

  // Classes and activities (each session up to the end of term or 6 months), exams and breaks as a calendar file
  const exportCalendar = async () => {
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const ics = buildIcs(state, { fromKey: dateKey(now), stamp, name: t('ics.calendarName') });
    const name = `studyplanner-${dateKey(now)}.ics`;
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      show({ tone: 'success', message: t('ics.saved') });
    } else {
      try {
        await Share.share({ title: name, message: ics });
      } catch {
        show({ tone: 'error', message: t('settings.backupShareFailed') });
      }
    }
  };

  // Add what a calendar file holds; Undo takes exactly that import back out
  const applyImport = (plan) => {
    const batch = `ics${Date.now().toString(36)}`;
    dispatch({ type: 'IMPORT_RECORDS', batch, classes: plan.classes, exams: plan.exams, vacations: plan.vacations });
    setImporting(false);
    const count = plan.classes.length + plan.exams.length + plan.vacations.length;
    show({ message: t('ics.imported', { count }), actionLabel: t('common.undo'), onAction: () => dispatch({ type: 'UNDO_IMPORT', batch }) });
  };

  const applyRestore = (data) => {
    const previous = { subjects: state.subjects, tasks: state.tasks, sessions: state.sessions, exams: state.exams, recurring: state.recurring, classes: state.classes, term: state.term, vacations: state.vacations, rotation: state.rotation, groups: state.groups, archive: state.archive, cards: state.cards, achievements: state.achievements };
    dispatch({ type: 'REPLACE_DATA', data });
    setRestoring(false);
    show({ message: t('settings.backupRestored'), actionLabel: t('common.undo'), onAction: () => dispatch({ type: 'REPLACE_DATA', data: previous }) });
  };

  const loadSample = () => {
    const previous = { subjects: state.subjects, tasks: state.tasks, sessions: state.sessions, exams: state.exams, recurring: state.recurring, classes: state.classes, term: state.term, vacations: state.vacations, rotation: state.rotation, groups: state.groups, archive: state.archive, cards: state.cards, achievements: state.achievements };
    dispatch({ type: 'REPLACE_DATA', data: sampleData(new Date()) });
    show({ message: t('settings.sampleLoaded'), actionLabel: t('common.undo'), onAction: () => dispatch({ type: 'REPLACE_DATA', data: previous }) });
  };

  // a row of small option buttons (minutes, sessions)
  const options = (values, current, onPick, a11y) => (
    <View style={styles.seg}>
      {values.map((v) => {
        const on = current === v;
        return (
          <Pressable key={v} onPress={() => onPick(v)} style={[styles.segItem, on && styles.segOn]} accessibilityRole="button" aria-pressed={!!on} accessibilityState={{ selected: on }} accessibilityLabel={a11y(v)}>
            <Text style={[styles.segText, on && { color: colors.onAccent }]}>{v}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const switchProps = { trackColor: { true: colors.accent, false: colors.faint }, thumbColor: colors.onAccent };
  const usual = usualStudyTime(state.sessions, dateKey()); // the smart reminder's time, once there's a habit to see

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <ScrollView contentContainerStyle={[styles.content, twoColumns && styles.contentWide]} showsVerticalScrollIndicator={false}>
        <View style={twoColumns ? styles.wideRow : null}>
        <View style={twoColumns ? styles.col : null}>
        <LinearGradient colors={['#151B33', '#2A3A9E', '#7A5CFA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.glow} pointerEvents="none" />
          <View style={styles.kickerPill}>
            <Ionicons name="settings" size={11} color="#C9D0FF" />
            <Text style={styles.heroKicker}>{t('settings.kicker')}</Text>
          </View>
          <Text style={styles.heroTitle}>{t('settings.heroTitle')}</Text>
          <Text style={styles.heroSub}>{t('settings.heroSub')}</Text>

          <Pressable style={styles.account} onPress={() => navigation.navigate('Profile')} accessibilityLabel={t('settings.openProfile')}>
            <Avatar size={46} name={user.name} />
            <View style={{ flex: 1 }}>
              <Text style={styles.accName} numberOfLines={1}>{user.name}</Text>
              <Text style={styles.accEmail} numberOfLines={1}>{user.email}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#C9D0FF" />
          </Pressable>
        </LinearGradient>

        <Section title={t('settings.goals')}>
          <Row icon="trophy-outline" tint="#F2A541" label={t('settings.dailyGoal')} sub={t('settings.dailyGoalSub')} last>
            <View style={styles.stepper}>
              <Pressable onPress={() => setGoal(-15)} style={styles.stepBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('settings.decreaseGoal')}>
                <Ionicons name="remove" size={18} color={colors.accent} />
              </Pressable>
              <Text style={styles.stepVal}>{t('common.minutes', { count: settings.dailyGoal })}</Text>
              <Pressable onPress={() => setGoal(15)} style={styles.stepBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('settings.increaseGoal')}>
                <Ionicons name="add" size={18} color={colors.accent} />
              </Pressable>
            </View>
          </Row>
        </Section>

        <Section title={t('settings.focusTimer')}>
          <Row icon="timer-outline" tint="#7A5CFA" label={t('settings.focusLength')} sub={t('settings.focusLengthSub')}>
            <View style={styles.seg}>
              {FOCUS_OPTIONS.map((m) => {
                const on = settings.focusMinutes === m;
                return (
                  <Pressable key={m} onPress={() => updateSettings({ focusMinutes: m })} style={[styles.segItem, on && styles.segOn]}>
                    <Text style={[styles.segText, on && { color: colors.onAccent }]}>{m}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Row>
          <Row icon="cafe-outline" tint="#14A38B" label={t('settings.shortBreak')} sub={t('settings.shortBreakSub')}>
            {options(SHORT_BREAK_OPTIONS, rules.shortBreak, (v) => updateSettings({ shortBreak: v }), (v) => t('settings.breakA11y', { count: v }))}
          </Row>
          <Row icon="bed-outline" tint="#2E86DE" label={t('settings.longBreak')} sub={t('settings.longBreakSub', { n: rules.round })}>
            {options(LONG_BREAK_OPTIONS, rules.longBreak, (v) => updateSettings({ longBreak: v }), (v) => t('settings.breakA11y', { count: v }))}
          </Row>
          <Row icon="repeat" tint="#7A5CFA" label={t('settings.focusRound')} sub={t('settings.focusRoundSub')}>
            {options(ROUND_OPTIONS, rules.round, (v) => updateSettings({ focusRound: v }), (v) => t('settings.roundA11y', { count: v }))}
          </Row>
          <Row icon="sunny-outline" tint="#F2A541" label={t('settings.keepAwake')} sub={t('settings.keepAwakeSub')} last>
            <Switch accessibilityLabel={t('settings.keepAwake')} value={settings.keepAwake !== false} onValueChange={(v) => updateSettings({ keepAwake: v })} {...switchProps} />
          </Row>
        </Section>

        <Section title={t('settings.notifications')}>
          <Row icon="notifications-outline" tint={colors.accent} label={t('settings.inAppAlerts')} sub={t('settings.inAppAlertsSub')}>
            <Switch accessibilityLabel={t('settings.inAppAlerts')} value={settings.reminders} onValueChange={(v) => updateSettings({ reminders: v })} {...switchProps} />
          </Row>
          <Row
            icon="phone-portrait-outline"
            tint="#EA580C"
            label={t('settings.push')}
            sub={notificationsSupported ? t('settings.pushSub') : t('settings.pushUnsupported')}
          >
            <Switch accessibilityLabel={t('settings.push')} value={settings.pushEnabled} onValueChange={togglePush} disabled={!notificationsSupported} {...switchProps} />
          </Row>
          {settings.pushEnabled && (
            <Row icon="alarm-outline" tint="#7A5CFA" label={t('settings.dailyReminder')} sub={settings.dailyReminder ? t('settings.dailyReminderAt', { time: hourLabel(settings.reminderHour) }) : t('settings.off')}>
              {settings.dailyReminder ? (
                <View style={styles.stepper}>
                  <Pressable onPress={() => setHour(-1)} style={styles.stepBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('settings.earlierReminder')}>
                    <Ionicons name="remove" size={18} color={colors.accent} />
                  </Pressable>
                  <Text style={styles.stepVal}>{hourLabel(settings.reminderHour)}</Text>
                  <Pressable onPress={() => setHour(1)} style={styles.stepBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('settings.laterReminder')}>
                    <Ionicons name="add" size={18} color={colors.accent} />
                  </Pressable>
                </View>
              ) : null}
              <Switch accessibilityLabel={t('settings.dailyReminder')} value={settings.dailyReminder} onValueChange={(v) => updateSettings({ dailyReminder: v })} {...switchProps} />
            </Row>
          )}
          <Row icon="sparkles-outline" tint="#7A5CFA" label={t('settings.smartReminders')} sub={settings.smartReminders === false ? t('settings.off') : usual ? t('settings.smartRemindersAt', { time: formatTime(usual) }) : t('settings.smartRemindersLearning')}>
            <Switch accessibilityLabel={t('settings.smartReminders')} value={settings.smartReminders !== false} onValueChange={(v) => updateSettings({ smartReminders: v })} {...switchProps} />
          </Row>
          {settings.pushEnabled && (
            <Row icon="hand-left-outline" tint="#17A398" label={t('settings.attendanceNudge')} sub={t('settings.attendanceNudgeSub')}>
              <Switch accessibilityLabel={t('settings.attendanceNudge')} value={settings.attendanceNudge !== false} onValueChange={(v) => updateSettings({ attendanceNudge: v })} {...switchProps} />
            </Row>
          )}
          {settings.pushEnabled && (
            <Row icon="stats-chart-outline" tint="#7A5CFA" label={t('settings.weeklyReport')} sub={t('settings.weeklyReportSub')}>
              <Switch accessibilityLabel={t('settings.weeklyReport')} value={settings.weeklyReport !== false} onValueChange={(v) => updateSettings({ weeklyReport: v })} {...switchProps} />
            </Row>
          )}
          <Row icon="pulse-outline" tint="#17A398" label={t('settings.vibrate')} sub={t('settings.vibrateSub')} last>
            <Switch accessibilityLabel={t('settings.vibrate')} value={settings.vibration} onValueChange={(v) => updateSettings({ vibration: v })} {...switchProps} />
          </Row>
        </Section>

        </View>
        <View style={twoColumns ? [styles.col, styles.colSide] : null}>
        <Section title={t('appearance.title')}>
          <Row icon={getScheme() === 'dark' ? 'moon-outline' : 'sunny-outline'} tint="#7A5CFA" label={t('appearance.theme')} sub={t('appearance.themeHint')} last />
          <View style={[styles.langRow, styles.rowLine]}>
            <View style={styles.seg}>
              {[
                ['system', t('appearance.themeSystem')],
                ['light', t('appearance.themeLight')],
                ['dark', t('appearance.themeDark')],
              ].map(([v, text]) => {
                const on = (settings.theme || 'light') === v;
                return (
                  <Pressable key={v} onPress={() => updateSettings({ theme: v })} accessibilityLabel={t('appearance.themeA11y', { name: text })} accessibilityRole="button" aria-pressed={!!on} accessibilityState={{ selected: on }} style={[styles.segItem, on && styles.segOn]}>
                    <Text style={[styles.segText, on && { color: colors.onAccent }]}>{text}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {LANGUAGE_CHOICE ? (
          <>
          <Row icon="language-outline" tint="#2E86DE" label={t('appearance.language')} sub={t('appearance.languageHint')} last />
          <View style={[styles.langRow, styles.rowLine]}>
            {[{ code: 'system', name: t('appearance.languageSystem') }, ...LANGUAGES].map(({ code, name }) => {
              const on = (settings.language || 'system') === code;
              return (
                <Pressable key={code} onPress={() => updateSettings({ language: code })} accessibilityLabel={t('appearance.languageA11y', { name })} accessibilityRole="button" aria-pressed={!!on} accessibilityState={{ selected: on }} style={[styles.langChip, on && styles.segOn]}>
                  <Text style={[styles.segText, on && { color: colors.onAccent }]}>{name}</Text>
                </Pressable>
              );
            })}
          </View>
          </>
          ) : null}
          {/* reading: text size and the easier-to-read font (theme.js applyReading) */}
          <Row icon="text-outline" tint="#E07B12" label={t('reading.size')} sub={t('reading.sizeHint')} last />
          <View style={[styles.langRow, styles.rowLine]}>
            <View style={styles.seg}>
              {['standard', 'large', 'larger'].map((v) => {
                const on = (settings.textSize || 'standard') === v;
                return (
                  <Pressable key={v} onPress={() => updateSettings({ textSize: v })} accessibilityLabel={t('reading.sizeA11y', { name: t(`reading.sizes.${v}`) })} accessibilityRole="button" aria-pressed={!!on} accessibilityState={{ selected: on }} style={[styles.segItem, on && styles.segOn]}>
                    <Text style={[styles.segText, on && { color: colors.onAccent }]}>{t(`reading.sizes.${v}`)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Row icon="book-outline" tint="#157A52" label={t('reading.font')} sub={t('reading.fontHint')} last>
            <Switch accessibilityLabel={t('reading.font')} value={!!settings.readingFont} onValueChange={(v) => updateSettings({ readingFont: v })} {...switchProps} />
          </Row>
        </Section>

        <Section title={t('settings.calendar')}>
          <Row icon="calendar-outline" tint="#17A398" label={t('settings.weekStart')} sub={t('settings.weekStartSub')} last>
            <View style={styles.seg}>
              {[0, 1].map((v) => {
                const on = (settings.weekStart || 0) === v;
                const text = weekdayName(v, 'short');
                return (
                  <Pressable key={v} onPress={() => updateSettings({ weekStart: v })} accessibilityLabel={t('settings.weekStartA11y', { day: text })} style={[styles.segItem, on && styles.segOn]}>
                    <Text style={[styles.segText, on && { color: colors.onAccent }]}>{text}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Row>
        </Section>

        <Section title={t('groups.section')}>
          <Row icon="share-social-outline" tint={colors.accent} label={t('groups.shareRow')} sub={t('groups.shareRowSub')} onPress={() => setSharing(true)} />
          <Row icon="people-circle-outline" tint="#157A52" label={t('together.setting')} sub={t('together.settingSub')}>
            <Switch accessibilityLabel={t('together.setting')} value={settings.shareStudying !== false} onValueChange={(v) => updateSettings({ shareStudying: v })} {...switchProps} />
          </Row>
          <Row icon="people-outline" tint="#16A085" label={t('groups.joinRow')} sub={t('groups.joinRowSub')} last={!groups.length} onPress={() => setJoining(true)} />
          {groups.map((g, i) => (
            <Row
              key={g.id}
              icon="people"
              tint="#16A085"
              label={g.name}
              sub={[g.live ? t('groups.liveTag') : null, g.from ? t('groups.from', { name: g.from }) : null, [t('restore.counts.classes', { count: g.counts.classes || 0 }), t('restore.counts.exams', { count: g.counts.exams || 0 })].join(', ')].filter(Boolean).join(' · ')}
              last={i === groups.length - 1}
            >
              {g.live ? (
                <Pressable onPress={() => setBoard(g)} hitSlop={8} style={styles.groupBtn} accessibilityRole="button" accessibilityLabel={t('board.openA11y', { name: g.name })}>
                  <Ionicons name="clipboard-outline" size={17} color={colors.accent} />
                </Pressable>
              ) : null}
              {g.live ? null : (
                <Pressable onPress={() => setJoining(true)} hitSlop={8} style={styles.groupBtn} accessibilityRole="button" accessibilityLabel={t('groups.updateA11y', { name: g.name })}>
                  <Ionicons name="refresh" size={17} color={colors.muted} />
                </Pressable>
              )}
              <Pressable onPress={() => leave(g)} hitSlop={8} style={styles.groupBtn} accessibilityRole="button" accessibilityLabel={t('groups.leaveA11y', { name: g.name })}>
                <Ionicons name="exit-outline" size={18} color={colors.danger} />
              </Pressable>
            </Row>
          ))}
        </Section>

        {cloudConfigured && user ? (
          <Section title={t('classroom.section')}>
            <Row
              icon="school-outline"
              tint={colors.accent}
              label={t('classroom.row')}
              sub={
                rooms.teaching || rooms.joined
                  ? [t('classroom.rowCounts', rooms), rooms.waiting ? t('classroom.rowWaiting', { count: rooms.waiting }) : null].filter(Boolean).join(' · ')
                  : t('classroom.rowSub')
              }
              last
              onPress={() => setClassroomsOpen(true)}
            />
          </Section>
        ) : null}

        <Section title={t('settings.data')}>
          <Row icon="shield-checkmark-outline" tint="#157A52" label={t('privacy.row')} sub={t('privacy.rowSub')} onPress={() => setPrivacyOpen(true)} />
          <Row icon="download-outline" tint="#2E86DE" label={t('settings.export')} sub={t('settings.exportSub')} onPress={exportBackup} />
          <Row icon="cloud-upload-outline" tint="#7A5CFA" label={t('settings.restore')} sub={t('settings.restoreSub')} onPress={() => setRestoring(true)} />
          <Row icon="calendar-outline" tint="#16A085" label={t('ics.export')} sub={t('ics.exportSub')} onPress={exportCalendar} />
          <Row icon="calendar-number-outline" tint="#2E86DE" label={t('ics.import')} sub={t('ics.importSub')} onPress={() => setImporting(true)} />
          {legacy.length ? (
            <Row icon="git-merge-outline" tint="#8E7DBE" label={t('legacy.row')} sub={t('legacy.rowSub', { count: legacy.length })} onPress={() => setImportingOld(true)} />
          ) : null}
          <Row
            icon="archive-outline"
            tint="#8E7DBE"
            label={t('archive.row')}
            sub={(settings.archiveAfter ?? 60) ? t('archive.rowSub', { count: (state.archive || []).length, days: settings.archiveAfter ?? 60 }) : t('archive.rowOff', { count: (state.archive || []).length })}
            onPress={() => setArchiving(true)}
            last={!showSampleData}
          />
          {/* sample data: the Development app only (variant.js) */}
          {showSampleData ? <Row icon="sparkles-outline" tint="#F2A541" label={t('settings.sample')} sub={t('settings.sampleSub')} last onPress={loadSample} /> : null}
        </Section>

        <Section title={t('settings.account')}>
          <Row icon="diamond-outline" tint="#94600F" label={t('premium.title')} sub={plan.plan === 'premium' ? t('premium.rowPremium') : t('premium.rowFree')} onPress={() => openPremium()} />
          <Row
            icon={sync.status === 'offline' ? 'cloud-offline-outline' : sync.status === 'error' ? 'alert-circle-outline' : sync.unsynced ? 'cloud-upload-outline' : 'cloud-done-outline'}
            tint={sync.status === 'error' ? colors.danger : sync.status === 'offline' || sync.unsynced ? '#E67E22' : '#16A085'}
            label={t('cloud.syncRow')}
            sub={syncText(sync)}
          >
            <Pressable onPress={sync.syncNow} disabled={sync.status === 'syncing'} hitSlop={8} style={[styles.syncBtn, sync.status === 'syncing' && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel={t('cloud.syncNow')}>
              <Ionicons name="sync" size={15} color={colors.accent} />
              <Text style={styles.syncBtnText}>{t('cloud.syncNow')}</Text>
            </Pressable>
          </Row>
          <Row
            icon="log-out-outline"
            tint={colors.muted}
            label={t('settings.signOut')}
            sub={t('settings.signOutSub')}
            last
            onPress={signOut}
          />
        </Section>

        <Section title={t('settings.danger')} danger>
          <Row
            icon="refresh-outline"
            tint="#EA580C"
            label={t('settings.reset')}
            sub={t('settings.resetSub')}
            onPress={resetAllData}
          />
          <Row
            icon="trash-outline"
            tint={colors.danger}
            label={t('settings.deleteAccount')}
            sub={t('settings.deleteAccountSub')}
            danger
            last
            onPress={deleteAccountWithUndo}
          />
        </Section>

        <Section title={t('settings.about')}>
          {install ? (
            <Row
              icon="download-outline"
              tint="#157A52"
              label={t('install.row')}
              sub={install === 'ios' ? t('install.iosSub') : t('install.sub')}
              onPress={
                install === 'ios'
                  ? () => show({ icon: 'share-outline', message: t('install.iosHow'), duration: 9000 })
                  : async () => {
                      if (await installApp()) show({ tone: 'success', message: t('install.done') });
                    }
              }
            />
          ) : null}
          <Row icon="play-circle-outline" tint={colors.accent} label={t('settings.intro')} sub={t('settings.introSub')} last={!shortcutsSupported} onPress={replay} />
          {shortcutsSupported ? <Row icon="keypad-outline" tint="#7A5CFA" label={t('shortcuts.title')} sub={t('shortcuts.settingsSub')} last onPress={showShortcutHelp} /> : null}
        </Section>

        <View style={styles.about}>
          <View style={styles.aboutLogo}>
            <Ionicons name="school" size={16} color={colors.onAccent} />
          </View>
          <Text style={styles.aboutName}>Studyly</Text>
          <Text style={styles.aboutVer}>{t('settings.version', { version: '1.0' })}</Text>
        </View>
        </View>
        </View>
      </ScrollView>
      <RestoreSheet visible={restoring} onClose={() => setRestoring(false)} onRestore={applyRestore} />
      <ShareGroupSheet visible={sharing} onClose={() => setSharing(false)} state={state} user={user} />
      <JoinGroupSheet
        visible={joining}
        onClose={() => setJoining(false)}
        state={state}
        onJoin={(share, live) => {
          setJoining(false);
          if (live) joinLive(live);
          else join(share);
        }}
      />
      <GroupBoardSheet visible={!!board} group={board} onClose={() => setBoard(null)} />
      <ClassroomsSheet visible={classroomsOpen} onClose={() => setClassroomsOpen(false)} />
      <PrivacySheet
        visible={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        onExport={exportBackup}
        onDelete={() => {
          setPrivacyOpen(false);
          deleteAccountWithUndo();
        }}
        shareStudying={settings.shareStudying !== false}
        onShareStudying={(v) => updateSettings({ shareStudying: v })}
      />
      <LegacyImportSheet
        visible={importingOld}
        onClose={() => setImportingOld(false)}
        accounts={legacy}
        onImport={(account) => {
          const previous = { subjects: state.subjects, tasks: state.tasks, sessions: state.sessions, exams: state.exams, recurring: state.recurring, classes: state.classes, term: state.term, vacations: state.vacations, rotation: state.rotation, groups: state.groups, archive: state.archive, cards: state.cards, achievements: state.achievements };
          const { data, added } = mergeLegacy(previous, account.data);
          dispatch({ type: 'REPLACE_DATA', data });
          markLegacyImported(account.id);
          setLegacy((list) => list.filter((a) => a.id !== account.id));
          setImportingOld(false);
          show({
            tone: 'success',
            message: t('legacy.done', { count: added }),
            actionLabel: t('common.undo'),
            onAction: () => {
              dispatch({ type: 'REPLACE_DATA', data: previous });
              unmarkLegacyImported(account.id);
              setLegacy((list) => [...list, account]);
            },
          });
        }}
      />
      <ArchiveSheet
        visible={archiving}
        onClose={() => setArchiving(false)}
        archive={state.archive || []}
        subjectById={Object.fromEntries(state.subjects.map((x) => [x.id, x]))}
        after={settings.archiveAfter ?? 60}
        onAfter={(archiveAfter) => updateSettings({ archiveAfter })}
        onRestoreAll={() => {
          const before = { tasks: state.tasks, archive: state.archive || [] };
          const count = before.archive.length;
          dispatch({ type: 'RESTORE_ARCHIVED', all: true });
          setArchiving(false);
          show({ tone: 'success', message: t('archive.restored', { count }), actionLabel: t('common.undo'), onAction: () => dispatch({ type: 'RESTORE_LISTS', lists: before }) });
        }}
        onClear={() => {
          const before = { archive: state.archive || [] };
          dispatch({ type: 'CLEAR_ARCHIVE' });
          setArchiving(false);
          show({ message: t('archive.cleared', { count: before.archive.length }), actionLabel: t('common.undo'), onAction: () => dispatch({ type: 'RESTORE_LISTS', lists: before }) });
        }}
      />
      <ImportCalendarSheet visible={importing} onClose={() => setImporting(false)} onImport={applyImport} existing={state} today={dateKey()} />
    </SafeAreaView>
  );
}

function Section({ title, children, danger }) {
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={[styles.sectionTitle, danger && { color: colors.danger }]}>{title.toUpperCase()}</Text>
      <View style={[styles.group, danger && styles.groupDanger]}>{children}</View>
    </View>
  );
}

function Row({ icon, tint, label, sub, children, onPress, danger, last }) {
  const Wrap = onPress ? Pressable : View;
  return (
    <Wrap onPress={onPress} style={[styles.row, !last && styles.rowLine, danger && { backgroundColor: colors.dangerSoft }]}>
      <View style={[styles.rowIcon, { backgroundColor: tint + '1F' }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {children}
      {onPress && !children ? <Ionicons name="chevron-forward" size={18} color={colors.faint} /> : null}
    </Wrap>
  );
}

const styles = themedStyles(() => ({
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.accentSoft },
  syncBtnText: { fontSize: 12, fontWeight: '800', color: colors.accent },
  groupBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, marginLeft: 6 },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 16, paddingBottom: 120, maxWidth: 720, width: '100%', alignSelf: 'center' },
  contentWide: { maxWidth: 1240 },
  wideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  col: { flex: 1, minWidth: 0 },
  colSide: { marginTop: -24 }, // its first section's own top margin: line it up with the hero
  hero: { borderRadius: 28, padding: 20, overflow: 'hidden', ...shadow },
  glow: { position: 'absolute', right: -50, top: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: '#8D9BFF', opacity: 0.2 },
  kickerPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  heroKicker: { color: '#C9D0FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  heroTitle: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 10, letterSpacing: -0.5 },
  heroSub: { color: '#C9D0FF', fontSize: 13, marginTop: 4 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 18, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  accAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  accInitials: { color: '#fff', fontWeight: '800', fontSize: 16 },
  accName: { fontSize: 16, fontWeight: '800', color: '#fff' },
  accEmail: { fontSize: 12, color: '#C9D0FF', marginTop: 1 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: colors.muted, marginBottom: 10, marginLeft: 6 },
  group: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  groupDanger: { borderColor: colors.dangerBorder },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '700', color: colors.ink },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bg, borderRadius: 18, padding: 3 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  stepVal: { minWidth: 58, textAlign: 'center', fontWeight: '800', color: colors.ink },
  seg: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 14, padding: 3 },
  segItem: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: 11 },
  segOn: { backgroundColor: colors.accentFill },
  segText: { fontWeight: '700', color: colors.muted, fontSize: 13 },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  langChip: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: 11, backgroundColor: colors.bg },
  about: { alignItems: 'center', marginTop: 28, gap: 4 },
  aboutLogo: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' },
  aboutName: { fontSize: 14, fontWeight: '800', color: colors.ink, marginTop: 4 },
  aboutVer: { fontSize: 12, color: colors.muted },
}));
