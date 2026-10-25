import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { EventPicker } from '@/components/EventPicker';
import { LoadingOrError } from '@/components/LoadingOrError';
import { PreviewClock } from '@/components/PreviewClock';
import { colors, itemColors } from '@/components/theme';
import type { ScheduleItem } from '@/data/types';
import { coachingTimes } from '@/lib/coaching';
import { useSchedule } from '@/lib/ScheduleStore';
import { countdown, formatRange, formatTime, fromMinutes, getNowState, toMinutes } from '@/lib/schedule';

export default function NowScreen() {
  const { day, clock, hasEvents, coaching, myEmail } = useSchedule();
  if (!hasEvents) return <LoadingOrError status="live" />;
  const state = getNowState(day, clock.minuteOfDay);
  // The student's next coaching session today that hasn't finished yet.
  const myCoaching = coaching
    .filter((c) => c.dayId === day.id && c.studentEmail === myEmail)
    .map((c) => ({ session: c, ...coachingTimes(c, day) }))
    .filter((c) => toMinutes(c.end) > clock.minuteOfDay)
    .sort((a, b) => a.start.localeCompare(b.start))[0];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <EventPicker />
      <PreviewClock />
      {!clock.isPreview ? <Text style={styles.clock}>{formatTime(fromMinutes(clock.minuteOfDay))}</Text> : null}

      {myCoaching ? (
        <Card
          label="Your coaching session"
          title={myCoaching.session.coach ? `With ${myCoaching.session.coach}` : 'Coaching session'}
          time={formatRange(myCoaching)}
          subtitle={
            toMinutes(myCoaching.start) <= clock.minuteOfDay
              ? `Happening now · ends in ${countdown(clock.minuteOfDay, myCoaching.end, clock.seconds)}`
              : `Starts in ${countdown(clock.minuteOfDay, myCoaching.start, clock.seconds)}`
          }
          notes={myCoaching.session.notes}
          highlight
        />
      ) : null}

      {state.dayOver ? (
        <Card label="Day complete" title="That's a wrap" subtitle="See you next session!" />
      ) : state.onTrack ? (
        <Card
          label="On track now"
          item={state.onTrack}
          big
          subtitle={`Ends in ${countdown(clock.minuteOfDay, state.onTrack.end, clock.seconds)}`}
        />
      ) : (
        <Card label="On track now" title="Track is quiet" subtitle="Nothing on track right now" />
      )}

      {state.upNext ? (
        <Card
          label="Up next"
          item={state.upNext}
          subtitle={`Starts in ${countdown(clock.minuteOfDay, state.upNext.start, clock.seconds)}`}
        />
      ) : null}

      {state.offTrack.map((item) => (
        <Card key={item.id} label="Also happening" item={item} subtitle={`Until ${formatTime(item.end)}`} />
      ))}
    </ScrollView>
  );
}

interface CardProps {
  label: string;
  item?: ScheduleItem;
  title?: string;
  subtitle?: string;
  big?: boolean;
  /** Shown under the title when there is no schedule item to take times from. */
  time?: string;
  notes?: string;
  highlight?: boolean;
}

function Card({ label, item, title, subtitle, big, time, notes, highlight }: CardProps) {
  const bars = item ? itemColors(item) : [highlight ? colors.accent : colors.border];
  return (
    <View style={[styles.card, highlight && styles.cardHighlight]}>
      <View style={styles.cardBars}>
        {bars.map((c, i) => (
          <View key={i} style={[styles.cardBar, { backgroundColor: c }]} />
        ))}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardLabel}>{label.toUpperCase()}</Text>
        <Text style={[styles.cardTitle, big && styles.cardTitleBig]}>{item?.title ?? title}</Text>
        {item || time ? <Text style={styles.cardTime}>{item ? formatRange(item) : time}</Text> : null}
        {subtitle ? <Text style={[styles.cardSub, big && styles.cardSubBig]}>{subtitle}</Text> : null}
        {notes ? <Text style={styles.cardTime}>{notes}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 40 },
  clock: { color: colors.text, fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'], marginBottom: 8 },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 16,
    marginTop: 12,
    overflow: 'hidden',
  },
  cardHighlight: { borderWidth: 1, borderColor: colors.accent },
  cardBars: { flexDirection: 'row' },
  cardBar: { width: 10 },
  cardBody: { flex: 1, padding: 16 },
  cardLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  cardTitle: { color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 4 },
  cardTitleBig: { fontSize: 32 },
  cardTime: { color: colors.muted, fontSize: 15, marginTop: 4 },
  cardSub: { color: colors.accent, fontSize: 16, fontWeight: '600', marginTop: 8 },
  cardSubBig: { fontSize: 22, fontVariant: ['tabular-nums'] },
});
