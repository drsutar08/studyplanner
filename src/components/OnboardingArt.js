import React from 'react';
import Svg, { Circle, Rect, Path, G, Defs, LinearGradient, Stop, Line } from 'react-native-svg';

// Three illustrations for the intro slides, drawn for the dark gradient backdrop.

export function PlanArt({ width = 280, height = 230 }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 280 230">
      <Circle cx="48" cy="44" r="6" fill="#FFD479" opacity="0.9" />
      <Circle cx="244" cy="70" r="4" fill="#8D9BFF" />
      <Path d="M232 28 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4z" fill="#fff" opacity="0.6" />

      {/* calendar card */}
      <Rect x="62" y="34" width="156" height="164" rx="22" fill="#FFFFFF" />
      <Path d="M62 56 a22 22 0 0 1 22 -22 h112 a22 22 0 0 1 22 22 v14 h-156z" fill="#5B6CF0" />
      <Rect x="92" y="22" width="10" height="26" rx="5" fill="#FFD479" />
      <Rect x="178" y="22" width="10" height="26" rx="5" fill="#FFD479" />
      <Rect x="84" y="52" width="60" height="9" rx="4.5" fill="#fff" opacity="0.9" />

      {/* tasks */}
      {[
        [90, '#E4572E', 86],
        [124, '#17A398', 70],
        [158, '#7A5CFA', 94],
      ].map(([y, c, w], i) => (
        <G key={y}>
          <Circle cx="90" cy={y + 6} r="9" fill={i === 1 ? c : 'none'} stroke={c} strokeWidth="2.5" />
          {i === 1 && <Path d="M85.5 130 l3.5 3.5 6.5 -7.5" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          <Rect x="108" y={y} width={w} height="8" rx="4" fill="#DDE2EE" />
          <Rect x="108" y={y + 12} width={w * 0.6} height="6" rx="3" fill="#EEF1F7" />
        </G>
      ))}

      {/* pencil */}
      <G transform="rotate(35 214 170)">
        <Rect x="204" y="120" width="20" height="78" rx="4" fill="#F2A541" />
        <Path d="M204 198 L214 216 L224 198 Z" fill="#FFE9C7" />
        <Path d="M210 210 L214 216 L218 210 Z" fill="#3B4CCA" />
        <Rect x="204" y="120" width="20" height="14" rx="4" fill="#E4572E" />
      </G>
    </Svg>
  );
}

export function FocusArt({ width = 280, height = 230 }) {
  const r = 78;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={width} height={height} viewBox="0 0 280 230">
      <Defs>
        <LinearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#8D9BFF" />
          <Stop offset="1" stopColor="#FFD479" />
        </LinearGradient>
      </Defs>
      <Circle cx="40" cy="60" r="3" fill="#fff" opacity="0.7" />
      <Circle cx="248" cy="40" r="4" fill="#FFD479" />
      <Circle cx="236" cy="190" r="3" fill="#fff" opacity="0.6" />
      <Circle cx="30" cy="170" r="14" fill="#7A5CFA" opacity="0.4" />

      <Circle cx="140" cy="115" r="98" fill="#FFFFFF" opacity="0.08" />
      <G transform="rotate(-90 140 115)">
        <Circle cx="140" cy="115" r={r} stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="14" fill="none" />
        <Circle cx="140" cy="115" r={r} stroke="url(#ring)" strokeWidth="14" fill="none" strokeLinecap="round" strokeDasharray={`${c * 0.72} ${c}`} />
      </G>
      <Circle cx="140" cy="115" r="58" fill="#FFFFFF" />
      <Rect x="119" y="96" width="42" height="9" rx="4.5" fill="#EEF1F7" />
      <Rect x="104" y="112" width="72" height="22" rx="6" fill="#151B33" />
      <Rect x="112" y="118" width="14" height="10" rx="3" fill="#8D9BFF" />
      <Rect x="133" y="118" width="14" height="10" rx="3" fill="#8D9BFF" />
      <Rect x="154" y="118" width="14" height="10" rx="3" fill="#8D9BFF" />
      <Rect x="122" y="142" width="36" height="6" rx="3" fill="#DDE2EE" />

      {/* play button */}
      <Circle cx="140" cy="206" r="18" fill="#FFD479" />
      <Path d="M135 198 L135 214 L148 206 Z" fill="#151B33" />
    </Svg>
  );
}

export function GrowArt({ width = 280, height = 230 }) {
  const bars = [
    [60, 46, '#8D9BFF'],
    [96, 70, '#8D9BFF'],
    [132, 58, '#8D9BFF'],
    [168, 102, '#17A398'],
    [204, 128, '#FFD479'],
  ];
  return (
    <Svg width={width} height={height} viewBox="0 0 280 230">
      <Circle cx="38" cy="50" r="5" fill="#FFD479" />
      <Circle cx="252" cy="96" r="3.5" fill="#fff" opacity="0.7" />
      <Path d="M40 120 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#fff" opacity="0.5" />

      <Rect x="40" y="52" width="200" height="152" rx="22" fill="#FFFFFF" />
      {[0, 1, 2].map((i) => (
        <Line key={i} x1="56" x2="224" y1={96 + i * 32} y2={96 + i * 32} stroke="#EEF1F7" strokeWidth="2" />
      ))}
      {bars.map(([x, h, c]) => (
        <Rect key={x} x={x} y={186 - h} width="22" height={h} rx="7" fill={c} />
      ))}
      {/* goal line */}
      <Line x1="56" x2="224" y1="108" y2="108" stroke="#1E9E6A" strokeWidth="2" strokeDasharray="5 5" />

      {/* trending arrow */}
      <Path d="M64 150 L110 128 L146 138 L206 78" stroke="#E4572E" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M190 76 L208 76 L208 94" stroke="#E4572E" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />

      {/* medal */}
      <Path d="M226 150 L216 190 L228 184 L236 196 L244 154 Z" fill="#5B6CF0" />
      <Circle cx="236" cy="150" r="20" fill="#FFD479" />
      <Circle cx="236" cy="150" r="13" fill="#F2A541" />
      <Path d="M236 141 l3 6 7 1 -5 5 1 7 -6 -3 -6 3 1 -7 -5 -5 7 -1z" fill="#fff" />
    </Svg>
  );
}
