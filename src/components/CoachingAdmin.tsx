import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { coachingTimes, isEmail } from '@/lib/coaching';
import { formatRange, formatTime, sortItems } from '@/lib/schedule';
import { useSchedule } from '@/lib/ScheduleStore';
import { colors } from './theme';

/** Admin list of the selected day's coaching sessions, with a form to book one for a student. */
export function CoachingAdmin() {
  const { day, coaching, addCoaching, removeCoaching } = useSchedule();
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [coach, setCoach] = useState('');
  const [coachEmail, setCoachEmail] = useState('');
  const [itemId, setItemId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const booked = coaching
    .filter((c) => c.dayId === day.id)
    .map((c) => ({ session: c, ...coachingTimes(c, day) }))
    .sort((a, b) => a.start.localeCompare(b.start));
  const items = sortItems(day.items);

  const save = async () => {
    const item = items.find((i) => i.id === itemId);
    if (!isEmail(email)) return setError("Enter the student's email. They sign in with it to see the session.");
    if (coachEmail.trim() && !isEmail(coachEmail)) return setError("Check the coach's email, or leave it empty.");
    if (!item) return setError('Pick the session the coaching happens in.');
    setBusy(true);
    const problem = await addCoaching({
      dayId: day.id,
      itemId: item.id,
      studentEmail: email,
      coach: coach.trim(),
      coachEmail: coachEmail.trim() || undefined,
      start: item.start,
      end: item.end,
      notes: notes.trim() || undefined,
    });
    setBusy(false);
    if (problem) return setError(problem);
    setEmail('');
    setNotes('');
    setItemId(null);
    setError(null);
    setAdding(false);
  };

  return (
    <View>
      <Text style={styles.heading}>Coaching</Text>
      <Text style={styles.sub}>
        Book a paid coaching session for one student. They get an email, and see it in the app after signing in on the Me tab.
      </Text>
      {booked.map(({ session, start, end }) => (
        <View key={session.id} style={styles.row}>
          <View style={styles.rowBody}>
            <Text style={styles.rowTime}>{formatRange({ start, end })}</Text>
            <Text style={styles.rowTitle}>{session.studentEmail}</Text>
            <Text style={styles.rowSub}>
              {session.coach ? `Coach: ${session.coach}` : 'No coach named'}
              {session.notes ? ` · ${session.notes}` : ''}
            </Text>
          </View>
          <Pressable
            onPress={async () => setError(await removeCoaching(session.id))}
            style={styles.remove}
            accessibilityLabel={`Remove coaching for ${session.studentEmail}`}
          >
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      ))}

      {adding ? (
        <View style={styles.form}>
          <TextInput
            id="coach-student"
            style={styles.input}
            placeholder="Student's email"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            id="coach-name"
            style={styles.input}
            placeholder="Coach's name"
            placeholderTextColor={colors.muted}
            value={coach}
            onChangeText={setCoach}
          />
          <TextInput
            id="coach-email"
            style={styles.input}
            placeholder="Coach's email (optional, they get a copy)"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={coachEmail}
            onChangeText={setCoachEmail}
          />
          <Text style={styles.label}>During which session?</Text>
          <View style={styles.chips}>
            {items.map((item) => (
              <Pressable key={item.id} onPress={() => setItemId(item.id)} style={[styles.chip, itemId === item.id && styles.chipOn]}>
                <Text style={[styles.chipText, itemId === item.id && styles.chipTextOn]}>
                  {formatTime(item.start)} {item.title}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            id="coach-notes"
            style={styles.input}
            placeholder="Notes for the student (optional), like where to meet"
            placeholderTextColor={colors.muted}
            value={notes}
            onChangeText={setNotes}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={save} style={[styles.btn, styles.btnPrimary]} disabled={busy}>
              <Text style={[styles.btnText, styles.btnTextPrimary]}>{busy ? 'Saving…' : 'Book coaching'}</Text>
            </Pressable>
            <Pressable onPress={() => setAdding(false)} style={styles.btn}>
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable onPress={() => setAdding(true)} style={[styles.btn, styles.btnPrimary, styles.addBtn]}>
            <Text style={[styles.btnText, styles.btnTextPrimary]}>+ Book coaching</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 24 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2, marginBottom: 10 },
  label: { color: colors.text, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, marginBottom: 6, borderLeftWidth: 6, borderLeftColor: colors.accent },
  rowBody: { flex: 1, padding: 12 },
  rowTime: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 2 },
  rowSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  remove: { padding: 12 },
  removeText: { color: '#FF6961', fontWeight: '600' },
  form: { backgroundColor: colors.cardRaised, borderRadius: 12, padding: 12, marginTop: 6 },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 16, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: { borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 13 },
  chipTextOn: { color: '#000', fontWeight: '700' },
  error: { color: '#FF6961', fontSize: 13, marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { backgroundColor: colors.cardRaised, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnText: { color: colors.text, fontWeight: '600' },
  btnTextPrimary: { color: '#000' },
  addBtn: { alignSelf: 'flex-start' },
});
