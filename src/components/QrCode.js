import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { create } from 'qrcode/lib/core/qrcode';

const QUIET = 4; // modules of white around the code, as scanners expect

// A QR code for `value`, drawn as one SVG path. Always dark on white (even in dark mode), so phone cameras read it.
// Low error correction keeps a long link scannable.
export default function QrCode({ value, size = 240, label }) {
  const { path, count } = useMemo(() => {
    const qr = create(value, { errorCorrectionLevel: 'L' });
    const n = qr.modules.size;
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) if (qr.modules.get(y, x)) d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
    }
    return { path: d, count: n + QUIET * 2 };
  }, [value]);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${count} ${count}`} shapeRendering="crispEdges">
        <Rect x="0" y="0" width={count} height={count} fill="#FFFFFF" />
        <Path d={path} fill="#000000" />
      </Svg>
    </View>
  );
}
