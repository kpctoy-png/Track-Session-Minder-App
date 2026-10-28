import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useSchedule } from '@/lib/ScheduleStore';
import { supabase } from '@/lib/supabase';
import { colors } from './theme';

// Clubs this phone has joined or said no thanks to, so the card asks only once per club.
const ANSWERED_KEY = 'tsm-list-answered';

async function answeredClubs(): Promise<string[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(ANSWERED_KEY)) ?? '[]');
  } catch {
    return [];
  }
}

// Clubs this phone has joined, so My Day can say so instead of asking again.
const JOINED_KEY = 'tsm-list-joined';

async function joinedClubs(): Promise<string[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(JOINED_KEY)) ?? '[]');
  } catch {
    return [];
  }
}

async function markJoined(clubId: string) {
  const clubs = await joinedClubs();
  await AsyncStorage.setItem(JOINED_KEY, JSON.stringify([...new Set([...clubs, clubId])])).catch(() => {});
}

async function markAnswered(clubId: string) {
  const clubs = await answeredClubs();
  await AsyncStorage.setItem(ANSWERED_KEY, JSON.stringify([...new Set([...clubs, clubId])])).catch(() => {});
}

/**
 * Optional: a driver leaves their name and email so the event's club can email them. On Now it asks once per club;
 * on My Day (`always`) it stays available even after No thanks, until they join.
 */
export function JoinListCard({ always = false }: { always?: boolean }) {
  const { clubs, event, session } = useSchedule();
  const club = clubs.find((c) => c.id === event.clubId);
  const [answered, setAnswered] = useState<string[] | null>(null);
  const [joinedBefore, setJoinedBefore] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    answeredClubs().then(setAnswered);
    joinedClubs().then(setJoinedBefore);
  }, []);

  useEffect(() => {
    if (session?.user.email) setEmail((e) => e || session.user.email!);
  }, [session]);

  if (!supabase || !club || !event.id || !answered) return null;
  if (joined || (always && joinedBefore.includes(club.id))) {
    return (
      <View style={styles.card}>
        <Text style={styles.text}>✓ You're on the {club.name} list. Thanks!</Text>
      </View>
    );
  }
  if (answered.includes(club.id) && !always) return null;

  const join = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!name.trim()) return setProblem('Please enter your name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) return setProblem('Please check your email address.');
    if (!agreed) return setProblem(`Tick the box to let ${club.name} email you.`);
    setBusy(true);
    setProblem(null);
    const { error } = await supabase!.rpc('join_driver_list', {
      signup_name: name.trim(),
      signup_email: cleanEmail,
      signup_event: event.id,
    });
    setBusy(false);
    if (error) return setProblem(`Couldn't sign you up: ${error.message}`);
    await markAnswered(club.id);
    await markJoined(club.id);
    setJoined(true);
  };

  const noThanks = async () => {
    await markAnswered(club.id);
    setAnswered([...answered, club.id]);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>📬 Stay in the loop with {club.name}</Text>
      <Text style={styles.text}>Leave your name and email to hear about their upcoming events. Optional.</Text>
      <TextInput
        style={styles.input}
        placeholder="Your name"
        placeholderTextColor={colors.muted}
        value={name}
        onChangeText={setName}
        autoComplete="name"
        maxLength={100}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.muted}
        value={email}
        onChangeText={setEmail}
        autoComplete="email"
        keyboardType="email-address"
        autoCapitalize="none"
        maxLength={254}
      />
      <Pressable style={styles.row} onPress={() => {
          setAgreed(!agreed);
          setProblem(null);
        }}>
        <Text style={[styles.box, agreed && styles.boxOn]}>{agreed ? '✓' : ''}</Text>
        <Text style={[styles.text, styles.grow]}>{club.name} may email me about their events. I can ask to be removed anytime.</Text>
      </Pressable>
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
      <View style={styles.row}>
        <Pressable onPress={join} disabled={busy} style={[styles.btn, styles.grow]}>
          <Text style={styles.btnText}>{busy ? 'Joining…' : 'Join the list'}</Text>
        </Pressable>
        {always ? null : (
          <Pressable onPress={noThanks} disabled={busy}>
            <Text style={styles.link}>No thanks</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginTop: 16, gap: 10 },
  heading: { color: colors.text, fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  text: { color: colors.text, fontSize: 14 },
  input: {
    backgroundColor: colors.cardRaised,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.muted,
    color: '#000',
    textAlign: 'center',
    fontWeight: '700',
    lineHeight: 18,
  },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  link: { color: colors.muted, fontWeight: '600' },
  btn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  btnText: { color: '#000', fontWeight: '700' },
  problem: { color: '#FF6961', fontSize: 13 },
});
