import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { rosterFromCsv, type RosterRow } from '@/lib/roster';
import { supabase } from '@/lib/supabase';
import { colors } from './theme';

/**
 * The event's registered drivers, uploaded from the registration site's participant list (CSV), so
 * announcements can also be emailed to everyone at the event. Uploading replaces the list.
 */
export function RosterAdmin({ eventId, eventName, onChange }: { eventId: string; eventName: string; onChange: () => void }) {
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ file: string; rows: RosterRow[] } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('event_roster').select('name, email').eq('event_id', eventId).order('name');
    if (error) setError(error.message);
    else setRows(data.map((r) => ({ name: r.name, email: r.email ?? '' })));
  }, [eventId]);

  useEffect(() => {
    setRows(null);
    setError(null);
    setUpload(null);
    setRemoving(false);
    load();
  }, [load]);

  const pick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv,text/plain';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const { rows, problem } = rosterFromCsv(await file.text());
      setError(problem ?? null);
      setUpload(problem ? null : { file: file.name, rows });
    };
    input.click();
  };

  const save = async () => {
    if (!supabase || !upload) return;
    setBusy(true);
    const del = await supabase.from('event_roster').delete().eq('event_id', eventId);
    const ins = del.error
      ? del
      : await supabase.from('event_roster').insert(upload.rows.map((r) => ({ event_id: eventId, name: r.name, email: r.email })));
    setBusy(false);
    if (ins.error) return setError(`Not saved: ${ins.error.message}`);
    setUpload(null);
    load();
    onChange();
  };

  const removeAll = async () => {
    await supabase?.from('event_roster').delete().eq('event_id', eventId);
    setRemoving(false);
    load();
    onChange();
  };

  if (!supabase) return null;
  const shown = showAll ? rows : rows?.slice(0, 10);

  return (
    <View>
      <Text style={styles.sub}>
        Upload the participant list from your registration site (for example ClubReg) so announcements can be emailed
        to everyone at {eventName}, including drivers who haven't opened the app. Save it as CSV first. Only
        organizers see this list, and it's deleted a week after the event.
      </Text>
      {Platform.OS === 'web' ? (
        <Pressable onPress={pick} style={styles.btn}>
          <Text style={styles.btnText}>{rows?.length ? 'Upload a new list (.csv)' : 'Upload participant list (.csv)'}</Text>
        </Pressable>
      ) : null}
      {upload ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>
            Found {upload.rows.length} {upload.rows.length === 1 ? 'driver' : 'drivers'} with an email in {upload.file}.
            {rows?.length ? ` This replaces the ${rows.length} already on the list.` : ''} Save the list for {eventName}?
          </Text>
          <View style={styles.buttons}>
            <Pressable onPress={() => !busy && save()} style={[styles.small, styles.primary]}>
              <Text style={styles.btnText}>{busy ? 'Saving…' : 'Save list'}</Text>
            </Pressable>
            <Pressable onPress={() => setUpload(null)} style={styles.small}>
              <Text style={styles.smallText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {error ? <Text style={styles.danger}>{error}</Text> : null}
      {!rows ? (
        <Text style={styles.sub}>Loading…</Text>
      ) : !rows.length ? (
        <Text style={styles.sub}>No list uploaded for this event yet.</Text>
      ) : (
        <>
          <View style={styles.summaryRow}>
            <Text style={styles.summary}>
              {rows.length} registered {rows.length === 1 ? 'driver' : 'drivers'}
            </Text>
            {removing ? (
              <Pressable onPress={removeAll}>
                <Text style={styles.danger}>Delete the whole list?</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => setRemoving(true)}>
                <Text style={styles.detail}>Delete list</Text>
              </Pressable>
            )}
          </View>
          {shown!.map((r) => (
            <View key={r.email} style={styles.row}>
              <Text style={styles.name}>{r.name || r.email}</Text>
              {r.name ? <Text style={styles.detail}>{r.email}</Text> : null}
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
  sub: { color: colors.muted, fontSize: 13, marginTop: 2, marginBottom: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  summary: { color: colors.text, fontSize: 16, fontWeight: '600' },
  btn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 10 },
  btnText: { color: '#000', fontWeight: '700' },
  confirm: { borderWidth: 2, borderColor: colors.accent, borderRadius: 12, padding: 12, marginBottom: 10, gap: 10 },
  confirmText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  buttons: { flexDirection: 'row', gap: 8 },
  small: { backgroundColor: colors.cardRaised, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  smallText: { color: colors.text, fontWeight: '600' },
  row: { backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 6 },
  name: { color: colors.text, fontSize: 15, fontWeight: '600' },
  detail: { color: colors.muted, fontSize: 13 },
  danger: { color: '#FF6961', fontWeight: '700', marginBottom: 8 },
  link: { color: colors.accent, fontWeight: '600', marginTop: 4 },
});
