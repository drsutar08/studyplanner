import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, solid, readable, themedStyles } from '../theme';
import { t } from '../i18n';
import { useAuth, initials } from '../auth';
import { useStudyPresence } from '../cloud/studyTogether';
import { studyingNow, canJoin } from '../studyTogether';

// "Studying now": who in your study groups has a focus session (or a break) under way, with Join on a running
// session (onJoin(person); left out where joining makes no sense). groupId shows one group only (its board).
// Nothing shows while signed out or without groups; `empty` says so when no one is studying.
export default function StudyingNow({ onJoin, groupId, empty = true, compact = false }) {
  const { user } = useAuth();
  const groups = useStudyPresence();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000); // "12 min left" stays right
    return () => clearInterval(id);
  }, []);
  const shown = groupId ? groups.filter((g) => g.id === groupId) : groups;
  if (!shown.length) return null;
  const at = Math.max(now, ...shown.map((g) => g.at || 0)); // the tick, or when the last change was heard if later
  const people = studyingNow(shown, user && user.id, at);

  // in focus mode, a line only: "Priya and Arjun are studying too"
  if (compact) {
    if (!people.length) return null;
    const names = people.map((p) => p.name.split(' ')[0]);
    return (
      <View style={styles.compact} accessibilityRole="text">
        <Ionicons name="people" size={14} color="rgba(255,255,255,0.85)" />
        <Text style={styles.compactText} numberOfLines={1}>
          {names.length === 1 ? t('together.alsoOne', { name: names[0] }) : names.length === 2 ? t('together.alsoTwo', { a: names[0], b: names[1] }) : t('together.alsoMany', { name: names[0], count: names.length - 1 })}
        </Text>
      </View>
    );
  }

  if (!people.length && !empty) return null;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.dot} />
        <Text style={styles.title}>{t('together.title')}</Text>
        {people.length ? <Text style={styles.count}>{t('together.count', { count: people.length })}</Text> : null}
      </View>
      {!people.length ? (
        <Text style={styles.empty}>{t('together.empty')}</Text>
      ) : (
        people.map((p) => {
          const mins = Math.max(1, Math.ceil(p.leftMs / 60000));
          const doing = p.phase === 'break' ? t('together.onBreak') : p.subject || t('together.freeSession');
          const when = p.paused ? t('together.paused') : t('together.left', { count: mins });
          const joinable = onJoin && canJoin(p, at);
          return (
            <View key={p.userId} style={styles.row} accessibilityLabel={t('together.rowA11y', { name: p.name, doing, when })}>
              <View style={[styles.avatar, { backgroundColor: p.color && p.phase === 'focus' ? solid(p.color) : colors.accentFill }]}>
                <Text style={styles.avatarText}>{initials(p.name) || '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {p.name || t('together.someone')}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  <Text style={{ color: p.color && p.phase === 'focus' ? readable(p.color) : colors.muted, fontWeight: '700' }}>{doing}</Text>
                  {` · ${when}${groupId ? '' : ` · ${p.groups.join(', ')}`}`}
                </Text>
              </View>
              {joinable ? (
                <Pressable onPress={() => onJoin(p)} style={({ hovered }) => [styles.join, hovered && { opacity: 0.9 }]} accessibilityRole="button" accessibilityLabel={t('together.joinA11y', { name: p.name, count: mins })}>
                  <Ionicons name="play" size={13} color="#fff" />
                  <Text style={styles.joinText}>{t('together.join')}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  card: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 16, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.success },
  title: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.ink },
  count: { fontSize: 13, fontWeight: '700', color: colors.muted },
  empty: { fontSize: 13, color: colors.muted, lineHeight: 19, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  join: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.accentFill, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  joinText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  compact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  compactText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
}));
