import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles } from '../theme';
import { activityLook } from '../activityKinds';
import { t, weekdayName } from '../i18n';
import { dateKey, parseKey, formatTime } from '../dates';
import { fromMin } from '../freeTime';
import { rotationIndexOn, rotationLetter, isActivity } from '../classes';
import { useDayDrop, dragProps, dropProps } from '../dnd';

const HOUR = 44; // height of one hour, px
const GUTTER = 30; // hour labels

// The Calendar's week: one column per day with classes, timed exams and timed tasks drawn at their times.
// `week` comes from buildWeek() (src/weekLayout.js). Tapping a day or a block selects that day.
// On the web a task, exam or one-off class can be dragged: onMove(drag, dayKey, minute) where minute is the new
// start (rounded to 15 min) when dropped on the timeline, or null when dropped on a day header (day only).
export default function WeekView({ week, selected, onSelect, subjectById, rotation = null, vacations = [], onMove }) {
  const today = dateKey();
  const { columns, startHour, endHour } = week;
  const height = (endHour - startHour) * HOUR;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const top = (min) => ((min - startHour * 60) / 60) * HOUR;
  const { ref, over } = useDayDrop((drag, key, at) => {
    if (!onMove) return;
    if (!at.timeline) return onMove(drag, key, null);
    const min = Math.round((startHour * 60 + (at.y / at.height) * (endHour - startHour) * 60) / 15) * 15;
    onMove(drag, key, Math.min(24 * 60 - 15, Math.max(0, min)));
  });
  const canDrag = (b) => b.kind === 'task' || b.kind === 'exam' || (b.kind === 'class' && b.ref.repeat === 'once');

  return (
    <View ref={ref}>
      {/* day headers */}
      <View style={styles.headRow}>
        <View style={{ width: GUTTER }} />
        {columns.map((col) => {
          const d = parseKey(col.key);
          const isToday = col.key === today;
          const isSel = col.key === selected;

          return (
            <Pressable
              key={col.key}
              onPress={() => onSelect(col.key)}
              style={[styles.dayHead, isSel && styles.dayHeadSel, over === col.key && !isSel && styles.dropOver]}
              {...dropProps(col.key)}
              accessibilityRole="button"
              aria-pressed={!!isSel} accessibilityState={{ selected: isSel }}
              accessibilityLabel={t('week.dayA11y', { day: weekdayName(d.getDay(), 'long'), date: d.getDate() })}
            >
              <Text style={[styles.dayName, isToday && { color: colors.accent }, isSel && styles.onSel]}>{weekdayName(d.getDay(), 'short')}</Text>
              <Text style={[styles.dayNum, isToday && { color: colors.accent }, isSel && styles.onSel]}>{d.getDate()}</Text>
              {rotation && rotation.type === 'days' && rotationIndexOn(rotation, col.key, vacations) !== null ? (
                <Text style={[styles.letter, isSel && styles.onSel]}>{rotationLetter(rotationIndexOn(rotation, col.key, vacations))}</Text>
              ) : null}
              <View style={styles.badgeRow}>
                {col.untimedExams > 0 ? <Ionicons name="flag" size={9} color={isSel ? colors.onAccent : colors.danger} /> : null}
                {col.untimedTasks > 0 ? <Text style={[styles.badge, isSel && styles.badgeSel]}>{col.untimedTasks}</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* timeline */}
      <View style={[styles.grid, { height }]}>
        <View style={{ width: GUTTER }}>
          {Array.from({ length: endHour - startHour }, (_, i) => (
            <Text key={i} style={[styles.hour, { top: i * HOUR - 6 }]}>
              {i === 0 ? '' : formatTime(fromMin((startHour + i) * 60)).replace(/:00(?=\D|$)/, '')}
            </Text>
          ))}
        </View>
        {columns.map((col) => (
          <Pressable key={col.key} style={[styles.col, col.key === selected && styles.colSel, over === col.key && styles.dropOver]} onPress={() => onSelect(col.key)} accessible={false} {...dropProps(col.key, true)}>
            {Array.from({ length: endHour - startHour }, (_, i) => (
              <View key={i} style={[styles.line, { top: i * HOUR }]} />
            ))}
            {col.blocks.map((b) => {
              const s = subjectById[b.subjectId];
              const tint = b.kind === 'exam' ? colors.danger : isActivity(b.ref) ? activityLook(b.ref).color : s ? s.color : colors.violet;
              const width = 100 / b.lanes;
              const h = Math.max(16, top(b.endMin) - top(b.startMin) - 2);
              return (
                <Pressable
                  key={b.id}
                  onPress={() => onSelect(col.key)}
                  {...dragProps(canDrag(b) ? b.id : null)}
                  style={[
                    styles.block,
                    { top: top(b.startMin) + 1, height: h, left: `${b.lane * width}%`, width: `${width}%`, borderLeftColor: tint, backgroundColor: tint + (b.kind === 'task' ? '14' : '2B') },
                    b.kind === 'task' && styles.taskBlock,
                    b.done && { opacity: 0.45 },
                    canDrag(b) && styles.draggable,
                  ]}
                  accessibilityLabel={t(`week.${b.kind}A11y`, { title: b.title, time: formatTime(fromMin(b.startMin)) })}
                >
                  {b.kind === 'exam' ? <Ionicons name="flag" size={8} color={tint} /> : null}
                  <Text style={styles.blockText} numberOfLines={Math.max(1, Math.floor(h / 11))}>
                    {b.title}
                  </Text>
                </Pressable>
              );
            })}
            {col.key === today && nowMin >= startHour * 60 && nowMin <= endHour * 60 ? (
              <View style={[styles.now, { top: top(nowMin) }]} pointerEvents="none">
                <View style={styles.nowDot} />
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
      <View style={styles.hintRow}>
        <View style={[styles.hintBox, { backgroundColor: colors.violet + '2B', borderLeftColor: colors.violet }]} />
        <Text style={styles.hint}>{t('week.legendClass')}</Text>
        <View style={[styles.hintBox, { backgroundColor: colors.danger + '2B', borderLeftColor: colors.danger }]} />
        <Text style={styles.hint}>{t('week.legendExam')}</Text>
        <View style={[styles.hintBox, styles.taskBlock, { borderLeftColor: colors.accent }]} />
        <Text style={styles.hint}>{t('week.legendTask')}</Text>
        <Text style={[styles.badge, { marginLeft: 6 }]}>2</Text>
        <Text style={styles.hint}>{t('week.legendUntimed')}</Text>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  headRow: { flexDirection: 'row', marginBottom: 6 },
  dayHead: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 12, marginHorizontal: 1 },
  dayHeadSel: { backgroundColor: colors.accentFill },
  dayName: { fontSize: 10, fontWeight: '700', color: colors.muted },
  letter: { fontSize: 9, fontWeight: '800', color: colors.violet, marginTop: -1 },
  dayNum: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 1 },
  onSel: { color: colors.onAccent },
  badgeSel: { color: colors.onAccent, backgroundColor: 'rgba(255,255,255,0.25)' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 12, marginTop: 1 },
  badge: { fontSize: 9, fontWeight: '800', color: colors.accent, backgroundColor: colors.accentSoft, borderRadius: 6, paddingHorizontal: 4, overflow: 'hidden' },
  grid: { flexDirection: 'row' },
  hour: { position: 'absolute', right: 4, fontSize: 9, color: colors.muted, fontWeight: '600' },
  col: { flex: 1, borderLeftWidth: 1, borderLeftColor: colors.line, position: 'relative' },
  colSel: { backgroundColor: colors.accentSoft + '66' },
  line: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.line, opacity: 0.6 },
  block: { position: 'absolute', borderRadius: 5, borderLeftWidth: 3, paddingHorizontal: 2, paddingVertical: 1, overflow: 'hidden', marginHorizontal: 1 },
  taskBlock: { borderStyle: 'dashed', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceAlt },
  // Narrow columns: clip a long word rather than breaking it mid-word (web wraps anywhere by default)
  blockText: { fontSize: 9, fontWeight: '700', color: colors.ink, lineHeight: 11, ...Platform.select({ web: { wordBreak: 'normal', overflowWrap: 'normal' }, default: {} }) },
  draggable: { cursor: 'grab' },
  dropOver: { backgroundColor: colors.accentSoft, outlineWidth: 2, outlineStyle: 'dashed', outlineColor: colors.accent, outlineOffset: -2 },
  now: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: colors.danger },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  hintRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  hintBox: { width: 12, height: 10, borderRadius: 3, borderLeftWidth: 3 },
  hint: { fontSize: 11, color: colors.muted, marginRight: 6 },
}));
