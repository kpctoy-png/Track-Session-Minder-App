import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSchedule } from '@/lib/ScheduleStore';
import { colors } from './theme';

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function EventPicker() {
  const { events, event, day, selectEvent, selectDay } = useSchedule();
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {events.map((e) => (
          <Chip key={e.id} label={e.name} selected={e.id === event.id} onPress={() => selectEvent(e.id)} />
        ))}
      </ScrollView>
      <View style={styles.row}>
        {event.days.map((d) => (
          <Chip
            key={d.id}
            label={`${d.label} ${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8))}`}
            selected={d.id === day.id}
            onPress={() => selectDay(d.id)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  chipTextSelected: { color: '#000' },
});
