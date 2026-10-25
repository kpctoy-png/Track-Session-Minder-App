import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ScheduleItem } from '@/data/types';
import { formatRange, usesTrack } from '@/lib/schedule';
import { colors, itemColors } from './theme';

interface Props {
  item: ScheduleItem;
  status?: 'past' | 'now' | 'future';
  right?: ReactNode;
}

export function ItemRow({ item, status = 'future', right }: Props) {
  const bars = itemColors(item);
  return (
    <View
      style={[
        styles.row,
        !usesTrack(item) && styles.offTrack,
        status === 'now' && styles.now,
        status === 'past' && styles.past,
      ]}
    >
      <View style={styles.bars}>
        {bars.map((c, i) => (
          <View key={i} style={[styles.bar, { backgroundColor: c }]} />
        ))}
      </View>
      <View style={styles.body}>
        <Text style={styles.time}>{formatRange(item)}</Text>
        <Text style={styles.title}>
          {item.title}
          {!usesTrack(item) ? <Text style={styles.tag}>  · off track</Text> : null}
        </Text>
      </View>
      {status === 'now' ? <Text style={styles.nowBadge}>NOW</Text> : null}
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  offTrack: { marginLeft: 24, backgroundColor: '#14140F' },
  now: { borderColor: colors.accent, backgroundColor: colors.cardRaised },
  past: { opacity: 0.4 },
  bars: { flexDirection: 'row', alignSelf: 'stretch' },
  bar: { width: 6 },
  body: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
  time: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  title: { color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 2 },
  tag: { color: colors.muted, fontSize: 13, fontWeight: '400' },
  nowBadge: { color: colors.accent, fontWeight: '800', fontSize: 12, marginRight: 12 },
});
