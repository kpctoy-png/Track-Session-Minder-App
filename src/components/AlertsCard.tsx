import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getAlertsState, refreshAlerts, turnOffAlerts, turnOnAlerts, type AlertsState } from '@/lib/push';
import { useSchedule } from '@/lib/ScheduleStore';
import { colors } from './theme';

// Every card on screen re-checks when one of them turns alerts on or off, so the top and bottom cards agree.
const listeners = new Set<() => void>();
const alertsChanged = () => listeners.forEach((l) => l());

/**
 * Lets a driver get phone alerts when the selected event's schedule changes (web version only).
 * "top" asks to turn alerts on, near the top of the screen so it isn't missed, and hides once they're on.
 * "bottom" shows that alerts are on (with Turn off), or offers to move them to this event.
 * "booking" is the My Day reminder for drivers with a coaching session or check ride.
 */
export function AlertsCard({ placement }: { placement: 'top' | 'bottom' | 'booking' }) {
  const { events, event, session } = useSchedule();
  const email = session?.user.email ?? null;
  const [alerts, setAlerts] = useState<AlertsState>({ state: 'unsupported' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Check again each time the Now tab is shown, so the card appears as soon as alerts are set up.
  useFocusEffect(
    useCallback(() => {
      getAlertsState().then(setAlerts, () => {});
    }, []),
  );

  useEffect(() => {
    const recheck = () => getAlertsState().then(setAlerts, () => {});
    listeners.add(recheck);
    return () => {
      listeners.delete(recheck);
    };
  }, []);

  // Signing in or out on My Day: attach or drop the email, so booking alerts follow who is signed in.
  useEffect(() => {
    refreshAlerts().catch(() => {});
  }, [email]);

  const turnOn = async () => {
    setBusy(true);
    setProblem(null);
    setProblem(await turnOnAlerts(event.id));
    setBusy(false);
    alertsChanged();
  };

  const turnOff = async () => {
    setBusy(true);
    await turnOffAlerts();
    setBusy(false);
    alertsChanged();
  };

  if (alerts.state === 'unsupported' || !event.id) return null;
  const onHere = alerts.state === 'on' && alerts.eventId === event.id;
  // Alerts follow one event per phone; offer to move them here.
  const elsewhere = alerts.state === 'on' && !onHere ? (events.find((e) => e.id === alerts.eventId)?.name ?? 'another event') : null;
  // Booking reminders reach any phone with alerts on for this email, whichever event it follows.
  if (placement === 'booking' && alerts.state === 'on') return null;
  if (placement === 'top' && alerts.state === 'on') return null;
  if (placement === 'bottom' && alerts.state !== 'on') return null;

  if (placement === 'booking' && alerts.state === 'off')
    return (
      <View style={[styles.card, styles.urgent]}>
        <Text style={styles.urgentTitle}>🔔 Turn on alerts for your reminder</Text>
        <Text style={styles.text}>
          Get an alert 15 minutes before your coaching or check ride, and if its time changes. Alerts are off on this
          phone.
        </Text>
        <Pressable onPress={turnOn} disabled={busy} style={styles.btn}>
          <Text style={styles.btnText}>{busy ? 'Turning on…' : 'Turn on alerts'}</Text>
        </Pressable>
        {problem ? <Text style={styles.problem}>{problem}</Text> : null}
      </View>
    );

  return (
    <View style={[styles.card, placement !== 'bottom' && styles.urgent]}>
      {alerts.state === 'add-to-home-screen' ? (
        <Text style={styles.text}>
          🔔 Want an alert when the schedule changes? On iPhone, first add this app to your home screen (tap Share,
          then Add to Home Screen), then open it from there.
        </Text>
      ) : alerts.state === 'blocked' ? (
        <Text style={styles.text}>
          🔔 Alerts are blocked for this app. To get them, allow notifications for it in your phone's settings.
        </Text>
      ) : onHere ? (
        <View style={styles.row}>
          <Text style={[styles.text, styles.grow]}>
            🔔 Alerts are on: you'll get one when {event.name} changes
            {email ? ', and about your coaching and check rides' : ''}.
          </Text>
          <Pressable onPress={turnOff} disabled={busy}>
            <Text style={styles.link}>Turn off</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.text}>
            {elsewhere
              ? `🔔 Your alerts are for ${elsewhere}. Switch them to ${event.name}?`
              : `🔔 Get an alert on this phone when the ${event.name} schedule changes${email ? ', and about your coaching and check rides' : ''}.`}
          </Text>
          <Pressable onPress={turnOn} disabled={busy} style={styles.btn}>
            <Text style={styles.btnText}>{busy ? 'Turning on…' : elsewhere ? 'Switch alerts' : 'Turn on alerts'}</Text>
          </Pressable>
        </>
      )}
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginTop: 16, gap: 10 },
  urgent: { borderWidth: 2, borderColor: colors.accent, marginTop: 12, marginBottom: 4 },
  urgentTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  text: { color: colors.text, fontSize: 14 },
  link: { color: colors.accent, fontWeight: '600' },
  btn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  btnText: { color: '#000', fontWeight: '700' },
  problem: { color: '#FF6961', fontSize: 13 },
});
