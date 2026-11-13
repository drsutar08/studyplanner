import React from 'react';
import Svg, { Circle, Rect, Path, G, Defs, LinearGradient, Stop, Ellipse, Line } from 'react-native-svg';
import { colors } from '../theme';

// Desk scene: stacked books, lamp, plant, floating shapes. Drawn for a dark-blue hero card.
export function HeroIllustration({ width = 200, height = 150 }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 200 150">
      <Defs>
        <LinearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFE9A8" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#FFE9A8" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {/* floating decor */}
      <Circle cx="24" cy="30" r="5" fill="#8D9BFF" opacity="0.6" />
      <Circle cx="178" cy="22" r="3.5" fill="#FFD479" opacity="0.8" />
      <Path d="M150 52 l4 8 8 4 -8 4 -4 8 -4 -8 -8 -4 8 -4z" fill="#FFFFFF" opacity="0.5" />
      <Rect x="14" y="70" width="10" height="10" rx="2" fill="#17A398" opacity="0.6" transform="rotate(20 19 75)" />

      {/* lamp */}
      <Path d="M132 120 L132 62 Q132 40 112 38" stroke="#C7CEF5" strokeWidth="4" fill="none" strokeLinecap="round" />
      <Path d="M100 30 L124 34 L118 50 L96 44 Z" fill="#F2A541" />
      <Path d="M96 44 L118 50 L124 100 L80 100 Z" fill="url(#glow)" />
      <Rect x="120" y="116" width="26" height="6" rx="3" fill="#C7CEF5" />

      {/* desk */}
      <Rect x="8" y="122" width="184" height="9" rx="4.5" fill="#2B3566" />
      <Rect x="26" y="131" width="6" height="16" rx="2" fill="#232C57" />
      <Rect x="168" y="131" width="6" height="16" rx="2" fill="#232C57" />

      {/* books */}
      <Rect x="34" y="104" width="64" height="18" rx="3" fill="#E4572E" />
      <Rect x="34" y="104" width="64" height="5" rx="2" fill="#F08A6C" />
      <Rect x="42" y="88" width="54" height="16" rx="3" fill="#7A5CFA" />
      <Rect x="42" y="88" width="54" height="4" rx="2" fill="#A18DFF" />
      <Rect x="38" y="73" width="48" height="15" rx="3" fill="#17A398" />
      <Rect x="38" y="73" width="48" height="4" rx="2" fill="#5FD0C6" />

      {/* open notebook */}
      <Path d="M100 122 L100 110 Q112 106 124 110 L124 122 Z" fill="#FFFFFF" />
      <Line x1="104" y1="114" x2="120" y2="114" stroke="#C7CEF5" strokeWidth="1.5" />
      <Line x1="104" y1="118" x2="116" y2="118" stroke="#C7CEF5" strokeWidth="1.5" />

      {/* plant */}
      <Path d="M158 122 L162 106 L176 106 L180 122 Z" fill="#F2A541" />
      <Path d="M169 106 Q160 92 164 80 Q172 90 169 106Z" fill="#2FBF7F" />
      <Path d="M169 106 Q180 94 178 82 Q168 90 169 106Z" fill="#1E9E6A" />
      <Path d="M169 106 Q169 90 169 74" stroke="#1E9E6A" strokeWidth="2" fill="none" />
    </Svg>
  );
}

// Circular progress with a rounded cap. `value` is 0..1.
export function ProgressRing({ size = 84, stroke = 9, value = 0, trackColor = 'rgba(255,255,255,0.22)', color = '#FFFFFF', children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <Svg width={size} height={size}>
      <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
        />
      </G>
      {children}
    </Svg>
  );
}

// Friendly "all clear" scene for the empty list. The clipboard is drawn like a card, so it uses theme tokens.
export function EmptyIllustration({ width = 180, height = 140 }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 180 140">
      <Ellipse cx="90" cy="124" rx="62" ry="9" fill={colors.line} />
      <Rect x="48" y="26" width="84" height="94" rx="12" fill={colors.surface} stroke={colors.line} strokeWidth="2" />
      <Rect x="68" y="18" width="44" height="16" rx="8" fill={colors.accent} />
      <Circle cx="68" cy="58" r="8" fill={colors.accentSoft} />
      <Path d="M64 58 l3 3 6 -7" stroke={colors.accent} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="84" y="54" width="34" height="8" rx="4" fill={colors.accentSoft} />
      <Circle cx="68" cy="84" r="8" fill={colors.successSoft} />
      <Path d="M64 84 l3 3 6 -7" stroke={colors.success} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="84" y="80" width="26" height="8" rx="4" fill={colors.successSoft} />
      <Circle cx="68" cy="108" r="8" fill={colors.surfaceAlt} />
      <Rect x="84" y="104" width="30" height="8" rx="4" fill={colors.surfaceAlt} />
      <Circle cx="150" cy="40" r="5" fill="#F2A541" />
      <Circle cx="28" cy="70" r="4" fill="#17A398" />
      <Path d="M30 30 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3z" fill="#8D9BFF" />
    </Svg>
  );
}

// Row of colourful book spines on a shelf, for the Subjects hero.
export function ShelfIllustration({ width = 150, height = 100 }) {
  const books = [
    { x: 10, h: 54, w: 16, c: '#E4572E' },
    { x: 28, h: 68, w: 14, c: '#F2A541' },
    { x: 44, h: 46, w: 18, c: '#17A398' },
    { x: 64, h: 62, w: 15, c: '#7A5CFA' },
    { x: 81, h: 50, w: 17, c: '#2E86DE' },
    { x: 100, h: 66, w: 14, c: '#D6336C' },
  ];
  return (
    <Svg width={width} height={height} viewBox="0 0 150 100">
      {books.map((b) => (
        <G key={b.x}>
          <Rect x={b.x} y={86 - b.h} width={b.w} height={b.h} rx="3" fill={b.c} />
          <Rect x={b.x + 3} y={86 - b.h + 8} width={b.w - 6} height="3" rx="1.5" fill="#FFFFFF" opacity="0.55" />
          <Rect x={b.x + 3} y={86 - b.h + 15} width={b.w - 6} height="3" rx="1.5" fill="#FFFFFF" opacity="0.35" />
        </G>
      ))}
      <G transform="rotate(18 130 76)">
        <Rect x="122" y="40" width="14" height="46" rx="3" fill="#8D9BFF" />
      </G>
      <Rect x="2" y="86" width="146" height="8" rx="4" fill="#2B3566" opacity="0.9" />
      <Circle cx="132" cy="22" r="4" fill="#FFD479" />
      <Path d="M20 18 l2.5 5 5 2.5 -5 2.5 -2.5 5 -2.5 -5 -5 -2.5 5 -2.5z" fill="#FFFFFF" opacity="0.6" />
    </Svg>
  );
}

// Scattered stars/planets for dark hero backgrounds.
export function StarsDecor({ width = 300, height = 200 }) {
  const stars = [[24, 30, 2], [80, 150, 1.5], [150, 24, 1.8], [250, 60, 2.2], [270, 160, 1.5], [200, 120, 1.2], [50, 90, 1.4]];
  return (
    <Svg width={width} height={height} viewBox="0 0 300 200" style={{ position: 'absolute', top: 0, left: 0 }}>
      {stars.map(([x, y, r], i) => (
        <Circle key={i} cx={x} cy={y} r={r} fill="#FFFFFF" opacity={0.35 + (i % 3) * 0.2} />
      ))}
      <Circle cx="268" cy="30" r="16" fill="#7A5CFA" opacity="0.35" />
      <Circle cx="20" cy="170" r="22" fill="#2E86DE" opacity="0.2" />
    </Svg>
  );
}

export function FlameIcon({ size = 56 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="fl" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFD479" />
          <Stop offset="1" stopColor="#FF6B3D" />
        </LinearGradient>
      </Defs>
      <Path d="M32 4 C36 16 50 24 50 40 C50 52 42 60 32 60 C22 60 14 52 14 40 C14 32 19 27 22 22 C23 28 27 30 28 30 C26 20 28 10 32 4Z" fill="url(#fl)" />
      <Path d="M32 62 C26 62 22 57 22 52 C22 45 29 42 30 36 C35 41 42 44 42 52 C42 57 38 62 32 62Z" fill="#FFF3C9" opacity="0.9" transform="translate(0,-6)" />
    </Svg>
  );
}

// Donut chart. segments: [{ value, color }]
export function Donut({ size = 140, stroke = 18, segments = [], center }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  // each arc's length and where it starts along the circle
  const arcs = segments.reduce((list, s) => {
    const prev = list[list.length - 1];
    return [...list, { s, len: (s.value / total) * c, start: prev ? prev.start + prev.len : 0 }];
  }, []);
  return (
    <Svg width={size} height={size}>
      <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.bg} strokeWidth={stroke} fill="none" />
        {arcs.map(({ s, len, start }, i) => {
          const gap = segments.length > 1 ? 3 : 0; // no seam when there is a single segment
          const el = (
            <Circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={s.color}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
              strokeDashoffset={-start}
              strokeLinecap="round"
            />
          );
          return el;
        })}
      </G>
      {center}
    </Svg>
  );
}
