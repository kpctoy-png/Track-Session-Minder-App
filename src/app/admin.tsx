import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EventPicker } from '@/components/EventPicker';
import { ItemRow } from '@/components/ItemRow';
import { PreviewClock } from '@/components/PreviewClock';
import { colors } from '@/components/theme';
import type { ScheduleItem } from '@/data/types';
import { useSchedule } from '@/lib/ScheduleStore';
import { formatTime, fromMinutes, shiftSchedule, sortItems, toMinutes } from '@/lib/schedule';

export default function AdminScreen() {
  const { day, clock, updateDay, resetDay } = useSchedule();
  const [editing, setEditing] = useState<string | null>(null);
  const items = sortItems(day.items);

  const runLate = (minutes: number) => updateDay(day.id, shiftSchedule(items, clock.minuteOfDay, minutes));

  const editItem = (id: string, change: (item: ScheduleItem) => ScheduleItem | null) =>
    updateDay(
      day.id,
      items.flatMap((item) => {
        if (item.id !== id) return [item];
        const next = change(item);
        return next ? [next] : [];
      }),
    );

  const nudge = (field: 'start' | 'end', delta: number) => (item: ScheduleItem) => {
    const value = toMinutes(item[field]) + delta;
    const other = toMinutes(field === 'start' ? item.end : item.start);
    if (field === 'start' ? value >= other : value <= other) return item;
    return { ...item, [field]: fromMinutes(value) };
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Practice mode: changes here only show on this device. Once the online database is connected, they will
          update every driver's phone.
        </Text>
      </View>
      <EventPicker />
      <PreviewClock />

      <Text style={styles.heading}>Running late?</Text>
      <Text style={styles.sub}>Shifts everything after {formatTime(fromMinutes(clock.minuteOfDay))}.</Text>
      <View style={styles.buttons}>
        {[5, 10, 15].map((m) => (
          <Btn key={m} label={`+${m} min`} onPress={() => runLate(m)} primary />
        ))}
        <Btn label="−5 min" onPress={() => runLate(-5)} />
      </View>

      <View style={styles.headerRow}>
        <Text style={styles.heading}>Sessions</Text>
        <Btn label="Reset day" onPress={() => resetDay(day.id)} />
      </View>
      <Text style={styles.sub}>Tap a session to change its times.</Text>

      {items.map((item) => (
        <View key={item.id}>
          <Pressable onPress={() => setEditing(editing === item.id ? null : item.id)}>
            <ItemRow item={item} />
          </Pressable>
          {editing === item.id ? (
            <View style={styles.editor}>
              <EditLine label="Start" onMinus={() => editItem(item.id, nudge('start', -5))} onPlus={() => editItem(item.id, nudge('start', 5))} />
              <EditLine label="End" onMinus={() => editItem(item.id, nudge('end', -5))} onPlus={() => editItem(item.id, nudge('end', 5))} />
              <Btn label="Remove session" onPress={() => editItem(item.id, () => null)} danger />
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

function EditLine({ label, onMinus, onPlus }: { label: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.editLine}>
      <Text style={styles.editLabel}>{label}</Text>
      <Btn label="−5" onPress={onMinus} />
      <Btn label="+5" onPress={onPlus} />
    </View>
  );
}

function Btn({ label, onPress, primary, danger }: { label: string; onPress: () => void; primary?: boolean; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.btn, primary && styles.btnPrimary, danger && styles.btnDanger]}>
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 40 },
  notice: { backgroundColor: '#2A2210', borderRadius: 12, padding: 12, marginBottom: 12 },
  noticeText: { color: '#FFD60A', fontSize: 13 },
  heading: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 8 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2, marginBottom: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editor: { backgroundColor: colors.cardRaised, borderRadius: 12, padding: 12, marginBottom: 10, marginTop: -2, gap: 8 },
  editLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editLabel: { color: colors.text, width: 50, fontWeight: '600' },
  btn: { backgroundColor: colors.cardRaised, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnDanger: { borderColor: '#FF453A', alignSelf: 'flex-start' },
  btnText: { color: colors.text, fontWeight: '600' },
  btnTextPrimary: { color: '#000' },
});
