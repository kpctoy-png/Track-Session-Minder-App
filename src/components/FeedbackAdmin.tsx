import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Feedback } from '@/data/types';
import { shortDate } from '@/lib/dates';
import { useSchedule } from '@/lib/ScheduleStore';
import { colors } from './theme';

/** Average rating and comments for one event, or for the app when eventId is null. */
export function FeedbackAdmin({ eventId, title }: { eventId: string | null; title: string }) {
  const { loadFeedback } = useSchedule();
  // The store rebuilds loadFeedback every second with the clock, so read the latest one through a ref.
  const load = useRef(loadFeedback);
  load.current = loadFeedback;
  const [entries, setEntries] = useState<Feedback[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reload each time the Admin tab is shown, so new feedback appears without a refresh.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setEntries(null);
      load.current(eventId).then(
        (rows) => !cancelled && setEntries(rows),
        (err: Error) => !cancelled && setError(err.message),
      );
      return () => {
        cancelled = true;
      };
    }, [eventId]),
  );

  const average = entries?.length ? entries.reduce((sum, f) => sum + f.rating, 0) / entries.length : 0;

  return (
    <View>
      <Text style={styles.heading}>{title}</Text>
      {error ? (
        <Text style={styles.sub}>Couldn't load feedback: {error}</Text>
      ) : !entries ? (
        <Text style={styles.sub}>Loading…</Text>
      ) : !entries.length ? (
        <Text style={styles.sub}>No feedback yet. Drivers leave it from the Me tab.</Text>
      ) : (
        <>
          <Text style={styles.summary}>
            <Text style={styles.stars}>{stars(Math.round(average))}</Text> {average.toFixed(1)} from {entries.length}{' '}
            {entries.length === 1 ? 'rating' : 'ratings'}
          </Text>
          {entries.map((f) => (
            <View key={f.id} style={styles.row}>
              <Text style={styles.rowTop}>
                <Text style={styles.stars}>{stars(f.rating)}</Text>  {f.name || f.email || 'Anonymous'} · {shortDate(f.createdAt.slice(0, 10))}
              </Text>
              {f.comment ? <Text style={styles.comment}>{f.comment}</Text> : null}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

const styles = StyleSheet.create({
  heading: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 24 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2, marginBottom: 10 },
  summary: { color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 4, marginBottom: 10 },
  stars: { color: colors.accent },
  row: { backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 6 },
  rowTop: { color: colors.muted, fontSize: 13 },
  comment: { color: colors.text, fontSize: 15, marginTop: 4 },
});
