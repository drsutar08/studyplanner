import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, Share, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { colors, radius, themedStyles } from '../theme';
import { t } from '../i18n';
import { useAuth } from '../auth';
import { dateKey, formatDue } from '../dates';
import { openPremium } from './PremiumSheet';
import { openFile } from '../materialFile';
import {
  cleanCode, formatCode, codeComplete, fileKind, fileProblem, formatSize, cleanUrl, linkHost, sortMaterials, isNew, hasNew,
  classroomErrorKind, PICKER_TYPES, TITLE_MAX, BODY_MAX,
} from '../classrooms';
import {
  useClassroomList, reloadClassrooms, createClassroom, deleteClassroom, resetCode, joinClassroom, leaveClassroom,
  listMembers, approveMember, removeMember, listMaterials, addLink, addNote, addFile, updateMaterial, deleteMaterial,
  fileUrl, reportClassroom, watchClassroom, useClassroomSeen, markSeen, classroomQuota,
} from '../cloud/classrooms';

// Classrooms: a teacher shares study materials (files, links, notes) with their own students. Students join with
// the classroom's code and wait for the teacher to approve them. Opened from Settings.
const KIND_ICON = { pdf: 'document-text', image: 'image', doc: 'document', slides: 'easel', sheet: 'grid', link: 'link', note: 'reader' };
const KIND_TINT = { pdf: '#C0392B', image: '#8E44AD', doc: '#2B6CB0', slides: '#D35400', sheet: '#157A52', link: '#0E7C86', note: '#5B6CF0' };
const materialKind = (m) => (m.kind === 'file' ? fileKind(m.mime_type, m.file_name) || 'doc' : m.kind);

export default function ClassroomsSheet({ visible, onClose }) {
  const { user } = useAuth();
  const rooms = useClassroomList();
  const seen = useClassroomSeen();
  const [view, setView] = useState('list'); // 'list' | 'create' | 'join' | 'room'
  const [roomId, setRoomId] = useState(null);
  const [roomSeenAt, setRoomSeenAt] = useState(null); // when the student last looked, before this visit
  const [openFor, setOpenFor] = useState(false);
  if (visible !== openFor) {
    setOpenFor(visible);
    if (visible) {
      setView('list');
      setRoomId(null);
    }
  }
  useEffect(() => {
    if (visible) reloadClassrooms();
  }, [visible]);

  const room = (rooms || []).find((c) => c.id === roomId) || null;
  const openRoom = (c) => {
    setRoomId(c.id);
    setRoomSeenAt(seen[c.id] || null);
    setView('room');
  };
  const back = () => {
    setView('list');
    setRoomId(null);
    reloadClassrooms();
  };

  let title = t('classroom.title');
  let sub = t('classroom.sub');
  let body;
  if (view === 'create') {
    title = t('classroom.createTitle');
    sub = t('classroom.createSub');
    body = <CreateForm onDone={(c) => reloadClassrooms().then(() => openRoom({ ...c, role: 'teacher' }))} onBack={back} />;
  } else if (view === 'join') {
    title = t('classroom.joinTitle');
    sub = t('classroom.joinSub');
    body = <JoinForm onDone={(c) => reloadClassrooms().then(() => openRoom({ ...c, role: 'student' }))} onBack={back} />;
  } else if (view === 'room' && room) {
    title = room.name;
    sub = room.role === 'teacher' ? t('classroom.youTeach') : t('classroom.teacher', { name: room.teacher_name || t('classroom.aTeacher') });
    body = <Room room={room} user={user} seenAt={roomSeenAt} onBack={back} />;
  } else {
    body = (
      <View>
        {rooms === null ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} /> : null}
        {rooms && !rooms.length ? <Text style={styles.help}>{t('classroom.empty')}</Text> : null}
        {(rooms || []).map((c) => (
          <Pressable key={c.id} style={styles.card} onPress={() => openRoom(c)} accessibilityRole="button" accessibilityLabel={c.name}>
            <View style={[styles.cardIcon, { backgroundColor: (c.role === 'teacher' ? colors.accent : '#16A085') + '1F' }]}>
              <Ionicons name={c.role === 'teacher' ? 'school' : 'book'} size={18} color={c.role === 'teacher' ? colors.accent : '#16A085'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {c.name}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {c.role === 'teacher'
                  ? [c.subject, t('classroom.studentsCount', { count: c.students || 0 }), t('classroom.materialsCount', { count: c.materials || 0 })].filter(Boolean).join(' · ')
                  : c.status === 'pending'
                    ? t('classroom.waiting')
                    : [c.subject, t('classroom.teacher', { name: c.teacher_name || t('classroom.aTeacher') })].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {c.role === 'teacher' && c.pending ? <Text style={styles.badge}>{t('classroom.requestsBadge', { count: c.pending })}</Text> : null}
            {hasNew(c, seen[c.id]) ? <Text style={styles.badge}>{t('classroom.newBadge')}</Text> : null}
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
        ))}
        <View style={styles.footerRow}>
          <Pressable style={[styles.primary, { flex: 1 }]} onPress={() => setView('create')} accessibilityRole="button">
            <Ionicons name="add" size={18} color={colors.onAccent} />
            <Text style={styles.primaryText}>{t('classroom.create')}</Text>
          </Pressable>
          <Pressable style={[styles.secondary, { flex: 1 }]} onPress={() => setView('join')} accessibilityRole="button">
            <Ionicons name="enter-outline" size={18} color={colors.accent} />
            <Text style={styles.secondaryText}>{t('classroom.join')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={view === 'list' ? onClose : back}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            {view === 'list' ? (
              <View style={[styles.headIcon, { backgroundColor: colors.accentFill }]}>
                <Ionicons name="school" size={20} color={colors.onAccent} />
              </View>
            ) : (
              <Pressable onPress={back} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('classroom.back')}>
                <Ionicons name="chevron-back" size={20} color={colors.muted} />
              </Pressable>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.heading} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.headSub} numberOfLines={1}>
                {sub}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
            {body}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------- making a classroom ----------
function CreateForm({ onDone, onBack }) {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const create = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const c = await createClassroom({ name: name.trim().slice(0, 60), subject: subject.trim().slice(0, 60) });
      onDone(c);
    } catch (e) {
      const kind = classroomErrorKind(e);
      if (kind === 'limit') {
        const q = await classroomQuota().catch(() => null);
        setError(t('classroom.errors.limit', { count: (q && q.classrooms_limit) || 1 }));
        openPremium('classrooms');
      } else setError(t(`classroom.errors.${kind}`));
      setBusy(false);
    }
  };
  return (
    <View>
      <Text style={styles.label}>{t('classroom.nameLabel')}</Text>
      <TextInput style={styles.field} value={name} onChangeText={setName} placeholder={t('classroom.namePlaceholder')} placeholderTextColor={colors.faint} maxLength={60} accessibilityLabel={t('classroom.nameLabel')} />
      <Text style={styles.label}>{t('classroom.subjectLabel')}</Text>
      <TextInput style={styles.field} value={subject} onChangeText={setSubject} placeholder={t('classroom.subjectPlaceholder')} placeholderTextColor={colors.faint} maxLength={60} accessibilityLabel={t('classroom.subjectLabel')} />
      <Text style={styles.help}>{t('classroom.createHelp')}</Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.footerRow}>
        <Pressable style={styles.secondary} onPress={onBack} accessibilityRole="button">
          <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable style={[styles.primary, { flex: 1 }, (!name.trim() || busy) && styles.off]} onPress={create} disabled={!name.trim() || busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>{t('classroom.createBtn')}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

// ---------- joining with a code ----------
function JoinForm({ onDone, onBack }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const join = async () => {
    if (busy || !codeComplete(code)) return;
    setBusy(true);
    setError('');
    try {
      const c = await joinClassroom(cleanCode(code));
      if (!c) {
        setError(t('classroom.errors.badCode'));
        setBusy(false);
        return;
      }
      onDone(c);
    } catch (e) {
      setError(t(`classroom.errors.${classroomErrorKind(e)}`));
      setBusy(false);
    }
  };
  return (
    <View>
      <Text style={styles.label}>{t('classroom.codeLabel')}</Text>
      <TextInput
        style={[styles.field, styles.codeField]}
        value={formatCode(code)}
        onChangeText={(v) => setCode(cleanCode(v))}
        placeholder="ABCD-EFGH"
        placeholderTextColor={colors.faint}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={9}
        onSubmitEditing={join}
        accessibilityLabel={t('classroom.codeLabel')}
      />
      <Text style={styles.help}>{t('classroom.joinHelp')}</Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.footerRow}>
        <Pressable style={styles.secondary} onPress={onBack} accessibilityRole="button">
          <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable style={[styles.primary, { flex: 1 }, (!codeComplete(code) || busy) && styles.off]} onPress={join} disabled={!codeComplete(code) || busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>{t('classroom.askToJoin')}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

// ---------- one classroom ----------
function Room({ room, user, seenAt, onBack }) {
  const teacher = room.role === 'teacher';
  const approved = teacher || room.status === 'approved';
  const [tab, setTab] = useState('materials'); // teacher: 'materials' | 'students'
  const [materials, setMaterials] = useState(null);
  const [members, setMembers] = useState(null);
  const [adding, setAdding] = useState(false);
  const [reporting, setReporting] = useState(null); // { material } or { classroom: true }
  const [confirm, setConfirm] = useState(null); // the action waiting for a second tap
  const [error, setError] = useState('');
  const [code, setCode] = useState(room.join_code);

  useEffect(() => {
    if (!teacher && approved && user) markSeen(user.id, room.id);
  }, [teacher, approved, user, room.id]);

  useEffect(() => {
    if (!approved) return undefined;
    let alive = true;
    const load = () => {
      listMaterials(room.id)
        .then((m) => alive && setMaterials(m))
        .catch(() => alive && setError(t('classroom.errors.offline')));
      if (teacher)
        listMembers(room.id)
          .then((m) => alive && setMembers(m))
          .catch(() => {});
    };
    load();
    const stop = watchClassroom(room.id, load);
    return () => {
      alive = false;
      stop();
    };
  }, [room.id, approved, teacher]);

  const run = async (fn) => {
    setError('');
    setConfirm(null);
    try {
      await fn();
      const [m, s] = await Promise.all([listMaterials(room.id), teacher ? listMembers(room.id) : Promise.resolve(null)]);
      setMaterials(m);
      if (teacher) setMembers(s);
      reloadClassrooms();
    } catch (e) {
      setError(t(`classroom.errors.${classroomErrorKind(e)}`));
    }
  };
  // a destructive action needs a second tap on the same button
  const twice = (key, fn) => () => {
    if (confirm === key) fn();
    else setConfirm(key);
  };

  const share = async () => {
    const message = t('classroom.shareMessage', { name: room.name, teacher: room.teacher_name || t('classroom.aTeacher'), code: formatCode(code) });
    try {
      if (Platform.OS === 'web' && navigator.clipboard) await navigator.clipboard.writeText(message);
      else await Share.share({ message });
    } catch {
      // closed without sharing
    }
  };
  const open = async (m) => {
    setError('');
    try {
      if (m.kind === 'link') await Linking.openURL(m.url);
      else if (m.kind === 'file') await openFile(await fileUrl(m.file_path), { name: m.file_name, mimeType: m.mime_type, title: m.title });
    } catch (e) {
      setError(t(`classroom.errors.${classroomErrorKind(e)}`));
    }
  };

  if (!approved) {
    return (
      <View>
        <View style={[styles.note, { backgroundColor: colors.warnSoft }]}>
          <Ionicons name="time-outline" size={18} color={colors.warn} />
          <Text style={[styles.noteText, { color: colors.warn }]}>{t('classroom.waitingLong', { name: room.teacher_name || t('classroom.aTeacher') })}</Text>
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Pressable style={styles.dangerBtn} onPress={twice('cancel', () => run(() => leaveClassroom(room.id, user.id)).then(onBack))} accessibilityRole="button">
          <Text style={styles.dangerText}>{confirm === 'cancel' ? t('classroom.tapAgain') : t('classroom.cancelRequest')}</Text>
        </Pressable>
      </View>
    );
  }

  if (adding) {
    const done = () => {
      setAdding(false);
      run(async () => {});
    };
    return <AddMaterial room={room} onDone={done} onBack={() => setAdding(false)} />;
  }
  if (reporting) {
    return (
      <ReportForm
        onBack={() => setReporting(null)}
        onSend={(reason) => reportClassroom({ classroomId: room.id, materialId: reporting.material ? reporting.material.id : null, reason })}
      />
    );
  }

  const pending = (members || []).filter((m) => m.status === 'pending');
  const students = (members || []).filter((m) => m.status === 'approved');

  return (
    <View>
      {teacher ? (
        <>
          <View style={styles.codeBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.codeLabel}>{t('classroom.codeTitle')}</Text>
              <Text style={styles.code} selectable accessibilityLabel={t('classroom.codeA11y', { code: formatCode(code).split('').join(' ') })}>
                {formatCode(code)}
              </Text>
            </View>
            <Pressable style={styles.pill} onPress={share} accessibilityRole="button">
              <Ionicons name="share-outline" size={15} color={colors.accent} />
              <Text style={styles.pillText}>{t('classroom.shareCode')}</Text>
            </Pressable>
          </View>
          <Text style={styles.help}>{t('classroom.codeHelp')}</Text>
          <View style={styles.tabs}>
            {['materials', 'students'].map((k) => (
              <Pressable key={k} style={[styles.tab, tab === k && styles.tabOn]} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
                <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>
                  {k === 'materials' ? t('classroom.materialsTab') : pending.length ? t('classroom.studentsTabWaiting', { count: pending.length }) : t('classroom.studentsTab')}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {teacher && tab === 'students' ? (
        <View>
          <Text style={styles.label}>{t('classroom.requests')}</Text>
          {members === null ? <ActivityIndicator color={colors.accent} /> : null}
          {members && !pending.length ? <Text style={styles.help}>{t('classroom.noRequests')}</Text> : null}
          {pending.map((m) => (
            <View key={m.user_id} style={styles.person}>
              <Text style={styles.personName} numberOfLines={1}>
                {m.student_name || t('classroom.aStudent')}
              </Text>
              <Pressable style={styles.pill} onPress={() => run(() => approveMember(room.id, m.user_id))} accessibilityRole="button" accessibilityLabel={t('classroom.approveA11y', { name: m.student_name })}>
                <Ionicons name="checkmark" size={15} color={colors.accent} />
                <Text style={styles.pillText}>{t('classroom.approve')}</Text>
              </Pressable>
              <Pressable style={styles.pillDanger} onPress={twice(`decline:${m.user_id}`, () => run(() => removeMember(room.id, m.user_id)))} accessibilityRole="button" accessibilityLabel={t('classroom.declineA11y', { name: m.student_name })}>
                <Text style={styles.pillDangerText}>{confirm === `decline:${m.user_id}` ? t('classroom.sure') : t('classroom.decline')}</Text>
              </Pressable>
            </View>
          ))}
          <Text style={styles.label}>{t('classroom.studentsCount', { count: students.length })}</Text>
          {members && !students.length ? <Text style={styles.help}>{t('classroom.noStudents')}</Text> : null}
          {students.map((m) => (
            <View key={m.user_id} style={styles.person}>
              <Text style={styles.personName} numberOfLines={1}>
                {m.student_name || t('classroom.aStudent')}
              </Text>
              <Pressable style={styles.pillDanger} onPress={twice(`remove:${m.user_id}`, () => run(() => removeMember(room.id, m.user_id)))} accessibilityRole="button" accessibilityLabel={t('classroom.removeA11y', { name: m.student_name })}>
                <Text style={styles.pillDangerText}>{confirm === `remove:${m.user_id}` ? t('classroom.sure') : t('classroom.remove')}</Text>
              </Pressable>
            </View>
          ))}
          <Pressable style={styles.secondaryWide} onPress={twice('reset', () => run(async () => setCode(await resetCode(room.id))))} accessibilityRole="button">
            <Ionicons name="refresh" size={16} color={colors.accent} />
            <Text style={styles.secondaryText}>{confirm === 'reset' ? t('classroom.resetConfirm') : t('classroom.resetCode')}</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          {teacher ? (
            <Pressable style={[styles.primary, { marginTop: 14 }]} onPress={() => setAdding(true)} accessibilityRole="button">
              <Ionicons name="add" size={18} color={colors.onAccent} />
              <Text style={styles.primaryText}>{t('classroom.addMaterial')}</Text>
            </Pressable>
          ) : null}
          {materials === null ? <ActivityIndicator color={colors.accent} style={{ marginTop: 18 }} /> : null}
          {materials && !materials.length ? <Text style={styles.help}>{teacher ? t('classroom.noMaterialsTeacher') : t('classroom.noMaterials')}</Text> : null}
          {sortMaterials(materials).map((m) => {
            const kind = materialKind(m);
            const fresh = !teacher && isNew(m, seenAt);
            const openable = m.kind !== 'note';
            return (
              <View key={m.id} style={styles.material}>
                <Pressable style={styles.materialMain} onPress={() => open(m)} disabled={!openable} accessibilityRole={openable ? 'button' : 'text'} accessibilityLabel={openable ? t('classroom.openA11y', { title: m.title }) : undefined}>
                  <View style={[styles.cardIcon, { backgroundColor: KIND_TINT[kind] + '1F' }]}>
                    <Ionicons name={KIND_ICON[kind]} size={18} color={KIND_TINT[kind]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>
                      {m.pinned ? '📌 ' : ''}
                      {m.title}
                      {fresh ? <Text style={styles.newText}>{`  ${t('classroom.newBadge')}`}</Text> : null}
                    </Text>
                    {m.body ? <Text style={styles.materialBody}>{m.body}</Text> : null}
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {[
                        m.kind === 'file' ? `${t(`classroom.kinds.${kind}`)} · ${formatSize(m.size)}` : m.kind === 'link' ? linkHost(m.url) : null,
                        formatDue(dateKey(new Date(m.created_at))),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                </Pressable>
                <View style={styles.materialActions}>
                  {teacher ? (
                    <>
                      <Pressable style={styles.iconBtn} onPress={() => run(() => updateMaterial(m.id, { pinned: !m.pinned }))} accessibilityRole="button" accessibilityLabel={m.pinned ? t('classroom.unpinA11y') : t('classroom.pinA11y')}>
                        <Ionicons name={m.pinned ? 'pin' : 'pin-outline'} size={16} color={colors.accent} />
                      </Pressable>
                      <Pressable style={styles.iconBtn} onPress={twice(`del:${m.id}`, () => run(() => deleteMaterial(m)))} accessibilityRole="button" accessibilityLabel={t('classroom.deleteA11y', { title: m.title })}>
                        {confirm === `del:${m.id}` ? <Text style={styles.pillDangerText}>{t('classroom.sure')}</Text> : <Ionicons name="trash-outline" size={16} color={colors.danger} />}
                      </Pressable>
                    </>
                  ) : (
                    <Pressable style={styles.iconBtn} onPress={() => setReporting({ material: m })} accessibilityRole="button" accessibilityLabel={t('classroom.reportA11y', { title: m.title })}>
                      <Ionicons name="flag-outline" size={16} color={colors.muted} />
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.bottomActions}>
        {teacher ? (
          <Pressable style={styles.dangerBtn} onPress={twice('delete', () => run(() => deleteClassroom(room.id)).then(onBack))} accessibilityRole="button">
            <Text style={styles.dangerText}>{confirm === 'delete' ? t('classroom.deleteConfirm') : t('classroom.delete')}</Text>
          </Pressable>
        ) : (
          <>
            <Pressable style={styles.linkBtn} onPress={() => setReporting({ classroom: true })} accessibilityRole="button">
              <Text style={styles.linkText}>{t('classroom.reportClassroom')}</Text>
            </Pressable>
            <Pressable style={styles.dangerBtn} onPress={twice('leave', () => run(() => leaveClassroom(room.id, user.id)).then(onBack))} accessibilityRole="button">
              <Text style={styles.dangerText}>{confirm === 'leave' ? t('classroom.tapAgain') : t('classroom.leave')}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

// ---------- adding a material ----------
function AddMaterial({ room, onDone, onBack }) {
  const [kind, setKind] = useState('file'); // 'file' | 'link' | 'note'
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [pinned, setPinned] = useState(false);
  const [asset, setAsset] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async () => {
    setError('');
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: PICKER_TYPES, multiple: false, copyToCacheDirectory: true });
      if (r.canceled || !r.assets || !r.assets[0]) return;
      const a = r.assets[0];
      const problem = fileProblem(a);
      if (problem) {
        setError(t(`classroom.errors.${problem}`));
        return;
      }
      setAsset(a);
      if (!title.trim()) setTitle(String(a.name || '').replace(/\.[A-Za-z0-9]{1,5}$/, '').slice(0, TITLE_MAX));
    } catch {
      setError(t('classroom.errors.pick'));
    }
  };

  const link = kind === 'link' ? cleanUrl(url) : null;
  const ready = title.trim().length > 0 && (kind === 'file' ? !!asset : kind === 'link' ? !!link : body.trim().length > 0);
  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    const fields = { title: title.trim().slice(0, TITLE_MAX), body: body.trim().slice(0, BODY_MAX) };
    try {
      if (kind === 'file') await addFile(room.id, asset, fields);
      else if (kind === 'link') await addLink(room.id, { ...fields, url: link });
      else await addNote(room.id, { ...fields, pinned });
      onDone();
    } catch (e) {
      const k = classroomErrorKind(e);
      if (k === 'storage') {
        const q = await classroomQuota().catch(() => null);
        setError(q && q.bytes >= q.bytes_limit ? t('classroom.errors.storageFull', { size: formatSize(q.bytes_limit) }) : t('classroom.errors.offline'));
        if (q && q.bytes >= q.bytes_limit) openPremium('classrooms');
      } else setError(t(`classroom.errors.${k}`));
      setBusy(false);
    }
  };

  return (
    <View>
      <View style={styles.tabs}>
        {['file', 'link', 'note'].map((k) => (
          <Pressable key={k} style={[styles.tab, kind === k && styles.tabOn]} onPress={() => setKind(k)} accessibilityRole="tab" accessibilityState={{ selected: kind === k }}>
            <Text style={[styles.tabText, kind === k && styles.tabTextOn]}>{t(`classroom.add.${k}`)}</Text>
          </Pressable>
        ))}
      </View>
      {kind === 'file' ? (
        <Pressable style={styles.pickBox} onPress={pick} accessibilityRole="button">
          <Ionicons name={asset ? KIND_ICON[fileKind(asset.mimeType, asset.name)] || 'document' : 'cloud-upload-outline'} size={22} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {asset ? asset.name : t('classroom.add.pick')}
            </Text>
            <Text style={styles.cardMeta}>{asset ? formatSize(asset.size) : t('classroom.add.pickHelp')}</Text>
          </View>
        </Pressable>
      ) : null}
      {kind === 'link' ? (
        <>
          <Text style={styles.label}>{t('classroom.add.urlLabel')}</Text>
          <TextInput style={styles.field} value={url} onChangeText={setUrl} placeholder="https://" placeholderTextColor={colors.faint} autoCapitalize="none" autoCorrect={false} keyboardType="url" accessibilityLabel={t('classroom.add.urlLabel')} />
          {url.trim() && !link ? <Text style={styles.errorText}>{t('classroom.errors.badLink')}</Text> : null}
        </>
      ) : null}
      <Text style={styles.label}>{t('classroom.add.titleLabel')}</Text>
      <TextInput style={styles.field} value={title} onChangeText={setTitle} placeholder={t(`classroom.add.titlePlaceholder.${kind}`)} placeholderTextColor={colors.faint} maxLength={TITLE_MAX} accessibilityLabel={t('classroom.add.titleLabel')} />
      <Text style={styles.label}>{kind === 'note' ? t('classroom.add.noteLabel') : t('classroom.add.bodyLabel')}</Text>
      <TextInput
        style={[styles.field, styles.multi]}
        value={body}
        onChangeText={setBody}
        placeholder={kind === 'note' ? t('classroom.add.notePlaceholder') : t('classroom.add.bodyPlaceholder')}
        placeholderTextColor={colors.faint}
        multiline
        maxLength={BODY_MAX}
        accessibilityLabel={kind === 'note' ? t('classroom.add.noteLabel') : t('classroom.add.bodyLabel')}
      />
      {kind === 'note' ? (
        <Pressable style={styles.check} onPress={() => setPinned((p) => !p)} accessibilityRole="checkbox" accessibilityState={{ checked: pinned }}>
          <Ionicons name={pinned ? 'checkbox' : 'square-outline'} size={20} color={colors.accent} />
          <Text style={styles.checkText}>{t('classroom.add.pin')}</Text>
        </Pressable>
      ) : null}
      <Text style={styles.help}>{t('classroom.add.visible')}</Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.footerRow}>
        <Pressable style={styles.secondary} onPress={onBack} accessibilityRole="button">
          <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable style={[styles.primary, { flex: 1 }, (!ready || busy) && styles.off]} onPress={save} disabled={!ready || busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>{kind === 'file' ? t('classroom.add.upload') : t('classroom.add.share')}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

// ---------- reporting ----------
function ReportForm({ onBack, onSend }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const send = async () => {
    if (!reason.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSend(reason.trim().slice(0, 500));
      setSent(true);
    } catch {
      setError(t('classroom.errors.offline'));
    }
    setBusy(false);
  };
  if (sent) {
    return (
      <View>
        <View style={[styles.note, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
          <Text style={[styles.noteText, { color: colors.accent }]}>{t('classroom.reportSent')}</Text>
        </View>
        <Pressable style={[styles.secondaryWide]} onPress={onBack} accessibilityRole="button">
          <Text style={styles.secondaryText}>{t('classroom.back')}</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View>
      <Text style={styles.label}>{t('classroom.reportTitle')}</Text>
      <TextInput style={[styles.field, styles.multi]} value={reason} onChangeText={setReason} placeholder={t('classroom.reportPlaceholder')} placeholderTextColor={colors.faint} multiline maxLength={500} accessibilityLabel={t('classroom.reportTitle')} />
      <Text style={styles.help}>{t('classroom.reportHelp')}</Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.footerRow}>
        <Pressable style={styles.secondary} onPress={onBack} accessibilityRole="button">
          <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable style={[styles.primary, { flex: 1 }, (!reason.trim() || busy) && styles.off]} onPress={send} disabled={!reason.trim() || busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>{t('classroom.reportSend')}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.scrim },
  dismiss: { flex: 1, alignSelf: 'stretch' },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 10, paddingBottom: 28 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  headIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.line, marginBottom: 8 },
  cardIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  cardMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  badge: { fontSize: 11, fontWeight: '800', color: colors.onAccent, backgroundColor: colors.accentFill, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  newText: { fontSize: 11, fontWeight: '800', color: colors.accent },
  help: { marginTop: 12, fontSize: 13, color: colors.muted, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 16, marginBottom: 8 },
  field: { backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.ink, ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }) },
  codeField: { fontSize: 22, fontWeight: '800', letterSpacing: 3, textAlign: 'center' },
  multi: { minHeight: 80, textAlignVertical: 'top' },
  errorText: { fontSize: 13, fontWeight: '600', color: colors.danger, marginTop: 10 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4, padding: 12, borderRadius: 12 },
  noteText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  footerRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primary: { borderRadius: radius.md, height: 52, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentFill },
  primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, height: 52, borderRadius: radius.md, backgroundColor: colors.accentSoft },
  secondaryWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, borderRadius: radius.md, backgroundColor: colors.accentSoft, marginTop: 18 },
  secondaryText: { fontSize: 15, fontWeight: '800', color: colors.accent },
  off: { opacity: 0.5 },
  codeBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: colors.accentSoft },
  codeLabel: { fontSize: 12, fontWeight: '700', color: colors.accent },
  code: { fontSize: 24, fontWeight: '900', color: colors.ink, letterSpacing: 2, marginTop: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.surface },
  pillText: { fontSize: 12, fontWeight: '800', color: colors.accent },
  pillDanger: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.dangerSoft },
  pillDangerText: { fontSize: 12, fontWeight: '800', color: colors.danger },
  tabs: { flexDirection: 'row', gap: 6, marginTop: 14, padding: 4, borderRadius: 14, backgroundColor: colors.bg },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10 },
  tabOn: { backgroundColor: colors.surface },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  tabTextOn: { color: colors.ink, fontWeight: '800' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  personName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink },
  material: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  materialMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  materialBody: { fontSize: 13, color: colors.ink, lineHeight: 19, marginTop: 3 },
  materialActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { minWidth: 34, height: 34, paddingHorizontal: 6, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  pickBox: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, padding: 16, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accent },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  checkText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  bottomActions: { marginTop: 22, gap: 8 },
  dangerBtn: { alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: radius.md, backgroundColor: colors.dangerSoft, marginTop: 14 },
  dangerText: { fontSize: 14, fontWeight: '800', color: colors.danger },
  linkBtn: { alignItems: 'center', paddingVertical: 8 },
  linkText: { fontSize: 13, fontWeight: '700', color: colors.muted, textDecorationLine: 'underline' },
}));
