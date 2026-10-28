import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { COACHING_OFFER } from '@/lib/coaching';
import { todayISO } from '@/lib/dates';
import { useSchedule } from '@/lib/ScheduleStore';
import { supabase } from '@/lib/supabase';
import { colors } from './theme';

type Request = { id: string; note: string | null; status: 'open' | 'booked' | 'declined'; paid: boolean };

/**
 * My Day: a signed-in driver asks the organizers of the selected event for a coaching session, sees the price
 * first, and then sees whether it's waiting, booked or full.
 */
export function CoachingRequestCard({ email }: { email: string }) {
  const { event } = useSchedule();
  const [request, setRequest] = useState<Request | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setRequest(null);
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
  }, [event.id, email]);

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
        <Text style={styles.sub}>
          {request.status === 'booked'
            ? 'Booked. Your session shows above, and you got an email.'
            : request.paid
            ? "Accepted and paid. Your session will show here once it's scheduled."
            : "Requested. See us at registration. We'll check for an open spot before you pay."}
          {request.note ? `\nYour note: ${request.note}` : ''}
        </Text>
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
  problem: { color: '#FF6961', fontWeight: '600' },
});
