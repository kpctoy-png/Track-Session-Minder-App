import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { isEmail } from '@/lib/coaching';
import { useSchedule } from '@/lib/ScheduleStore';
import { supabase } from '@/lib/supabase';
import { colors } from './theme';

type Organizer = { email: string; club_id: string };

/** Redline admins add and remove club organizers by email. Organizers then sign in on Admin with an emailed code. */
export function ManageOrganizers() {
  const { clubs } = useSchedule();
  const [organizers, setOrganizers] = useState<Organizer[] | null>(null);
  const [email, setEmail] = useState('');
  const [clubId, setClubId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const club = clubId ?? (clubs.length === 1 ? clubs[0].id : null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('club_organizers').select('email, club_id').order('email');
    if (error) setError(`Couldn't load organizers: ${error.message}. If this is new, run the latest setup.sql in Supabase.`);
    else setOrganizers(data as Organizer[]);
  }, []);

  // Reload each time the Admin tab is shown.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const add = async () => {
    if (!supabase) return;
    const address = email.trim().toLowerCase();
    if (!isEmail(address)) return setError('Enter the organizer’s email address.');
    if (!club) return setError('Pick the club they organize.');
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('club_organizers').insert({ email: address, club_id: club });
    setBusy(false);
    if (error) {
      return setError(error.code === '23505' ? `${address} is already an organizer for that club.` : `Couldn't add them: ${error.message}`);
    }
    setEmail('');
    load();
  };

  const remove = async (o: Organizer) => {
    if (!supabase) return;
    setError(null);
    const { error } = await supabase.from('club_organizers').delete().eq('email', o.email).eq('club_id', o.club_id);
    if (error) setError(`Couldn't remove them: ${error.message}`);
    else load();
  };

  const clubName = (id: string) => clubs.find((c) => c.id === id)?.name ?? id;

  return (
    <View>
      <Text style={styles.heading}>Manage organizers</Text>
      <Text style={styles.sub}>
        Organizers can change their club's events. Add their email here, then send them the admin link. They sign in
        with a code we email them, no password needed.
      </Text>
      {organizers?.length ? (
        organizers.map((o) => (
          <View key={`${o.email}-${o.club_id}`} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.email}>{o.email}</Text>
              <Text style={styles.club}>{clubName(o.club_id)}</Text>
            </View>
            <Pressable onPress={() => remove(o)} style={styles.btn}>
              <Text style={styles.btnText}>Remove</Text>
            </Pressable>
          </View>
        ))
      ) : organizers ? (
        <Text style={styles.sub}>No organizers added here yet.</Text>
      ) : null}
      <TextInput
        id="organizer-email"
        style={styles.input}
        placeholder="Organizer's email"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={add}
      />
      {clubs.length > 1 ? (
        <View style={styles.chips}>
          {clubs.map((c) => (
            <Pressable key={c.id} onPress={() => setClubId(c.id)} style={[styles.chip, club === c.id && styles.chipOn]}>
              <Text style={[styles.chipText, club === c.id && styles.chipTextOn]}>{c.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={add} style={[styles.btn, styles.btnPrimary]}>
        <Text style={[styles.btnText, styles.btnTextPrimary]}>{busy ? 'Adding…' : 'Add organizer'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 24 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 8 },
  rowText: { flex: 1 },
  email: { color: colors.text, fontSize: 15, fontWeight: '600' },
  club: { color: colors.muted, fontSize: 13, marginTop: 2 },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 16, marginTop: 6, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: { borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 13 },
  chipTextOn: { color: '#000', fontWeight: '700' },
  error: { color: '#FF6961', fontSize: 13, marginBottom: 8 },
  btn: { backgroundColor: colors.cardRaised, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnText: { color: colors.text, fontWeight: '600' },
  btnTextPrimary: { color: '#000' },
});
