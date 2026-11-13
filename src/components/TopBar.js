import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, themedStyles } from '../theme';
import { t } from '../i18n';
import { formatDue, formatDate, formatTime, dateKey } from '../dates';
import Avatar from './Avatar';
import { nudgeText } from '../smartNudgeText';
import { useClock } from '../clock';
import { isActivity } from '../classes';
import { activityLook, activityCategoryLabel } from '../activityKinds';
import { classWhen } from './AddClassSheet';
import { useShortcuts } from '../shortcuts';

const shortDate = () =>
  formatDate(new Date(), { weekday: 'long', month: 'short', day: 'numeric' });

// Everything a person might type to find a task: title, subject, priority, due date words, status.
// The words are looked up on each search, so they follow the current language.
const PRIORITY_KEYS = { high: 'high', med: 'med', low: 'low' };
const taskSearchText = (task, subject) =>
  [
    task.title,
    subject ? subject.name : t('common.noSubject'),
    t(`topBar.searchWords.${PRIORITY_KEYS[task.priority] || 'med'}`),
    formatDue(task.due),
    task.due,
    t(task.done ? 'topBar.searchWords.done' : task.due < dateKey() ? 'topBar.searchWords.overdue' : 'topBar.searchWords.open'),
    task.recurId ? t('topBar.searchWords.repeating') : '',
  ]
    .join(' ')
    .toLowerCase();

// 'Friday, Oct 30 · 5:01 PM' under the screen title, the time ticking over on the minute
function DateTimeLine() {
  const now = useClock();
  return (
    <Text style={styles.subtitle} numberOfLines={1}>
      {shortDate()} · {formatTime(now)}
    </Text>
  );
}

// Search also finds exams, classes and activities; `onOpenDay(day)` opens the Calendar on that day (null: as it is).
export default function TopBar({ user, unsynced = false, onOpenFocus, onProfile, onSettings, onLogout, title, wide, onMenu, canGoBack, onBack, topInset, tasks, subjects, exams = [], classes = [], alerts, onOpenTask, onOpenSubjects, onOpenDay }) {
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState(null); // 'search' | 'notif' | 'user'
  const [seen, setSeen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const input = useRef(null);
  // "/" jumps to search
  useShortcuts({
    '/': () => {
      setSearchOpen(true);
      setPanel('search');
      setTimeout(() => input.current && input.current.focus(), 0);
    },
  });

  const subjectById = useMemo(() => Object.fromEntries(subjects.map((s) => [s.id, s])), [subjects]);

  const q = query.trim().toLowerCase();
  const taskHits = useMemo(
    () =>
      q
        ? tasks
            .filter((task) => taskSearchText(task, subjectById[task.subjectId]).includes(q))
            .slice(0, 8)
        : [],
    [q, tasks, subjectById]
  );
  const subjectHits = useMemo(() => (q ? subjects.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 3) : []), [q, subjects]);
  // exams by title, type, subject or place; upcoming first, then the most recent
  const examHits = useMemo(() => {
    if (!q) return [];
    const today = dateKey();
    const text = (e) => [e.title, e.kind, subjectById[e.subjectId] && subjectById[e.subjectId].name, e.building, e.room].filter(Boolean).join(' ').toLowerCase();
    return exams
      .filter((e) => text(e).includes(q))
      .sort((a, b) => {
        const ua = a.date >= today;
        const ub = b.date >= today;
        if (ua !== ub) return ua ? -1 : 1;
        return ua ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
      })
      .slice(0, 4);
  }, [q, exams, subjectById]);
  // classes and activities by title, teacher, place, subject or activity type
  const classHits = useMemo(() => {
    if (!q) return [];
    const text = (c) => [c.title, c.teacher, c.location, subjectById[c.subjectId] && subjectById[c.subjectId].name, isActivity(c) && activityCategoryLabel(c)].filter(Boolean).join(' ').toLowerCase();
    return classes.filter((c) => text(c).includes(q)).slice(0, 4);
  }, [q, classes, subjectById]);

  const close = () => setPanel(null);
  const unread = seen ? 0 : alerts.length;

  const top = topInset + 66;

  return (
    <>
    <View style={[styles.wrap, { paddingTop: topInset + 10 }]}>
      <View style={styles.row}>
        {canGoBack && (
          <Pressable onPress={onBack} hitSlop={8} style={styles.iconBtn} accessibilityLabel={t('topBar.goBack')}>
            <Ionicons name="arrow-back" size={22} color={colors.ink} />
          </Pressable>
        )}
        {!wide && !canGoBack && (
          <Pressable onPress={onMenu} hitSlop={8} style={styles.iconBtn} accessibilityLabel={t('topBar.openMenu')}>
            <Ionicons name="menu" size={24} color={colors.ink} />
          </Pressable>
        )}
        {(wide || !searchOpen) && (
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <DateTimeLine />
          </View>
        )}

        {wide || searchOpen ? (
          <View style={[styles.search, panel === 'search' && styles.searchFocus]}>
            <Ionicons name="search" size={18} color={panel === 'search' ? colors.accent : colors.muted} />
            <TextInput
              ref={input}
              value={query}
              onChangeText={(v) => {
                setQuery(v);
                setPanel('search');
              }}
              onFocus={() => setPanel('search')}
              autoFocus={!wide}
              placeholder={t('topBar.searchPlaceholder')}
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            {(query.length > 0 || !wide) && (
              <Pressable
                onPress={() => {
                  setQuery('');
                  if (!wide) {
                    setSearchOpen(false);
                    setPanel(null);
                  }
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={wide ? t('topBar.clearSearch') : t('topBar.closeSearch')}
              >
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        {!wide && !searchOpen && (
          <Pressable onPress={() => setSearchOpen(true)} style={styles.iconBtn} hitSlop={6} accessibilityLabel={t('topBar.search')}>
            <Ionicons name="search" size={21} color={colors.ink} />
          </Pressable>
        )}

        <Pressable
          onPress={() => {
            setPanel(panel === 'notif' ? null : 'notif');
            setSeen(true);
          }}
          style={styles.iconBtn}
          accessibilityLabel={t('topBar.notifications')}
          hitSlop={6}
        >
          <Ionicons name={unread ? 'notifications' : 'notifications-outline'} size={22} color={colors.ink} />
          {unread > 0 && (
            <View style={styles.dotBadge}>
              <Text style={styles.dotBadgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          )}
        </Pressable>

        {(wide || !searchOpen) && (
          <Pressable onPress={() => setPanel(panel === 'user' ? null : 'user')} style={styles.avatarRing} accessibilityLabel={unsynced ? t('topBar.accountMenuUnsynced') : t('topBar.accountMenu')}>
            <Avatar size={36} name={user.name} />
            {/* changes on this device that haven't reached the cloud for a while (Settings says how many) */}
            {unsynced ? <View style={styles.unsyncedDot} testID="unsynced-dot" /> : null}
          </Pressable>
        )}
      </View>
    </View>

    {panel && !(panel === 'search' && q.length === 0) && (
    <View style={[styles.overlay, { top: top - 6 }]} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={close} />

      {panel === 'search' && q.length > 0 && (
        <View style={[styles.panel, styles.searchPanel, { top: 6 }]}>
          {taskHits.length + subjectHits.length + examHits.length + classHits.length === 0 ? (
            <Text style={styles.empty}>{t('topBar.noResults', { query })}</Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 340 }}>
              {subjectHits.map((s) => (
                <Pressable key={s.id} style={styles.hit} onPress={() => { close(); setQuery(''); onOpenSubjects(); }}>
                  <View style={[styles.hitIcon, { backgroundColor: s.color }]}>
                    <Ionicons name="library" size={14} color="#fff" />
                  </View>
                  <Text style={styles.hitTitle}>{s.name}</Text>
                  <Text style={styles.hitMeta}>{t('topBar.subject')}</Text>
                </Pressable>
              ))}
              {examHits.map((e) => (
                <Pressable key={`x${e.id}`} style={styles.hit} onPress={() => { close(); setQuery(''); onOpenDay(e.date); }}>
                  <View style={[styles.hitIcon, { backgroundColor: colors.danger }]}>
                    <Ionicons name="flag" size={14} color="#fff" />
                  </View>
                  <Text style={styles.hitTitle} numberOfLines={1}>{e.title}</Text>
                  <Text style={styles.hitMeta}>{t('topBar.exam')} · {formatDue(e.date)}</Text>
                </Pressable>
              ))}
              {classHits.map((c) => {
                const act = isActivity(c);
                const tint = act ? activityLook(c).color : subjectById[c.subjectId] ? subjectById[c.subjectId].color : colors.violet;
                return (
                  <Pressable key={`c${c.id}`} style={styles.hit} onPress={() => { close(); setQuery(''); onOpenDay(c.repeat === 'once' ? c.date : null); }}>
                    <View style={[styles.hitIcon, { backgroundColor: tint }]}>
                      <Ionicons name={act ? activityLook(c).icon : 'easel'} size={14} color="#fff" />
                    </View>
                    <Text style={styles.hitTitle} numberOfLines={1}>{c.title}</Text>
                    <Text style={styles.hitMeta} numberOfLines={1}>{act ? activityCategoryLabel(c) : t('topBar.class')} · {classWhen(c)}</Text>
                  </Pressable>
                );
              })}
              {taskHits.map((task) => (
                <Pressable key={task.id} style={styles.hit} onPress={() => { close(); setQuery(''); onOpenTask(task); }}>
                  <View style={[styles.hitIcon, { backgroundColor: subjectById[task.subjectId]?.color || colors.muted }]}>
                    <Ionicons name={task.done ? 'checkmark' : 'document-text'} size={14} color="#fff" />
                  </View>
                  <Text style={[styles.hitTitle, task.done && { textDecorationLine: 'line-through', color: colors.muted }]} numberOfLines={1}>
                    {task.title}
                  </Text>
                  <Text style={styles.hitMeta}>{formatDue(task.due)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {panel === 'notif' && (
        <View style={[styles.panel, styles.notifPanel, { top: 6 }]}>
          <Text style={styles.panelTitle}>{t('topBar.notifications')}</Text>
          {alerts.length === 0 ? (
            <Text style={styles.empty}>{t('topBar.allCaughtUp')}</Text>
          ) : (
            <ScrollView style={{ maxHeight: 340 }}>
              {alerts.map((a) =>
                a.nudge ? (
                  <Pressable key="nudge" style={styles.hit} onPress={() => { close(); onOpenFocus && onOpenFocus(); }} accessibilityRole="button">
                    <View style={[styles.hitIcon, { backgroundColor: '#7A5CFA' }]}>
                      <Ionicons name="sparkles" size={14} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.hitTitle} numberOfLines={1}>{nudgeText(a.nudge).title}</Text>
                      <Text style={[styles.hitMeta, { marginLeft: 0 }]} numberOfLines={2}>{nudgeText(a.nudge).body}</Text>
                    </View>
                  </Pressable>
                ) : a.exam ? (
                  <Pressable key={"x" + a.exam.id} style={styles.hit} onPress={() => { close(); onOpenTask(a.exam); }}>
                    <View style={[styles.hitIcon, { backgroundColor: a.days <= 1 ? colors.danger : "#F2A541" }]}>
                      <Ionicons name="flag" size={14} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.hitTitle} numberOfLines={1}>{a.exam.title}</Text>
                      <Text style={[styles.hitMeta, { marginLeft: 0 }]}>
                        {a.days === 0 ? t('topBar.examToday') : a.days === 1 ? t('topBar.examTomorrow') : t('topBar.examInDays', { count: a.days })}
                      </Text>
                    </View>
                  </Pressable>
                ) : (
                <Pressable key={a.task.id} style={styles.hit} onPress={() => { close(); onOpenTask(a.task); }}>
                  <View style={[styles.hitIcon, { backgroundColor: a.overdue ? colors.danger : colors.accentFill }]}>
                    <Ionicons name={a.overdue ? "alert" : "time"} size={14} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.hitTitle} numberOfLines={1}>{a.task.title}</Text>
                    <Text style={[styles.hitMeta, { marginLeft: 0 }]}>
                      {a.overdue ? t('topBar.overdueWasDue', { date: formatDue(a.task.due) }) : t('topBar.dueToday')}
                    </Text>
                  </View>
                </Pressable>
                )
              )}
            </ScrollView>
          )}
        </View>
      )}

      {panel === 'user' && (
        <View style={[styles.panel, styles.userPanel, { top: 6 }]}>
          <Text style={styles.panelTitle}>{user.name}</Text>
          <Text style={[styles.hitMeta, { marginLeft: 8, marginBottom: 8 }]}>{user.email}</Text>
          <Pressable style={styles.hit} onPress={() => { close(); onProfile(); }}><Ionicons name="person-outline" size={18} color={colors.ink} /><Text style={styles.hitTitle}>{t('topBar.profile')}</Text></Pressable>
          <Pressable style={styles.hit} onPress={() => { close(); onSettings(); }}><Ionicons name="settings-outline" size={18} color={colors.ink} /><Text style={styles.hitTitle}>{t('topBar.settings')}</Text></Pressable>
          <Pressable style={styles.hit} onPress={() => { close(); onLogout(); }}><Ionicons name="log-out-outline" size={18} color={colors.danger} /><Text style={[styles.hitTitle, { color: colors.danger }]}>{t('topBar.signOut')}</Text></Pressable>
        </View>
      )}
    </View>
    )}
    </>
  );
}

const styles = themedStyles(() => ({
  wrap: { backgroundColor: colors.surface, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line, shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, zIndex: 20, elevation: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleBlock: { flexShrink: 1, minWidth: 110, marginRight: 4 },
  title: { fontSize: 19, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 1 },
  avatarRing: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  search: { flex: 1, maxWidth: 560, flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.bg, borderWidth: 1, borderColor: 'transparent' },
  searchFocus: { borderColor: colors.accent, backgroundColor: colors.surface },
  input: { flex: 1, fontSize: 14, color: colors.ink, paddingVertical: 0, ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }) },
  unsyncedDot: { position: 'absolute', top: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#E67E22', borderWidth: 2, borderColor: colors.surface },
  dotBadge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  dotBadgeText: { color: colors.onAccent, fontSize: 10, fontWeight: '800' },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.onAccent, fontWeight: '700' },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 30, elevation: 30 },
  panel: { position: 'absolute', backgroundColor: colors.surface, borderRadius: radius.md, padding: 8, borderWidth: 1, borderColor: colors.line, ...shadow },
  searchPanel: { left: 16, right: 16, maxWidth: 600 },
  notifPanel: { right: 16, width: 340, maxWidth: '92%' },
  userPanel: { right: 16, width: 260 },
  panelTitle: { fontSize: 15, fontWeight: '800', color: colors.ink, padding: 8 },
  hit: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10 },
  hitIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hitTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink },
  hitMeta: { fontSize: 12, color: colors.muted, marginLeft: 8 },
  empty: { padding: 16, color: colors.muted, textAlign: 'center' },
}));
