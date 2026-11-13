import React from 'react';
import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles } from '../theme';
import { t } from '../i18n';

// The keyboard shortcuts, by where they work. Keys are shown as written on the keyboard.
const GROUPS = [
  ['general', [['N', 'newTask'], ['/', 'search'], ['1 – 5', 'screens'], [',', 'settings'], ['?', 'help'], ['Esc', 'close']]],
  ['calendar', [['T', 'today'], ['← →', 'prevNext'], ['M', 'month'], ['W', 'week']]],
  ['focus', [['Space', 'startPause']]],
];

export default function ShortcutsSheet({ visible, onClose }) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleFill} onPress={onClose} accessibilityLabel={t('common.closeSheet')} />
        <View style={styles.card}>
          <View style={styles.head}>
            <View style={styles.headIcon}>
              <Ionicons name="keypad" size={18} color={colors.onAccent} />
            </View>
            <Text style={styles.heading}>{t('shortcuts.title')}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
            {GROUPS.map(([group, keys]) => (
              <View key={group} style={styles.group}>
                <Text style={styles.groupTitle}>{t(`shortcuts.groups.${group}`)}</Text>
                {keys.map(([key, what]) => (
                  <View key={what} style={styles.row}>
                    <Text style={styles.what}>{t(`shortcuts.keys.${what}`)}</Text>
                    <View style={styles.kbd}>
                      <Text style={styles.kbdText}>{key === 'Space' ? t('shortcuts.space') : key}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
            <Text style={styles.note}>{t('shortcuts.note')}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const StyleFill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };

const styles = themedStyles(() => ({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.scrim, padding: 16 },
  card: { width: '100%', maxWidth: 520, backgroundColor: colors.surface, borderRadius: 24, padding: 20 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  headIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, fontSize: 19, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  group: { marginTop: 14 },
  groupTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: colors.muted, textTransform: 'uppercase', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line },
  what: { flex: 1, fontSize: 14, color: colors.ink, fontWeight: '600' },
  kbd: { minWidth: 30, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, borderWidth: 1, borderBottomWidth: 2, borderColor: colors.line, backgroundColor: colors.bg, alignItems: 'center' },
  kbdText: { fontSize: 12, fontWeight: '800', color: colors.ink, fontFamily: 'monospace' },
  note: { marginTop: 14, fontSize: 12, color: colors.muted, lineHeight: 17 },
}));
