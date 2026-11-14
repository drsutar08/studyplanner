import React from 'react';
import { View, Text } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Classrooms from '../components/Classrooms';
import { cloudConfigured } from '../cloud/supabase';
import { colors, themedStyles } from '../theme';
import { t } from '../i18n';

// Classrooms: a teacher's study materials for their own students (menu → Classrooms). Needs the cloud.
export default function ClassroomsScreen() {
  const focused = useIsFocused();
  if (!cloudConfigured) {
    return (
      <View style={styles.empty}>
        <Ionicons name="cloud-offline-outline" size={28} color={colors.muted} />
        <Text style={styles.emptyText}>{t('classroom.needsCloud')}</Text>
      </View>
    );
  }
  return <Classrooms active={focused} />;
}

const styles = themedStyles(() => ({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32, backgroundColor: colors.bg },
  emptyText: { fontSize: 15, color: colors.muted, textAlign: 'center' },
}));
