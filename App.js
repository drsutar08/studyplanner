import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, View, useColorScheme, useWindowDimensions } from 'react-native';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef, useIsFocused } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { StoreProvider, useStore } from './src/store';
import { ToastProvider } from './src/toast';
import { IntroContext } from './src/intro';
import { useAccountActions } from './src/actions';
import { colors, applyScheme, applyReading, getScheme, themedStyles } from './src/theme';
import { useReadingFont } from './src/readingFonts';
import { setAppShortcuts, listenForAppShortcuts, shortcutFromUrl } from './src/appShortcuts';
import { applyLanguage, getLanguage, t } from './src/i18n';
import { LOCALE } from './src/locale';
import { dateKey, daysBetween, addDays } from './src/dates';
import Sidebar, { NAV } from './src/components/Sidebar';
import TopBar from './src/components/TopBar';
import ShortcutsSheet from './src/components/ShortcutsSheet';
import { JoinGroupSheet } from './src/components/GroupSheets';
import { useGroupActions } from './src/groupActions';
import { useToast } from './src/toast';
import { useLiveGroups } from './src/cloud/liveGroups';
import { useGroupBoards } from './src/cloud/groupBoard';
import { useStudyTogether } from './src/cloud/studyTogether';
import { usePlanLoader } from './src/cloud/plan';
import { startPurchases, endPurchases } from './src/purchases';
import { appUrl } from './src/appScheme';
import { badges, newlyEarned } from './src/achievements';
import { badgeName } from './src/components/AchievementsCard';
import { useShortcuts, onShortcutHelp } from './src/shortcuts';
import TabBar from './src/components/TabBar';
import AddTaskSheet from './src/components/AddTaskSheet';
import TodayScreen from './src/screens/TodayScreen';
import FocusScreen from './src/screens/FocusScreen';
import SubjectsScreen from './src/screens/SubjectsScreen';
import FlashcardsScreen from './src/screens/FlashcardsScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import { onlyClasses } from './src/classes';
import ProgressScreen from './src/screens/ProgressScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import SplashScreen from './src/screens/SplashScreen';
import { CloudSetupScreen, LoadFailedScreen, NewPasswordScreen } from './src/screens/CloudScreens';
import { cloudConfigured, launchUrl } from './src/cloud/supabase';
import OnboardingScreen from './src/screens/OnboardingScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from './src/auth';
import { syncReminders, cancelAllReminders, registerReminderActions, listenForReminderActions } from './src/notifications';
import { snoozeUntil } from './src/notificationRules';
import { syncNextClassWidget, syncTodayWidget } from './src/widgets';
import { dueCards } from './src/flashcards';
import { CalendarDayContext } from './src/calendarDay';
import { nudgeNow } from './src/smartReminders';
import { useClock } from './src/clock';
import ErrorBoundary from './src/ErrorBoundary';
import { installGlobalHandlers } from './src/monitoring';
import './src/install'; // catches the browser's install offer as soon as the app loads
import { PremiumHost } from './src/components/PremiumSheet';

installGlobalHandlers();

const Tab = createBottomTabNavigator();
const navRef = createNavigationContainerRef();

// Built on each render so it follows the light / dark palette
const navTheme = () => ({
  ...DefaultTheme,
  dark: getScheme() === 'dark',
  colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.surface, text: colors.ink, border: colors.line, primary: colors.accent },
});

// A tab that isn't showing stays mounted behind the one that is. On the web it is made inert, so the keyboard and
// screen readers skip it (it is already hidden from them, but its buttons could still take focus).
function TabLayout({ children }) {
  const focused = useIsFocused();
  const ref = useRef(null);
  useEffect(() => {
    if (Platform.OS === 'web' && ref.current) ref.current.inert = !focused;
  }, [focused]);
  return (
    <View ref={ref} style={styles.tabLayout}>
      {children}
    </View>
  );
}
const tabLayout = ({ children }) => <TabLayout>{children}</TabLayout>;

const WIDE_BREAKPOINT = 900;

function Shell({ route }) {
  const { state, dispatch, sync } = useStore();
  const [adding, setAdding] = useState(false);
  const { user, settings } = useAuth();
  const { signOut } = useAccountActions();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= WIDE_BREAKPOINT;
  const [drawer, setDrawer] = useState(false);
  const [shortcutHelp, setShortcutHelp] = useState(false);
  // A study-group link opened from outside: this page's #share=… on the web, studyplanner://share?d=… on a phone
  const [incoming, setIncoming] = useState(() => (launchUrl && /[#&](share|group)=/.test(launchUrl) ? launchUrl : null));
  const { join, joinLive } = useGroupActions();
  // live groups: this account's own ones published as its timetable changes, joined ones taken as they change
  // a live group's board: its shared tasks become the member's own, and a new note pops up
  const { show } = useToast();

  // a badge earned (achievements.js): recorded once, with a toast (one for several at once)
  useEffect(() => {
    if (!state.ready) return;
    const today = dateKey();
    const fresh = newlyEarned(badges(state, today, settings.weekStart || 0), today);
    if (!fresh.length) return;
    dispatch({ type: 'EARN_ACHIEVEMENTS', items: fresh });
    show({
      tone: 'success',
      message: fresh.length === 1 ? t('badges.earnedOne', { name: badgeName(fresh[0].id) }) : t('badges.earnedMany', { count: fresh.length }),
      actionLabel: t('badges.see'),
      onAction: () => go('Progress'),
      duration: 7000,
    });
  }, [state.ready, state.sessions, state.tasks, state.exams, state.cards, state.archive, state.achievements]); // eslint-disable-line react-hooks/exhaustive-deps
  useGroupBoards({
    enabled: cloudConfigured && !!user && state.ready,
    joined: state.groups,
    state,
    dispatch,
    onNote: (g, note) => show({ message: t('board.newNoteToast', { name: g.name, note: note.body.length > 90 ? `${note.body.slice(0, 90)}…` : note.body }), duration: 8000 }),
  });
  useLiveGroups({
    enabled: cloudConfigured && !!user && state.ready,
    state,
    user,
    joined: state.groups,
    onUpdate: (g, row) => join({ ...row.payload, id: row.id, n: row.name, f: row.owner_name }, { live: true, version: row.updated_at, quiet: true }),
  });
  // the account's plan (Free or Premium) and its limits, for the screens that show them
  usePlanLoader({ enabled: cloudConfigured && !!user, userId: user && user.id });
  // purchases (purchases.native.js): linked to the signed-in account, so Premium follows the account
  useEffect(() => {
    if (user && user.id) startPurchases(user.id);
    else endPurchases();
  }, [user && user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // study together: who in this account's groups is studying now, and this device's focus timer shared with them
  useStudyTogether({
    enabled: cloudConfigured && !!user && state.ready,
    user,
    share: settings.shareStudying !== false,
    groupsKey: state.groups.filter((g) => g.live).map((g) => g.id).sort().join(','),
  });
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return undefined;
      // keep the code out of the address bar (and out of a reload) once it has been read
      const clear = () => window.history.replaceState(null, '', window.location.pathname + window.location.search);
      if (/[#&](share|group)=/.test(window.location.hash)) clear();
      const onHash = () => {
        if (!/[#&](share|group)=/.test(window.location.hash)) return;
        setIncoming(window.location.href);
        clear();
      };
      window.addEventListener('hashchange', onHash);
      return () => window.removeEventListener('hashchange', onHash);
    }
    const open = (url) => {
      if (url && url.startsWith(appUrl('share')) && /[?&][dg]=/.test(url)) setIncoming(url);
      const shortcut = shortcutFromUrl(url); // a long-press shortcut on Android arrives as a link
      if (shortcut) runShortcut.current(shortcut);
    };
    Linking.getInitialURL().then(open).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => open(url));
    return () => sub.remove();
  }, []);
  // the long-press shortcuts on the app icon: set in the app's language, and what each one does
  const runShortcut = useRef(() => {});
  useEffect(() => {
    runShortcut.current = (id) => {
      if (id === 'new-task') setAdding(true);
      else if (id === 'focus') go('Focus');
      else if (id === 'cards') go('Flashcards');
    };
  });
  useEffect(() => {
    setAppShortcuts();
  }, [settings.language]);
  useEffect(() => listenForAppShortcuts((id) => runShortcut.current(id)), []);
  const [calendarDay, setCalendarDay] = useState(null); // selected day on the Calendar
  const calendarDayValue = useMemo(() => ({ setDay: setCalendarDay }), []);

  const today = dateKey();
  // Repeating tasks: top up the next two weeks at launch and whenever the date changes
  useEffect(() => {
    dispatch({ type: 'MATERIALIZE' });
  }, [today, dispatch]);
  // Done tasks older than the archive setting leave the lists (Settings → Data → Archived tasks)
  const archiveAfter = settings.archiveAfter ?? 60;
  useEffect(() => {
    if (state.ready && archiveAfter > 0) dispatch({ type: 'ARCHIVE_DONE', before: addDays(today, -archiveAfter) });
  }, [today, archiveAfter, state.ready, dispatch]);

  // Keep the phone's scheduled reminders in step with tasks and settings
  useEffect(() => {
    syncReminders({ tasks: state.tasks, exams: state.exams, classes: state.classes, term: state.term, vacations: state.vacations, rotation: state.rotation, sessions: state.sessions, subjects: state.subjects, settings });
  }, [state.tasks, state.exams, state.classes, state.term, state.vacations, state.rotation, state.sessions, state.subjects, today, settings.pushEnabled, settings.dailyReminder, settings.reminderHour, settings.attendanceNudge, settings.weeklyReport, settings.weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Mark done" / "Snooze" on task reminders. The Shell remounts after a language change, so the
  // button titles are registered again in the new language.
  useEffect(() => {
    registerReminderActions();
    return listenForReminderActions(({ type, taskId, screen }) => {
      if (type === 'done') dispatch({ type: 'COMPLETE_TASK', id: taskId });
      else if (type === 'snooze') dispatch({ type: 'SNOOZE_TASK', id: taskId, until: snoozeUntil(Date.now()) });
      else if (navRef.isReady()) navRef.navigate(screen || 'Today');
    });
  }, [dispatch]);

  // Home-screen "Next class" widget: refresh on timetable changes and whenever the app comes back
  useEffect(() => {
    const sync = () => syncNextClassWidget({ classes: onlyClasses(state.classes), term: state.term, vacations: state.vacations, subjects: state.subjects, rotation: state.rotation });
    sync();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && sync());
    return () => sub.remove();
  }, [state.classes, state.term, state.vacations, state.subjects, state.rotation]);

  // ...and the "Today" widget: on task, focus and flashcard changes, and whenever the app comes back (a new day)
  useEffect(() => {
    if (!state.ready) return undefined;
    const sync = () => syncTodayWidget({ tasks: state.tasks, sessions: state.sessions, cardsDue: dueCards(state.cards || [], dateKey()).length, dailyGoal: settings.dailyGoal });
    sync();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && sync());
    return () => sub.remove();
  }, [state.ready, state.tasks, state.sessions, state.cards, settings.dailyGoal, settings.language]); // eslint-disable-line react-hooks/exhaustive-deps

  const minute = useClock(); // the smart reminder comes and goes with the time
  const alerts = useMemo(() => {
    const exams = state.exams
      .filter((e) => daysBetween(today, e.date) >= 0 && daysBetween(today, e.date) <= 3)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((exam) => ({ exam, days: daysBetween(today, exam.date) }));
    const tasks = state.tasks
      .filter((t) => !t.done && t.due <= today)
      .sort((a, b) => a.due.localeCompare(b.due))
      .map((task) => ({ task, overdue: task.due < today }));
    // around the usual study time, a smart reminder leads the list
    const nudge = settings.smartReminders !== false ? nudgeNow(state) : null;
    return [...(nudge ? [{ nudge }] : []), ...exams, ...tasks];
  }, [state, today, minute, settings.smartReminders]); // eslint-disable-line react-hooks/exhaustive-deps


  const go = (name, params) => {
    if (navRef.isReady()) navRef.navigate(name, params);
    setDrawer(false);
  };

  // Desktop keyboard shortcuts that work on every screen (see ShortcutsSheet for the list)
  const SCREENS = ['Today', 'Calendar', 'Focus', 'Subjects', 'Progress'];
  useShortcuts({
    n: () => setAdding(true),
    ',': () => go('Settings'),
    '?': () => setShortcutHelp(true),
    ...Object.fromEntries(SCREENS.map((name, i) => [String(i + 1), () => go(name)])),
  });
  useEffect(() => onShortcutHelp(() => setShortcutHelp(true)), []);

  const todays = state.tasks.filter((t) => t.due === today);
  const todayStats = {
    done: todays.filter((t) => t.done).length,
    total: todays.length,
    minutes: state.sessions.filter((s) => s.date === today).reduce((a, s) => a + s.minutes, 0),
  };

  const sidebar = (
    <Sidebar
      route={route}
      onNavigate={go}
      user={user}
      onAddTask={() => {
        setDrawer(false);
        setAdding(true);
      }}
      badges={{ Today: settings.reminders ? alerts.length : 0 }}
      subjects={state.subjects.map((s) => ({ ...s, open: state.tasks.filter((t) => t.subjectId === s.id && !t.done).length }))}
      today={todayStats}
      topInset={insets.top}
    />
  );

  // NAV labels are translated when read, so the title follows the current language
  const title = NAV.find((n) => n.name === route)?.label ?? '';

  return (
    <View style={styles.root}>
      {wide && sidebar}

      <View style={styles.main}>
        <TopBar
          title={title}
          wide={wide}
          topInset={insets.top}
          onMenu={() => setDrawer(true)}
          canGoBack={route !== 'Today'}
          onBack={() => (navRef.canGoBack() ? navRef.goBack() : go('Today'))}
          tasks={state.tasks}
          subjects={state.subjects}
          alerts={settings.reminders ? alerts : []}
          onOpenFocus={() => go('Focus')}
          unsynced={!!(sync && sync.unsynced)}
          user={user}
          onProfile={() => go('Profile')}
          onSettings={() => go('Settings')}
          onLogout={signOut}
          onOpenTask={(t) => go(t && t.date ? 'Calendar' : 'Today')}
          onOpenSubjects={() => go('Subjects')}
          exams={state.exams}
          classes={state.classes}
          onOpenDay={(day) => go('Calendar', day ? { day } : undefined)}
        />

        <View style={{ flex: 1 }}>
          <CalendarDayContext.Provider value={calendarDayValue}>
          <Tab.Navigator
            backBehavior="history"
            // with the sidebar showing, its menu and "New task" button do the tab bar's job
            tabBar={(p) => (wide ? null : <TabBar {...p} onAdd={() => setAdding(true)} />)}
            screenOptions={{ headerShown: false }}
            screenLayout={tabLayout}
          >
            <Tab.Screen name="Today" component={TodayScreen} />
            <Tab.Screen name="Calendar" component={CalendarScreen} />
            <Tab.Screen name="Focus" component={FocusScreen} />
            <Tab.Screen name="Subjects" component={SubjectsScreen} />
            <Tab.Screen name="Flashcards" component={FlashcardsScreen} options={hiddenTab} />
            <Tab.Screen name="Progress" component={ProgressScreen} />
            <Tab.Screen name="Profile" component={ProfileScreen} options={hiddenTab} />
            <Tab.Screen name="Settings" component={SettingsScreen} options={hiddenTab} />
          </Tab.Navigator>
          </CalendarDayContext.Provider>
        </View>
      </View>

      <ShortcutsSheet visible={shortcutHelp} onClose={() => setShortcutHelp(false)} />
      <PremiumHost />
      <JoinGroupSheet
        visible={!!incoming}
        initialText={incoming || ''}
        onClose={() => setIncoming(null)}
        state={state}
        onJoin={(share, live) => {
          setIncoming(null);
          if (live) joinLive(live);
          else join(share);
        }}
      />

      <AddTaskSheet
        visible={adding}
        onClose={() => setAdding(false)}
        subjects={state.subjects}
        classes={state.classes}
        exams={state.exams}
        // on the Calendar the new task goes on the selected day
        defaultDue={route === 'Calendar' && calendarDay ? calendarDay : undefined}
        onSave={(t) => dispatch(t.repeat ? { type: 'ADD_RECURRING', ...t, days: t.repeat, startDate: t.due } : { type: 'ADD_TASK', ...t })}
      />

      {!wide && drawer && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={styles.scrim} onPress={() => setDrawer(false)} />
          <View style={styles.drawer}>{sidebar}</View>
        </View>
      )}
    </View>
  );
}

// Profile and Settings are reached from the menu and avatar, not the bottom bar.
const INTRO_KEY = 'studyplanner:intro-seen';
const hiddenTab = { tabBarButton: () => null, tabBarItemStyle: { display: 'none' } };

// Applies the chosen theme and language before anything below draws. Returns a key that changes with them:
// the screens are remounted under that key, so every style and label is drawn again in the new look.
function useAppearance(settings) {
  const system = useColorScheme();
  // light unless dark is chosen, or 'system' is chosen and the device is dark
  const scheme = settings.theme === 'dark' || (settings.theme === 'system' && system === 'dark') ? 'dark' : 'light';
  applyScheme(scheme);
  applyLanguage(settings.language || 'system');
  // text size and the easier-to-read font (once it has loaded)
  const font = useReadingFont(!!settings.readingFont);
  const size = settings.textSize || 'standard';
  applyReading({ size, font });
  return `${getScheme()}:${getLanguage()}:${LOCALE}:${size}:${font ? 'read' : 'usual'}`;
}

function Root() {
  const { state, retryLoad, startOffline } = useStore();
  const { ready, user, settings, recovering, logout, endedBecause } = useAuth();
  const appearance = useAppearance(settings);
  // Keeps the current screen across a theme / language switch
  const navState = useRef(undefined);
  const [route, setRoute] = useState('Today');
  const [authMode, setAuthMode] = useState('login');
  const [loginNotice, setLoginNotice] = useState(''); // e.g. "check your email" after signing up
  const [seenIntro, setSeenIntro] = useState(null); // null while loading
  const [splashDone, setSplashDone] = useState(false);
  const [replayIntro, setReplayIntro] = useState(false);

  // Splash stays up for a short beat so the animation is seen, even if data loads instantly
  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 1900);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(INTRO_KEY)
      .then((v) => setSeenIntro(v === '1'))
      .catch(() => setSeenIntro(true));
  }, []);

  const finishIntro = () => {
    setSeenIntro(true);
    AsyncStorage.setItem(INTRO_KEY, '1').catch(() => {});
  };

  // Signing out clears this device's reminders so they don't fire for the next person
  useEffect(() => {
    if (!user) cancelAllReminders({ includeSession: true });
  }, [user]);

  // Signing out (or deleting the account) always lands on the login screen
  const [seenUser, setSeenUser] = useState(user);
  if (user !== seenUser) {
    setSeenUser(user);
    if (!user) {
      setAuthMode('login');
      setRoute('Today');
    }
  }
  useEffect(() => {
    if (!user) navState.current = undefined; // the next account starts on the Dashboard
  }, [user]);

  return (
    <React.Fragment key={appearance}>
      <StatusBar style={getScheme() === 'dark' ? 'light' : 'dark'} />
      {renderRoot()}
    </React.Fragment>
  );

  function renderRoot() {
  if ((!state.ready && !state.loadFailed) || !ready || seenIntro === null || !splashDone) return <SplashScreen />;
  // a build without a Supabase project (for developers)
  if (!cloudConfigured) return <CloudSetupScreen />;

  // First launch only: three intro slides before the login screen
  if (!user && !seenIntro) return <OnboardingScreen onDone={finishIntro} />;
  // "Show intro again" from Settings
  if (user && replayIntro) return <OnboardingScreen onDone={() => setReplayIntro(false)} />;

  if (!user) {
    return authMode === 'login' ? (
      <LoginScreen key={loginNotice || endedBecause} notice={loginNotice || (endedBecause === 'deleted' ? t('account.goneElsewhere') : '')} onSwitch={() => setAuthMode('signup')} />
    ) : (
      <SignupScreen
        onSwitch={() => setAuthMode('login')}
        onConfirmSent={(email) => {
          setLoginNotice(t('auth.login.checkEmail', { email }));
          setAuthMode('login');
        }}
      />
    );
  }
  // opened from a "reset password" email
  if (recovering) return <NewPasswordScreen />;
  // a device new to the account couldn't download it
  if (state.loadFailed) return <LoadFailedScreen onRetry={retryLoad} onSignOut={logout} onOffline={startOffline} />;

  return (
    <IntroContext.Provider
      value={{
        // the replayed intro ends on the dashboard, not back on Settings
        replay: () => {
          navState.current = undefined;
          setReplayIntro(true);
        },
      }}
    >
      <NavigationContainer
        key={user.id}
        ref={navRef}
        initialState={navState.current}
        onReady={() => setRoute(navRef.getCurrentRoute()?.name ?? 'Today')}
        theme={navTheme()}
        onStateChange={(st) => {
          navState.current = st;
          setRoute(navRef.getCurrentRoute()?.name ?? 'Today');
        }}
      >
        <Shell route={route} />
      </NavigationContainer>
    </IntroContext.Provider>
  );
  }
}

export default function App() {
  return (
    <ErrorBoundary>
    <SafeAreaProvider>
      <AuthProvider>
        <StoreProvider>
          <ToastProvider>
            <Root />
          </ToastProvider>
        </StoreProvider>
      </AuthProvider>
    </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = themedStyles(() => ({
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.bg },
  main: { flex: 1 },
  tabLayout: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  drawer: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 264, borderTopRightRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden', shadowColor: colors.shadow, shadowOpacity: 0.3, shadowRadius: 24, shadowOffset: { width: 6, height: 0 }, elevation: 24 },
}));
