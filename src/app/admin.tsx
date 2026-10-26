import { useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { CoachingAdmin } from '@/components/CoachingAdmin';
import { EmailCodeSignIn } from '@/components/EmailCodeSignIn';
import { EventPicker } from '@/components/EventPicker';
import { FeedbackAdmin } from '@/components/FeedbackAdmin';
import { ItemRow } from '@/components/ItemRow';
import { ManageOrganizers } from '@/components/ManageOrganizers';
import { NewEventForm } from '@/components/NewEventForm';
import { SheetImportForm } from '@/components/SheetImportForm';
import { PreviewClock } from '@/components/PreviewClock';
import { colors } from '@/components/theme';
import type { ScheduleItem } from '@/data/types';
import { useSchedule } from '@/lib/ScheduleStore';
import { formatRange, formatTime, fromMinutes, shiftSchedule, sortItems, spreadCatchUp, toMinutes, trimSchedule } from '@/lib/schedule';
import { supabase } from '@/lib/supabase';

export default function AdminScreen() {
  const { clubs, event, day, clock, updateDay, deleteEvent, session, sync, hasEvents, manageableClubs, canManage, isPlatformAdmin } = useSchedule();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [catchUpNote, setCatchUpNote] = useState<{ text: string; undo?: { dayId: string; items: ScheduleItem[] } } | null>(null);
  const navigation = useNavigation();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Brief confirmation once a change has reached drivers.
  const [saved, setSaved] = useState<{ text: string; at: number } | null>(null);
  const items = sortItems(day.items);
  const editable = hasEvents && canManage(event.clubId);
  const clubName = clubs.find((c) => c.id === event.clubId)?.name ?? 'This club';

  // A catch-up note (and its Undo) only applies to the day it was made on.
  useEffect(() => setCatchUpNote(null), [day.id]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), 4000);
    return () => clearTimeout(timer);
  }, [saved]);

  // Tapping the Admin tab again always brings back the dashboard.
  useEffect(
    () =>
      navigation.addListener('tabPress' as never, () => {
        setCreating(false);
        setImporting(false);
      }),
    [navigation],
  );

  if (supabase && !session) return <SignIn />;
  if (creating) return <NewEventForm onDone={() => setCreating(false)} />;
  if (importing) return <SheetImportForm onDone={() => setImporting(false)} />;

  const save = async (dayId: string, next: ScheduleItem[], what: string) => {
    setSaved(null);
    if (await updateDay(dayId, next)) setSaved({ text: `✓ ${what} · sent to drivers`, at: Date.now() });
  };

  const runLate = (minutes: number) =>
    save(
      day.id,
      shiftSchedule(items, clock.minuteOfDay, minutes),
      minutes > 0 ? `Moved ${minutes} min later` : `Moved ${-minutes} min earlier`,
    );

  // After an incident: shorten the remaining track sessions so the day finishes `minutes` earlier.
  const catchUp = (minutes: number) => {
    const cuts = spreadCatchUp(items, clock.minuteOfDay, minutes);
    const used = Object.values(cuts).filter((c) => c > 0);
    const total = used.reduce((sum, c) => sum + c, 0);
    if (!total) return setCatchUpNote({ text: 'No upcoming track sessions are long enough to shorten.' });
    const next = trimSchedule(items, clock.minuteOfDay, cuts);
    const lastEnd = sortItems(next).reduce((latest, i) => Math.max(latest, toMinutes(i.end)), 0);
    const per = Math.min(...used) === Math.max(...used) ? `${used[0]} min` : `${Math.min(...used)}–${Math.max(...used)} min`;
    const short = total < minutes ? ` That's all that fits without making sessions shorter than 10 minutes.` : '';
    setCatchUpNote({
      text: `Caught up ${total} min: ${used.length} sessions are ${per} shorter, and the day now ends at ${formatTime(fromMinutes(lastEnd))}.${short}`,
      undo: { dayId: day.id, items: day.items },
    });
    save(day.id, next, `Caught up ${total} min`);
  };

  const editItem = (id: string, change: (item: ScheduleItem) => ScheduleItem | null) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const next = change(item);
    if (next === item) return;
    save(
      day.id,
      items.flatMap((i) => (i.id !== id ? [i] : next ? [next] : [])),
      next ? `${next.title} now ${formatRange(next)}` : `${item.title} removed`,
    );
  };

  const nudge = (field: 'start' | 'end', delta: number) => (item: ScheduleItem) => {
    const value = toMinutes(item[field]) + delta;
    const other = toMinutes(field === 'start' ? item.end : item.start);
    if (field === 'start' ? value >= other : value <= other) return item;
    return { ...item, [field]: fromMinutes(value) };
  };

  return (
    <View style={styles.screen}>
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
          {manageableClubs.length ? <Btn label="+ New event" onPress={() => setCreating(true)} primary /> : null}
          {editable ? <Btn label="Import from Google Sheet" onPress={() => setImporting(true)} /> : null}
          {!editable ? null : confirmDelete ? (
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
        {hasEvents ? <EventPicker /> : null}
        {hasEvents ? <PreviewClock /> : null}

        {editable ? (
          <>
            <Text style={styles.heading}>Running late?</Text>
            <Text style={styles.sub}>Shifts everything after {formatTime(fromMinutes(clock.minuteOfDay))}.</Text>
            <View style={styles.buttons}>
              {[5, 10, 15, 30, 45, 60].map((m) => (
                <Btn key={m} label={`+${m} min`} onPress={() => runLate(m)} primary />
              ))}
              <Btn label="−5 min" onPress={() => runLate(-5)} />
            </View>

            <Text style={[styles.heading, styles.sessionsHeading]}>Catch up after an incident</Text>
            <Text style={styles.sub}>
              Shortens the track sessions that haven't started yet, spread evenly, so the day ends earlier. Lunch,
              classroom and meetings keep their length.
            </Text>
            <View style={styles.buttons}>
              {[5, 10, 15, 20, 30].map((m) => (
                <Btn key={m} label={`Catch up ${m} min`} onPress={() => catchUp(m)} />
              ))}
            </View>
            {catchUpNote ? (
              <View style={styles.catchUpNote}>
                <Text style={styles.catchUpText}>{catchUpNote.text}</Text>
                {catchUpNote.undo ? (
                  <Btn
                    label="Undo"
                    onPress={() => {
                      const undo = catchUpNote.undo;
                      if (undo) save(undo.dayId, undo.items, 'Catch-up undone');
                      setCatchUpNote(null);
                    }}
                  />
                ) : null}
              </View>
            ) : null}

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

            <CoachingAdmin />
            <FeedbackAdmin eventId={event.id} title={`Feedback on ${event.name}`} />
          </>
        ) : (
          <Text style={styles.sub}>
            {!hasEvents
              ? manageableClubs.length
                ? 'There are no events yet. Tap + New event to add one.'
                : 'There are no events yet, and this account is not an organizer account.'
              : manageableClubs.length
                ? `${clubName} events can only be changed by ${clubName} admins. Choose one of your own events to edit.`
                : 'This account is not an organizer account, so it can view schedules but not change them.'}
          </Text>
        )}
        {isPlatformAdmin ? <FeedbackAdmin eventId={null} title="Feedback on the app" /> : null}
        {isPlatformAdmin && supabase ? <ManageOrganizers /> : null}
      </ScrollView>
      {saved ? (
        <View style={styles.saved} pointerEvents="none">
          <Text style={styles.savedText}>{saved.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Organizers sign in with an emailed code; the password form is still there for accounts made in Supabase. */
function SignIn() {
  const [usePassword, setUsePassword] = useState(false);
  if (!usePassword)
    return (
      <View style={styles.page}>
        <EmailCodeSignIn
          heading="Admin sign in"
          intro="For event organizers. Enter your email and we'll send you a code, no password needed."
          emailHint="Enter the email Redline added you with."
          idPrefix="admin"
        >
          <Pressable onPress={() => setUsePassword(true)}>
            <Text style={styles.link}>Sign in with a password instead</Text>
          </Pressable>
        </EmailCodeSignIn>
      </View>
    );
  return <PasswordSignIn onUseCode={() => setUsePassword(false)} />;
}

function PasswordSignIn({ onUseCode }: { onUseCode: () => void }) {
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
      <Pressable onPress={onUseCode}>
        <Text style={styles.link}>Email me a code instead</Text>
      </Pressable>
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
  screen: { flex: 1 },
  saved: { position: 'absolute', left: 16, right: 16, bottom: 16, backgroundColor: '#1F7A3A', borderRadius: 12, padding: 12, alignItems: 'center' },
  savedText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  page: { padding: 16, paddingBottom: 40 },
  link: { color: colors.accent, fontWeight: '600', marginTop: 14 },
  notice: { backgroundColor: '#2A2210', borderRadius: 12, padding: 12, marginBottom: 12 },
  noticeText: { color: '#FFD60A', fontSize: 13 },
  heading: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 8 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2, marginBottom: 10 },
  sessionsHeading: { marginTop: 24 },
  catchUpNote: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 12, padding: 12, marginTop: 10 },
  catchUpText: { color: colors.text, fontSize: 13, flex: 1 },
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
