import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TrackEvent } from '@/data/types';

import { shortDate } from '@/lib/dates';
import { useSchedule } from '@/lib/ScheduleStore';
import { ClubLogo } from './ClubLogo';
import { colors } from './theme';

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

/**
 * The chosen event and its days. Given `only`, Change lists just those events here (an organizer's own) instead of
 * opening the full events page.
 */
export function EventPicker({ only }: { only?: TrackEvent[] }) {
  const { clubs, event, day, selectDay, selectEvent } = useSchedule();
  const [choosing, setChoosing] = useState(false);
  const header = (
    <>
      <ClubLogo club={clubs.find((c) => c.id === event.clubId)} height={36} />
      <View style={styles.eventText}>
        <Text style={styles.eventName}>{event.name}</Text>
        <Text style={styles.eventTrack}>
          {event.track} · {event.location}
        </Text>
      </View>
    </>
  );
  return (
    <View style={styles.wrap}>
      {!only ? (
        <Link href="/events" asChild>
          <Pressable style={styles.event}>
            {header}
            <Text style={styles.change}>Change</Text>
          </Pressable>
        </Link>
      ) : (
        <Pressable style={styles.event} onPress={() => setChoosing(!choosing)} disabled={only.length < 2}>
          {header}
          {only.length > 1 ? <Text style={styles.change}>{choosing ? 'Close' : 'Change'}</Text> : null}
        </Pressable>
      )}
      {only && choosing ? (
        <View style={styles.row}>
          {only.map((e) => (
            <Chip
              key={e.id}
              label={`${e.name} · ${shortDate(e.days[0]?.date ?? '')}`}
              selected={e.id === event.id}
              onPress={() => {
                selectEvent(e.id);
                setChoosing(false);
              }}
            />
          ))}
        </View>
      ) : null}
      <View style={styles.row}>
        {event.days.map((d) => (
          <Chip
            key={d.id}
            label={`${d.label} · ${shortDate(d.date)}`}
            selected={d.id === day.id}
            onPress={() => selectDay(d.id)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginBottom: 12 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eventText: { flex: 1 },
  eventName: { color: colors.text, fontSize: 20, fontWeight: '700' },
  eventTrack: { color: colors.muted, fontSize: 13, marginTop: 2 },
  change: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
