import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { reportError } from './monitoring';
import { colors, radius, themedStyles } from './theme';
import { t } from './i18n';

// Catches render errors so a bug in one screen shows a friendly page instead of a blank app.
export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportError(error, `render: ${(info && info.componentStack ? info.componentStack.split('\n')[1] : '').trim()}`);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.root}>
        <View style={styles.icon}>
          <Ionicons name="warning" size={34} color={colors.onAccent} />
        </View>
        <Text style={styles.title}>{t('errorScreen.title')}</Text>
        <Text style={styles.body}>{t('errorScreen.body')}</Text>
        <Pressable style={styles.btn} onPress={() => this.setState({ error: null })} accessibilityLabel={t('errorScreen.retry')}>
          <Ionicons name="refresh" size={18} color={colors.onAccent} />
          <Text style={styles.btnText}>{t('errorScreen.retry')}</Text>
        </Pressable>
        {__DEV__ ? <Text style={styles.dev}>{String(this.state.error && this.state.error.message)}</Text> : null}
      </View>
    );
  }
}

const styles = themedStyles(() => ({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.bg },
  icon: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center', marginTop: 10, maxWidth: 340 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, backgroundColor: colors.accentFill, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 26 },
  btnText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
  dev: { marginTop: 22, fontSize: 12, color: colors.danger, textAlign: 'center', maxWidth: 360 },
}));
