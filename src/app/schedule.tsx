import { ScrollView, StyleSheet, Text } from 'react-native';

import { EventPicker } from '@/components/EventPicker';
import { ItemRow } from '@/components/ItemRow';
import { LoadingOrError } from '@/components/LoadingOrError';
import { PreviewClock } from '@/components/PreviewClock';
import { colors } from '@/components/theme';
import { isCoachOf, sessionsFor } from '@/lib/coaching';
import { useSchedule } from '@/lib/ScheduleStore';
import { sortItems, toMinutes } from '@/lib/schedule';

export default function ScheduleScreen() {
  const { day, clock, hasEvents, coaching, myEmail } = useSchedule();
  if (!hasEvents) return <LoadingOrError status="live" />;
  const now = clock.minuteOfDay;
  // Item id -> badge, for sessions this person takes ("YOUR COACHING") or gives ("YOU'RE COACHING").
  const badges = new Map(
    sessionsFor(coaching, myEmail)
      .filter((c) => c.dayId === day.id)
      .map((c) => [c.itemId, isCoachOf(c, myEmail) ? "YOU'RE COACHING" : 'YOUR COACHING']),
  );

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <EventPicker />
      <PreviewClock />
      <Text style={styles.hint}>Indented items happen off track, alongside the sessions.</Text>
      {sortItems(day.items).map((item) => {
        const status = toMinutes(item.end) <= now ? 'past' : toMinutes(item.start) <= now ? 'now' : 'future';
        return (
          <ItemRow
            key={item.id}
            item={item}
            status={status}
            right={badges.has(item.id) ? <Text style={styles.coaching}>{badges.get(item.id)}</Text> : undefined}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 40 },
  hint: { color: colors.muted, fontSize: 13, marginBottom: 10 },
  coaching: { color: colors.accent, fontWeight: '800', fontSize: 11, marginRight: 12 },
});
