import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, Share, useWindowDimensions, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles } from '../theme';
import { t } from '../i18n';
import { dateKey, formatDue } from '../dates';
import QrCode from './QrCode';
import { shareable, readShare, joinPlan, withoutGroup } from '../share';
import GroupBoardSheet from './GroupBoardSheet';
import { appUrl } from '../appScheme';
import { createGroup, ownedGroups, stopSharing, openGroup, groupLink, readGroupLink, reloadOwnedGroups, groupErrorKind } from '../cloud/liveGroups';
import { usePlan } from '../cloud/plan';
import { limited } from '../plans';
import { openPremium } from './PremiumSheet';

// Where a share link points: this page on the web, the app itself on a phone (studyplanner://share)
const linkBase = () => (Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : appUrl('share'));

const counts = (o) => [
  o.classes ? t('restore.counts.classes', { count: o.classes }) : null,
  o.exams ? t('restore.counts.exams', { count: o.exams }) : null,
  o.vacations ? t('restore.counts.breaks', { count: o.vacations }) : null,
].filter(Boolean).join(', ');

function Sheet({ visible, onClose, icon, tint, title, sub, children, footer }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={[styles.headIcon, { backgroundColor: tint }]}>
              <Ionicons name={icon} size={20} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{title}</Text>
              <Text style={styles.headSub}>{sub}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          {footer}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Share: the live groups you share (link, QR, members, stop sharing), and making a new one: name it, choose what
// goes in. A live group follows your timetable: members see changes as you make them.
export function ShareGroupSheet({ visible, onClose, state, user }) {
  const today = dateKey();
  const plan = usePlan(); // the Free plan makes one group
  const [board, setBoard] = useState(null); // the owned group whose board is open
  const [name, setName] = useState('');
  const [include, setInclude] = useState({ classes: true, exams: true, vacations: true });
  const [mine, setMine] = useState(null); // your live groups (null while loading)
  const [picked, setPicked] = useState(null); // the group whose link is shown
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false); // the link as a QR code, for a classmate to scan
  const qrSize = Math.min(320, useWindowDimensions().width - 96); // as big as fits
  const [openFor, setOpenFor] = useState(false);
  if (visible !== openFor) {
    setOpenFor(visible);
    if (visible) {
      setName(t('groups.defaultName', { name: (user && user.name ? user.name.split(' ')[0] : '') || t('groups.me') }));
      setInclude({ classes: true, exams: true, vacations: true });
      setMine(null);
      setPicked(null);
      setError('');
      setCopied(false);
      setQr(false);
    }
  }
  useEffect(() => {
    if (!visible) return undefined;
    let alive = true;
    ownedGroups()
      .then((list) => alive && setMine(list))
      .catch(() => alive && setMine([]));
    return () => {
      alive = false;
    };
  }, [visible]);

  const avail = useMemo(() => shareable(state, today), [state, today]);
  const total = (include.classes ? avail.classes.length : 0) + (include.exams ? avail.exams.length : 0) + (include.vacations ? avail.vacations.length : 0);
  const link = picked ? groupLink(picked, linkBase()) : '';

  const create = async () => {
    if (busy || !total || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const g = await createGroup(state, user, { name: name.trim(), include });
      setMine((list) => [...(list || []), { ...g, members: 0 }]);
      setPicked(g);
      setCopied(false);
      reloadOwnedGroups();
    } catch (e) {
      const kind = groupErrorKind(e);
      if (kind === 'tooMany' && limited(plan)) {
        setError(t('premium.limits.groups', { count: plan.limits.groups }));
        openPremium('groups');
      } else setError(t(`groups.errors.${kind}`));
    }
    setBusy(false);
  };
  const stop = async (g) => {
    try {
      await stopSharing(g.id);
      setMine((list) => (list || []).filter((x) => x.id !== g.id));
      if (picked && picked.id === g.id) setPicked(null);
      reloadOwnedGroups();
    } catch {
      setError(t('groups.errors.offline'));
    }
  };
  const copy = async () => {
    try {
      if (Platform.OS === 'web' && navigator.clipboard) await navigator.clipboard.writeText(link);
      else await Share.share({ message: link });
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const send = async () => {
    const message = t('groups.shareMessage', { name: picked.name, link });
    try {
      if (Platform.OS === 'web' && navigator.share) await navigator.share({ title: picked.name, text: message });
      else if (Platform.OS === 'web') await navigator.clipboard.writeText(message);
      else await Share.share({ message });
    } catch {
      // closed the share panel
    }
  };

  const toggle = (key, label, n, icon) => {
    const on = include[key] && n > 0;
    return (
      <Pressable key={key} disabled={!n} onPress={() => setInclude((cur) => ({ ...cur, [key]: !cur[key] }))} style={[styles.option, !n && { opacity: 0.45 }]} accessibilityRole="checkbox" aria-checked={!!on} accessibilityState={{ checked: on, disabled: !n }} accessibilityLabel={`${label} (${n})`}>
        <Ionicons name={icon} size={18} color={on ? colors.accent : colors.muted} />
        <Text style={styles.optionText}>{label}</Text>
        <Text style={styles.optionCount}>{n}</Text>
        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.accent : colors.muted} />
      </Pressable>
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      icon="share-social"
      tint={colors.accent}
      title={t('groups.shareTitle')}
      sub={t('groups.shareSubLive')}
      footer={
        picked ? (
          <View style={styles.footerRow}>
            <Pressable onPress={copy} style={styles.secondary} accessibilityRole="button" accessibilityLabel={t('groups.copy')}>
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={colors.accent} />
              <Text style={styles.secondaryText}>{copied ? t('groups.copied') : t('groups.copy')}</Text>
            </Pressable>
            <Pressable onPress={send} style={[styles.save, { flex: 1, marginTop: 0 }]} accessibilityRole="button" accessibilityLabel={t('groups.send')}>
              <Ionicons name="paper-plane" size={18} color={colors.onAccent} />
              <Text style={styles.saveText}>{t('groups.send')}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={create} disabled={busy || !total || !name.trim()} style={[styles.save, (busy || !total || !name.trim()) && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel={t('groups.create')}>
            {busy ? <ActivityIndicator color={colors.onAccent} /> : <Ionicons name="link" size={18} color={colors.onAccent} />}
            <Text style={styles.saveText}>{t('groups.create')}</Text>
          </Pressable>
        )
      }
    >
      {mine && mine.length ? (
        <>
          <Text style={styles.label}>{t('groups.yours')}</Text>
          {mine.map((g) => {
            const on = picked && picked.id === g.id;
            return (
              <View key={g.id} style={[styles.owned, on && styles.ownedOn]}>
                <Pressable onPress={() => { setPicked(on ? null : g); setCopied(false); setQr(false); }} style={{ flex: 1 }} accessibilityRole="button" aria-pressed={!!on} accessibilityState={{ selected: !!on }} accessibilityLabel={t('groups.showLinkA11y', { name: g.name })}>
                  <Text style={styles.ownedName}>{g.name}</Text>
                  <Text style={styles.ownedMeta}>{t('groups.members', { count: g.members || 0 })}</Text>
                </Pressable>
                <Pressable onPress={() => setBoard(g)} hitSlop={8} style={styles.boardBtn} accessibilityRole="button" accessibilityLabel={t('board.openA11y', { name: g.name })}>
                  <Ionicons name="clipboard-outline" size={14} color={colors.accent} />
                  <Text style={styles.boardText}>{t('board.open')}</Text>
                </Pressable>
                <Pressable onPress={() => stop(g)} hitSlop={8} style={styles.stopBtn} accessibilityRole="button" accessibilityLabel={t('groups.stopA11y', { name: g.name })}>
                  <Text style={styles.stopText}>{t('groups.stop')}</Text>
                </Pressable>
              </View>
            );
          })}
        </>
      ) : null}

      {picked ? (
        <>
          <Text selectable style={styles.link} numberOfLines={3} accessibilityLabel={t('groups.linkA11y')}>
            {link}
          </Text>
          <Pressable onPress={() => setQr((v) => !v)} style={styles.qrToggle} accessibilityRole="button" accessibilityState={{ expanded: qr }} accessibilityLabel={qr ? t('groups.hideQr') : t('groups.showQr')}>
            <Ionicons name="qr-code-outline" size={17} color={colors.accent} />
            <Text style={styles.qrToggleText}>{qr ? t('groups.hideQr') : t('groups.showQr')}</Text>
            <Ionicons name={qr ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accent} />
          </Pressable>
          {qr ? (
            <View style={styles.qrBox}>
              <QrCode value={link} size={qrSize} label={t('groups.qrA11y', { name: picked.name })} />
              <Text style={styles.qrHint}>{t('groups.qrHint')}</Text>
            </View>
          ) : null}
          <Pressable onPress={() => setPicked(null)} style={styles.newBtn} accessibilityRole="button">
            <Ionicons name="add" size={16} color={colors.accent} />
            <Text style={styles.newBtnText}>{t('groups.another')}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.label}>{mine && mine.length ? t('groups.newGroup') : t('groups.nameLabel')}</Text>
          <TextInput value={name} onChangeText={setName} maxLength={60} style={styles.field} placeholder={t('groups.namePlaceholder')} placeholderTextColor={colors.muted} accessibilityLabel={t('groups.nameLabel')} />
          <Text style={styles.label}>{t('groups.includeLabel')}</Text>
          {toggle('classes', t('groups.includeClasses'), avail.classes.length, 'easel-outline')}
          {toggle('exams', t('groups.includeExams'), avail.exams.length, 'flag-outline')}
          {toggle('vacations', t('groups.includeBreaks'), avail.vacations.length, 'sunny-outline')}
          <View style={[styles.note, { backgroundColor: colors.bg }]}>
            <Ionicons name="lock-closed-outline" size={15} color={colors.muted} />
            <Text style={[styles.noteText, { color: colors.muted }]}>{t('groups.privateLive')}</Text>
          </View>
        </>
      )}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <GroupBoardSheet visible={!!board} group={board} owner onClose={() => setBoard(null)} />
    </Sheet>
  );
}

// Join: paste a link (or open one), see what it adds, and join, or update a group already joined. A live group's
// link is looked up in the cloud first (its code checked there); onJoin(share, live) with live = { id, code }.
export function JoinGroupSheet({ visible, onClose, state, initialText = '', onJoin }) {
  const [text, setText] = useState('');
  const [found, setFound] = useState({ key: '', row: null }); // the live group the text points at (row: null | false)
  const [openFor, setOpenFor] = useState(false);
  if (visible !== openFor) {
    setOpenFor(visible);
    if (visible) setText(initialText || '');
  }
  const liveRef = useMemo(() => readGroupLink(text), [text]);
  const liveKey = liveRef ? `${liveRef.id}.${liveRef.code}` : '';
  useEffect(() => {
    if (!visible || !liveRef) return undefined;
    let alive = true;
    openGroup(liveRef)
      .then((row) => alive && setFound({ key: liveKey, row: row || false }))
      .catch(() => alive && setFound({ key: liveKey, row: false }));
    return () => {
      alive = false;
    };
  }, [visible, liveKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const liveRow = liveRef && found.key === liveKey ? found.row : null; // null: looking it up
  const read = useMemo(() => {
    if (!text.trim()) return null;
    if (liveRef) return liveRow ? { share: { ...liveRow.payload, id: liveRow.id, n: liveRow.name, f: liveRow.owner_name } } : liveRow === false ? { error: 'notShare' } : null;
    return readShare(text);
  }, [text, liveRef, liveRow]);
  const share = read && read.share;
  const plan = useMemo(() => (share ? joinPlan(share, withoutGroup(state, share.id), 'preview') : null), [share, state]);
  const already = share && (state.groups || []).find((g) => g.id === share.id);
  const total = plan ? plan.classes.length + plan.exams.length + plan.vacations.length : 0;
  const rows = plan ? [...plan.classes.map((c) => ['easel-outline', c.title]), ...plan.exams.map((e) => ['flag-outline', `${e.title} · ${formatDue(e.date)}`]), ...plan.vacations.map((v) => ['sunny-outline', v.title])] : [];
  const can = share && (total || already);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      icon="people"
      tint="#16A085"
      title={already ? t('groups.updateTitle') : t('groups.joinTitle')}
      sub={t('groups.joinSub')}
      footer={
        <Pressable onPress={() => can && onJoin(share, liveRef)} disabled={!can} style={[styles.save, { backgroundColor: '#16A085' }, !can && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel={already ? t('groups.update') : t('groups.join')}>
          <Ionicons name={already ? 'refresh' : 'people'} size={18} color={colors.onAccent} />
          <Text style={styles.saveText}>{already ? t('groups.update') : t('groups.join')}</Text>
        </Pressable>
      }
    >
      <Text style={styles.help}>{t('groups.pasteHelp')}</Text>
      <TextInput value={text} onChangeText={setText} multiline style={[styles.field, styles.paste]} placeholder={t('groups.pastePlaceholder')} placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t('groups.pasteA11y')} />
      {liveRef && liveRow === null ? <ActivityIndicator style={{ marginTop: 12 }} color={colors.accent} /> : null}
      {read && read.error ? (
        <View style={[styles.note, { backgroundColor: colors.dangerSoft }]}>
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={[styles.noteText, { color: colors.danger }]}>{t(`groups.errors.${read.error}`)}</Text>
        </View>
      ) : null}
      {share && plan ? (
        <>
          <View style={styles.group}>
            <Text style={styles.groupName}>
              {share.n || t('groups.unnamed')}
              {liveRef ? <Text style={styles.liveTag}>{`  ${t('groups.liveTag')}`}</Text> : null}
            </Text>
            <Text style={styles.groupFrom}>{[share.f ? t('groups.from', { name: share.f }) : null, !liveRef && share.at ? t('groups.sharedOn', { date: formatDue(share.at) }) : null].filter(Boolean).join(' · ')}</Text>
          </View>
          <View style={[styles.note, { backgroundColor: total ? colors.successSoft : colors.bg }]}>
            <Ionicons name={total ? 'checkmark-circle' : 'information-circle'} size={16} color={total ? colors.success : colors.muted} />
            <Text style={[styles.noteText, { color: total ? colors.success : colors.muted }]}>
              {total ? t('groups.adds', { what: counts({ classes: plan.classes.length, exams: plan.exams.length, vacations: plan.vacations.length }) }) : t('groups.nothingNew')}
              {plan.subjects.length ? ` ${t('groups.newSubjects', { count: plan.subjects.length })}` : ''}
              {plan.skipped ? ` ${t('ics.skipped', { count: plan.skipped })}` : ''}
              {already ? ` ${t('groups.replaces')}` : ''}
              {liveRef ? ` ${t('groups.liveNote')}` : ''}
            </Text>
          </View>
          {rows.slice(0, 10).map(([icon, label], i) => (
            <View key={i} style={styles.item}>
              <Ionicons name={icon} size={15} color={colors.muted} />
              <Text style={styles.itemText} numberOfLines={1}>{label}</Text>
            </View>
          ))}
          {rows.length > 10 ? <Text style={styles.help}>{t('calendar.moreItems', { count: rows.length - 10 })}</Text> : null}
        </>
      ) : null}
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.scrim },
  dismiss: { flex: 1, alignSelf: 'stretch' },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 10, paddingBottom: 28 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  headIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  owned: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.line, marginBottom: 8 },
  ownedOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  ownedName: { fontSize: 15, fontWeight: '800', color: colors.ink },
  ownedMeta: { fontSize: 12, color: colors.muted, marginTop: 1 },
  boardBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.accentSoft },
  boardText: { fontSize: 12, fontWeight: '800', color: colors.accent },
  stopBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.dangerSoft },
  stopText: { fontSize: 12, fontWeight: '800', color: colors.danger },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 14 },
  newBtnText: { fontSize: 13, fontWeight: '800', color: colors.accent },
  liveTag: { fontSize: 12, fontWeight: '800', color: '#16A085' },
  errorText: { fontSize: 13, fontWeight: '600', color: colors.danger, marginTop: 10 },
  label: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 16, marginBottom: 8 },
  field: { backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.ink, ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }) },
  paste: { minHeight: 90, textAlignVertical: 'top', fontSize: 12, ...Platform.select({ web: { fontFamily: 'monospace' }, default: {} }) },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.line },
  optionText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink },
  optionCount: { fontSize: 13, fontWeight: '700', color: colors.muted },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12, padding: 12, borderRadius: 12 },
  noteText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  link: { marginTop: 12, fontSize: 12, color: colors.accent, backgroundColor: colors.accentSoft, borderRadius: 12, padding: 12, ...Platform.select({ web: { fontFamily: 'monospace', wordBreak: 'break-all' }, default: {} }) },
  qrToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.accentSoft },
  qrToggleText: { fontSize: 13, fontWeight: '800', color: colors.accent },
  qrBox: { alignItems: 'center', marginTop: 12, padding: 14, borderRadius: 18, backgroundColor: colors.bg },
  qrHint: { fontSize: 12, color: colors.muted, marginTop: 10, textAlign: 'center', lineHeight: 17 },
  help: { marginTop: 12, fontSize: 13, color: colors.muted, lineHeight: 19 },
  group: { marginTop: 14 },
  groupName: { fontSize: 17, fontWeight: '800', color: colors.ink },
  groupFrom: { fontSize: 12, color: colors.muted, marginTop: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line },
  itemText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.ink },
  footerRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 52, borderRadius: radius.md, backgroundColor: colors.accentSoft },
  secondaryText: { fontSize: 15, fontWeight: '800', color: colors.accent },
  save: { marginTop: 16, borderRadius: radius.md, height: 52, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentFill },
  saveText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
}));
