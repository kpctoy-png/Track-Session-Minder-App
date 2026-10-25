import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import type { ScheduleItem } from '@/data/types';

/** A schedule item's title. Parade laps get a green flag in front and a checkered flag after. */
export function ItemTitle({
  item,
  style,
  size = 16,
  children,
}: {
  item: Pick<ScheduleItem, 'title' | 'kind'>;
  style: StyleProp<TextStyle>;
  /** The title's font size, so the flag matches it. */
  size?: number;
  children?: ReactNode;
}) {
  if (item.kind !== 'parade')
    return (
      <Text style={style}>
        {item.title}
        {children}
      </Text>
    );
  return (
    <View style={styles.row}>
      <GreenFlag size={size} />
      <Text style={[style, styles.text]}>
        {item.title} 🏁{children}
      </Text>
    </View>
  );
}

/** Phones have no green flag emoji, so draw one: a pole with a green flag at the top. */
function GreenFlag({ size }: { size: number }) {
  return (
    <View style={{ width: size * 0.9, height: size * 1.1, marginRight: size * 0.35 }} accessibilityLabel="Green flag">
      <View style={[styles.pole, { height: size * 1.1, width: Math.max(2, size * 0.1) }]} />
      <View style={[styles.flag, { left: Math.max(2, size * 0.1), width: size * 0.8, height: size * 0.55 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  text: { flexShrink: 1 },
  pole: { position: 'absolute', left: 0, top: 0, backgroundColor: '#D0D0D6', borderRadius: 1 },
  flag: { position: 'absolute', top: 0, backgroundColor: '#34C759', borderTopRightRadius: 2, borderBottomRightRadius: 2 },
});
