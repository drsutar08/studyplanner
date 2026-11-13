import React, { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles } from '../theme';
import { t } from '../i18n';
import { dateKey, formatDue, formatTime } from '../dates';
import { addReply, deleteReply, replyErrorKind, REPLY_MAX } from '../cloud/groupBoard';

// The replies under one post on a group's board: "2 replies" opens them, with a box to add one. People delete their
// own; the group's owner (moderate) can delete any. onChanged() reloads the board's replies.
export default function BoardReplies({ post, replies, userId, moderate, onChanged }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    const body = text.trim().slice(0, REPLY_MAX);
    if (!body || busy) return;
    setBusy(true);
    setError('');
    setText(''); // emptied at once, refilled if it fails
    try {
      await addReply(post.id, body);
      await onChanged();
    } catch (e) {
      setText(body);
      setError(t(`board.errors.${replyErrorKind(e)}`));
    }
    setBusy(false);
  };
  const remove = async (r) => {
    setError('');
    try {
      await deleteReply(r.id);
      await onChanged();
    } catch {
      setError(t('board.errors.offline'));
    }
  };

  const when = (r) => {
    const d = new Date(r.created_at);
    return `${formatDue(dateKey(d))}, ${formatTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)}`;
  };
  return (
    <View>
      <Pressable onPress={() => setOpen(!open)} hitSlop={6} style={styles.toggle} accessibilityRole="button" aria-expanded={open} accessibilityState={{ expanded: open }} accessibilityLabel={replies.length ? t('replies.showA11y', { count: replies.length }) : t('replies.reply')}>
        <Ionicons name={open ? 'chatbubbles' : 'chatbubbles-outline'} size={14} color={colors.accent} />
        <Text style={styles.toggleText}>{replies.length ? t('replies.count', { count: replies.length }) : t('replies.reply')}</Text>
      </Pressable>
      {open ? (
        <View style={styles.box}>
          {replies.map((r) => (
            <View key={r.id} style={styles.reply}>
              <View style={{ flex: 1 }}>
                <Text style={styles.author} numberOfLines={1}>
                  {r.user_id === userId ? t('replies.you') : r.author_name || t('together.someone')}
                  <Text style={styles.when}>{`  ${when(r)}`}</Text>
                </Text>
                <Text style={styles.body}>{r.body}</Text>
              </View>
              {r.user_id === userId || moderate ? (
                <Pressable onPress={() => remove(r)} hitSlop={8} style={styles.del} accessibilityRole="button" accessibilityLabel={t('replies.deleteA11y', { name: r.user_id === userId ? t('replies.you') : r.author_name })}>
                  <Ionicons name="close" size={14} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
          ))}
          <View style={styles.composer}>
            <TextInput value={text} onChangeText={setText} onSubmitEditing={send} placeholder={t('replies.placeholder')} placeholderTextColor={colors.muted} style={styles.input} accessibilityLabel={t('replies.inputA11y')} maxLength={REPLY_MAX} returnKeyType="send" />
            <Pressable onPress={send} disabled={!text.trim() || busy} style={[styles.send, (!text.trim() || busy) && { opacity: 0.45 }]} accessibilityRole="button" accessibilityLabel={t('replies.send')}>
              <Ionicons name="send" size={15} color="#fff" />
            </Pressable>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, alignSelf: 'flex-start' },
  toggleText: { fontSize: 12, fontWeight: '700', color: colors.accent },
  box: { marginTop: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: colors.line },
  reply: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 5 },
  author: { fontSize: 12, fontWeight: '800', color: colors.ink },
  when: { fontSize: 11, fontWeight: '400', color: colors.muted },
  body: { fontSize: 13, color: colors.ink, lineHeight: 18, marginTop: 1 },
  del: { padding: 4 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, color: colors.ink, backgroundColor: colors.surface },
  send: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' },
  error: { fontSize: 12, color: colors.danger, marginTop: 4 },
}));
