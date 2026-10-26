import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { shortDate } from '@/lib/dates';
import { useSchedule } from '@/lib/ScheduleStore';
import { supabase } from '@/lib/supabase';
import { colors } from './theme';

interface Signup {
  email: string;
  name: string;
  event_id: string | null;
  created_at: string;
}

/** Drivers who joined this club's list from the Now tab, with a spreadsheet download. */
export function SignupsAdmin({ clubId }: { clubId: string }) {
  const { events } = useSchedule();
  const [rows, setRows] = useState<Signup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('driver_signups')
      .select('email, name, event_id, created_at')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setRows(data);
  }, [clubId]);

  // Reload each time the Admin tab is shown, so new sign-ups appear without a refresh.
  useFocusEffect(
    useCallback(() => {
      setRows(null);
      setError(null);
      load();
    }, [load]),
  );

  const remove = async (email: string) => {
    await supabase?.from('driver_signups').delete().eq('club_id', clubId).eq('email', email);
    setRemoving(null);
    load();
  };

  const download = () => {
    if (!rows) return;
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [
      'Name,Email,Signed up at event,Date',
      ...rows.map((r) => [r.name, r.email, events.find((e) => e.id === r.event_id)?.name ?? '', r.created_at.slice(0, 10)].map(cell).join(',')),
    ].join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `${clubId}-driver-list.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (!supabase) return null;
  const shown = showAll ? rows : rows?.slice(0, 10);

  return (
    <View>
      <Text style={styles.sub}>Drivers who chose "Join the list" on the Now tab and agreed to be emailed.</Text>
      {error ? (
        <Text style={styles.sub}>Couldn't load the list: {error}</Text>
      ) : !rows ? (
        <Text style={styles.sub}>Loading…</Text>
      ) : !rows.length ? (
        <Text style={styles.sub}>Nobody has joined yet.</Text>
      ) : (
        <>
          <Text style={styles.summary}>
            {rows.length} {rows.length === 1 ? 'driver' : 'drivers'}
          </Text>
          {Platform.OS === 'web' ? (
            <Pressable onPress={download} style={styles.btn}>
              <Text style={styles.btnText}>Download spreadsheet (.csv)</Text>
            </Pressable>
          ) : null}
          {shown!.map((r) => (
            <View key={r.email} style={styles.row}>
              <View style={styles.grow}>
                <Text style={styles.name}>{r.name}</Text>
                <Text style={styles.detail}>
                  {r.email} · {shortDate(r.created_at.slice(0, 10))}
                </Text>
              </View>
              {removing === r.email ? (
                <Pressable onPress={() => remove(r.email)}>
                  <Text style={styles.danger}>Remove?</Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => setRemoving(r.email)}>
                  <Text style={styles.detail}>Remove</Text>
                </Pressable>
              )}
            </View>
          ))}
          {rows.length > 10 ? (
            <Pressable onPress={() => setShowAll(!showAll)}>
              <Text style={styles.link}>{showAll ? 'Show fewer' : `Show all ${rows.length}`}</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 24 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2, marginBottom: 10 },
  summary: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 10 },
  btn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 10 },
  btnText: { color: '#000', fontWeight: '700' },
  row: { backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  name: { color: colors.text, fontSize: 15, fontWeight: '600' },
  detail: { color: colors.muted, fontSize: 13 },
  danger: { color: '#FF6961', fontWeight: '700' },
  link: { color: colors.accent, fontWeight: '600', marginTop: 4 },
});
