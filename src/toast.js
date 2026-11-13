import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, getScheme, themedStyles } from './theme';

// The one way the app tells you something: a small bar at the bottom ("Task deleted  ·  Undo").
// One at a time. It can offer an action (Undo), and can run `onExpire` when it times out without the
// action being tapped, which is how "delete my account in a few seconds unless you undo" works.
//
//   show({ message, tone, icon, actionLabel, onAction, onExpire, duration })
//   tone: 'info' (default) | 'success' | 'error'
const ToastContext = createContext({ show: () => {}, hide: () => {} });
const DURATION = 6000;

const TONES = {
  info: { icon: 'information-circle', color: '#C9D0FF' },
  success: { icon: 'checkmark-circle', color: '#4ADE80' },
  error: { icon: 'alert-circle', color: '#FF8FA8' },
};

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const anim = useState(() => new Animated.Value(0))[0];
  const timer = useRef(null);
  const current = useRef(null); // the toast on screen, so a pending onExpire is never lost or run twice
  const shownId = useRef(0); // which toast is on screen, so a fade-out never removes a newer one

  const settle = useCallback((runExpire) => {
    const c = current.current;
    if (c && !c.settled) {
      c.settled = true;
      if (runExpire && c.onExpire) c.onExpire();
    }
  }, []);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    const id = shownId.current;
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      // only remove the toast this fade belongs to; a newer one may have replaced it meanwhile
      if (finished && shownId.current === id) setToast(null);
    });
  }, [anim]);

  const show = useCallback(
    (t) => {
      clearTimeout(timer.current);
      settle(true); // a new message replaces the old one; whatever the old one was waiting to do now happens
      current.current = { ...t, settled: false };
      shownId.current += 1;
      setToast({ ...t, id: shownId.current });
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        settle(true);
        hide();
      }, t.duration || DURATION);
    },
    [anim, hide, settle]
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  const tone = TONES[(toast && toast.tone) || 'info'];

  return (
    <ToastContext.Provider value={{ show, hide }}>
      {children}
      {toast ? (
        <View style={styles.layer} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.toast,
              { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
            ]}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            <Ionicons name={toast.icon || tone.icon} size={19} color={tone.color} />
            <Text style={styles.message} numberOfLines={3}>{toast.message}</Text>
            {toast.actionLabel ? (
              <Pressable
                onPress={() => {
                  settle(false); // the action was taken, so the "on expire" step is cancelled
                  // hide this toast before the action runs: an action that shows a follow-up message
                  // ("Account kept") must not have that new toast faded out by this hide
                  hide();
                  if (toast.onAction) toast.onAction();
                }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={toast.actionLabel}
                style={styles.action}
              >
                <Text style={styles.actionText}>{toast.actionLabel}</Text>
              </Pressable>
            ) : null}
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = themedStyles(() => ({
  layer: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', alignItems: 'center', zIndex: 1000, elevation: 1000 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 108,
    marginHorizontal: 16,
    maxWidth: 520,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: 16,
    // A dark bar in both themes; in dark mode it is lifted a step so it stands out from the page
    backgroundColor: getScheme() === 'dark' ? colors.surfaceAlt : '#151B33',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  message: { flexShrink: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  action: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(141,155,255,0.22)' },
  actionText: { color: '#C9D0FF', fontWeight: '800', fontSize: 14 },
}));
