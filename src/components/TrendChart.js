import React, { useState } from 'react';
import { View, Text } from 'react-native';
import Svg, { Polyline, Circle, Line } from 'react-native-svg';
import { colors, themedStyles, readable } from '../theme';
import { t } from '../i18n';
import { formatDate, parseKey } from '../dates';

const H = 72; // chart height, px
const PAD = 6;

// A subject's scores over time (gradeTrend().points, oldest first) as a small line chart, with the average as a
// faint line and the change since the first score. Fills the width it is given.
export default function TrendChart({ points, change, average, color }) {
  const [width, setWidth] = useState(0);
  if (points.length < 2) return null;
  // from a little below the lowest score to 100% (or the best, with extra credit), so a change shows
  const top = Math.max(100, ...points.map((p) => p.pct));
  const bottom = Math.max(0, Math.floor((Math.min(...points.map((p) => p.pct)) - 10) / 10) * 10);
  const x = (i) => PAD + (i / (points.length - 1)) * (width - PAD * 2);
  const y = (pct) => PAD + (1 - (pct - bottom) / (top - bottom)) * (H - PAD * 2);
  const up = change > 0.5;
  const down = change < -0.5;
  const tone = up ? colors.success : down ? colors.danger : colors.muted;
  const day = (key) => formatDate(parseKey(key), { month: 'short', day: 'numeric' });
  const label = up
    ? t('grades.trendUp', { pts: Math.round(change), date: day(points[0].date) })
    : down
      ? t('grades.trendDown', { pts: Math.round(-change), date: day(points[0].date) })
      : t('grades.trendFlat', { date: day(points[0].date) });

  return (
    <View style={styles.wrap} accessible accessibilityRole="image" accessibilityLabel={`${label}. ${points.map((p) => `${day(p.date)} ${Math.round(p.pct)}%`).join(', ')}`}>
      <Text style={[styles.label, { color: readable(tone) }]}>
        {up ? '▲ ' : down ? '▼ ' : '● '}
        {label}
      </Text>
      <View style={{ height: H }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={H}>
            {average != null ? <Line x1={PAD} x2={width - PAD} y1={y(average)} y2={y(average)} stroke={color} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="4 4" /> : null}
            <Polyline points={points.map((p, i) => `${x(i)},${y(p.pct)}`).join(' ')} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) => (
              <Circle key={p.id} cx={x(i)} cy={y(p.pct)} r={i === points.length - 1 ? 4.5 : 3} fill={i === points.length - 1 ? color : colors.surface} stroke={color} strokeWidth={2} />
            ))}
          </Svg>
        ) : null}
      </View>
      <View style={styles.ends}>
        <Text style={styles.end}>{day(points[0].date)}</Text>
        <Text style={styles.end}>{day(points[points.length - 1].date)}</Text>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { marginTop: 10, marginLeft: 18, padding: 10, borderRadius: 12, backgroundColor: colors.bg },
  label: { fontSize: 12, fontWeight: '800', marginBottom: 6 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  end: { fontSize: 10, color: colors.muted, fontWeight: '600' },
}));
