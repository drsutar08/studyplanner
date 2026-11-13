import React from 'react';
import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, themedStyles, readable } from '../theme';
import { t, weekdayName } from '../i18n';
import { addDays, dateKey, parseKey } from '../dates';

// Selecting several tasks at once (the Dashboard's "Select"): the bar above the list, the action bar at the
// bottom, and the sheet that picks the day to move them to.

// "3 selected · Select all · Cancel"
export function SelectBar({ count, total, onAll, onNone, onCancel }) {
  const all = count === total && total > 0;
  return (
    <View style={styles.selectBar}>
      <Ionicons name="checkmark-done-circle" size={20} color={colors.accent} />
      <Text style={styles.selectCount} accessibilityLiveRegion="polite">{t('select.selected', { count })}</Text>
      <Pressable onPress={all ? onNone : onAll} hitSlop={6} style={styles.textBtn} accessibilityRole="button">
        <Text style={styles.textBtnText}>{all ? t('select.none') : t('select.all')}</Text>
      </Pressable>
      <Pressable onPress={onCancel} hitSlop={6} style={[styles.textBtn, styles.cancel]} accessibilityRole="button" accessibilityLabel={t('select.cancel')}>
        <Text style={[styles.textBtnText, { color: colors.ink }]}>{t('select.cancel')}</Text>
      </Pressable>
    </View>
  );
}

// Done · Move… · Delete, floating at the bottom while tasks are selected
export function ActionBar({ count, bottom, onDone, onMove, onDelete }) {
  const off = count === 0;
  const btn = (icon, label, onPress, tone) => (
    <Pressable onPress={onPress} disabled={off} style={[styles.action, off && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel={`${label} (${count})`}>
      <Ionicons name={icon} size={20} color={tone} />
      <Text style={[styles.actionText, { color: readable(tone) }]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={[styles.bar, { bottom }]} pointerEvents="box-none">
      <View style={styles.barInner}>
        {btn('checkmark-circle', t('select.done'), onDone, colors.success)}
        <View style={styles.divider} />
        {btn('calendar', t('select.move'), onMove, colors.accent)}
        <View style={styles.divider} />
        {btn('trash', t('select.delete'), onDelete, colors.danger)}
      </View>
    </View>
  );
}

// Pick the day: today, tomorrow, next week, or any of the next two weeks
export function MoveSheet({ visible, count, onClose, onPick }) {
  const today = dateKey();
  const quick = [
    [today, t('common.today')],
    [addDays(today, 1), t('common.tomorrow')],
    [addDays(today, 7), t('select.nextWeek')],
  ];
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i + 2));
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1, alignSelf: 'stretch' }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <Text style={styles.heading}>{t('select.moveTitle', { count })}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
          <View style={styles.quick}>
            {quick.map(([key, label]) => (
              <Pressable key={key} onPress={() => onPick(key)} style={styles.quickBtn} accessibilityRole="button" accessibilityLabel={t('select.moveTo', { when: label })}>
                <Text style={styles.quickText}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {days.map((key) => {
              const d = parseKey(key);
              return (
                <Pressable key={key} onPress={() => onPick(key)} style={styles.day} accessibilityRole="button" accessibilityLabel={t('select.moveTo', { when: key })}>
                  <Text style={styles.dayName}>{weekdayName(d.getDay(), 'short')}</Text>
                  <Text style={styles.dayNum}>{d.getDate()}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// A task row while picking: a tap ticks it (the row's own buttons and swipe are off)
export function PickRow({ sel, task, children }) {
  const on = sel.picked.includes(task.id);
  return (
    <Pressable onPress={() => sel.toggle(task.id)} style={styles.pickRow} accessibilityRole="checkbox" aria-checked={!!on} accessibilityState={{ checked: on }} accessibilityLabel={t('select.taskA11y', { title: task.title })}>
      <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? colors.accent : colors.faint} />
      <View style={{ flex: 1 }} pointerEvents="none">
        {children}
      </View>
    </Pressable>
  );
}

// The action bar and the "Move to…" sheet for a useTaskSelection() (taskSelection.js)
export function SelectionActions({ sel, bottom }) {
  return (
    <>
      {sel.selecting ? <ActionBar count={sel.picked.length} bottom={bottom} onDone={sel.complete} onMove={sel.openMove} onDelete={sel.remove} /> : null}
      <MoveSheet visible={sel.moving} count={sel.picked.length} onClose={sel.closeMove} onPick={sel.moveTo} />
    </>
  );
}

// "Select" (to start picking), shown next to a list's heading
export function SelectButton({ onPress }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.selectBtn} accessibilityRole="button" accessibilityLabel={t('select.startA11y')}>
      <Ionicons name="checkmark-circle-outline" size={15} color={colors.accent} />
      <Text style={styles.selectBtnText}>{t('select.select')}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.accentSoft },
  selectBtnText: { fontSize: 12, fontWeight: '800', color: colors.accent },
  selectBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder },
  selectCount: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.accent },
  textBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  textBtnText: { fontSize: 13, fontWeight: '800', color: colors.accent },
  cancel: { backgroundColor: colors.surface },
  bar: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  barInner: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 480, backgroundColor: colors.surface, borderRadius: 20, paddingVertical: 6, borderWidth: 1, borderColor: colors.line, ...shadow },
  action: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 6 },
  actionText: { fontSize: 12, fontWeight: '800' },
  divider: { width: 1, height: 30, backgroundColor: colors.line },
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 10, paddingBottom: 28 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  heading: { flex: 1, fontSize: 19, fontWeight: '800', color: colors.ink },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  quick: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  quickBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.accentSoft },
  quickText: { fontSize: 14, fontWeight: '800', color: colors.accent },
  day: { width: 52, alignItems: 'center', paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  dayName: { fontSize: 11, fontWeight: '700', color: colors.muted },
  dayNum: { fontSize: 17, fontWeight: '800', color: colors.ink, marginTop: 1 },
}));
