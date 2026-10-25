import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RUN_GROUPS } from '@/data/runGroups';
import { colors } from './theme';

/** A short how-to for drivers, opened from the My Day tab. */
export function DriverGuide({ onDone }: { onDone: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>How to use the app</Text>
        <Pressable onPress={onDone}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>
      <Text style={styles.intro}>
        Track Session Minder shows your track day schedule live. When the organizers run late or change a session,
        your phone updates on its own within seconds.
      </Text>

      <Section title="Put it on your home screen">
        <Step>iPhone (Safari): tap Share, then Add to Home Screen.</Step>
        <Step>Android (Chrome): tap the ⋮ menu, then Add to Home screen (or Install app).</Step>
        <Body>It then opens like any other app. No download or account needed.</Body>
      </Section>

      <Section title="Pick your event">
        <Body>
          The event's name is at the top of every screen. Tap Change, or open the Events tab, and tap your weekend. On
          multi-day events, tap the day at the top (for example Friday or Saturday) to switch days.
        </Body>
      </Section>

      <Section title="Now tab: what's happening">
        <Step>The big card shows who's on track right now and how long is left.</Step>
        <Step>Up next shows the next group and a countdown, so you know when to head to grid.</Step>
        <Step>Also happening lists classroom sessions and breaks running alongside.</Step>
        <Body>Before the event day, the Now tab shows a preview of the day. Use the −15 / +15 buttons to step through it.</Body>
      </Section>

      <Section title="Schedule tab: the whole day">
        <Body>
          Every session in order. The current one is outlined and says NOW, and finished ones fade out. Indented items
          happen off track (classroom, meetings).
        </Body>
        <Text style={styles.subheading}>Run group colors</Text>
        {Object.values(RUN_GROUPS).map((g) => (
          <View key={g.name} style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: g.color }]} />
            <Text style={styles.legendText}>{g.name}</Text>
          </View>
        ))}
        <Body>Combined sessions show both colors. Meetings, lunch and parade laps have no color.</Body>
      </Section>

      <Section title="Coaching and check rides">
        <Body>
          If you've booked a coaching session or check ride, you'll get an email. To see it in the app, open the My Day tab,
          enter that same email, and type the code we email you (no password). Your booking then shows on Now with a
          countdown, on Schedule with a badge, and on My Day. If the day runs late, its time moves too.
        </Body>
      </Section>

      <Section title="Tell us how it went">
        <Body>On the My Day tab, tap Rate an event or the app to leave 1 to 5 stars and a comment. No sign-in needed.</Body>
      </Section>

      <Section title="If something looks off">
        <Step>Times look old: reload the page, or close and reopen the app.</Step>
        <Step>Can't see your coaching: check you signed in with the email the booking was made for.</Step>
        <Step>Didn't get a code: check your spam folder, then tap Use a different email or send a new code.</Step>
      </Section>

      <Pressable onPress={onDone} style={styles.button}>
        <Text style={styles.buttonText}>Got it</Text>
      </Pressable>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {children}
    </View>
  );
}

const Body = ({ children }: { children: ReactNode }) => <Text style={styles.body}>{children}</Text>;

const Step = ({ children }: { children: ReactNode }) => (
  <View style={styles.step}>
    <Text style={styles.bullet}>•</Text>
    <Text style={[styles.body, styles.stepText]}>{children}</Text>
  </View>
);

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  done: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  intro: { color: colors.muted, fontSize: 15, marginTop: 8, lineHeight: 21 },
  section: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginTop: 14 },
  heading: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 6 },
  subheading: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  body: { color: colors.text, fontSize: 15, lineHeight: 21, marginBottom: 4 },
  step: { flexDirection: 'row', gap: 8 },
  bullet: { color: colors.accent, fontSize: 15, lineHeight: 21 },
  stepText: { flex: 1 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  swatch: { width: 18, height: 18, borderRadius: 4 },
  legendText: { color: colors.text, fontSize: 15 },
  button: { backgroundColor: colors.accent, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 18 },
  buttonText: { color: '#000', fontSize: 16, fontWeight: '700' },
});
