import React, { useState } from 'react';
import { View, Text, Pressable, Share } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles } from '../theme';
import { t } from '../i18n';
import { QUOTE_COUNT, quoteAt, quoteIndexForToday } from '../quotes';

function QuoteMark({ size = 40, color = '#F2A541' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        d="M10 28c0-8 4-14 12-17l1.6 3C19 16 17 19 17 22h5v14H10V28Zm18 0c0-8 4-14 12-17l1.6 3C37 16 35 19 35 22h5v14H28V28Z"
        fill={color}
      />
    </Svg>
  );
}

export default function QuoteCard() {
  const today = quoteIndexForToday();
  const [offset, setOffset] = useState(0); // lets the user browse more quotes without changing "today's" pick
  const q = quoteAt((today + offset) % QUOTE_COUNT);

  const share = () => Share.share({ message: t('quotes.share', { text: q.text, author: q.author }) }).catch(() => {});

  return (
    <View style={styles.card}>
      <View style={styles.accent} />
      <View style={styles.head}>
        <View style={styles.badge}>
          <Ionicons name="sparkles" size={12} color={colors.warn} />
          <Text style={styles.badgeText}>{offset === 0 ? t('quotes.ofTheDay') : t('quotes.more')}</Text>
        </View>
        <QuoteMark size={26} />
      </View>
      <Text style={styles.text}>{q.text}</Text>
      <View style={styles.foot}>
        <Text style={styles.author}>{q.author}</Text>
        <View style={styles.actions}>
          <Pressable onPress={share} hitSlop={8} style={styles.btn} accessibilityLabel={t('quotes.shareA11y')}>
            <Ionicons name="share-social-outline" size={15} color={colors.accent} />
          </Pressable>
          <Pressable onPress={() => setOffset((o) => (o + 1) % QUOTE_COUNT)} hitSlop={8} style={styles.btn} accessibilityLabel={t('quotes.nextA11y')}>
            <Ionicons name="refresh" size={15} color={colors.accent} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  card: {
    marginTop: 14,
    backgroundColor: colors.warnSoft,
    borderRadius: 20,
    padding: 12,
    paddingLeft: 16,
    borderWidth: 1,
    borderColor: colors.warnBorder,
    overflow: 'hidden',
  },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, backgroundColor: '#F2A541' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  // warnBorder rather than warnSoft: the card itself is warnSoft, so the badge needs a step darker to show
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.warnBorder, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: colors.warn },
  text: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: colors.ink, marginTop: 4, fontStyle: 'italic' },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  author: { fontSize: 13, fontWeight: '700', color: colors.warn },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
}));
