import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/components/theme';
import type { TrackEvent } from '@/data/types';
import { dateRange, shortDate, todayISO } from '@/lib/dates';
import { useSchedule } from '@/lib/ScheduleStore';

const lastDay = (e: TrackEvent) => e.days[e.days.length - 1].date;

export default function EventsScreen() {
  const { events, event: selected, selectEvent } = useSchedule();
  const today = todayISO();
  const byDate = [...events].sort((a, b) => a.days[0].date.localeCompare(b.days[0].date));
  const upcoming = byDate.filter((e) => lastDay(e) >= today);
  const past = byDate.filter((e) => lastDay(e) < today).reverse();

  const open = (id: string) => {
    selectEvent(id);
    router.navigate('/schedule');
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.section}>UPCOMING</Text>
      {upcoming.length ? (
        upcoming.map((e) => (
          <EventCard key={e.id} event={e} today={today} selected={e.id === selected.id} onPress={() => open(e.id)} />
        ))
      ) : (
        <Text style={styles.empty}>No upcoming events yet.</Text>
      )}
      {past.length ? <Text style={[styles.section, styles.pastSection]}>PAST</Text> : null}
      {past.map((e) => (
        <EventCard key={e.id} event={e} today={today} selected={e.id === selected.id} onPress={() => open(e.id)} past />
      ))}
    </ScrollView>
  );
}

interface CardProps {
  event: TrackEvent;
  today: string;
  selected: boolean;
  past?: boolean;
  onPress: () => void;
}

function EventCard({ event, today, selected, past, onPress }: CardProps) {
  const first = event.days[0].date;
  const happening = first <= today && today <= lastDay(event);
  return (
    <Pressable onPress={onPress} style={[styles.card, selected && styles.cardSelected, past && styles.cardPast]}>
      <View style={styles.dateBlock}>
        <Text style={styles.month}>{shortDate(first).split(' ')[0].toUpperCase()}</Text>
        <Text style={styles.dayNum}>{Number(first.slice(8, 10))}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name}>{event.name}</Text>
          {happening ? <Text style={styles.live}>TODAY</Text> : null}
        </View>
        <Text style={styles.meta}>
          {event.track} · {event.location}
        </Text>
        <Text style={styles.meta}>
          {dateRange(first, lastDay(event))} · {event.days.map((d) => d.label.slice(0, 3)).join(', ')}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 40 },
  section: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  pastSection: { marginTop: 20 },
  empty: { color: colors.muted, fontSize: 15 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardSelected: { borderColor: colors.accent },
  cardPast: { opacity: 0.5 },
  dateBlock: { width: 48, alignItems: 'center', backgroundColor: colors.cardRaised, borderRadius: 10, paddingVertical: 6 },
  month: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  dayNum: { color: colors.text, fontSize: 22, fontWeight: '800' },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: colors.text, fontSize: 17, fontWeight: '700', flexShrink: 1 },
  live: { color: '#000', backgroundColor: colors.accent, fontSize: 11, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  meta: { color: colors.muted, fontSize: 13 },
  chevron: { color: colors.muted, fontSize: 26 },
});
