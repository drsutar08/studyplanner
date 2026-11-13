import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles, solid } from '../theme';
import { t } from '../i18n';
import { addStep, removeStep, toggleStep, MAX_STEPS, MAX_STEP_LENGTH } from '../subtasks';

// A task's subtasks as a checklist. Two modes:
//  - tick (task card, Focus): `onToggle(stepId)`, plus an "Add a subtask" field when `onAdd(title)` is given
//  - editable (task sheet): `editable` + `onChange(steps)`: tick, rename in place, remove, and add new ones
export default function StepList({ steps = [], onToggle, onAdd, editable = false, onChange, tint = colors.accent, autoFocusAdd = false }) {
  const [draft, setDraft] = useState('');
  const toggle = (id) => (editable ? onChange(toggleStep(steps, id)) : onToggle(id));
  const add = () => {
    if (!editable) {
      if (draft.trim()) onAdd(draft);
    } else {
      const next = addStep(steps, draft);
      if (next !== steps) onChange(next);
    }
    setDraft('');
  };

  return (
    <View>
      {steps.map((s) => (
        <View key={s.id} style={styles.row}>
          <Pressable
            onPress={() => toggle(s.id)}
            hitSlop={8}
            accessibilityRole="checkbox"
            aria-checked={!!s.done}
            accessibilityState={{ checked: s.done }}
            accessibilityLabel={t(s.done ? 'steps.reopenA11y' : 'steps.doneA11y', { title: s.title })}
          >
            <Ionicons name={s.done ? 'checkmark-circle' : 'ellipse-outline'} size={19} color={s.done ? colors.success : colors.muted} />
          </Pressable>
          {editable ? (
            <TextInput
              value={s.title}
              onChangeText={(text) => onChange(steps.map((x) => (x.id === s.id ? { ...x, title: text } : x)))}
              style={[styles.title, styles.input, s.done && styles.titleDone]}
              maxLength={MAX_STEP_LENGTH}
              accessibilityLabel={t('steps.renameA11y', { title: s.title })}
            />
          ) : (
            <Text style={[styles.title, s.done && styles.titleDone]} numberOfLines={2}>
              {s.title}
            </Text>
          )}
          {editable ? (
            <Pressable onPress={() => onChange(removeStep(steps, s.id))} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('steps.removeA11y', { title: s.title })}>
              <Ionicons name="close" size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      ))}

      {(editable || onAdd) && steps.length < MAX_STEPS ? (
        <View style={styles.addRow}>
          <Ionicons name="add" size={18} color={tint} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={add}
            blurOnSubmit={false}
            returnKeyType="done"
            placeholder={t('steps.addPlaceholder')}
            autoFocus={autoFocusAdd}
            placeholderTextColor={colors.muted}
            style={[styles.title, styles.input]}
            maxLength={MAX_STEP_LENGTH}
            accessibilityLabel={t('steps.addA11y')}
          />
          {draft.trim() ? (
            <Pressable onPress={add} hitSlop={8} style={[styles.addBtn, { backgroundColor: solid(tint) }]} accessibilityRole="button" accessibilityLabel={t('steps.addButtonA11y')}>
              <Ionicons name="arrow-up" size={14} color={colors.onAccent} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  title: { flex: 1, fontSize: 14, color: colors.ink },
  titleDone: { color: colors.muted, textDecorationLine: 'line-through' },
  input: {
    paddingVertical: 2,
    ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }),
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  addBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
