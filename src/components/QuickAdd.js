import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, readable, themedStyles } from '../theme';
import { t } from '../i18n';
import { dateKey, formatDue, formatTime } from '../dates';
import { useStore } from '../store';
import { useAuth } from '../auth';
import { useToast } from '../toast';
import { parseQuickAdd } from '../quickAdd';
import { voiceSupported, listen } from '../voice';

const list = (key) =>
  t(key)
    .split('|')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
// the words quick add understands, in the app's language (i18n quickAdd.w*)
const wordsNow = () => ({
  today: list('quickAdd.wToday'),
  tomorrow: list('quickAdd.wTomorrow'),
  weekdays: t('quickAdd.wWeekdays')
    .split(';')
    .map((d) => d.split('|').map((x) => x.trim().toLowerCase()).filter(Boolean)),
  minutes: list('quickAdd.wMinutes'),
  hours: list('quickAdd.wHours'),
  before: list('quickAdd.wBefore'),
  at: list('quickAdd.wAt'),
});
const newId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// A task from one line: "Physics worksheet tomorrow 30 min !". What it picked up shows as chips while typing;
// Enter (or +) adds it, with Undo in the toast; it's in the list straight away to edit like any other.
export default function QuickAdd() {
  const { state, dispatch } = useStore();
  const { settings } = useAuth();
  const { show } = useToast();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false); // the card's border shows focus (the web outline is off)
  // voice (web): what's said goes into the box; nothing is added until + is pressed
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState('');
  const stopRef = useRef(null);
  useEffect(() => () => stopRef.current && stopRef.current(), []);
  const toggleVoice = () => {
    if (listening) {
      if (stopRef.current) stopRef.current();
      return;
    }
    setVoiceNote('');
    setListening(true);
    stopRef.current = listen({
      onText: (heard) => setText(heard),
      onEnd: (error) => {
        setListening(false);
        stopRef.current = null;
        if (error) setVoiceNote(t(`quickAdd.voice.${error}`));
      },
    });
  };
  const today = dateKey();
  const parsed = text.trim() ? parseQuickAdd(text, { today, subjects: state.subjects, words: wordsNow(), defaultMinutes: settings.focusMinutes || 25 }) : null;
  const subject = parsed && parsed.subjectId ? state.subjects.find((s) => s.id === parsed.subjectId) : null;

  const add = () => {
    if (!parsed || !parsed.title) return;
    const task = { id: newId(), title: parsed.title.slice(0, 200), subjectId: parsed.subjectId, due: parsed.due, time: parsed.time, estimate: parsed.estimate, priority: parsed.priority };
    dispatch({ type: 'ADD_TASK', ...task });
    setText('');
    show({
      tone: 'success',
      message: t('quickAdd.added', { title: task.title }),
      actionLabel: t('common.undo'),
      onAction: () => dispatch({ type: 'DELETE_TASK', id: task.id }),
    });
  };

  const chips = parsed
    ? [
        { icon: 'calendar-outline', text: formatDue(parsed.due), on: !!parsed.found.due },
        parsed.time ? { icon: 'time-outline', text: formatTime(parsed.time), on: true } : null,
        { icon: 'hourglass-outline', text: t('common.minutes', { count: parsed.estimate }), on: !!parsed.found.estimate },
        subject ? { icon: 'ellipse', text: subject.name, on: true, color: subject.color } : null,
        parsed.priority === 'high' ? { icon: 'flag', text: t('quickAdd.important'), on: true, color: colors.danger } : null,
      ].filter(Boolean)
    : [];

  return (
    <View style={[styles.card, focused && { borderColor: colors.accent }]}>
      <View style={styles.row}>
        <Ionicons name="flash" size={18} color={colors.accent} />
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            setVoiceNote('');
          }}
          onSubmitEditing={add}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={listening ? t('quickAdd.voice.listening') : t('quickAdd.placeholder')}
          placeholderTextColor={colors.muted}
          style={styles.input}
          accessibilityLabel={t('quickAdd.inputA11y')}
          returnKeyType="done"
          blurOnSubmit={false}
          maxLength={240}
        />
        {voiceSupported() ? (
          <Pressable onPress={toggleVoice} style={[styles.mic, listening && styles.micOn]} accessibilityRole="button" aria-pressed={listening} accessibilityState={{ selected: listening }} accessibilityLabel={listening ? t('quickAdd.voice.stop') : t('quickAdd.voice.start')}>
            <Ionicons name={listening ? 'mic' : 'mic-outline'} size={18} color={listening ? '#fff' : colors.accent} />
          </Pressable>
        ) : null}
        <Pressable onPress={add} disabled={!parsed || !parsed.title} style={[styles.add, (!parsed || !parsed.title) && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel={t('quickAdd.add')}>
          <Ionicons name="add" size={20} color="#fff" />
        </Pressable>
      </View>
      {parsed ? (
        <View style={styles.chips} accessibilityLiveRegion="polite">
          {chips.map((c) => (
            <View key={c.icon} style={[styles.chip, c.on && styles.chipOn]}>
              <Ionicons name={c.icon} size={11} color={c.color ? readable(c.color) : c.on ? colors.accent : colors.muted} />
              <Text style={[styles.chipText, c.on && { color: colors.ink }]}>{c.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {voiceNote ? <Text style={[styles.hint, { color: colors.danger }]} accessibilityLiveRegion="polite">{voiceNote}</Text> : null}
      {parsed ? <Text style={styles.hint}>{listening ? t('quickAdd.voice.check') : t('quickAdd.hint')}</Text> : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  card: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 8, marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, fontSize: 15, color: colors.ink, paddingVertical: 8, minWidth: 0, ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }) },
  mic: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  micOn: { backgroundColor: colors.danger },
  add: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.accentSoft },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  hint: { fontSize: 11, color: colors.muted, marginTop: 4, marginBottom: 2 },
}));
