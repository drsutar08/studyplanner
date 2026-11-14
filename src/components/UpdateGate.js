import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { supabase } from '../cloud/supabase';
import { updateState, offeredBuild, storeLinks } from '../appUpdate';
import { colors, radius, themedStyles } from '../theme';
import { t } from '../i18n';

// Asks people on an old build to update: "Update required" blocks the app (min_build), "Update available" can be
// put off (latest_build). The numbers live in app_config.app_update on Supabase, so a release can be made
// mandatory without a new build. Checked at launch and when the app comes back to the front.
const DISMISSED_KEY = 'appUpdate.dismissedBuild';
const RECHECK_MS = 10 * 60 * 1000;

export default function UpdateGate() {
  const [state, setState] = useState({ kind: 'none', config: null });
  const lastCheck = useRef(0);

  // Resolves to the new state, or null to keep the current one (offline, not set up, web, Expo Go: never block)
  const check = useCallback(async () => {
    if (!supabase || Platform.OS === 'web' || !Application.nativeBuildVersion) return null;
    lastCheck.current = Date.now();
    try {
      const { data, error } = await supabase.rpc('app_update_info');
      if (error || !data) return null;
      let kind = updateState(data, Platform.OS, Application.nativeBuildVersion);
      if (kind === 'suggest') {
        const dismissed = Number(await AsyncStorage.getItem(DISMISSED_KEY).catch(() => 0)) || 0;
        if (dismissed >= offeredBuild(data, Platform.OS)) kind = 'none';
      }
      return { kind, config: data };
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let live = true;
    const run = () =>
      check().then((next) => {
        if (live && next) setState(next);
      });
    run();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - lastCheck.current > RECHECK_MS) run();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, [check]);

  const openStore = async () => {
    for (const url of storeLinks(state.config, Platform.OS, Application.applicationId)) {
      try {
        await Linking.openURL(url);
        return;
      } catch {
        // try the next link (no Play Store app: its web page)
      }
    }
  };

  const later = () => {
    AsyncStorage.setItem(DISMISSED_KEY, String(offeredBuild(state.config, Platform.OS))).catch(() => {});
    setState((s) => ({ ...s, kind: 'none' }));
  };

  if (state.kind === 'none') return null;
  const forced = state.kind === 'force';
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={forced ? () => {} : later}>
      <View style={[styles.backdrop, forced && styles.backdropSolid]}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.icon}>
            <Ionicons name="cloud-download" size={30} color={colors.onAccent} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {t(forced ? 'appUpdate.requiredTitle' : 'appUpdate.availableTitle')}
          </Text>
          <Text style={styles.body}>{t(forced ? 'appUpdate.requiredBody' : 'appUpdate.availableBody')}</Text>
          <Pressable style={styles.btn} onPress={openStore} accessibilityRole="button" accessibilityLabel={t('appUpdate.update')}>
            <Text style={styles.btnText}>{t('appUpdate.update')}</Text>
          </Pressable>
          {forced ? null : (
            <Pressable style={styles.later} onPress={later} accessibilityRole="button" accessibilityLabel={t('appUpdate.later')}>
              <Text style={styles.laterText}>{t('appUpdate.later')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(8,10,20,0.55)' },
  backdropSolid: { backgroundColor: colors.bg },
  card: { width: '100%', maxWidth: 380, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 28 },
  icon: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center', marginTop: 10 },
  btn: { alignSelf: 'stretch', alignItems: 'center', marginTop: 24, backgroundColor: colors.accentFill, borderRadius: radius.md, paddingVertical: 14 },
  btnText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
  later: { alignSelf: 'stretch', alignItems: 'center', marginTop: 8, paddingVertical: 12 },
  laterText: { color: colors.muted, fontWeight: '600', fontSize: 15 },
}));
