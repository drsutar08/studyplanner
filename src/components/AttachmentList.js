import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Image, Modal, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themedStyles, readable, solid } from '../theme';
import { t } from '../i18n';
import { parseLink, addAttachment, cannotAdd } from '../attachments';
import { pickAttachmentPhoto } from '../attachmentPhoto';
import { usePhotoUrl } from '../cloud/photos';
import { usePlan } from '../cloud/plan';
import { roomFor, photoCount } from '../plans';
import { openPremium } from './PremiumSheet';
import { useStore } from '../store';

// A photo from this device, or from Storage when it was added on another one (a grey square while it loads)
function PhotoImage({ att, style, resizeMode }) {
  const uri = usePhotoUrl(att);
  return uri ? <Image source={{ uri }} style={style} resizeMode={resizeMode} /> : <View style={[style, { backgroundColor: colors.bg }]} />;
}

// A task's links and photos. Tapping a link opens it, tapping a photo shows it full size. `editable` adds
// "Add link" / "Add photo" and a remove button on each; onChange(list) gets the new list.
export default function AttachmentList({ list = [], onChange, editable = false, tint = colors.accent }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [viewing, setViewing] = useState(null); // the photo shown full size
  const plan = usePlan();
  const store = useStore(); // for the photo count across tasks (the Free plan's limit)

  const limitError = (kind) => {
    const why = cannotAdd(list, kind);
    return why ? t(`attachments.errors.${why}`) : null;
  };

  const addLink = () => {
    const link = parseLink(text);
    if (!link) return setError(t('attachments.errors.link'));
    const full = limitError('link');
    if (full) return setError(full);
    onChange(addAttachment(list, { kind: 'link', ...link }));
    setText('');
    setLinkOpen(false);
    setError(null);
  };

  const addPhoto = async () => {
    const full = limitError('photo');
    if (full) return setError(full);
    // the Free plan's photo limit, across all tasks (the server refuses more as well)
    if (roomFor(plan, 'photos', photoCount(store.state.tasks, store.state.archive)) < 1) {
      setError(t('premium.limits.photos', { count: plan.limits.photos }));
      openPremium('photos');
      return;
    }
    setError(null);
    try {
      const url = await pickAttachmentPhoto();
      if (url) onChange(addAttachment(list, { kind: 'photo', url, name: '' }));
    } catch (_e) {
      setError(t('attachments.errors.photo'));
    }
  };

  const open = (a) => {
    if (a.kind === 'photo') setViewing(a);
    else Linking.openURL(a.url).catch(() => setError(t('attachments.errors.open')));
  };

  return (
    <View>
      {list.length ? (
        <View style={styles.list}>
          {list.map((a, i) =>
            a.kind === 'photo' ? (
              <View key={a.id} style={styles.photoWrap}>
                <Pressable onPress={() => open(a)} accessibilityRole="button" accessibilityLabel={t('attachments.photoA11y', { n: i + 1 })}>
                  <PhotoImage att={a} style={styles.photo} />
                </Pressable>
                {editable ? (
                  <Pressable onPress={() => onChange(list.filter((x) => x.id !== a.id))} hitSlop={6} style={styles.removePhoto} accessibilityRole="button" accessibilityLabel={t('attachments.removeA11y', { name: t('attachments.photo') })}>
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View key={a.id} style={styles.link}>
                <Pressable onPress={() => open(a)} style={styles.linkMain} accessibilityRole="link" accessibilityLabel={t('attachments.openA11y', { name: a.name })}>
                  <Ionicons name="link" size={14} color={tint} />
                  <Text style={[styles.linkText, { color: readable(tint) }]} numberOfLines={1}>
                    {a.name}
                  </Text>
                </Pressable>
                {editable ? (
                  <Pressable onPress={() => onChange(list.filter((x) => x.id !== a.id))} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('attachments.removeA11y', { name: a.name })}>
                    <Ionicons name="close" size={15} color={colors.muted} />
                  </Pressable>
                ) : null}
              </View>
            )
          )}
        </View>
      ) : null}

      {editable && linkOpen ? (
        <View style={styles.linkInputRow}>
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              setError(null);
            }}
            placeholder={t('attachments.linkPlaceholder')}
            placeholderTextColor={colors.muted}
            style={styles.linkInput}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={addLink}
            accessibilityLabel={t('attachments.linkA11y')}
          />
          <Pressable onPress={addLink} style={[styles.linkAdd, { backgroundColor: solid(tint) }]} accessibilityRole="button" accessibilityLabel={t('attachments.addLinkConfirm')}>
            <Text style={styles.linkAddText}>{t('attachments.add')}</Text>
          </Pressable>
        </View>
      ) : null}

      {editable ? (
        <View style={styles.actions}>
          {!linkOpen ? (
            <Pressable onPress={() => setLinkOpen(true)} style={styles.action} accessibilityRole="button">
              <Ionicons name="link-outline" size={15} color={tint} />
              <Text style={[styles.actionText, { color: readable(tint) }]}>{t('attachments.addLink')}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={addPhoto} style={styles.action} accessibilityRole="button">
            <Ionicons name="image-outline" size={15} color={tint} />
            <Text style={[styles.actionText, { color: readable(tint) }]}>{t('attachments.addPhoto')}</Text>
          </Pressable>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)} accessibilityLabel={t('attachments.closePhoto')}>
          {viewing ? <PhotoImage att={viewing} style={styles.full} resizeMode="contain" /> : null}
          <View style={styles.viewerClose}>
            <Ionicons name="close" size={22} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = themedStyles(() => ({
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  photoWrap: { position: 'relative' },
  photo: { width: 64, height: 64, borderRadius: 12, backgroundColor: colors.bg },
  removePhoto: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', paddingLeft: 10, paddingRight: 8, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.bg },
  linkMain: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  linkText: { fontSize: 13, fontWeight: '700', flexShrink: 1, ...Platform.select({ web: { textDecorationLine: 'underline' }, default: {} }) },
  linkInputRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  linkInput: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.ink, ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }) },
  linkAdd: { borderRadius: radius.md, paddingHorizontal: 14, justifyContent: 'center' },
  linkAddText: { color: colors.onAccent, fontWeight: '800', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
  actionText: { fontSize: 13, fontWeight: '700' },
  error: { fontSize: 12, color: colors.danger, marginTop: 6, fontWeight: '600' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  full: { width: '100%', height: '90%' },
  viewerClose: { position: 'absolute', top: 24, right: 24, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
}));
