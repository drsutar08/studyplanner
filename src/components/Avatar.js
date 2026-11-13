import React from 'react';
import { Text, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth, initials } from '../auth';

// Avatar colours a student can pick on the Profile. Fixed gradients: they sit behind white initials in
// both themes. The first is the default.
export const AVATAR_COLORS = {
  indigo: ['#5B6CF0', '#7A5CFA'],
  teal: ['#0E9F8E', '#22C3A6'],
  rose: ['#E0457B', '#F27AA0'],
  amber: ['#E07B12', '#F5A524'],
  sky: ['#1D8FE1', '#4FB3F6'],
  slate: ['#475569', '#64748B'],
};

// The signed-in user's avatar: their photo when they picked one, else initials on their colour.
// `size` is the diameter.
export default function Avatar({ size = 36, name }) {
  const { user, settings } = useAuth();
  const photo = settings.avatarPhoto;
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (photo) return <Image source={{ uri: photo }} style={round} accessibilityIgnoresInvertColors />;
  return (
    <LinearGradient colors={AVATAR_COLORS[settings.avatarColor] || AVATAR_COLORS.indigo} style={[round, { alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: Math.round(size * 0.38) }}>{initials(name || (user && user.name) || '')}</Text>
    </LinearGradient>
  );
}
