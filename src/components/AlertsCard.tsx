import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getAlertsState, turnOffAlerts, turnOnAlerts, type AlertsState } from '@/lib/push';
import { useSchedule } from '@/lib/ScheduleStore';
import { colors } from './theme';

/** Lets a driver get phone alerts when the selected event's schedule changes (web version only). */
export function AlertsCard() {
  const { events, event } = useSchedule();
  const [alerts, setAlerts] = useState<AlertsState>({ state: 'unsupported' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    getAlertsState().then(setAlerts, () => {});
  }, []);

  const turnOn = async () => {
    setBusy(true);
    setProblem(null);
    setProblem(await turnOnAlerts(event.id));
    setAlerts(await getAlertsState());
    setBusy(false);
  };

  const turnOff = async () => {
    setBusy(true);
    await turnOffAlerts();
    setAlerts(await getAlertsState());
    setBusy(false);
  };

  if (alerts.state === 'unsupported' || !event.id) return null;
  const onHere = alerts.state === 'on' && alerts.eventId === event.id;
  // Alerts follow one event per phone; offer to move them here.
  const elsewhere = alerts.state === 'on' && !onHere ? (events.find((e) => e.id === alerts.eventId)?.name ?? 'another event') : null;

  return (
    <View style={styles.card}>
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
          <Text style={[styles.text, styles.grow]}>🔔 Alerts are on: you'll get one when {event.name} changes.</Text>
          <Pressable onPress={turnOff} disabled={busy}>
            <Text style={styles.link}>Turn off</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.text}>
            {elsewhere
              ? `🔔 Your alerts are for ${elsewhere}. Switch them to ${event.name}?`
              : `🔔 Get an alert on this phone when the ${event.name} schedule changes.`}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  text: { color: colors.text, fontSize: 14 },
  link: { color: colors.accent, fontWeight: '600' },
  btn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  btnText: { color: '#000', fontWeight: '700' },
  problem: { color: '#FF6961', fontSize: 13 },
});
