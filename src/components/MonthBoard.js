import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles, readable } from '../theme';
import { t, weekdayName } from '../i18n';
import { dateKey, monthGrid } from '../dates';
import { useAuth } from '../auth';
import { useDayDrop, dragProps, dropProps } from '../dnd';

const SHOWN = 3; // items written out in a day; the rest are "+N more"

// The desktop month: a full calendar board where each day lists what's on it (classes with their time,
// exams, tasks), like a desktop calendar app. `items(key)` returns { list: [{ id, label, color, kind, done, drag }],
// vacation } for a day, already in order. Tapping a day selects it. On the web an item with `drag` can be dragged
// to another day: onMove(drag, dayKey).
export default function MonthBoard({ month, selected, onSelect, items, onMove }) {
  const weekStart = useAuth().settings.weekStart || 0;
  const cells = monthGrid(month, weekStart);
  const today = dateKey();
  const { ref, over } = useDayDrop((drag, key) => onMove && onMove(drag, key));
  return (
    <View style={styles.board} ref={ref}>
      <View style={styles.headRow}>
        {Array.from({ length: 7 }, (_, i) => {
          const wd = (i + weekStart) % 7;
          return (
            <Text key={i} style={[styles.head, (wd === 0 || wd === 6) && { color: colors.muted }]}>
              {weekdayName(wd, 'short')}
            </Text>
          );
        })}
      </View>
      {Array.from({ length: 6 }, (_, r) => (
        <View key={r} style={[styles.row, r === 5 && { borderBottomWidth: 0 }]}>
          {cells.slice(r * 7, r * 7 + 7).map((c, i) => {
            const isSel = c.key === selected;
            const isToday = c.key === today;
            const wd = (i + weekStart) % 7;
            const { list, vacation } = items(c.key);
            const more = list.length - SHOWN;
            return (
              <Pressable
                key={c.key}
                onPress={() => onSelect(c.key)}
                style={({ hovered }) => [
                  styles.cell,
                  i === 6 && { borderRightWidth: 0 },
                  (wd === 0 || wd === 6) && styles.weekend,
                  vacation && styles.vacation,
                  !c.inMonth && styles.outside,
                  hovered && !isSel && styles.hover,
                  isSel && styles.selected,
                  over === c.key && styles.dropOver,
                ]}
                {...dropProps(c.key)}
                accessibilityLabel={t('monthGrid.dayA11y', { date: c.key })}
                accessibilityState={{ selected: isSel }}
              >
                <View style={styles.cellHead}>
                  <View style={[styles.num, isToday && styles.numToday]}>
                    <Text style={[styles.numText, !c.inMonth && { color: colors.muted }, isToday && { color: colors.onAccent }]}>{c.day}</Text>
                  </View>
                  {vacation ? <Ionicons name="sunny" size={12} color="#14A38B" /> : null}
                </View>
                {list.slice(0, SHOWN).map((it) => (
                  <View key={it.id} {...dragProps(it.drag)} style={[styles.item, it.drag && styles.draggable, { backgroundColor: it.color + (it.kind === 'exam' ? '26' : '18'), borderLeftColor: it.color }]}>
                    {it.kind === 'exam' ? <Ionicons name="flag" size={9} color={it.color} /> : null}
                    <Text style={[styles.itemText, it.done && styles.itemDone, it.kind === 'exam' && { color: readable(it.color), fontWeight: '800' }]} numberOfLines={1}>
                      {it.label}
                    </Text>
                  </View>
                ))}
                {more > 0 ? <Text style={styles.more}>{t('calendar.moreItems', { count: more })}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = themedStyles(() => ({
  board: { borderWidth: 1, borderColor: colors.line, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface },
  headRow: { flexDirection: 'row', backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.line },
  head: { flex: 1, textAlign: 'center', paddingVertical: 9, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: colors.muted, textTransform: 'uppercase' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line },
  cell: { flex: 1, minWidth: 0, height: 126, padding: 6, gap: 3, borderRightWidth: 1, borderRightColor: colors.line, borderWidth: 0 },
  weekend: { backgroundColor: colors.surfaceAlt },
  vacation: { backgroundColor: colors.tealSoft },
  outside: { backgroundColor: colors.surfaceAlt }, // days of the months around it (not faded: their numbers must stay readable)
  hover: { backgroundColor: colors.accentSoft },
  selected: { backgroundColor: colors.accentSoft, ...{ outlineWidth: 2, outlineStyle: 'solid', outlineColor: colors.accent, outlineOffset: -2 } },
  cellHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 1 },
  num: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  numToday: { backgroundColor: colors.accentFill },
  numText: { fontSize: 13, fontWeight: '800', color: colors.ink },
  item: { flexDirection: 'row', alignItems: 'center', gap: 3, borderLeftWidth: 3, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  itemText: { flex: 1, fontSize: 11, fontWeight: '600', color: colors.ink },
  itemDone: { textDecorationLine: 'line-through', color: colors.muted },
  draggable: { cursor: 'grab' },
  dropOver: { backgroundColor: colors.accentSoft, outlineWidth: 2, outlineStyle: 'dashed', outlineColor: colors.accent, outlineOffset: -3 },
  more: { fontSize: 11, fontWeight: '800', color: colors.accent, paddingLeft: 4 },
}));
