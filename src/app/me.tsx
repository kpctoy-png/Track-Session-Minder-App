import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DriverGuide } from '@/components/DriverGuide';
import { EmailCodeSignIn } from '@/components/EmailCodeSignIn';
import { FeedbackForm } from '@/components/FeedbackForm';
import { colors } from '@/components/theme';
import { bookingName, coachingTimes, coachingTitle, isCoachOf, isEmail, sessionsFor } from '@/lib/coaching';
import { shortDate } from '@/lib/dates';
import { formatRange } from '@/lib/schedule';
import { useSchedule } from '@/lib/ScheduleStore';
import { supabase } from '@/lib/supabase';

export default function MeScreen() {
  const { events, coaching, myEmail, setPracticeEmail, selectEvent, selectDay } = useSchedule();
  const router = useRouter();
  // A link ending in /me?guide=1 (used in invite emails) opens the guide directly.
  const { guide } = useLocalSearchParams<{ guide?: string }>();
  const [givingFeedback, setGivingFeedback] = useState(false);
  const [readingGuide, setReadingGuide] = useState(guide === '1');

  if (givingFeedback) return <FeedbackForm onDone={() => setGivingFeedback(false)} />;
  if (readingGuide) {
    const closeGuide = () => {
      setReadingGuide(false);
      if (guide) router.setParams({ guide: undefined });
    };
    return <DriverGuide onDone={closeGuide} />;
  }
  const topButtons = (
    <>
      <Pressable onPress={() => setReadingGuide(true)} style={styles.feedback}>
        <Text style={styles.feedbackStars}>?</Text>
        <Text style={styles.feedbackText}>How to use the app</Text>
      </Pressable>
      <Pressable onPress={() => setGivingFeedback(true)} style={styles.feedback}>
        <Text style={styles.feedbackStars}>★★★★★</Text>
        <Text style={styles.feedbackText}>Rate an event or the app</Text>
      </Pressable>
    </>
  );
  if (supabase && !myEmail)
    return (
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {topButtons}
        <EmailCodeSignIn
          heading="Sign in"
          intro="See the coaching sessions and check rides booked for you. We'll email you a code, no password needed."
          emailHint="Enter the email you used to sign up for the event."
          idPrefix="me"
        />
      </ScrollView>
    );
  if (!supabase && !myEmail)
    return (
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {topButtons}
        <PracticeSignIn onSubmit={setPracticeEmail} />
      </ScrollView>
    );

  const mine = sessionsFor(coaching, myEmail)
    .flatMap((session) => {
      const event = events.find((e) => e.days.some((d) => d.id === session.dayId));
      const day = event?.days.find((d) => d.id === session.dayId);
      return event && day ? [{ session, event, day, ...coachingTimes(session, day) }] : [];
    })
    .sort((a, b) => (a.day.date + a.start).localeCompare(b.day.date + b.start));

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.signedIn}>
        <Text style={styles.signedInText}>Signed in as {myEmail}</Text>
        <Btn label="Sign out" onPress={() => (supabase ? supabase.auth.signOut() : setPracticeEmail(null))} />
      </View>
      {topButtons}

      <Text style={styles.heading}>Your coaching and check rides</Text>
      {mine.length ? (
        mine.map(({ session, event, day, start, end }) => (
          <Pressable
            key={session.id}
            style={styles.card}
            onPress={() => {
              selectEvent(event.id);
              selectDay(day.id);
              router.navigate('/');
            }}
          >
            <Text style={styles.cardLabel}>
              {event.name.toUpperCase()} · {day.label.toUpperCase()} {shortDate(day.date).toUpperCase()}
            </Text>
            <Text style={styles.cardTitle}>
              {isCoachOf(session, myEmail)
                ? coachingTitle(session, myEmail)
                : session.coach
                ? `${session.kind === 'checkride' ? 'Check ride' : 'Coaching'} with ${session.coach}`
                : bookingName(session.kind)}
            </Text>
            <Text style={styles.cardTime}>{formatRange({ start, end })}</Text>
            {session.notes ? <Text style={styles.cardNotes}>{session.notes}</Text> : null}
          </Pressable>
        ))
      ) : (
        <Text style={styles.sub}>
          Nothing booked yet. When an organizer books coaching or a check ride for {myEmail}, as student or coach, it shows up here and on the Now tab.
        </Text>
      )}
    </ScrollView>
  );
}

/** Without the database there's nothing to sign in to, so just pretend to be a student. */
function PracticeSignIn({ onSubmit }: { onSubmit: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const submit = () => isEmail(email) && onSubmit(email);
  return (
    <View>
      <Text style={styles.heading}>Sign in</Text>
      <Text style={styles.sub}>Practice mode: type any student's email to see the app as they would.</Text>
      <TextInput
        id="me-email"
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={submit}
      />
      <Btn label="Continue" onPress={submit} primary />
    </View>
  );
}

function Btn({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.btn, primary && styles.btnPrimary]}>
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 40 },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  feedbackStars: { color: colors.accent, fontSize: 16 },
  feedbackText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  heading: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 8 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2, marginBottom: 10 },
  signedIn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#10261A', borderRadius: 12, padding: 12, marginBottom: 12 },
  signedInText: { color: '#34C759', fontSize: 13, flex: 1 },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 16, marginBottom: 10 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginTop: 10, borderLeftWidth: 6, borderLeftColor: colors.accent },
  cardLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  cardTitle: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 4 },
  cardTime: { color: colors.accent, fontSize: 15, fontWeight: '600', marginTop: 4 },
  cardNotes: { color: colors.muted, fontSize: 14, marginTop: 6 },
  btn: { backgroundColor: colors.cardRaised, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnText: { color: colors.text, fontWeight: '600' },
  btnTextPrimary: { color: '#000' },
});
