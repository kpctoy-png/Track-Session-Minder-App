import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';

export const CONTACT_EMAIL = 'tracksessionminder@gmail.com';
const UPDATED = 'October 27, 2026';

/** What the app collects and why, in plain words. Opened from My Day, the driver guide, or /privacy. */
export function PrivacyPolicy({ onDone }: { onDone: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Privacy</Text>
        <Pressable onPress={onDone}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>
      <Text style={styles.intro}>
        Track Session Minder is made by Redline Techniques LLC. Track day clubs use it to share their schedules with
        drivers. We collect as little as we can, only to run the app, and we never sell it. Last updated {UPDATED}.
      </Text>

      <Section title="Just looking at the schedule">
        <Body>No account and no personal information. Anyone can open the app and see an event's schedule.</Body>
      </Section>

      <Section title="What we collect, and only if you use it">
        <Step>Your email, when you sign in on My Day or as an organizer, so we can email you a sign-in code.</Step>
        <Step>
          Coaching and check ride bookings: the student's email, the instructor's name and email, the time and any
          note. The club's organizers enter these.
        </Step>
        <Step>
          The club's driver list: your name and email, only if you fill in “Stay in the loop” and tick the box.
        </Step>
        <Step>
          Registered drivers: your name, email and cell number from the event's registration site (for example ClubReg),
          uploaded by the club's organizers so they can text or email you urgent announcements during that event.
        </Step>
        <Step>Feedback: your star rating, comment, and the name you choose to give.</Step>
        <Step>
          Phone alerts: if you turn them on, the alert address your phone's browser gives us, the event you follow, and
          your email if you're signed in, so booking alerts reach you.
        </Step>
        <Step>On your phone only: your sign-in, the event you picked, and a few display settings.</Step>
      </Section>

      <Section title="How it's used">
        <Body>
          To show you the schedule and your bookings, send sign-in codes, booking emails, alerts and 15-minute
          reminders. A club uses its own driver list to email you about its events, and its registered drivers list only to text or email
          urgent announcements (lightning, a red flag) during that event.
        </Body>
        <Body>No ads, no tracking or analytics, and we don't sell or rent your information to anyone.</Body>
      </Section>

      <Section title="Who can see it">
        <Step>Your bookings: you, your instructor, that club's organizers, and Redline Techniques.</Step>
        <Step>
          A club's driver list, registered drivers and feedback: that club's organizers and Redline Techniques.
        </Step>
        <Body>
          We rely on a few services to run the app: Supabase stores the data and handles sign-in, Google (Gmail)
          sends our emails, GitHub hosts the app, and your phone's maker (Apple, Google or Mozilla) delivers alerts.
          They only handle your information to provide those services.
        </Body>
      </Section>

      <Section title="How long we keep it">
        <Step>Bookings and feedback about an event are deleted when the club deletes the event.</Step>
        <Step>An event's registered drivers list is deleted a week after the event.</Step>
        <Step>Phone alerts stop and are deleted when you tap Turn off or your browser drops them.</Step>
        <Step>Your sign-in email and the driver list stay until you ask us or the club to remove them.</Step>
      </Section>

      <Section title="Your choices">
        <Step>Turn alerts off anytime on the Now tab, or sign out on My Day.</Step>
        <Step>
          Email {CONTACT_EMAIL} to see, correct or delete your information, or to be taken off a club's list. We'll
          reply within 30 days.
        </Step>
        <Body>
          The app is meant for adult drivers and isn't aimed at children under 13. If this policy changes, we'll update
          this page and the date above.
        </Body>
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
  page: { padding: 16, paddingTop: 24, paddingBottom: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  done: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  intro: { color: colors.muted, fontSize: 15, marginTop: 8, lineHeight: 21 },
  section: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginTop: 14 },
  heading: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 6 },
  body: { color: colors.text, fontSize: 15, lineHeight: 21, marginBottom: 4 },
  step: { flexDirection: 'row', gap: 8 },
  bullet: { color: colors.accent, fontSize: 15, lineHeight: 21 },
  stepText: { flex: 1 },
  button: { backgroundColor: colors.accent, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 18 },
  buttonText: { color: '#000', fontSize: 16, fontWeight: '700' },
});
