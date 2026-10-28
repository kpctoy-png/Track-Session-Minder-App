import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { COACHING_OFFER, coachingTimes } from '@/lib/coaching';
import { shortDate, todayISO } from '@/lib/dates';
import { formatRange } from '@/lib/schedule';
import { useSchedule } from '@/lib/ScheduleStore';
import { supabase } from '@/lib/supabase';
import { colors } from './theme';

type Request = { id: string; note: string | null; status: 'open' | 'booked' | 'declined'; paid: boolean };

/**
 * My Day: a signed-in driver asks the organizers of the selected event for a coaching session, sees the price
 * first, and then sees whether it's waiting, booked or full.
 */
export function CoachingRequestCard({ email }: { email: string }) {
  const { event, coaching } = useSchedule();
  // A booking for this driver arrives live; it's the moment their request turns booked, so look again then.
  const eventDays = new Set(event.days.map((d) => d.id));
  const mine = coaching
    .filter((c) => c.studentEmail === email && c.kind !== 'checkride' && eventDays.has(c.dayId))
    .map((c) => {
      const day = event.days.find((d) => d.id === c.dayId)!;
      return { session: c, day, ...coachingTimes(c, day) };
    })
    .sort((a, b) => (a.day.date + a.start).localeCompare(b.day.date + b.start));
  const myBookings = mine.length;
  const [request, setRequest] = useState<Request | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setAsking(false);
    setProblem(null);
    supabase
      ?.from('coaching_requests')
      .select('id, note, status, paid')
      .eq('event_id', event.id)
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => setRequest((data?.[0] as Request | undefined) ?? null));
  }, [event.id, email, myBookings]);

  const last = event.days.map((d) => d.date).sort().pop();
  if (!supabase || !last || last < todayISO(new Date())) return null;
  const offer = COACHING_OFFER[event.clubId];
  const terms = `Coaching is ${offer ? offer.price : 'paid per session'}, subject to availability.${offer ? ` ${offer.pay}` : ''}`;

  const send = async () => {
    setBusy(true);
    const { data, error } = await supabase!
      .from('coaching_requests')
      .insert({ event_id: event.id, email, note: note.trim() || null })
      .select('id, note, status, paid')
      .single();
    setBusy(false);
    if (error) return setProblem(`Not sent: ${error.message}`);
    setRequest(data as Request);
    setAsking(false);
    setNote('');
  };

  const withdraw = async () => {
    if (!request) return;
    const { error } = await supabase!.from('coaching_requests').delete().eq('id', request.id);
    if (error) return setProblem(error.message);
    setRequest(null);
  };

  if (request && request.status !== 'declined' && !asking)
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Coaching at {event.name}</Text>
        {/* Accepted and then a session booked counts as booked, even before the request itself is marked. */}
        <Text style={styles.sub}>
          {request.status === 'booked' || (request.paid && myBookings > 0)
            ? `Confirmed. You're booked for ${myBookings === 1 ? 'this session' : 'these sessions'}:`
            : request.paid
            ? "Accepted and paid. Your session and time will show here once it's scheduled."
            : "Requested. See us at registration. We'll check for an open spot before you pay."}
          {request.note && !myBookings ? `\nYour note: ${request.note}` : ''}
        </Text>
        {request.paid || request.status === 'booked'
          ? mine.map(({ session, day, start, end }) => (
              <View key={session.id} style={styles.booked}>
                <Text style={styles.bookedDay}>
                  {day.label} {shortDate(day.date)}
                </Text>
                <Text style={styles.bookedTime}>{formatRange({ start, end })}</Text>
                {day.items.find((i) => i.id === session.itemId)?.title ? (
                  <Text style={styles.bookedItem}>{day.items.find((i) => i.id === session.itemId)!.title}</Text>
                ) : null}
                <Text style={styles.sub}>{[session.coach ? `Coach: ${session.coach}` : null, session.notes].filter(Boolean).join(' · ')}</Text>
              </View>
            ))
          : null}
        {request.status === 'open' && !request.paid ? (
          <Pressable onPress={withdraw}>
            <Text style={styles.link}>Withdraw request</Text>
          </Pressable>
        ) : null}
        {problem ? <Text style={styles.problem}>{problem}</Text> : null}
      </View>
    );

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Want a coach at {event.name}?</Text>
      {request?.status === 'declined' ? <Text style={styles.sub}>Your last request couldn't be booked: coaching was full.</Text> : null}
      {asking ? (
        <>
          <Text style={styles.terms}>{terms}</Text>
          <Text style={styles.sub}>Requested sessions are not always available.</Text>
          <TextInput
            id="coaching-request-note"
            style={styles.input}
            placeholder="Please add your requested session here (optional)"
            placeholderTextColor={colors.muted}
            maxLength={200}
            value={note}
            onChangeText={setNote}
          />
          <View style={styles.buttons}>
            <Pressable onPress={() => !busy && send()} style={[styles.btn, styles.primary]}>
              <Text style={styles.primaryText}>{busy ? 'Sending…' : 'Send request'}</Text>
            </Pressable>
            <Pressable onPress={() => setAsking(false)} style={styles.btn}>
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.sub}>{terms}</Text>
          <Pressable onPress={() => setAsking(true)} style={[styles.btn, styles.primary, styles.start]}>
            <Text style={styles.primaryText}>Request coaching</Text>
          </Pressable>
        </>
      )}
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginTop: 12, gap: 8, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 13 },
  terms: { color: colors.text, fontSize: 15, fontWeight: '600' },
  input: { backgroundColor: colors.cardRaised, color: colors.text, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 16 },
  buttons: { flexDirection: 'row', gap: 8 },
  btn: { backgroundColor: colors.cardRaised, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
  start: { alignSelf: 'flex-start' },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  primaryText: { color: '#000', fontWeight: '700' },
  btnText: { color: colors.text, fontWeight: '600' },
  link: { color: colors.accent, fontWeight: '600' },
  booked: { borderLeftWidth: 4, borderLeftColor: colors.accent, paddingLeft: 10, gap: 2 },
  bookedDay: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  bookedTime: { color: colors.accent, fontSize: 18, fontWeight: '700' },
  bookedItem: { color: colors.text, fontSize: 15, fontWeight: '600' },
  problem: { color: '#FF6961', fontWeight: '600' },
});
