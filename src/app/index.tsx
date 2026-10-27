import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import { AlertsCard } from '@/components/AlertsCard';
import { ClubLogo, hasClubLogo } from '@/components/ClubLogo';
import { JoinListCard } from '@/components/JoinListCard';
import { EventPicker } from '@/components/EventPicker';
import { FirstSessionNote } from '@/components/FirstSessionNote';
import { LoadingOrError } from '@/components/LoadingOrError';
import { PreviewClock } from '@/components/PreviewClock';
import { ItemTitle } from '@/components/ItemTitle';
import { colors, itemColors } from '@/components/theme';
import type { Club, ScheduleItem } from '@/data/types';
import { bookingName, coachingTimes, coachingTitle, sessionsFor } from '@/lib/coaching';
import { daysBetween, shortDate, todayISO } from '@/lib/dates';
import { useSchedule } from '@/lib/ScheduleStore';
import { countdown, firstSessionNote, formatRange, formatTime, fromMinutes, getNowState, sortItems, toMinutes } from '@/lib/schedule';

export default function NowScreen() {
  const { clubs, events, event, day, clock, hasEvents, coaching, myEmail, selectEvent, selectDay } = useSchedule();
  // On days without an event, the live cards would describe another day; they only show when asked for.
  const [previewing, setPreviewing] = useState(false);
  if (!hasEvents) return <LoadingOrError status="live" />;
  const showLive = !clock.isPreview || previewing;
  const state = getNowState(day, clock.minuteOfDay);
  const mine = sessionsFor(coaching, myEmail);
  // The student's coaching on the day shown. On the day itself, finished sessions drop off; in a preview,
  // every session that day stays, since the preview clock is only a stand-in.
  const myCoaching = mine
    .filter((c) => c.dayId === day.id)
    .map((c) => ({ session: c, ...coachingTimes(c, day) }))
    .filter((c) => clock.isPreview || toMinutes(c.end) > clock.minuteOfDay)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  // Otherwise point to their next coaching on another day, so it isn't hidden behind the day picker.
  // Sessions that already ended today don't count, so a finished check ride isn't shown as "next".
  const now = new Date();
  const today = todayISO(now);
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const nextElsewhere = myCoaching
    ? undefined
    : mine
        .flatMap((c) => {
          const event = events.find((e) => e.days.some((d) => d.id === c.dayId));
          const other = event?.days.find((d) => d.id === c.dayId);
          if (!event || !other || other.date < today) return [];
          const times = coachingTimes(c, other);
          return other.date > today || toMinutes(times.end) > nowMinute ? [{ session: c, event, day: other, ...times }] : [];
        })
        .sort((a, b) => (a.day.date + a.start).localeCompare(b.day.date + b.start))[0];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <AnnouncementBanner />
      <EventPicker />
      {showLive ? <PreviewClock /> : null}
      {clock.isPreview && previewing ? (
        <Pressable onPress={() => setPreviewing(false)}>
          <Text style={styles.link}>Done previewing</Text>
        </Pressable>
      ) : null}
      {!clock.isPreview ? <Text style={styles.clock}>{formatTime(fromMinutes(clock.minuteOfDay))}</Text> : null}
      <AlertsCard placement="top" />

      {myCoaching ? (
        <Card
          label={`Your ${bookingName(myCoaching.session.kind).toLowerCase()}`}
          title={coachingTitle(myCoaching.session, myEmail)}
          time={formatRange(myCoaching)}
          subtitle={
            toMinutes(myCoaching.end) <= clock.minuteOfDay
              ? `Booked for ${day.label}, ${shortDate(day.date)}`
              : toMinutes(myCoaching.start) <= clock.minuteOfDay
              ? `Happening now · ends in ${countdown(clock.minuteOfDay, myCoaching.end, clock.seconds)}`
              : `Starts in ${countdown(clock.minuteOfDay, myCoaching.start, clock.seconds)}`
          }
          notes={myCoaching.session.notes}
          highlight
        />
      ) : nextElsewhere ? (
        <Pressable
          onPress={() => {
            selectEvent(nextElsewhere.event.id);
            selectDay(nextElsewhere.day.id);
          }}
        >
          <Card
            label={`Your next ${bookingName(nextElsewhere.session.kind).toLowerCase()}`}
            title={coachingTitle(nextElsewhere.session, myEmail)}
            time={`${nextElsewhere.event.name} · ${nextElsewhere.day.label} ${shortDate(nextElsewhere.day.date)} · ${formatTime(nextElsewhere.start)}`}
            subtitle="Tap to see that day"
            highlight
          />
        </Pressable>
      ) : null}

      {!showLive ? (
        <DayAhead
          eventName={event.name}
          club={clubs.find((c) => c.id === event.clubId)}
          dayLabel={day.label}
          date={day.date}
          items={day.items}
          onPreview={() => setPreviewing(true)}
        />
      ) : state.dayOver ? (
        <Card label="Day complete" title="That's a wrap" subtitle="See you next session!" />
      ) : state.onTrack ? (
        <Card
          label="On track now"
          item={state.onTrack}
          big
          note={firstSessionNote(event.clubId, day.items, state.onTrack)}
          subtitle={`Ends in ${countdown(clock.minuteOfDay, state.onTrack.end, clock.seconds)}`}
        />
      ) : (
        <Card label="On track now" title="Track is quiet" subtitle="Nothing on track right now" />
      )}

      {showLive && state.upNext ? (
        <Card
          label="Up next"
          item={state.upNext}
          note={firstSessionNote(event.clubId, day.items, state.upNext)}
          subtitle={`Starts in ${countdown(clock.minuteOfDay, state.upNext.start, clock.seconds)}`}
        />
      ) : null}

      {(showLive ? state.offTrack : []).map((item) => (
        <Card key={item.id} label="Also happening" item={item} subtitle={`Until ${formatTime(item.end)}`} />
      ))}

      <AlertsCard placement="bottom" />
      <JoinListCard />
    </ScrollView>
  );
}

/** Shown instead of the live cards when the selected day isn't today. */
function DayAhead(props: { eventName: string; club?: Club; dayLabel: string; date: string; items: ScheduleItem[]; onPreview: () => void }) {
  const days = daysBetween(todayISO(), props.date);
  const first = sortItems(props.items)[0];
  const when = days === 1 ? 'Tomorrow' : days > 1 ? `In ${days} days` : 'This day has passed';
  return (
    <>
      <Card
        label={days > 0 ? 'Next event' : 'Past event'}
        title={props.eventName}
        time={`${props.dayLabel}, ${shortDate(props.date)}${first ? ` · starts ${formatTime(first.start)} with ${first.title}` : ''}`}
        subtitle={when}
        highlight={days > 0}
      />
      {props.club ? (
        <View style={styles.host}>
          {hasClubLogo(props.club) ? <ClubLogo club={props.club} height={40} /> : null}
          <View>
            <Text style={styles.hostLabel}>Hosted by</Text>
            <Text style={styles.hostName}>{props.club.name}</Text>
          </View>
        </View>
      ) : null}
      {props.items.length ? (
        <Pressable onPress={props.onPreview} style={styles.previewBtn}>
          <Text style={styles.previewBtnText}>Preview the day</Text>
          <Text style={styles.previewBtnSub}>See what this screen will show on the day, at any time</Text>
        </Pressable>
      ) : null}
    </>
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
  /** The club's note for a run group's first session of the day. */
  note?: string;
}

function Card({ label, item, title, subtitle, big, time, notes, highlight, note }: CardProps) {
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
        {item ? (
          <ItemTitle item={item} style={[styles.cardTitle, big && styles.cardTitleBig]} size={big ? 32 : 22} />
        ) : (
          <Text style={[styles.cardTitle, big && styles.cardTitleBig]}>{title}</Text>
        )}
        {item || time ? <Text style={styles.cardTime}>{item ? formatRange(item) : time}</Text> : null}
        {note ? <FirstSessionNote text={note} big={big} /> : null}
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
  link: { color: colors.accent, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  host: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 12, padding: 10, marginTop: 8 },
  hostLabel: { color: colors.muted, fontSize: 12 },
  hostName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  previewBtn: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  previewBtnText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  previewBtnSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
