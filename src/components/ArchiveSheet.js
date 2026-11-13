import React, { useMemo } from 'react';
import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles } from '../theme';
import { t } from '../i18n';
import { formatDate, parseKey, monthTitle } from '../dates';

export const ARCHIVE_OPTIONS = [0, 30, 60, 90];
const SHOWN = 80; // rows written out; the rest are counted

// Done tasks moved out of the lists after a while: when that happens, what is in the archive (by month, newest
// first), and putting it all back or deleting it. `after` is the setting in days (0 = never).
export default function ArchiveSheet({ visible, onClose, archive, subjectById, after, onAfter, onRestoreAll, onClear }) {
  const months = useMemo(() => {
    const by = new Map();
    for (const x of [...archive].sort((a, b) => b.completedAt.localeCompare(a.completedAt))) {
      const m = x.completedAt.slice(0, 7);
      if (!by.has(m)) by.set(m, []);
      by.get(m).push(x);
    }
    return [...by.entries()];
  }, [archive]);
  let left = SHOWN;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1, alignSelf: 'stretch' }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={styles.headIcon}>
              <Ionicons name="archive" size={20} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{t('archive.title')}</Text>
              <Text style={styles.headSub}>{t('archive.sub')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <Text style={styles.label}>{t('archive.afterLabel')}</Text>
          <View style={styles.row}>
            {ARCHIVE_OPTIONS.map((d) => {
              const on = after === d;
              const label = d ? t('archive.days', { count: d }) : t('archive.never');
              return (
                <Pressable key={d} onPress={() => onAfter(d)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" aria-pressed={!!on} accessibilityState={{ selected: on }} accessibilityLabel={t('archive.afterA11y', { when: label })}>
                  <Text style={[styles.chipText, on && { color: colors.onAccent }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView style={{ maxHeight: 360, marginTop: 14 }} showsVerticalScrollIndicator={false}>
            {archive.length === 0 ? (
              <Text style={styles.empty}>{after ? t('archive.empty', { count: after }) : t('archive.emptyOff')}</Text>
            ) : (
              months.map(([m, list]) => {
                const rows = list.slice(0, Math.max(0, left));
                left -= rows.length;
                return (
                  <View key={m} style={styles.month}>
                    <View style={styles.monthHead}>
                      <Text style={styles.monthName}>{monthTitle(m)}</Text>
                      <Text style={styles.monthCount}>{t('archive.count', { count: list.length })}</Text>
                    </View>
                    {rows.map((x) => {
                      const s = subjectById[x.subjectId];
                      return (
                        <View key={x.id} style={styles.item}>
                          <Ionicons name="checkmark-circle" size={15} color={s ? s.color : colors.success} />
                          <Text style={styles.itemTitle} numberOfLines={1}>{x.title}</Text>
                          <Text style={styles.itemWhen}>{formatDate(parseKey(x.completedAt), { month: 'short', day: 'numeric' })}</Text>
                        </View>
                      );
                    })}
                    {rows.length < list.length ? <Text style={styles.more}>{t('calendar.moreItems', { count: list.length - rows.length })}</Text> : null}
                  </View>
                );
              })
            )}
          </ScrollView>

          {archive.length ? (
            <View style={styles.actions}>
              <Pressable onPress={onRestoreAll} style={styles.restore} accessibilityRole="button" accessibilityLabel={t('archive.restoreAll')}>
                <Ionicons name="arrow-undo" size={17} color={colors.accent} />
                <Text style={styles.restoreText}>{t('archive.restoreAll')}</Text>
              </Pressable>
              <Pressable onPress={onClear} style={styles.clear} accessibilityRole="button" accessibilityLabel={t('archive.clear')}>
                <Ionicons name="trash" size={17} color={colors.danger} />
                <Text style={styles.clearText}>{t('archive.clear')}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 10, paddingBottom: 28 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#8E7DBE', alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 18, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.accentFill, borderColor: colors.accentFill },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  empty: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  month: { marginBottom: 12 },
  monthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  monthName: { fontSize: 12, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  monthCount: { fontSize: 12, fontWeight: '700', color: colors.muted },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  itemTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.ink },
  itemWhen: { fontSize: 12, color: colors.muted },
  more: { fontSize: 12, color: colors.muted, marginTop: 4, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  restore: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: radius.md, backgroundColor: colors.accentSoft },
  restoreText: { fontSize: 14, fontWeight: '800', color: colors.accent },
  clear: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  clearText: { fontSize: 14, fontWeight: '800', color: colors.danger },
}));
