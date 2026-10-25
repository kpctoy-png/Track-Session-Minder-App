import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { EventDay } from '@/data/types';
import { formatTime } from '@/lib/schedule';
import { useSchedule } from '@/lib/ScheduleStore';
import { fetchSheetTab, parseScheduleGrid, sheetIdFromLink, type ImportedDay } from '@/lib/sheetImport';
import { colors } from './theme';

/** Pairs each imported day with the event day of the same name, falling back to the same position. */
function matchDays(imported: ImportedDay[], days: EventDay[]) {
  return days.map((day, i) => ({
    day,
    source: imported.find((d) => d.label.toLowerCase() === day.label.toLowerCase()) ?? imported[i],
  }));
}

export function SheetImportForm({ onDone }: { onDone: () => void }) {
  const { event, updateDay } = useSchedule();
  const [link, setLink] = useState('');
  const [tab, setTab] = useState('');
  const [imported, setImported] = useState<ImportedDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const id = sheetIdFromLink(link);
    if (!id) return setError('Paste the link to a Google Sheet. It contains /spreadsheets/d/.');
    if (!tab.trim()) return setError('Enter the name of the tab at the bottom of the sheet, like "Nov 2026".');
    setLoading(true);
    setError(null);
    setImported(null);
    try {
      const days = parseScheduleGrid(await fetchSheetTab(id, tab.trim()));
      if (!days.length) setError('No schedule found on that tab. Check the tab name: it needs a SATURDAY / SUNDAY header row.');
      else setImported(days);
    } catch (err) {
      setError(
        `Couldn't read the sheet (${(err as Error).message}). In Google Sheets, click Share and set General access to "Anyone with the link".`,
      );
    } finally {
      setLoading(false);
    }
  };

  const matches = imported ? matchDays(imported, event.days) : [];

  const save = () => {
    for (const { day, source } of matches) {
      if (source) updateDay(day.id, source.items.map((item, n) => ({ ...item, id: `${day.id}-${Date.now()}-${n}` })));
    }
    onDone();
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>Import from Google Sheet</Text>
        <Pressable onPress={onDone}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
      <Text style={styles.sub}>Replaces the schedule for {event.name}.</Text>

      <Text style={styles.label}>Sheet link</Text>
      <TextInput
        id="import-link"
        style={styles.input}
        placeholder="https://docs.google.com/spreadsheets/d/…"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        value={link}
        onChangeText={setLink}
      />
      <Text style={styles.label}>Tab name</Text>
      <TextInput
        id="import-tab"
        style={styles.input}
        placeholder="Nov 2026"
        placeholderTextColor={colors.muted}
        value={tab}
        onChangeText={setTab}
        onSubmitEditing={load}
      />
      <Pressable onPress={load} style={styles.secondary} disabled={loading}>
        <Text style={styles.secondaryText}>{loading ? 'Reading the sheet…' : 'Preview'}</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {imported ? (
        <>
          {matches.map(({ day, source }) => (
            <View key={day.id} style={styles.preview}>
              <Text style={styles.previewTitle}>
                {day.label}: {source ? `${source.items.length} sessions from the sheet's ${source.label}` : 'no match, left as is'}
              </Text>
              {source?.items.slice(0, 4).map((item, i) => (
                <Text key={i} style={styles.previewLine}>
                  {formatTime(item.start)}  {item.title}
                </Text>
              ))}
              {source && source.items.length > 4 ? <Text style={styles.previewLine}>…</Text> : null}
            </View>
          ))}
          <Pressable onPress={save} style={styles.save}>
            <Text style={styles.saveText}>Replace schedule</Text>
          </Pressable>
        </>
      ) : null}
      <Pressable onPress={onDone} style={styles.back}>
        <Text style={styles.cancel}>Cancel and go back to Admin</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  cancel: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 14, marginTop: 4 },
  label: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 18, marginBottom: 8 },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    fontSize: 16,
  },
  secondary: { borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 16, borderWidth: 1, borderColor: colors.accent },
  secondaryText: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  error: { color: '#FF6961', fontSize: 14, marginTop: 12 },
  preview: { backgroundColor: colors.card, borderRadius: 12, padding: 12, marginTop: 12 },
  previewTitle: { color: colors.text, fontWeight: '700', marginBottom: 6 },
  previewLine: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  save: { backgroundColor: colors.accent, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 20 },
  saveText: { color: '#000', fontSize: 16, fontWeight: '700' },
  back: { alignItems: 'center', padding: 14, marginTop: 8 },
});
