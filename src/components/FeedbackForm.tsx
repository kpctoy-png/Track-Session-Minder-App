import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useSchedule } from '@/lib/ScheduleStore';
import { todayISO } from '@/lib/dates';
import { colors } from './theme';

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/** A 1 to 5 star rating with an optional comment, about an event or the app. */
export function FeedbackForm({ onDone }: { onDone: () => void }) {
  const { events, event, session, sendFeedback } = useSchedule();
  const [about, setAbout] = useState<string | null>(event.id || null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  // The event being viewed, plus the five most recent ones that have started.
  const today = todayISO();
  const recent = events
    .filter((e) => e.days[0]?.date <= today)
    .sort((a, b) => b.days[0].date.localeCompare(a.days[0].date));
  const choices = [event, ...recent.filter((e) => e.id !== event.id)].filter((e) => e.id).slice(0, 6);

  const send = async () => {
    if (!rating) return setError('Tap a star to choose your rating.');
    setBusy(true);
    const problem = await sendFeedback({ eventId: about ?? undefined, rating, comment: comment.trim(), name: name.trim() });
    setBusy(false);
    if (problem) setError(problem);
    else setSent(true);
  };

  if (sent) {
    return (
      <View style={styles.page}>
        <Text style={styles.title}>Thanks for the feedback!</Text>
        <Text style={styles.sub}>The organizers read every one.</Text>
        <Pressable onPress={onDone} style={styles.save}>
          <Text style={styles.saveText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>Feedback</Text>
        <Pressable onPress={onDone}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>What is it about?</Text>
      <View style={styles.chips}>
        {choices.map((e) => (
          <Chip key={e.id} label={e.name} selected={about === e.id} onPress={() => setAbout(e.id)} />
        ))}
        <Chip label="The app" selected={about === null} onPress={() => setAbout(null)} />
      </View>

      <Text style={styles.label}>Your rating</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => {
              setRating(n);
              setError(null);
            }}
            accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
            hitSlop={6}
          >
            <Text style={[styles.star, n <= rating && styles.starOn]}>{n <= rating ? '★' : '☆'}</Text>
          </Pressable>
        ))}
        <Text style={styles.starLabel}>{LABELS[rating]}</Text>
      </View>

      <Text style={styles.label}>Comments (optional)</Text>
      <TextInput
        id="feedback-comment"
        style={[styles.input, styles.comment]}
        placeholder="What went well, and what could be better?"
        placeholderTextColor={colors.muted}
        multiline
        maxLength={2000}
        value={comment}
        onChangeText={setComment}
      />
      {session ? null : (
        <TextInput
          id="feedback-name"
          style={styles.input}
          placeholder="Your name (optional)"
          placeholderTextColor={colors.muted}
          maxLength={100}
          value={name}
          onChangeText={setName}
        />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={send} style={styles.save} disabled={busy}>
        <Text style={styles.saveText}>{busy ? 'Sending…' : 'Send feedback'}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 14, marginTop: 4 },
  cancel: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  label: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 18, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '600' },
  chipTextOn: { color: '#000' },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  star: { color: colors.muted, fontSize: 40 },
  starOn: { color: colors.accent },
  starLabel: { color: colors.text, fontSize: 15, fontWeight: '600', marginLeft: 8 },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 16, marginBottom: 10 },
  comment: { minHeight: 110, textAlignVertical: 'top' },
  error: { color: '#FF6961', fontSize: 14, marginTop: 4 },
  save: { backgroundColor: colors.accent, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 16 },
  saveText: { color: '#000', fontSize: 16, fontWeight: '700' },
});
