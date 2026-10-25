import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from './theme';
import { dateRange, isValidDate, addDays, weekday } from '@/lib/dates';
import { buildEvent } from '@/lib/newEvent';
import { useSchedule } from '@/lib/ScheduleStore';

// The tracks Just Track It runs at, so they don't need typing each time.
const TRACKS = [
  { track: 'Barber Motorsports Park', location: 'Birmingham, AL', short: 'Barber' },
  { track: 'Michelin Raceway Road Atlanta', location: 'Braselton, GA', short: 'Road Atlanta' },
  { track: 'Roebling Road Raceway', location: 'Bloomingdale, GA', short: 'Roebling Road' },
  { track: 'Atlanta Motorsports Park', location: 'Dawsonville, GA', short: 'AMP' },
  { track: 'Carolina Motorsports Park', location: 'Kershaw, SC', short: 'CMP' },
];

export function NewEventForm({ onDone }: { onDone: () => void }) {
  const { events, manageableClubs, createEvent } = useSchedule();
  const [clubId, setClubId] = useState(manageableClubs[0]?.id ?? '');
  const [name, setName] = useState('');
  const [track, setTrack] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dayCount, setDayCount] = useState(2);
  const [templateId, setTemplateId] = useState<string | null>(events[events.length - 1]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickTrack = (t: (typeof TRACKS)[number]) => {
    setTrack(t.track);
    setLocation(t.location);
    if (!name.trim()) setName(`${t.short} Weekend`);
  };

  const dateOk = isValidDate(startDate);

  const save = async () => {
    if (!clubId) return setError('Choose which club is running this event.');
    if (!name.trim() || !track.trim() || !location.trim()) return setError('Fill in the event name, track and location.');
    if (!dateOk) return setError('Enter the first day as year-month-day, like 2027-01-16.');
    setSaving(true);
    setError(null);
    const template = events.find((e) => e.id === templateId);
    const problem = await createEvent(buildEvent({ clubId, name, track, location, startDate: startDate.trim(), dayCount, template }));
    setSaving(false);
    if (problem) return setError(problem);
    onDone();
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>New event</Text>
        <Pressable onPress={onDone}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
      {manageableClubs.length > 1 ? (
        <>
          <Label text="Club" />
          <View style={styles.chips}>
            {manageableClubs.map((c) => (
              <Chip key={c.id} label={c.name} selected={clubId === c.id} onPress={() => setClubId(c.id)} />
            ))}
          </View>
        </>
      ) : null}
      <Label text="Track" />
      <View style={styles.chips}>
        {TRACKS.map((t) => (
          <Chip key={t.track} label={t.short} selected={track === t.track} onPress={() => pickTrack(t)} />
        ))}
      </View>
      <Field id="event-track" placeholder="Track name" value={track} onChangeText={setTrack} />
      <Field id="event-location" placeholder="City, State" value={location} onChangeText={setLocation} />

      <Label text="Event name" />
      <Field id="event-name" placeholder="Barber Weekend" value={name} onChangeText={setName} />

      <Label text="First day" />
      <Field
        id="event-start"
        placeholder="2027-01-16"
        value={startDate}
        onChangeText={setStartDate}
        keyboardType="numbers-and-punctuation"
      />
      {dateOk ? (
        <Text style={styles.hint}>
          {weekday(startDate.trim())}, {dateRange(startDate.trim(), addDays(startDate.trim(), dayCount - 1))}
        </Text>
      ) : null}

      <Label text="Number of days" />
      <View style={styles.chips}>
        {[1, 2, 3].map((n) => (
          <Chip key={n} label={`${n} day${n > 1 ? 's' : ''}`} selected={dayCount === n} onPress={() => setDayCount(n)} />
        ))}
      </View>

      <Label text="Start with the schedule from" />
      <View style={styles.chips}>
        {events.map((e) => (
          <Chip key={e.id} label={e.name} selected={templateId === e.id} onPress={() => setTemplateId(e.id)} />
        ))}
        <Chip label="Blank" selected={templateId === null} onPress={() => setTemplateId(null)} />
      </View>
      <Text style={styles.hint}>You can adjust every session's times on the Admin tab afterwards.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={save} style={styles.save} disabled={saving}>
        <Text style={styles.saveText}>{saving ? 'Saving…' : 'Create event'}</Text>
      </Pressable>
      <Pressable onPress={onDone} style={styles.back}>
        <Text style={styles.cancel}>Cancel and go back to Admin</Text>
      </Pressable>
    </ScrollView>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

function Field(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  cancel: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  label: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 18, marginBottom: 8 },
  hint: { color: colors.muted, fontSize: 13, marginTop: -2, marginBottom: 4 },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  chipTextSelected: { color: '#000' },
  error: { color: '#FF6961', fontSize: 14, marginTop: 12 },
  save: { backgroundColor: colors.accent, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 20 },
  saveText: { color: '#000', fontSize: 16, fontWeight: '700' },
  back: { alignItems: 'center', padding: 14, marginTop: 8 },
});
