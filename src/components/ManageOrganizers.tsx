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
  const [removing, setRemoving] = useState<string | null>(null);
  const club = clubId ?? (clubs.length === 1 ? clubs[0].id : null);
  const [clubForm, setClubForm] = useState<{ name: string; website: string; logo: string } | null>(null);
  const [clubError, setClubError] = useState<string | null>(null);

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

  const addClub = async () => {
    if (!supabase || !clubForm) return;
    const name = clubForm.name.trim();
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const link = (raw: string) => (raw.trim() && !/^https?:\/\//i.test(raw.trim()) ? `https://${raw.trim()}` : raw.trim()) || null;
    if (!id) return setClubError('Enter the organization’s name.');
    if (clubs.some((c) => c.id === id || c.name.toLowerCase() === name.toLowerCase())) return setClubError(`${name} is already here.`);
    setBusy(true);
    setClubError(null);
    const { error } = await supabase.from('clubs').insert({ id, name, website: link(clubForm.website), logo_url: link(clubForm.logo) });
    setBusy(false);
    if (error) return setClubError(`Couldn't add it: ${error.message}`);
    setClubForm(null);
    setClubId(id);
  };

  const clubName = (id: string) => clubs.find((c) => c.id === id)?.name ?? id;

  const closeClubForm = () => {
    setClubForm(null);
    setClubError(null);
  };

  return (
    <View>
      <Text style={styles.label}>Organizations</Text>
      <Text style={styles.sub}>
        Each organization only sees and changes its own events, driver lists, coaching and sign-ups. Only Redline sees
        them all.
      </Text>
      <View style={styles.chips}>
        {clubs.map((c) => (
          <View key={c.id} style={styles.chip}>
            <Text style={styles.chipText}>{c.name}</Text>
          </View>
        ))}
      </View>
      {clubForm ? (
        <View>
          <TextInput
            id="club-name"
            style={styles.input}
            placeholder="Organization name"
            placeholderTextColor={colors.muted}
            autoCapitalize="words"
            value={clubForm.name}
            onChangeText={(name) => setClubForm({ ...clubForm, name })}
          />
          <TextInput
            id="club-website"
            style={styles.input}
            placeholder="Website (optional)"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="url"
            value={clubForm.website}
            onChangeText={(website) => setClubForm({ ...clubForm, website })}
          />
          <TextInput
            id="club-logo"
            style={styles.input}
            placeholder="Logo image link (optional, otherwise the name shows)"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="url"
            value={clubForm.logo}
            onChangeText={(logo) => setClubForm({ ...clubForm, logo })}
          />
          {clubError ? <Text style={styles.error}>{clubError}</Text> : null}
          <View style={styles.btnRow}>
            <Pressable onPress={addClub} style={[styles.btn, styles.btnPrimary]}>
              <Text style={[styles.btnText, styles.btnTextPrimary]}>{busy ? 'Adding…' : 'Add organization'}</Text>
            </Pressable>
            <Pressable onPress={closeClubForm} style={styles.btn}>
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setClubForm({ name: '', website: '', logo: '' })} style={[styles.btn, styles.btnAlone]}>
          <Text style={styles.btnText}>+ Add organization</Text>
        </Pressable>
      )}
      <Text style={[styles.label, styles.labelGap]}>Organizers</Text>
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
            {removing === `${o.email}-${o.club_id}` ? (
              <>
                <Pressable
                  onPress={() => {
                    setRemoving(null);
                    remove(o);
                  }}
                  style={[styles.btn, styles.btnDanger]}
                >
                  <Text style={styles.btnText}>Remove access</Text>
                </Pressable>
                <Pressable onPress={() => setRemoving(null)} style={styles.btn}>
                  <Text style={styles.btnText}>Keep</Text>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={() => setRemoving(`${o.email}-${o.club_id}`)} style={styles.btn}>
                <Text style={styles.btnText}>Remove</Text>
              </Pressable>
            )}
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
  label: { color: colors.text, fontSize: 16, fontWeight: '700' },
  labelGap: { marginTop: 20 },
  btnRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  btnAlone: { alignSelf: 'flex-start' },
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
  btnDanger: { borderColor: '#FF453A' },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnText: { color: colors.text, fontWeight: '600' },
  btnTextPrimary: { color: '#000' },
});
