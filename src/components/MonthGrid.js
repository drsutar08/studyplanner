import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles } from '../theme';
import { t } from '../i18n';
import { weekdayLetters, addMonths, dateKey, monthGrid, monthOf, monthTitle } from '../dates';
import { useAuth } from '../auth';

// Month calendar. `marks(key)` returns { dots: [colors], exam: boolean, classes: number, vacation: boolean } for a day.
// Pass showHeader={false} when the screen draws its own month title and arrows.
export default function MonthGrid({ month, onMonthChange, selected, onSelect, marks, minKey, showHeader = true }) {
  const weekStart = useAuth().settings.weekStart || 0;
  const cells = monthGrid(month, weekStart);
  const letters = weekdayLetters(weekStart);
  const today = dateKey();

  return (
    <View>
      {showHeader && (
        <View style={styles.head}>
          <Pressable onPress={() => onMonthChange(addMonths(month, -1))} hitSlop={8} style={styles.nav} accessibilityLabel={t('monthGrid.prevMonth')}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </Pressable>
          <Pressable onPress={() => onMonthChange(monthOf(today))} accessibilityLabel={t('monthGrid.thisMonth')}>
            <Text style={styles.title}>{monthTitle(month)}</Text>
          </Pressable>
          <Pressable onPress={() => onMonthChange(addMonths(month, 1))} hitSlop={8} style={styles.nav} accessibilityLabel={t('monthGrid.nextMonth')}>
            <Ionicons name="chevron-forward" size={20} color={colors.ink} />
          </Pressable>
        </View>
      )}

      <View style={styles.row}>
        {letters.map((l, i) => (
          <Text key={i} style={[styles.letter, [0, 6].includes((i + weekStart) % 7) && { color: colors.muted }]}>
            {l}
          </Text>
        ))}
      </View>

      {Array.from({ length: 6 }, (_, r) => (
        <View key={r} style={styles.row}>
          {cells.slice(r * 7, r * 7 + 7).map((c) => {
            const isSel = c.key === selected;
            const isToday = c.key === today;
            const disabled = minKey && c.key < minKey;
            const m = (marks && marks(c.key)) || { dots: [], exam: false };
            const busy = m.dots.length > 0;
            return (
              <Pressable
                key={c.key}
                disabled={disabled}
                onPress={() => onSelect(c.key)}
                style={styles.cellWrap}
                accessibilityLabel={t('monthGrid.dayA11y', { date: c.key })}
              >
                <View
                  style={[
                    styles.cell,
                    c.inMonth && busy && styles.cellBusy,
                    c.inMonth && m.exam && styles.cellExam,
                    c.inMonth && m.vacation && styles.cellBreak,
                    isToday && !isSel && styles.cellToday,
                    isSel && styles.cellSel,
                  ]}
                >
                  <Text
                    style={[
                      styles.numText,
                      !c.inMonth && { color: colors.muted, fontWeight: '400' },
                      disabled && { color: colors.faint },
                      isToday && !isSel && { color: colors.accent, fontWeight: '800' },
                      isSel && { color: colors.onAccent, fontWeight: '800' },
                    ]}
                  >
                    {c.day}
                  </Text>
                  <View style={styles.dots}>
                    {m.exam ? <Ionicons name="flag" size={9} color={isSel ? '#FFD2D2' : colors.danger} /> : null}
                    {m.classes ? <View style={[styles.classBar, { backgroundColor: isSel ? colors.onAccent : colors.violet }]} /> : null}
                    {m.dots.slice(0, 3).map((col, i) => (
                      <View key={i} style={[styles.dot, { backgroundColor: isSel ? colors.onAccent : col }]} />
                    ))}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// Used by other screens as a fill; the grid itself uses colors.violet so it follows the theme.
export const CLASS_COLOR = '#7A5CFA';

const styles = themedStyles(() => ({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '800', color: colors.ink },
  nav: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row' },
  letter: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: colors.muted, marginBottom: 8 },
  cellWrap: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  cell: { width: '88%', maxWidth: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  cellBusy: { backgroundColor: colors.surfaceAlt },
  cellExam: { backgroundColor: colors.dangerSoft },
  cellBreak: { backgroundColor: colors.tealSoft },
  cellToday: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  cellSel: {
    backgroundColor: colors.accentFill,
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  numText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  dots: { height: 9, flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  classBar: { width: 9, height: 3, borderRadius: 2 },
}));
