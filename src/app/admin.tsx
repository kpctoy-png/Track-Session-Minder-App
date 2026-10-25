import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { EventPicker } from '@/components/EventPicker';
import { ItemRow } from '@/components/ItemRow';
import { NewEventForm } from '@/components/NewEventForm';
import { PreviewClock } from '@/components/PreviewClock';
import { colors } from '@/components/theme';
import type { ScheduleItem } from '@/data/types';
import { useSchedule } from '@/lib/ScheduleStore';
import { formatTime, fromMinutes, shiftSchedule, sortItems, toMinutes } from '@/lib/schedule';
import { supabase } from '@/lib/supabase';

export default function AdminScreen() {
  const { event, day, clock, updateDay, deleteEvent, session, sync } = useSchedule();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const items = sortItems(day.items);

  if (supabase && !session) return <SignIn />;
  if (creating) return <NewEventForm onDone={() => setCreating(false)} />;

  const runLate = (minutes: number) => updateDay(day.id, shiftSchedule(items, clock.minuteOfDay, minutes));

  const editItem = (id: string, change: (item: ScheduleItem) => ScheduleItem | null) =>
    updateDay(
      day.id,
      items.flatMap((item) => {
        if (item.id !== id) return [item];
        const next = change(item);
        return next ? [next] : [];
      }),
    );

  const nudge = (field: 'start' | 'end', delta: number) => (item: ScheduleItem) => {
    const value = toMinutes(item[field]) + delta;
    const other = toMinutes(field === 'start' ? item.end : item.start);
    if (field === 'start' ? value >= other : value <= other) return item;
    return { ...item, [field]: fromMinutes(value) };
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {supabase ? (
        <View style={styles.signedIn}>
          <Text style={styles.signedInText}>Changes go live to every driver. Signed in as {session?.user.email}</Text>
          <Btn label="Sign out" onPress={() => supabase?.auth.signOut()} />
        </View>
      ) : (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Practice mode: changes here only show on this device. Once the online database is connected, they will
            update every driver's phone.
          </Text>
        </View>
      )}
      {sync.status === 'error' ? (
        <View style={styles.error}>
          <Text style={styles.errorText}>{sync.message}</Text>
        </View>
      ) : null}
      <View style={styles.eventActions}>
        <Btn label="+ New event" onPress={() => setCreating(true)} primary />
        {confirmDelete ? (
          <>
            <Btn
              label={`Delete ${event.name}`}
              danger
              onPress={async () => {
                const problem = await deleteEvent(event.id);
                setConfirmDelete(false);
                setDeleteError(problem);
              }}
            />
            <Btn label="Keep it" onPress={() => setConfirmDelete(false)} />
          </>
        ) : (
          <Btn label="Delete event" onPress={() => setConfirmDelete(true)} />
        )}
      </View>
      {deleteError ? <Text style={styles.errorText}>{deleteError}</Text> : null}
      <EventPicker />
      <PreviewClock />

      <Text style={styles.heading}>Running late?</Text>
      <Text style={styles.sub}>Shifts everything after {formatTime(fromMinutes(clock.minuteOfDay))}.</Text>
      <View style={styles.buttons}>
        {[5, 10, 15, 30, 45, 60].map((m) => (
          <Btn key={m} label={`+${m} min`} onPress={() => runLate(m)} primary />
        ))}
        <Btn label="−5 min" onPress={() => runLate(-5)} />
      </View>

      <Text style={[styles.heading, styles.sessionsHeading]}>Sessions</Text>
      <Text style={styles.sub}>Tap a session to change its times.</Text>

      {items.map((item) => (
        <View key={item.id}>
          <Pressable onPress={() => setEditing(editing === item.id ? null : item.id)}>
            <ItemRow item={item} />
          </Pressable>
          {editing === item.id ? (
            <View style={styles.editor}>
              <EditLine label="Start" onMinus={() => editItem(item.id, nudge('start', -5))} onPlus={() => editItem(item.id, nudge('start', 5))} />
              <EditLine label="End" onMinus={() => editItem(item.id, nudge('end', -5))} onPlus={() => editItem(item.id, nudge('end', 5))} />
              <Btn label="Remove session" onPress={() => editItem(item.id, () => null)} danger />
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError('That email and password did not match an admin account.');
  };

  return (
    <View style={styles.page}>
      <Text style={styles.heading}>Admin sign in</Text>
      <Text style={styles.sub}>Only event organizers can change the schedule.</Text>
      <TextInput
        id="admin-email"
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        id="admin-password"
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.muted}
        secureTextEntry
        autoComplete="password"
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={signIn}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Btn label={busy ? 'Signing in…' : 'Sign in'} onPress={signIn} primary />
    </View>
  );
}

function EditLine({ label, onMinus, onPlus }: { label: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.editLine}>
      <Text style={styles.editLabel}>{label}</Text>
      <Btn label="−5" onPress={onMinus} />
      <Btn label="+5" onPress={onPlus} />
    </View>
  );
}

function Btn({ label, onPress, primary, danger }: { label: string; onPress: () => void; primary?: boolean; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.btn, primary && styles.btnPrimary, danger && styles.btnDanger]}>
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 40 },
  notice: { backgroundColor: '#2A2210', borderRadius: 12, padding: 12, marginBottom: 12 },
  noticeText: { color: '#FFD60A', fontSize: 13 },
  heading: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 8 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2, marginBottom: 10 },
  sessionsHeading: { marginTop: 24 },
  eventActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  signedIn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#10261A', borderRadius: 12, padding: 12, marginBottom: 12 },
  signedInText: { color: '#34C759', fontSize: 13, flex: 1 },
  error: { backgroundColor: '#2A1212', borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { color: '#FF6961', fontSize: 13, marginBottom: 8 },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 16, marginBottom: 10 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editor: { backgroundColor: colors.cardRaised, borderRadius: 12, padding: 12, marginBottom: 10, marginTop: -2, gap: 8 },
  editLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editLabel: { color: colors.text, width: 50, fontWeight: '600' },
  btn: { backgroundColor: colors.cardRaised, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnDanger: { borderColor: '#FF453A', alignSelf: 'flex-start' },
  btnText: { color: colors.text, fontWeight: '600' },
  btnTextPrimary: { color: '#000' },
});
