import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles } from '../theme';
import { t } from '../i18n';
import { addDays, dateKey, formatDue } from '../dates';
import { useStore } from '../store';
import DateField from './DateField';
import { listPosts, addPost, updatePost, deletePost, watchBoards, boardErrorKind, listReplies, watchReplies } from '../cloud/groupBoard';
import { boardNotes, boardTasks } from '../groupTasks';
import { useAuth } from '../auth';
import StudyingNow from './StudyingNow';
import BoardReplies from './BoardReplies';

const ESTIMATES = [15, 30, 45, 60, 90];

// A live group's board: notes (pinned ones first) and shared tasks. Its owner posts, pins and removes; members read,
// and see whether each shared task is in their list or done.
export default function GroupBoardSheet({ visible, group, owner = false, onClose }) {
  const { state } = useStore();
  const { user } = useAuth();
  const [posts, setPosts] = useState(null); // null while loading
  const [replies, setReplies] = useState(null); // null until read (or when the board has no replies yet: see the 20261109 migration)
  const [error, setError] = useState('');
  const [kind, setKind] = useState('note');
  const [body, setBody] = useState('');
  const [pin, setPin] = useState(false);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(addDays(dateKey(), 7));
  const [estimate, setEstimate] = useState(30);
  const [busy, setBusy] = useState(false);
  const gid = visible && group ? group.id : null;

  useEffect(() => {
    if (!gid) return undefined;
    let alive = true;
    const load = () =>
      listPosts([gid])
        .then((p) => alive && setPosts(p))
        .catch(() => alive && setError(t('board.errors.offline')));
    load();
    const stop = watchBoards([gid], load);
    return () => {
      alive = false;
      stop();
    };
  }, [gid]);

  // the replies under the posts, kept up to date as the group writes them
  const loadReplies = () =>
    gid
      ? listReplies(gid)
          .then(setReplies)
          .catch(() => {})
      : Promise.resolve();
  useEffect(() => {
    if (!gid) return undefined;
    let alive = true;
    const load = () =>
      listReplies(gid)
        .then((r) => alive && setReplies(r))
        .catch(() => {}); // offline, or replies not set up: the board works without them
    load();
    const stop = watchReplies(gid, load);
    return () => {
      alive = false;
      stop();
    };
  }, [gid]);
  const repliesTo = (postId) => (replies || []).filter((r) => r.post_id === postId);

  const [openFor, setOpenFor] = useState(null);
  if (gid !== openFor) {
    setOpenFor(gid);
    setPosts(null);
    setReplies(null);
    setError('');
    setKind('note');
    setBody('');
    setPin(false);
    setTitle('');
    setDue(addDays(dateKey(), 7));
    setEstimate(30);
  }
  if (!group) return null;

  // onError: what to do when it fails (besides the message)
  const run = async (fn, onError) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      setPosts(await listPosts([group.id]));
    } catch (e) {
      setError(t(`board.errors.${boardErrorKind(e)}`));
      if (onError) onError();
    }
    setBusy(false);
  };
  const canPost = kind === 'note' ? body.trim().length > 0 : title.trim().length > 0 && !!due;
  // the form empties at once (so what's typed while it's sending isn't wiped), and refills if the post fails
  const post = () => {
    if (!canPost || busy) return;
    const sent = { kind, body, title, pin };
    const row = kind === 'note' ? { group_id: group.id, kind: 'note', body: body.trim().slice(0, 1000), pinned: pin } : { group_id: group.id, kind: 'task', title: title.trim().slice(0, 120), body: body.trim().slice(0, 1000), due, estimate };
    setBody('');
    setTitle('');
    setPin(false);
    run(
      () => addPost(row),
      () => {
        setKind(sent.kind);
        setBody(sent.body);
        setTitle(sent.title);
        setPin(sent.pin);
      }
    );
  };

  const mine = Object.fromEntries((state.tasks || []).filter((x) => x.fromGroup === group.id).map((x) => [x.groupTaskId, x]));
  const notes = posts ? boardNotes(posts) : [];
  const tasks = posts ? boardTasks(posts) : [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1, alignSelf: 'stretch' }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={styles.headIcon}>
              <Ionicons name="clipboard" size={20} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading} numberOfLines={1}>{t('board.title', { name: group.name })}</Text>
              <Text style={styles.headSub}>{owner ? t('board.subOwner') : t('board.subMember')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: owner ? 330 : 520 }} keyboardShouldPersistTaps="handled">
            {/* who in this group is studying now (study together) */}
            <StudyingNow groupId={group.id} empty={false} />
            {posts === null && !error ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} /> : null}

            {posts ? (
              <>
                <Text style={styles.section}>{t('board.notes')}</Text>
                {!notes.length ? <Text style={styles.empty}>{owner ? t('board.noNotesOwner') : t('board.noNotes')}</Text> : null}
                {notes.map((n) => (
                  <View key={n.id} style={[styles.note, n.pinned && styles.notePinned]}>
                    {n.pinned ? <Ionicons name="pin" size={14} color={colors.accent} style={{ marginTop: 2 }} /> : null}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.noteText}>{n.body}</Text>
                      <Text style={styles.noteMeta}>{formatDue(String(n.created_at).slice(0, 10))}</Text>
                      {replies ? <BoardReplies post={n} replies={repliesTo(n.id)} userId={user && user.id} moderate={owner} onChanged={loadReplies} /> : null}
                    </View>
                    {owner ? (
                      <>
                        <Pressable onPress={() => run(() => updatePost(n.id, { pinned: !n.pinned }))} hitSlop={8} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={n.pinned ? t('board.unpinA11y') : t('board.pinA11y')}>
                          <Ionicons name={n.pinned ? 'pin' : 'pin-outline'} size={16} color={colors.muted} />
                        </Pressable>
                        <Pressable onPress={() => run(() => deletePost(n.id))} hitSlop={8} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t('board.deleteNoteA11y')}>
                          <Ionicons name="trash-outline" size={16} color={colors.muted} />
                        </Pressable>
                      </>
                    ) : null}
                  </View>
                ))}

                <Text style={styles.section}>{t('board.tasks')}</Text>
                {!tasks.length ? <Text style={styles.empty}>{owner ? t('board.noTasksOwner') : t('board.noTasks')}</Text> : null}
                {tasks.map((x) => {
                  const copy = mine[x.id];
                  return (
                    <View key={x.id} style={styles.task}>
                      <Ionicons name={copy && copy.done ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={copy && copy.done ? colors.success : colors.muted} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.taskTitle} numberOfLines={2}>{x.title}</Text>
                        <Text style={styles.noteMeta}>
                          {[t('board.due', { when: formatDue(x.due) }), t('common.minutes', { count: x.estimate || 30 }), owner ? null : copy ? (copy.done ? t('board.done') : t('board.inYourTasks')) : t('board.notInList')].filter(Boolean).join(' · ')}
                        </Text>
                        {x.body ? <Text style={styles.taskBody}>{x.body}</Text> : null}
                        {replies ? <BoardReplies post={x} replies={repliesTo(x.id)} userId={user && user.id} moderate={owner} onChanged={loadReplies} /> : null}
                      </View>
                      {owner ? (
                        <Pressable onPress={() => run(() => deletePost(x.id))} hitSlop={8} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t('board.deleteTaskA11y', { title: x.title })}>
                          <Ionicons name="trash-outline" size={16} color={colors.muted} />
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </>
            ) : null}
          </ScrollView>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {owner && posts ? (
            <View style={styles.composer}>
              <View style={styles.seg} accessibilityRole="tablist">
                {[['note', t('board.newNote')], ['task', t('board.newTask')]].map(([k, label]) => (
                  <Pressable key={k} onPress={() => setKind(k)} style={[styles.segBtn, kind === k && styles.segOn]} accessibilityRole="tab" accessibilityState={{ selected: kind === k }} aria-selected={kind === k}>
                    <Text style={[styles.segText, kind === k && styles.segTextOn]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              {kind === 'task' ? (
                <>
                  <TextInput value={title} onChangeText={setTitle} placeholder={t('board.taskPlaceholder')} placeholderTextColor={colors.muted} style={styles.input} accessibilityLabel={t('board.taskTitleA11y')} maxLength={120} />
                  <View style={styles.taskOpts}>
                    <DateField value={due} onChange={setDue} label={t('board.dueLabel')} minKey={dateKey()} />
                    <View style={styles.chips}>
                      {ESTIMATES.map((m) => (
                        <Pressable key={m} onPress={() => setEstimate(m)} style={[styles.chip, estimate === m && styles.chipOn]} accessibilityRole="button" aria-pressed={!!(estimate === m)} accessibilityState={{ selected: estimate === m }}>
                          <Text style={[styles.chipText, estimate === m && styles.chipTextOn]}>{t('common.minutes', { count: m })}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </>
              ) : null}
              <TextInput
                value={body}
                onChangeText={setBody}
                placeholder={kind === 'note' ? t('board.notePlaceholder') : t('board.detailsPlaceholder')}
                placeholderTextColor={colors.muted}
                multiline
                style={[styles.input, { minHeight: 52 }]}
                accessibilityLabel={kind === 'note' ? t('board.noteA11y') : t('board.detailsA11y')}
                maxLength={1000}
              />
              <View style={styles.postRow}>
                {kind === 'note' ? (
                  <Pressable onPress={() => setPin((v) => !v)} style={styles.pinToggle} accessibilityRole="checkbox" aria-checked={pin} accessibilityState={{ checked: pin }}>
                    <Ionicons name={pin ? 'checkbox' : 'square-outline'} size={18} color={pin ? colors.accent : colors.muted} />
                    <Text style={styles.pinText}>{t('board.pinForAll')}</Text>
                  </Pressable>
                ) : (
                  <Text style={[styles.pinText, { flex: 1 }]}>{t('board.taskNote')}</Text>
                )}
                <Pressable onPress={post} disabled={!canPost || busy} style={[styles.postBtn, (!canPost || busy) && { opacity: 0.4 }]} accessibilityRole="button">
                  {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.postText}>{kind === 'note' ? t('board.postNote') : t('board.postTask')}</Text>}
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 10, paddingBottom: 24 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  headIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#16A085', alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.muted, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  empty: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  note: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.bg, marginBottom: 8 },
  notePinned: { backgroundColor: colors.accentSoft },
  noteText: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  noteMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  iconBtn: { padding: 4 },
  task: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  taskTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  taskBody: { fontSize: 13, color: colors.ink, marginTop: 3, lineHeight: 18 },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', marginTop: 8 },
  composer: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 10, paddingTop: 12, gap: 8 },
  seg: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 12, padding: 3 },
  segBtn: { flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center' },
  segOn: { backgroundColor: colors.accentFill },
  segText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  segTextOn: { color: colors.onAccent },
  input: { borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, padding: 10, fontSize: 14, color: colors.ink, textAlignVertical: 'top' },
  taskOpts: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.accentFill, borderColor: colors.accentFill },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.ink },
  chipTextOn: { color: colors.onAccent },
  postRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pinToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pinText: { fontSize: 12, color: colors.muted },
  postBtn: { height: 44, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' },
  postText: { color: colors.onAccent, fontSize: 14, fontWeight: '800' },
}));
