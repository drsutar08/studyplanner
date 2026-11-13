import React, { useEffect, useState } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { StarsDecor } from '../components/Illustrations';
import { themedStyles } from '../theme';
import { t } from '../i18n';

export default function SplashScreen() {
  const pop = useState(() => new Animated.Value(0))[0];
  const text = useState(() => new Animated.Value(0))[0];
  const pulse = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.timing(text, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LinearGradient colors={['#151B33', '#2A3A9E', '#7A5CFA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.root}>
      <StarsDecor width={300} height={420} />

      <Animated.View
        style={[
          styles.halo,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.22] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
          },
        ]}
      />
      <Animated.View style={[styles.logo, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>
        <Ionicons name="school" size={52} color="#fff" />
      </Animated.View>

      <Animated.View
        style={{
          alignItems: 'center',
          opacity: text,
          transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
        }}
      >
        <Text style={styles.name}>Studyly</Text>
        <Text style={styles.tag}>{t('brand.tagline')}</Text>
      </Animated.View>

      <View style={styles.dots}>
        {[0, 1, 2].map((i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: i === 1 ? [1, 0.3] : [0.3, 1] }),
              },
            ]}
          />
        ))}
      </View>
    </LinearGradient>
  );
}

const styles = themedStyles(() => ({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  halo: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: '#8D9BFF', marginBottom: 90 },
  logo: {
    width: 110,
    height: 110,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  name: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  tag: { color: '#C9D0FF', fontSize: 15, marginTop: 6, letterSpacing: 1 },
  dots: { position: 'absolute', bottom: 64, flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
}));
