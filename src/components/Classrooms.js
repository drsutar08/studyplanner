import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, Share, ActivityIndicator, Linking, BackHandler, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import { colors, radius, shadow, themedStyles } from '../theme';
import { t } from '../i18n';
import { useAuth } from '../auth';
import { dateKey, formatDue } from '../dates';
import { openPremium } from './PremiumSheet';
import { openFile } from '../materialFile';
import {
  cleanCode, formatCode, codeComplete, fileKind, fileProblem, formatSize, cleanUrl, linkHost, sortMaterials, isNew, hasNew,
  classroomErrorKind, summary, PICKER_TYPES, TITLE_MAX, BODY_MAX,
} from '../classrooms';
import {
  useClassroomList, reloadClassrooms, createClassroom, deleteClassroom, resetCode, joinClassroom, leaveClassroom,
  listMembers, approveMember, removeMember, listMaterials, addLink, addNote, addFile, updateMaterial, deleteMaterial,
  fileUrl, reportClassroom, watchClassroom, useClassroomSeen, markSeen, classroomQuota,
  listReports, resolveReport, isReportAdmin, adminReports, removeMaterialById, myReports,
} from '../cloud/classrooms';

// Classrooms: a teacher shares study materials (files, links, notes) with their own students. Students join with
// the classroom's code and wait for the teacher to approve them. A page of its own in the menu (ClassroomsScreen).
const KIND_ICON = { pdf: 'document-text', image: 'image', doc: 'document', slides: 'easel', sheet: 'grid', link: 'link', note: 'reader' };
const KIND_TINT = { pdf: '#D64545', image: '#8E44AD', doc: '#2B6CB0', slides: '#E67E22', sheet: '#16A085', link: '#0E7C86', note: '#B7791F' };
const materialKind = (m) => (m.kind === 'file' ? fileKind(m.mime_type, m.file_name) || 'doc' : m.kind);
const HERO = ['#0B2E66', '#1D4FD1', '#3D8BF2'];
const ROOM_TINTS = ['#5B6CF0', '#16A085', '#E67E22', '#D64545', '#8E44AD', '#2B6CB0', '#0E7C86', '#C2185B'];
// each classroom keeps its own colour and initials
const tintFor = (text) => ROOM_TINTS[[...String(text || '')].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7) % ROOM_TINTS.length];
// "Physics 10-B" -> "P10", "Asha Rao" -> "AR", "Chemistry" -> "C" (a number stays whole)
const initials = (name) => {
  const words = String(name || '?').split(/\s+/).filter(Boolean);
  const first = (words[0] || '?')[0].toUpperCase();
  const second = words[1] ? (/^\d/.test(words[1]) ? words[1].match(/^\d+/)[0].slice(0, 2) : words[1][0].toUpperCase()) : '';
  return first + second;
};
const when = (iso) => formatDue(dateKey(new Date(iso)));

// active: the page is on screen (it reloads each time it comes back)
export default function Classrooms({ active }) {
  const { user } = useAuth();
  const rooms = useClassroomList();
  const seen = useClassroomSeen();
  const wide = useWindowDimensions().width >= 900;
  const [view, setView] = useState('list'); // 'list' | 'create' | 'join' | 'room' | 'admin'
  const [admin, setAdmin] = useState(null); // null, or { open } for Studyly admins (app_config.report_admins)
  const [mine, setMine] = useState([]); // the reports this account sent
  const [roomId, setRoomId] = useState(null);
  const [roomSeenAt, setRoomSeenAt] = useState(null); // when the student last looked, before this visit
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    reloadClassrooms();
    myReports().then((list) => alive && setMine(list));
    isReportAdmin().then((yes) => {
      if (!yes || !alive) return;
      adminReports()
        .then((list) => alive && setAdmin({ open: list.filter((r) => r.status === 'open').length }))
        .catch(() => alive && setAdmin({ open: 0 }));
    });
    return () => {
      alive = false;
    };
  }, [active, view]);

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
  // Android's back button steps back inside the page first
  useEffect(() => {
    if (!active || view === 'list' || Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => sub.remove();
  });

  let body;
  if (view === 'create') {
    body = (
      <Panel icon="add-circle" tint={colors.accent} title={t('classroom.createTitle')} sub={t('classroom.createSub')} onBack={back}>
        <CreateForm onDone={(c) => reloadClassrooms().then(() => openRoom({ ...c, role: 'teacher' }))} onBack={back} />
      </Panel>
    );
  } else if (view === 'join') {
    body = (
      <Panel icon="enter" tint="#16A085" title={t('classroom.joinTitle')} sub={t('classroom.joinSub')} onBack={back}>
        <JoinForm onDone={(c) => reloadClassrooms().then(() => openRoom({ ...c, role: 'student' }))} onBack={back} />
      </Panel>
    );
  } else if (view === 'mine') {
    body = (
      <Panel icon="flag" tint="#B7791F" title={t('classroom.myReports')} sub={t('classroom.myReportsSub')} onBack={back}>
        <MyReports list={mine} />
      </Panel>
    );
  } else if (view === 'admin') {
    body = (
      <Panel icon="flag" tint={colors.danger} title={t('classroom.admin.title')} sub={t('classroom.admin.sub')} onBack={back}>
        <AdminReports />
      </Panel>
    );
  } else if (view === 'room' && room) {
    body = <Room room={room} user={user} seenAt={roomSeenAt} wide={wide} onBack={back} />;
  } else {
    const s = summary(rooms);
    const teaching = (rooms || []).filter((c) => c.role === 'teacher');
    const learning = (rooms || []).filter((c) => c.role === 'student');
    const stats = [
      [s.teaching, t('classroom.statTeaching')],
      [s.students, t('classroom.statStudents')],
      [s.joined, t('classroom.statJoined')],
    ];
    body = (
      <View>
        <LinearGradient colors={HERO} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, wide && styles.heroWide]}>
          <View style={styles.glow} pointerEvents="none" />
          <View style={styles.glow2} pointerEvents="none" />
          <View style={{ flex: 1, zIndex: 2 }}>
            <View style={styles.kickerPill}>
              <Ionicons name="school" size={11} color="#E6F0FF" />
              <Text style={styles.kicker}>{t('classroom.kicker')}</Text>
            </View>
            <Text style={styles.heroTitle}>{t('classroom.heroTitle')}</Text>
            <Text style={styles.heroSub}>{t('classroom.heroSub')}</Text>
            <View style={styles.heroButtons}>
              <Pressable style={styles.heroBtn} onPress={() => setView('create')} accessibilityRole="button">
                <Ionicons name="add" size={17} color={HERO[1]} />
                <Text style={styles.heroBtnText}>{t('classroom.create')}</Text>
              </Pressable>
              <Pressable style={styles.heroGhost} onPress={() => setView('join')} accessibilityRole="button">
                <Ionicons name="enter-outline" size={16} color="#fff" />
                <Text style={styles.heroGhostText}>{t('classroom.join')}</Text>
              </Pressable>
            </View>
          </View>
          {rooms && rooms.length ? (
            <View style={[styles.heroStats, !wide && styles.heroStatsNarrow]}>
              {stats.map(([n, label]) => (
                <View key={label} style={[styles.heroStat, !wide && styles.heroStatNarrow]}>
                  <Text style={styles.heroStatNum}>{n}</Text>
                  <Text style={styles.heroStatLbl}>{label}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </LinearGradient>

        {mine.length ? (
          <Pressable style={styles.mineCard} onPress={() => setView('mine')} accessibilityRole="button" accessibilityLabel={t('classroom.myReports')}>
            <View style={[styles.tile, { backgroundColor: '#B7791F' }]}>
              <Ionicons name="flag" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{t('classroom.myReports')}</Text>
              <Text style={styles.cardMeta}>{myReportsLine(mine)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
        ) : null}
        {admin ? (
          <Pressable style={styles.adminCard} onPress={() => setView('admin')} accessibilityRole="button" accessibilityLabel={t('classroom.admin.title')}>
            <View style={[styles.tile, { backgroundColor: colors.danger }]}>
              <Ionicons name="flag" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{t('classroom.admin.title')}</Text>
              <Text style={styles.cardMeta}>{admin.open ? t('classroom.admin.open', { count: admin.open }) : t('classroom.admin.none')}</Text>
            </View>
            {admin.open ? <Text style={[styles.countPill, { backgroundColor: colors.danger }]}>{admin.open}</Text> : null}
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
        ) : null}

        {rooms === null ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 32 }} /> : null}

        {rooms && !rooms.length ? (
          <View style={[styles.howRow, wide && styles.row]}>
            {[
              ['school', colors.accent, 'forTeachers', 'forTeachersText'],
              ['book', '#16A085', 'forStudents', 'forStudentsText'],
            ].map(([icon, tint, title, text]) => (
              <View key={title} style={[styles.howCard, wide && { flex: 1 }]}>
                <View style={[styles.tile, { backgroundColor: tint }]}>
                  <Ionicons name={icon} size={20} color="#fff" />
                </View>
                <Text style={styles.howTitle}>{t(`classroom.${title}`)}</Text>
                <Text style={styles.howText}>{t(`classroom.${text}`)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {[
          [teaching, 'sectionTeaching'],
          [learning, 'sectionLearning'],
        ].map(([list, key]) =>
          list.length ? (
            <View key={key}>
              <Text style={styles.section}>{t(`classroom.${key}`)}</Text>
              <View style={[styles.grid, wide && styles.gridWide]}>
                {list.map((c) => (
                  <RoomCard key={c.id} c={c} fresh={hasNew(c, seen[c.id])} wide={wide} onPress={() => openRoom(c)} />
                ))}
              </View>
            </View>
          ) : null
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.pageContent, wide && styles.pageContentWide]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {body}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// A classroom in the list: its colour and initials, what it is, and what needs a look
function RoomCard({ c, fresh, wide, onPress }) {
  const tint = tintFor(c.name);
  const teacher = c.role === 'teacher';
  const pending = !teacher && c.status === 'pending';
  return (
    <Pressable style={({ hovered }) => [styles.roomCard, wide && styles.roomCardWide, hovered && styles.roomCardHover]} onPress={onPress} accessibilityRole="button" accessibilityLabel={c.name}>
      <View style={[styles.roomStripe, { backgroundColor: tint }]} />
      <View style={[styles.avatar, { backgroundColor: tint }]}>
        <Text style={styles.avatarText}>{initials(c.name)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.roomName} numberOfLines={1}>
          {c.name}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {[c.subject, teacher ? t('classroom.youTeachShort') : c.teacher_name || t('classroom.aTeacher')].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.chips}>
          {pending ? (
            <Chip icon="time-outline" text={t('classroom.waitingShort')} tone="warn" />
          ) : (
            <>
              {teacher ? <Chip icon="people-outline" text={t('classroom.studentsCount', { count: c.students || 0 })} /> : null}
              <Chip icon="folder-open-outline" text={t('classroom.materialsCount', { count: c.materials || 0 })} />
            </>
          )}
          {teacher && c.pending ? <Chip icon="person-add" text={t('classroom.requestsBadge', { count: c.pending })} tone="accent" /> : null}
          {teacher && c.reports ? <Chip icon="flag" text={t('classroom.reportsBadge', { count: c.reports })} tone="danger" /> : null}
          {fresh ? <Chip icon="sparkles" text={t('classroom.newBadge')} tone="accent" /> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Pressable>
  );
}

function Chip({ icon, text, tone }) {
  const style = tone === 'accent' ? styles.chipAccent : tone === 'danger' ? styles.chipDanger : tone === 'warn' ? styles.chipWarn : null;
  const color = tone === 'accent' ? colors.onAccent : tone === 'danger' ? '#fff' : tone === 'warn' ? colors.warn : colors.muted;
  return (
    <View style={[styles.chip, style]}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[styles.chipText, { color }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

// A form or list on its own card, with a back button
function Panel({ icon, tint, title, sub, onBack, children }) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t('classroom.back')}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <View style={[styles.tile, { backgroundColor: tint }]}>
          <Ionicons name={icon} size={19} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.panelTitle} accessibilityRole="header">
            {title}
          </Text>
          {sub ? <Text style={styles.cardMeta}>{sub}</Text> : null}
        </View>
      </View>
      {children}
    </View>
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
  const tint = tintFor(name.trim() || 'Classroom');
  return (
    <View>
      <View style={styles.preview}>
        <View style={[styles.avatar, { backgroundColor: tint }]}>
          <Text style={styles.avatarText}>{name.trim() ? initials(name) : '?'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.roomName} numberOfLines={1}>
            {name.trim() || t('classroom.namePlaceholder')}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {subject.trim() || t('classroom.subjectPlaceholder')}
          </Text>
        </View>
      </View>
      <Text style={styles.label}>{t('classroom.nameLabel')}</Text>
      <TextInput style={styles.field} value={name} onChangeText={setName} placeholder={t('classroom.namePlaceholder')} placeholderTextColor={colors.faint} maxLength={60} accessibilityLabel={t('classroom.nameLabel')} />
      <Text style={styles.label}>{t('classroom.subjectLabel')}</Text>
      <TextInput style={styles.field} value={subject} onChangeText={setSubject} placeholder={t('classroom.subjectPlaceholder')} placeholderTextColor={colors.faint} maxLength={60} accessibilityLabel={t('classroom.subjectLabel')} />
      <Info icon="shield-checkmark-outline" text={t('classroom.createHelp')} />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Footer onBack={onBack} onGo={create} ready={!!name.trim()} busy={busy} label={t('classroom.createBtn')} />
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
      <Info icon="person-circle-outline" text={t('classroom.joinHelp')} />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Footer onBack={onBack} onGo={join} ready={codeComplete(code)} busy={busy} label={t('classroom.askToJoin')} />
    </View>
  );
}

function Info({ icon, text, tone }) {
  const warn = tone === 'warn';
  return (
    <View style={[styles.info, warn && styles.infoWarn]}>
      <Ionicons name={icon} size={17} color={warn ? colors.warn : colors.accent} />
      <Text style={[styles.infoText, warn && { color: colors.warn }]}>{text}</Text>
    </View>
  );
}

function Footer({ onBack, onGo, ready, busy, label }) {
  return (
    <View style={styles.footerRow}>
      <Pressable style={styles.secondary} onPress={onBack} accessibilityRole="button">
        <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
      </Pressable>
      <Pressable style={[styles.primary, { flex: 1 }, (!ready || busy) && styles.off]} onPress={onGo} disabled={!ready || busy} accessibilityRole="button">
        {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>{label}</Text>}
      </Pressable>
    </View>
  );
}

// ---------- one classroom ----------
function Room({ room, user, seenAt, wide, onBack }) {
  const teacher = room.role === 'teacher';
  const approved = teacher || room.status === 'approved';
  const [tab, setTab] = useState('materials'); // teacher: 'materials' | 'students' | 'reports'
  const [reports, setReports] = useState(null);
  const [materials, setMaterials] = useState(null);
  const [members, setMembers] = useState(null);
  const [adding, setAdding] = useState(false);
  const [reporting, setReporting] = useState(null); // { material } or { classroom: true }
  const [confirm, setConfirm] = useState(null); // the action waiting for a second tap
  const [error, setError] = useState('');
  const [code, setCode] = useState(room.join_code);
  const [copied, setCopied] = useState(false);
  const [sentReports, setSentReports] = useState([]); // a student's own reports in this classroom

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
      if (teacher) {
        listMembers(room.id)
          .then((m) => alive && setMembers(m))
          .catch(() => {});
        listReports(room.id)
          .then((r) => alive && setReports(r))
          .catch(() => alive && setReports([]));
      } else {
        myReports().then((r) => alive && setSentReports(r.filter((x) => x.classroom_id === room.id)));
      }
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
      const [m, s, r] = await Promise.all([
        listMaterials(room.id),
        teacher ? listMembers(room.id) : Promise.resolve(null),
        teacher ? listReports(room.id).catch(() => []) : Promise.resolve(null),
      ]);
      setMaterials(m);
      if (teacher) {
        setMembers(s);
        setReports(r);
      }
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
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        setCopied(true);
      } else await Share.share({ message });
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

  if (adding) {
    const done = () => {
      setAdding(false);
      run(async () => {});
    };
    return (
      <Panel icon="cloud-upload" tint={colors.accent} title={t('classroom.addMaterial')} sub={room.name} onBack={() => setAdding(false)}>
        <AddMaterial room={room} onDone={done} onBack={() => setAdding(false)} />
      </Panel>
    );
  }
  if (reporting) {
    return (
      <Panel icon="flag" tint={colors.danger} title={t('classroom.reportTitle')} sub={reporting.material ? reporting.material.title : room.name} onBack={() => setReporting(null)}>
        <ReportForm
          about={reporting.material ? 'material' : 'classroom'}
          onBack={() => setReporting(null)}
          onSend={async (reason) => {
            await reportClassroom({ classroomId: room.id, materialId: reporting.material ? reporting.material.id : null, reason });
            myReports().then((r) => setSentReports(r.filter((x) => x.classroom_id === room.id)));
          }}
        />
      </Panel>
    );
  }

  const pending = (members || []).filter((m) => m.status === 'pending');
  const students = (members || []).filter((m) => m.status === 'approved');
  const openReports = (reports || []).filter((r) => r.status === 'open');
  const sorted = sortMaterials(materials);
  const pinned = sorted.filter((m) => m.pinned);
  const rest = sorted.filter((m) => !m.pinned);
  const freshCount = teacher ? 0 : sorted.filter((m) => isNew(m, seenAt)).length;
  const tint = tintFor(room.name);

  const hero = (
    <LinearGradient colors={HERO} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, styles.roomHero, wide && styles.heroWide]}>
      <View style={styles.glow} pointerEvents="none" />
      <View style={{ flex: 1, zIndex: 2 }}>
        <View style={styles.heroTop}>
          <Pressable onPress={onBack} hitSlop={10} style={styles.glassBtn} accessibilityRole="button" accessibilityLabel={t('classroom.back')}>
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </Pressable>
          <View style={[styles.avatar, styles.avatarHero, { backgroundColor: tint }]}>
            <Text style={styles.avatarText}>{initials(room.name)}</Text>
          </View>
        </View>
        <Text style={styles.roomTitle} accessibilityRole="header">
          {room.name}
        </Text>
        <Text style={styles.heroSub}>
          {[room.subject, teacher ? t('classroom.youTeach') : t('classroom.teacher', { name: room.teacher_name || t('classroom.aTeacher') })].filter(Boolean).join(' · ')}
        </Text>
        {approved ? (
          <View style={styles.heroChips}>
            {teacher ? <GlassChip icon="people" text={t('classroom.studentsCount', { count: students.length || room.students || 0 })} /> : null}
            <GlassChip icon="folder-open" text={t('classroom.materialsCount', { count: materials ? materials.length : room.materials || 0 })} />
            {freshCount ? <GlassChip icon="sparkles" text={t('classroom.newCount', { count: freshCount })} /> : null}
          </View>
        ) : (
          <View style={styles.heroChips}>
            <GlassChip icon="time" text={t('classroom.waitingShort')} />
          </View>
        )}
      </View>
      {teacher ? (
        <View style={[styles.codeGlass, wide && styles.codeGlassWide]}>
          <Text style={styles.codeLabel}>{t('classroom.codeTitle')}</Text>
          <Text style={styles.code} selectable accessibilityLabel={t('classroom.codeA11y', { code: formatCode(code).split('').join(' ') })}>
            {formatCode(code)}
          </Text>
          <Pressable style={styles.codeShare} onPress={share} accessibilityRole="button">
            <Ionicons name={copied ? 'checkmark' : 'share-social'} size={15} color={HERO[1]} />
            <Text style={styles.codeShareText}>{copied ? t('classroom.copied') : t('classroom.shareCode')}</Text>
          </Pressable>
        </View>
      ) : null}
    </LinearGradient>
  );

  if (!approved) {
    return (
      <View>
        {hero}
        <View style={styles.waitCard}>
          <View style={[styles.waitIcon]}>
            <Ionicons name="hourglass-outline" size={30} color={colors.warn} />
          </View>
          <Text style={styles.waitTitle}>{t('classroom.waiting')}</Text>
          <Text style={styles.waitText}>{t('classroom.waitingLong', { name: room.teacher_name || t('classroom.aTeacher') })}</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable style={styles.outlineDanger} onPress={twice('cancel', () => run(() => leaveClassroom(room.id, user.id)).then(onBack))} accessibilityRole="button">
            <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
            <Text style={styles.outlineDangerText}>{confirm === 'cancel' ? t('classroom.tapAgain') : t('classroom.cancelRequest')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const TABS = [
    ['materials', 'folder-open', t('classroom.materialsTab'), 0],
    ['students', 'people', t('classroom.studentsTab'), pending.length],
    ['reports', 'flag', t('classroom.reportsTab'), openReports.length],
  ];

  const materialCard = (m) => {
    const kind = materialKind(m);
    const fresh = !teacher && isNew(m, seenAt);
    const openable = m.kind !== 'note';
    const note = m.kind === 'note';
    return (
      <View key={m.id} style={[styles.material, note && styles.materialNote, wide && styles.materialWide]}>
        <Pressable style={styles.materialMain} onPress={() => open(m)} disabled={!openable} accessibilityRole={openable ? 'button' : 'text'} accessibilityLabel={openable ? t('classroom.openA11y', { title: m.title }) : undefined}>
          <View style={[styles.kindTile, { backgroundColor: KIND_TINT[kind] + (note ? '26' : '1A') }]}>
            <Ionicons name={KIND_ICON[kind]} size={22} color={KIND_TINT[kind]} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.materialTop}>
              {m.pinned ? (
                <View style={styles.pinTag}>
                  <Ionicons name="pin" size={10} color={colors.accent} />
                </View>
              ) : null}
              {fresh ? <Text style={styles.newPill}>{t('classroom.newBadge')}</Text> : null}
              <Text style={[styles.kindLabel, { color: KIND_TINT[kind] }]}>
                {m.kind === 'file' ? t(`classroom.kinds.${kind}`) : m.kind === 'link' ? linkHost(m.url) || t('classroom.add.link') : t('classroom.add.note')}
              </Text>
            </View>
            <Text style={styles.materialTitle} numberOfLines={2}>
              {m.title}
            </Text>
            {m.body ? (
              <Text style={styles.materialBody} numberOfLines={note ? 8 : 3}>
                {m.body}
              </Text>
            ) : null}
            <Text style={styles.materialMeta}>{[m.kind === 'file' ? formatSize(m.size) : null, when(m.created_at)].filter(Boolean).join(' · ')}</Text>
          </View>
          {openable && !teacher ? (
            <View style={styles.openBtn}>
              <Ionicons name={m.kind === 'link' ? 'open-outline' : 'arrow-down'} size={17} color={colors.accent} />
            </View>
          ) : null}
        </Pressable>
        <View style={styles.materialActions}>
          {teacher ? (
            <>
              {openable ? (
                <Pressable style={styles.iconBtn} onPress={() => open(m)} accessibilityRole="button" accessibilityLabel={t('classroom.openA11y', { title: m.title })}>
                  <Ionicons name={m.kind === 'link' ? 'open-outline' : 'eye-outline'} size={16} color={colors.muted} />
                </Pressable>
              ) : null}
              <Pressable style={[styles.iconBtn, m.pinned && styles.iconBtnOn]} onPress={() => run(() => updateMaterial(m.id, { pinned: !m.pinned }))} accessibilityRole="button" accessibilityLabel={m.pinned ? t('classroom.unpinA11y') : t('classroom.pinA11y')}>
                <Ionicons name={m.pinned ? 'pin' : 'pin-outline'} size={16} color={colors.accent} />
              </Pressable>
              <Pressable style={[styles.iconBtn, confirm === `del:${m.id}` && styles.iconBtnDanger]} onPress={twice(`del:${m.id}`, () => run(() => deleteMaterial(m)))} accessibilityRole="button" accessibilityLabel={t('classroom.deleteA11y', { title: m.title })}>
                {confirm === `del:${m.id}` ? <Text style={styles.sureText}>{t('classroom.sure')}</Text> : <Ionicons name="trash-outline" size={16} color={colors.danger} />}
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.iconBtn} onPress={() => setReporting({ material: m })} accessibilityRole="button" accessibilityLabel={t('classroom.reportA11y', { title: m.title })}>
              <Ionicons name="flag-outline" size={15} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <View>
      {hero}

      {teacher ? (
        <View style={styles.segment} accessibilityRole="tablist">
          {TABS.map(([k, icon, label, count]) => (
            <Pressable key={k} style={[styles.segBtn, tab === k && styles.segBtnOn]} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} accessibilityLabel={count ? `${label} (${count})` : label}>
              <Ionicons name={tab === k ? icon : `${icon}-outline`} size={16} color={tab === k ? colors.accent : colors.muted} />
              <Text style={[styles.segText, tab === k && styles.segTextOn]} numberOfLines={1}>
                {label}
              </Text>
              {count ? <Text style={[styles.countPill, k === 'reports' && { backgroundColor: colors.danger }]}>{count}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {teacher && tab === 'reports' ? (
        <View>
          <View style={styles.reportsIntro}>
            <Ionicons name="eye-off-outline" size={16} color={colors.muted} />
            <Text style={styles.reportsIntroText}>{t('classroom.reportsHelpTeacher')}</Text>
          </View>
          {reports === null ? <ActivityIndicator color={colors.accent} style={{ marginTop: 14 }} /> : null}
          {reports && !reports.length ? <Empty icon="shield-checkmark-outline" text={t('classroom.noReports')} big /> : null}
          <View style={[styles.grid, wide && styles.gridWide]}>
            {(reports || []).map((r) => {
              const material = (materials || []).find((m) => m.id === r.material_id);
              return (
                <ReportCard
                  key={r.id}
                  r={r}
                  wide={wide}
                  title={(r.material_title || (material && material.title) || t('classroom.reportMaterialKind')) + (material ? '' : `  ${t('classroom.reportMaterialGone')}`)}
                  actions={
                    r.status === 'open' ? (
                      <>
                        <ActionBtn kind="primary" icon="checkmark" label={t('classroom.resolve')} a11y={t('classroom.resolveA11y', { title: r.material_title })} onPress={() => run(() => resolveReport(r.id))} />
                        {material ? (
                          <ActionBtn kind="danger" icon="trash-outline" label={confirm === `rdel:${r.id}` ? t('classroom.sure') : t('classroom.deleteMaterial')} a11y={t('classroom.deleteA11y', { title: r.material_title })} onPress={twice(`rdel:${r.id}`, () => run(() => deleteMaterial(material)))} />
                        ) : null}
                      </>
                    ) : null
                  }
                />
              );
            })}
          </View>
        </View>
      ) : teacher && tab === 'students' ? (
        <View style={[wide && styles.row, { gap: 14 }]}>
          <View style={[styles.block, wide && { flex: 1 }]}>
            <View style={styles.blockHead}>
              <Text style={styles.blockTitle}>{t('classroom.requests')}</Text>
              {pending.length ? <Text style={styles.countPill}>{pending.length}</Text> : null}
            </View>
            {members === null ? <ActivityIndicator color={colors.accent} /> : null}
            {members && !pending.length ? <Empty icon="mail-open-outline" text={t('classroom.noRequests')} /> : null}
            {pending.map((m) => (
              <View key={m.user_id} style={styles.person}>
                <View style={[styles.personAvatar, { backgroundColor: tintFor(m.student_name) }]}>
                  <Text style={styles.personInitials}>{initials(m.student_name || '?')}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.personName} numberOfLines={1}>
                    {m.student_name || t('classroom.aStudent')}
                  </Text>
                  <Text style={styles.materialMeta}>{t('classroom.askedOn', { when: when(m.requested_at) })}</Text>
                </View>
                <Pressable style={styles.approveBtn} onPress={() => run(() => approveMember(room.id, m.user_id))} accessibilityRole="button" accessibilityLabel={t('classroom.approveA11y', { name: m.student_name })}>
                  <Ionicons name="checkmark" size={15} color={colors.onAccent} />
                  <Text style={styles.approveText}>{t('classroom.approve')}</Text>
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={twice(`decline:${m.user_id}`, () => run(() => removeMember(room.id, m.user_id)))} accessibilityRole="button" accessibilityLabel={t('classroom.declineA11y', { name: m.student_name })}>
                  {confirm === `decline:${m.user_id}` ? <Text style={styles.sureText}>{t('classroom.sure')}</Text> : <Ionicons name="close" size={17} color={colors.danger} />}
                </Pressable>
              </View>
            ))}
          </View>
          <View style={[styles.block, wide && { flex: 1 }]}>
            <View style={styles.blockHead}>
              <Text style={styles.blockTitle}>{t('classroom.studentsCount', { count: students.length })}</Text>
            </View>
            {members && !students.length ? <Empty icon="people-outline" text={t('classroom.noStudents')} /> : null}
            {students.map((m) => (
              <View key={m.user_id} style={styles.person}>
                <View style={[styles.personAvatar, { backgroundColor: tintFor(m.student_name) }]}>
                  <Text style={styles.personInitials}>{initials(m.student_name || '?')}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.personName} numberOfLines={1}>
                    {m.student_name || t('classroom.aStudent')}
                  </Text>
                  {m.approved_at ? <Text style={styles.materialMeta}>{t('classroom.joinedOn', { when: when(m.approved_at) })}</Text> : null}
                </View>
                <Pressable style={styles.pillDanger} onPress={twice(`remove:${m.user_id}`, () => run(() => removeMember(room.id, m.user_id)))} accessibilityRole="button" accessibilityLabel={t('classroom.removeA11y', { name: m.student_name })}>
                  <Text style={styles.pillDangerText}>{confirm === `remove:${m.user_id}` ? t('classroom.sure') : t('classroom.remove')}</Text>
                </Pressable>
              </View>
            ))}
            <Pressable style={styles.resetBtn} onPress={twice('reset', () => run(async () => setCode(await resetCode(room.id))))} accessibilityRole="button">
              <Ionicons name="refresh" size={15} color={colors.accent} />
              <Text style={styles.resetText}>{confirm === 'reset' ? t('classroom.resetConfirm') : t('classroom.resetCode')}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View>
          {teacher ? (
            <Pressable style={({ hovered }) => [styles.addCard, hovered && styles.addCardHover]} onPress={() => setAdding(true)} accessibilityRole="button">
              <View style={styles.addIcon}>
                <Ionicons name="add" size={22} color={colors.onAccent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.addTitle}>{t('classroom.addMaterial')}</Text>
                <Text style={styles.cardMeta}>{t('classroom.addMaterialSub')}</Text>
              </View>
              <View style={styles.addKinds}>
                {['pdf', 'slides', 'image', 'link', 'note'].map((k) => (
                  <Ionicons key={k} name={KIND_ICON[k]} size={15} color={KIND_TINT[k]} />
                ))}
              </View>
            </Pressable>
          ) : null}
          {materials === null ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}
          {materials && !materials.length ? <Empty icon="folder-open-outline" text={teacher ? t('classroom.noMaterialsTeacher') : t('classroom.noMaterials')} big /> : null}
          {pinned.length ? (
            <>
              <Text style={styles.section}>{t('classroom.pinnedSection')}</Text>
              <View style={[styles.grid, wide && styles.gridWide]}>{pinned.map(materialCard)}</View>
            </>
          ) : null}
          {rest.length ? (
            <>
              <Text style={styles.section}>{pinned.length ? t('classroom.allSection') : t('classroom.materialsTab')}</Text>
              <View style={[styles.grid, wide && styles.gridWide]}>{rest.map(materialCard)}</View>
            </>
          ) : null}
          {!teacher && sentReports.length ? (
            <>
              <Text style={styles.section}>{t('classroom.myReports')}</Text>
              <MyReports list={sentReports} wide={wide} inRoom />
            </>
          ) : null}
        </View>
      )}

      <View style={styles.bottomActions}>
        {teacher ? (
          <Pressable style={styles.outlineDanger} onPress={twice('delete', () => run(() => deleteClassroom(room.id)).then(onBack))} accessibilityRole="button">
            <Ionicons name="trash-outline" size={15} color={colors.danger} />
            <Text style={styles.outlineDangerText}>{confirm === 'delete' ? t('classroom.deleteConfirm') : t('classroom.delete')}</Text>
          </Pressable>
        ) : (
          <>
            <Pressable style={styles.outlineMuted} onPress={() => setReporting({ classroom: true })} accessibilityRole="button">
              <Ionicons name="flag-outline" size={15} color={colors.muted} />
              <Text style={styles.outlineMutedText}>{t('classroom.reportClassroom')}</Text>
            </Pressable>
            <Pressable style={styles.outlineDanger} onPress={twice('leave', () => run(() => leaveClassroom(room.id, user.id)).then(onBack))} accessibilityRole="button">
              <Ionicons name="exit-outline" size={15} color={colors.danger} />
              <Text style={styles.outlineDangerText}>{confirm === 'leave' ? t('classroom.tapAgain') : t('classroom.leave')}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function GlassChip({ icon, text }) {
  return (
    <View style={styles.glassChip}>
      <Ionicons name={icon} size={12} color="#fff" />
      <Text style={styles.glassChipText}>{text}</Text>
    </View>
  );
}

function Empty({ icon, text, big }) {
  return (
    <View style={[styles.empty, big && styles.emptyBig]}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={big ? 28 : 22} color={colors.accent} />
      </View>
      <Text style={styles.emptyText}>{text}</Text>
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

  const KINDS = [
    ['file', 'document-attach', '#2B6CB0'],
    ['link', 'link', KIND_TINT.link],
    ['note', 'reader', KIND_TINT.note],
  ];
  const pickedKind = asset ? fileKind(asset.mimeType, asset.name) || 'doc' : null;

  return (
    <View>
      <View style={styles.kindRow} accessibilityRole="tablist">
        {KINDS.map(([k, icon, tint]) => (
          <Pressable key={k} style={[styles.kindChoice, kind === k && { borderColor: tint, backgroundColor: tint + '14' }]} onPress={() => setKind(k)} accessibilityRole="tab" accessibilityState={{ selected: kind === k }}>
            <View style={[styles.kindChoiceIcon, { backgroundColor: kind === k ? tint : tint + '1A' }]}>
              <Ionicons name={icon} size={20} color={kind === k ? '#fff' : tint} />
            </View>
            <Text style={[styles.kindChoiceText, kind === k && { color: colors.ink }]}>{t(`classroom.add.${k}`)}</Text>
          </Pressable>
        ))}
      </View>
      {kind === 'file' ? (
        <Pressable style={({ hovered }) => [styles.pickBox, asset && styles.pickBoxDone, hovered && styles.addCardHover]} onPress={pick} accessibilityRole="button">
          <View style={[styles.kindTile, { backgroundColor: (pickedKind ? KIND_TINT[pickedKind] : colors.accent) + '1A' }]}>
            <Ionicons name={pickedKind ? KIND_ICON[pickedKind] : 'cloud-upload-outline'} size={24} color={pickedKind ? KIND_TINT[pickedKind] : colors.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.materialTitle} numberOfLines={1}>
              {asset ? asset.name : t('classroom.add.pick')}
            </Text>
            <Text style={styles.cardMeta}>{asset ? `${formatSize(asset.size)} · ${t('classroom.add.change')}` : t('classroom.add.pickHelp')}</Text>
          </View>
          {asset ? <Ionicons name="checkmark-circle" size={22} color="#16A085" /> : null}
        </Pressable>
      ) : null}
      {kind === 'link' ? (
        <>
          <Text style={styles.label}>{t('classroom.add.urlLabel')}</Text>
          <View style={styles.fieldIcon}>
            <Ionicons name="globe-outline" size={18} color={colors.muted} />
            <TextInput style={styles.fieldBare} value={url} onChangeText={setUrl} placeholder="https://" placeholderTextColor={colors.faint} autoCapitalize="none" autoCorrect={false} keyboardType="url" accessibilityLabel={t('classroom.add.urlLabel')} />
            {link ? <Ionicons name="checkmark-circle" size={18} color="#16A085" /> : null}
          </View>
          {url.trim() && !link ? <Text style={styles.errorText}>{t('classroom.errors.badLink')}</Text> : null}
        </>
      ) : null}
      <Text style={styles.label}>{t('classroom.add.titleLabel')}</Text>
      <TextInput style={styles.field} value={title} onChangeText={setTitle} placeholder={t(`classroom.add.titlePlaceholder.${kind}`)} placeholderTextColor={colors.faint} maxLength={TITLE_MAX} accessibilityLabel={t('classroom.add.titleLabel')} />
      <Text style={styles.label}>{kind === 'note' ? t('classroom.add.noteLabel') : t('classroom.add.bodyLabel')}</Text>
      <TextInput
        style={[styles.field, styles.multi, kind === 'note' && styles.noteField]}
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
      <Info icon="lock-closed-outline" text={t('classroom.add.visible')} />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Footer onBack={onBack} onGo={save} ready={ready} busy={busy} label={kind === 'file' ? t('classroom.add.upload') : t('classroom.add.share')} />
    </View>
  );
}

// ---------- reporting ----------
function ReportForm({ about, onBack, onSend }) {
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
    } catch (e) {
      setError(t(`classroom.errors.${classroomErrorKind(e)}`));
    }
    setBusy(false);
  };
  if (sent) {
    return (
      <View>
        <Empty icon="checkmark-circle-outline" text={t('classroom.reportSent')} big />
        <Pressable style={styles.secondaryWide} onPress={onBack} accessibilityRole="button">
          <Text style={styles.secondaryText}>{t('classroom.back')}</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View>
      <TextInput style={[styles.field, styles.multi]} value={reason} onChangeText={setReason} placeholder={t('classroom.reportPlaceholder')} placeholderTextColor={colors.faint} multiline maxLength={500} accessibilityLabel={t('classroom.reportTitle')} />
      <Info icon={about === 'material' ? 'eye-off-outline' : 'shield-checkmark-outline'} text={about === 'material' ? t('classroom.reportHelpMaterial') : t('classroom.reportHelpClassroom')} />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Footer onBack={onBack} onGo={send} ready={!!reason.trim()} busy={busy} label={t('classroom.reportSend')} />
    </View>
  );
}

// ---------- Studyly admins: every report ----------
function AdminReports() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [filter, setFilter] = useState('open'); // 'open' | 'all'
  useEffect(() => {
    let alive = true;
    adminReports()
      .then((l) => alive && setList(l))
      .catch(() => alive && setError(t('classroom.errors.offline')));
    return () => {
      alive = false;
    };
  }, []);
  const run = async (fn) => {
    setError('');
    setConfirm(null);
    try {
      await fn();
      setList(await adminReports());
      reloadClassrooms();
    } catch (e) {
      setError(t(`classroom.errors.${classroomErrorKind(e)}`));
    }
  };
  const twice = (key, fn) => () => {
    if (confirm === key) fn();
    else setConfirm(key);
  };
  const shown = (list || []).filter((r) => filter === 'all' || r.status === 'open');
  const openCount = (list || []).filter((r) => r.status === 'open').length;
  const who = (name, email) => [name, email ? (name ? `(${email})` : email) : null].filter(Boolean).join(' ') || '?';
  return (
    <View>
      <View style={[styles.segment, styles.segmentInPanel]} accessibilityRole="tablist">
        {['open', 'all'].map((k) => {
          const n = k === 'open' ? openCount : (list || []).length;
          return (
            <Pressable key={k} style={[styles.segBtn, filter === k && styles.segBtnOn]} onPress={() => setFilter(k)} accessibilityRole="tab" accessibilityState={{ selected: filter === k }} accessibilityLabel={`${t(`classroom.admin.${k}Tab`)} (${n})`}>
              <Text style={[styles.segText, filter === k && styles.segTextOn]}>{t(`classroom.admin.${k}Tab`)}</Text>
              {list ? <Text style={[styles.countPill, k === 'open' && n ? { backgroundColor: colors.danger } : !n && styles.countPillOff]}>{n}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {list === null && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 18 }} /> : null}
      {list && !shown.length ? <Empty icon="shield-checkmark-outline" text={t('classroom.admin.empty')} /> : null}
      {shown.map((r) => {
        const material = !!(r.material_id || r.material_title);
        return (
          <ReportCard
            key={r.id}
            r={r}
            inPanel
            title={material ? r.material_title || t('classroom.reportMaterialKind') : r.classroom_name}
            details={[
              ['school-outline', material ? t('classroom.admin.inClassroom', { name: r.classroom_name }) : null],
              ['person-outline', t('classroom.admin.teacher', { who: who(r.teacher_name, r.teacher_email) })],
              ['flag-outline', t('classroom.admin.reportedBy', { who: who(r.reporter_name, r.reporter_email) })],
            ]}
            actions={
              <>
                {r.status === 'open' ? <ActionBtn kind="primary" icon="checkmark" label={t('classroom.resolve')} onPress={() => run(() => resolveReport(r.id))} /> : null}
                {r.material_id ? (
                  <ActionBtn kind="danger" icon="trash-outline" label={confirm === `m:${r.id}` ? t('classroom.sure') : t('classroom.admin.removeMaterial')} onPress={twice(`m:${r.id}`, () => run(() => removeMaterialById(r.material_id)))} />
                ) : null}
                <ActionBtn kind="outline" icon="close-circle-outline" label={confirm === `c:${r.id}` ? t('classroom.sure') : t('classroom.admin.deleteClassroom')} onPress={twice(`c:${r.id}`, () => run(() => deleteClassroom(r.classroom_id)))} />
              </>
            }
          />
        );
      })}
    </View>
  );
}

// "2 reports · 1 open"
const myReportsLine = (list) => {
  const open = list.filter((r) => r.status === 'open').length;
  return [t('classroom.myReportsCount', { count: list.length }), open ? t('classroom.myReportsOpen', { count: open }) : t('classroom.myReportsAllResolved')].join(' · ');
};

// A student's own reports: what they reported, why, and where it stands. Nothing about who dealt with it.
function MyReports({ list, wide, inRoom }) {
  if (!list.length) return <Empty icon="flag-outline" text={t('classroom.noMyReports')} />;
  return (
    <View>
      {inRoom ? null : <Info icon="information-circle-outline" text={t('classroom.myReportsHelp')} />}
      <View style={[styles.grid, wide && styles.gridWide, inRoom && { marginTop: -12 }]}>
        {list.map((r) => {
          const material = !!(r.material_id || r.material_title);
          return (
            <ReportCard
              key={r.id}
              r={r}
              wide={wide}
              inPanel={!inRoom}
              title={material ? r.material_title || t('classroom.reportMaterialKind') : r.classroom_name}
              details={[
                ['school-outline', inRoom || !material ? null : t('classroom.admin.inClassroom', { name: r.classroom_name })],
                [r.status === 'open' ? 'time-outline' : 'checkmark-done-outline', r.status === 'open' ? t('classroom.myReportOpenNote') : t('classroom.myReportDoneNote', { when: when(r.resolved_at || r.created_at) })],
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

// One report: what it's about, its state, the reason, (for admins) who's involved, and what can be done
function ReportCard({ r, title, details, actions, wide, inPanel }) {
  const open = r.status === 'open';
  const material = !!(r.material_id || r.material_title);
  return (
    <View style={[styles.reportCard, inPanel && styles.reportCardInPanel, wide && styles.materialWide, !open && styles.reportCardDone]}>
      <View style={[styles.reportStripe, { backgroundColor: open ? colors.danger : colors.line }]} />
      <View style={styles.reportTop}>
        <View style={styles.reportKind}>
          <Ionicons name={material ? 'document-text-outline' : 'school-outline'} size={12} color={colors.muted} />
          <Text style={styles.reportKindText}>{material ? t('classroom.reportMaterialKind') : t('classroom.reportClassroomKind')}</Text>
        </View>
        <View style={[styles.reportStatus, open ? styles.reportStatusOpen : styles.reportStatusDone]}>
          <Ionicons name={open ? 'alert-circle' : 'checkmark-circle'} size={12} color={open ? colors.danger : '#16A085'} />
          <Text style={[styles.reportStatusText, { color: open ? colors.danger : '#16A085' }]}>{open ? t('classroom.statusOpen') : t('classroom.resolved')}</Text>
        </View>
        <Text style={styles.reportWhen}>{when(r.created_at)}</Text>
      </View>
      <Text style={styles.reportTitle} numberOfLines={2}>
        {title}
      </Text>
      <View style={styles.quote}>
        <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.muted} />
        <Text style={styles.quoteText}>{r.reason}</Text>
      </View>
      {details
        ? details
            .filter(([, text]) => text)
            .map(([icon, text]) => (
              <View key={icon} style={styles.detail}>
                <Ionicons name={icon} size={14} color={colors.muted} />
                <Text style={styles.detailText} selectable>
                  {text}
                </Text>
              </View>
            ))
        : null}
      {actions ? <View style={styles.reportActions}>{actions}</View> : null}
    </View>
  );
}

function ActionBtn({ kind, icon, label, a11y, onPress }) {
  const box = kind === 'primary' ? styles.actPrimary : kind === 'danger' ? styles.actDanger : styles.actOutline;
  const color = kind === 'primary' ? colors.onAccent : colors.danger;
  return (
    <Pressable style={[styles.act, box]} onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y || label}>
      <Ionicons name={icon} size={15} color={color} />
      <Text style={[styles.actText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  page: { flex: 1, backgroundColor: colors.bg },
  pageContent: { padding: 16, paddingTop: 16, paddingBottom: 140, maxWidth: 760, width: '100%', alignSelf: 'center' },
  pageContentWide: { maxWidth: 1080, padding: 24 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },

  // the gradient headers
  hero: { borderRadius: 28, padding: 22, overflow: 'hidden', ...shadow },
  heroWide: { flexDirection: 'row', alignItems: 'center', gap: 24, padding: 28 },
  roomHero: { paddingTop: 16 },
  glow: { position: 'absolute', right: -50, top: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: '#fff', opacity: 0.1 },
  glow2: { position: 'absolute', left: -40, bottom: -70, width: 160, height: 160, borderRadius: 80, backgroundColor: '#7FD3FF', opacity: 0.16 },
  kickerPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  kicker: { color: '#E6F0FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  heroTitle: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 10, letterSpacing: -0.5, maxWidth: 480 },
  heroSub: { color: '#DCE8FF', fontSize: 13, lineHeight: 19, marginTop: 6, maxWidth: 460 },
  heroButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  heroBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', paddingHorizontal: 16, height: 44, borderRadius: 14 },
  heroBtnText: { color: HERO[1], fontSize: 14, fontWeight: '800' },
  heroGhost: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', paddingHorizontal: 14, height: 44, borderRadius: 14 },
  heroGhostText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  heroStats: { flexDirection: 'row', gap: 10, zIndex: 2 },
  heroStatsNarrow: { marginTop: 18 },
  heroStat: { minWidth: 96, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)' },
  heroStatNarrow: { flex: 1, minWidth: 0, paddingVertical: 10 },
  heroStatNum: { color: '#fff', fontSize: 24, fontWeight: '800' },
  heroStatLbl: { color: '#DCE8FF', fontSize: 11, fontWeight: '700', marginTop: 2 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  glassBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  roomTitle: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 14, letterSpacing: -0.6 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  glassChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)' },
  glassChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  codeGlass: { marginTop: 18, padding: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', zIndex: 2 },
  codeGlassWide: { marginTop: 0, minWidth: 250, alignItems: 'center' },
  codeLabel: { color: '#DCE8FF', fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  code: { color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: 3, marginTop: 4 },
  codeShare: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'stretch', marginTop: 12, height: 40, borderRadius: 12, backgroundColor: '#fff' },
  codeShareText: { color: HERO[1], fontSize: 14, fontWeight: '800' },

  // the list
  section: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.muted, textTransform: 'uppercase', marginTop: 24, marginBottom: 10, marginLeft: 4 },
  grid: { gap: 10 },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  roomCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingLeft: 18, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  roomCardWide: { width: '49.2%' },
  roomCardHover: { borderColor: colors.accent },
  roomStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  avatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarHero: { width: 44, height: 44, borderRadius: 15, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
  avatarText: { color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: 0.5 },
  roomName: { fontSize: 16, fontWeight: '800', color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.bg },
  chipAccent: { backgroundColor: colors.accentFill },
  chipDanger: { backgroundColor: colors.danger },
  chipWarn: { backgroundColor: colors.warnSoft },
  chipText: { fontSize: 11, fontWeight: '800' },
  mineCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 14, borderRadius: 20, backgroundColor: colors.warnSoft, borderWidth: 1, borderColor: colors.warnBorder },
  adminCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 14, borderRadius: 20, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.dangerBorder },
  howRow: { gap: 12, marginTop: 16 },
  howCard: { padding: 18, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 8 },
  howTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 4 },
  howText: { fontSize: 13, lineHeight: 19, color: colors.muted },
  tile: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  cardMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  countPill: { minWidth: 20, textAlign: 'center', fontSize: 11, fontWeight: '900', color: '#fff', backgroundColor: colors.accentFill, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },

  // panels (forms)
  panel: { backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20, ...shadow },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  panelTitle: { fontSize: 19, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 8, borderRadius: 18, backgroundColor: colors.bg },
  label: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 16, marginBottom: 8 },
  field: { backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: colors.ink, borderWidth: 1, borderColor: colors.line, ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }) },
  fieldIcon: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line },
  fieldBare: { flex: 1, paddingVertical: 13, fontSize: 15, color: colors.ink, ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }) },
  codeField: { fontSize: 26, fontWeight: '900', letterSpacing: 4, textAlign: 'center', paddingVertical: 18 },
  multi: { minHeight: 90, textAlignVertical: 'top' },
  noteField: { backgroundColor: colors.warnSoft, borderColor: colors.warnBorder },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: colors.accentSoft },
  infoWarn: { backgroundColor: colors.warnSoft },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.ink },
  errorText: { fontSize: 13, fontWeight: '700', color: colors.danger, marginTop: 12 },
  footerRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  primary: { borderRadius: radius.md, height: 52, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentFill },
  primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 18, height: 52, borderRadius: radius.md, backgroundColor: colors.accentSoft },
  secondaryWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, borderRadius: radius.md, backgroundColor: colors.accentSoft, marginTop: 16 },
  secondaryText: { fontSize: 15, fontWeight: '800', color: colors.accent },
  off: { opacity: 0.5 },

  // inside a classroom
  segment: { flexDirection: 'row', gap: 4, marginTop: 16, padding: 4, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  segmentInPanel: { backgroundColor: colors.bg, borderWidth: 0, marginTop: 10 },
  segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 12 },
  segBtnOn: { backgroundColor: colors.accentSoft },
  segText: { fontSize: 13, fontWeight: '700', color: colors.muted, flexShrink: 1 },
  segTextOn: { color: colors.accent, fontWeight: '800' },
  addCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, padding: 14, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accent, backgroundColor: colors.accentSoft },
  addCardHover: { opacity: 0.85 },
  addIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' },
  addTitle: { fontSize: 15, fontWeight: '800', color: colors.accent },
  addKinds: { flexDirection: 'row', gap: 6 },
  material: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  materialWide: { width: '49.2%' },
  materialNote: { backgroundColor: colors.warnSoft, borderColor: colors.warnBorder },
  materialMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  kindTile: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  materialTop: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  kindLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },
  pinTag: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  newPill: { fontSize: 10, fontWeight: '900', color: colors.onAccent, backgroundColor: colors.accentFill, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', textTransform: 'uppercase', letterSpacing: 0.5 },
  materialTitle: { fontSize: 15, fontWeight: '800', color: colors.ink, marginTop: 3 },
  materialBody: { fontSize: 13, color: colors.ink, lineHeight: 19, marginTop: 4, opacity: 0.85 },
  materialMeta: { fontSize: 12, color: colors.muted, marginTop: 6 },
  openBtn: { width: 34, height: 34, borderRadius: 17, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  materialActions: { flexDirection: 'column', gap: 6 },
  iconBtn: { minWidth: 32, height: 32, paddingHorizontal: 6, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  iconBtnOn: { backgroundColor: colors.accentSoft },
  iconBtnDanger: { backgroundColor: colors.dangerSoft },
  sureText: { fontSize: 11, fontWeight: '900', color: colors.danger },
  block: { marginTop: 16, padding: 16, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  blockTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.line },
  personAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  personInitials: { color: '#fff', fontSize: 13, fontWeight: '900' },
  personName: { fontSize: 14, fontWeight: '800', color: colors.ink },
  approveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 34, borderRadius: 12, backgroundColor: colors.accentFill },
  approveText: { color: colors.onAccent, fontSize: 13, fontWeight: '800' },
  resetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, height: 42, borderRadius: 12, backgroundColor: colors.accentSoft },
  resetText: { fontSize: 13, fontWeight: '800', color: colors.accent },
  reportsIntro: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16, marginBottom: 4, paddingHorizontal: 4 },
  reportsIntroText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.muted },
  reportCard: { marginTop: 12, padding: 16, paddingLeft: 20, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  reportCardInPanel: { backgroundColor: colors.bg, borderColor: colors.bg },
  reportCardDone: { opacity: 0.6 },
  reportStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  reportTop: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  reportKind: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.line },
  reportKindText: { fontSize: 11, fontWeight: '800', color: colors.muted },
  reportStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  reportStatusOpen: { backgroundColor: colors.dangerSoft },
  reportStatusDone: { backgroundColor: '#16A0851F' },
  reportStatusText: { fontSize: 11, fontWeight: '800' },
  reportWhen: { marginLeft: 'auto', fontSize: 12, color: colors.muted },
  reportTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 10 },
  quote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  quoteText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.ink, fontStyle: 'italic' },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  detailText: { flex: 1, fontSize: 13, color: colors.ink },
  reportActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, height: 36, borderRadius: 12 },
  actPrimary: { backgroundColor: colors.accentFill },
  actDanger: { backgroundColor: colors.dangerSoft },
  actOutline: { borderWidth: 1.5, borderColor: colors.dangerBorder },
  actText: { fontSize: 13, fontWeight: '800' },
  countPillOff: { backgroundColor: colors.faint },
  pillDanger: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 34, borderRadius: 12, backgroundColor: colors.dangerSoft },
  pillDangerText: { fontSize: 13, fontWeight: '800', color: colors.danger },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 18, paddingHorizontal: 12 },
  emptyBig: { marginTop: 16, paddingVertical: 32, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: 'center', maxWidth: 380 },
  waitCard: { alignItems: 'center', marginTop: 16, padding: 24, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 8 },
  waitIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.warnSoft, alignItems: 'center', justifyContent: 'center' },
  waitTitle: { fontSize: 17, fontWeight: '800', color: colors.ink, textAlign: 'center', marginTop: 4 },
  waitText: { fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: 'center', maxWidth: 380 },
  bottomActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 28 },
  outlineDanger: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 40, borderRadius: 12, borderWidth: 1.5, borderColor: colors.dangerBorder, marginTop: 8 },
  outlineDangerText: { fontSize: 13, fontWeight: '800', color: colors.danger },
  outlineMuted: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 40, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, marginTop: 8 },
  outlineMutedText: { fontSize: 13, fontWeight: '800', color: colors.muted },

  // adding
  kindRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  kindChoice: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: 18, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  kindChoiceIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  kindChoiceText: { fontSize: 13, fontWeight: '800', color: colors.muted },
  pickBox: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, padding: 16, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accent, backgroundColor: colors.accentSoft },
  pickBoxDone: { borderStyle: 'solid', borderColor: '#16A085', backgroundColor: colors.surface },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  checkText: { fontSize: 14, fontWeight: '700', color: colors.ink },
}));
