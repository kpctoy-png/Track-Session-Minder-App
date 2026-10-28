import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useSchedule } from '@/lib/ScheduleStore';
import { rosterFromCsv, rosterFromTable, type RosterRow } from '@/lib/roster';
import { supabase } from '@/lib/supabase';
import { isZip, readXlsx } from '@/lib/xlsx';
import { colors } from './theme';

/**
 * The event's registered drivers, uploaded from the registration site's participant list (CSV, Excel or ClubReg export), so
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
    const { data, error } = await supabase.from('event_roster').select('name, email, run_group, coaching').eq('event_id', eventId).order('name');
    if (error) setError(error.message);
    else setRows(data.map((r) => ({ name: r.name, email: r.email ?? '', runGroup: r.run_group ?? undefined, coaching: r.coaching ?? 0 })));
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
    input.accept = '.xls,.xlsx,.csv,text/csv,text/plain,text/html,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      let read: ReturnType<typeof rosterFromCsv>;
      try {
        read = isZip(bytes) ? rosterFromTable(await readXlsx(bytes)) : rosterFromCsv(new TextDecoder().decode(bytes));
      } catch {
        read = { rows: [], problem: "Couldn't read that file. Try saving it as CSV." };
      }
      const { rows, problem } = read;
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
      : await supabase.from('event_roster').insert(upload.rows.map((r) => ({ event_id: eventId, name: r.name, email: r.email, run_group: r.runGroup ?? null, coaching: r.coaching ?? 0 })));
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
        Upload the participant list so announcements can be emailed to everyone at {eventName}, including drivers who
        haven't opened the app. In ClubReg: This Event → Reports → Report Builder, tick Email, Export, and upload the
        file it saves (a CSV or Excel sheet works too). Cancelled entries are skipped. Only organizers see this
        list, and it's deleted a week after the event.
      </Text>
      {Platform.OS === 'web' ? (
        <Pressable onPress={pick} style={styles.btn}>
          <Text style={styles.btnText}>{rows?.length ? 'Upload a new list' : 'Upload participant list'}</Text>
        </Pressable>
      ) : null}
      <ClubRegLink eventId={eventId} />
      {upload ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>
            Found {upload.rows.length} {upload.rows.length === 1 ? 'driver' : 'drivers'} with an email in {upload.file}
            {paidFor(upload.rows) ? `, ${paidFor(upload.rows)} of them paid for coaching` : ''}.
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
              <Text style={styles.detail}>
                {[r.name ? r.email : '', r.runGroup, r.coaching ? `${r.coaching} coaching paid` : ''].filter(Boolean).join(' · ')}
              </Text>
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

type Pull = { at: string; total: number | null; added: string[]; removed: string[]; problem: string | null };

/**
 * Links the event to its ClubReg event so the "ClubReg sync" robot pulls the list at 5:30 AM two days before,
 * the day before and each morning of the event, and shows what each pull changed.
 */
function ClubRegLink({ eventId }: { eventId: string }) {
  const [linked, setLinked] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pulls, setPulls] = useState<Pull[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const { events } = useSchedule();

  useEffect(() => {
    setLinked(null);
    setDraft('');
    setPulls([]);
    setProblem(null);
    setUnlinking(false);
    supabase
      ?.from('roster_sync')
      .select('clubreg_event_id')
      .eq('event_id', eventId)
      .maybeSingle()
      .then(({ data }) => setLinked(data?.clubreg_event_id ?? null));
    supabase
      ?.from('roster_pulls')
      .select('at, total, added, removed, problem')
      .eq('event_id', eventId)
      .order('at', { ascending: false })
      .limit(5)
      .then(({ data }) => setPulls((data as Pull[] | null) ?? []));
  }, [eventId]);

  const link = async () => {
    // Accepts the number, or a ClubReg link with the number at the end (signUp.cfm/event/16477).
    const id = /(\d{3,10})\D*$/.exec(draft.trim())?.[1];
    if (!id) return setProblem('Type the ClubReg event number, for example 16477.');
    // One ClubReg event fills one list: linking it twice would copy the same drivers into both events.
    const { data: taken } = await supabase!
      .from('roster_sync')
      .select('event_id')
      .eq('clubreg_event_id', id)
      .neq('event_id', eventId)
      .limit(1);
    if (taken?.length) {
      const other = events.find((e) => e.id === taken[0].event_id)?.name ?? 'another event';
      return setProblem(`ClubReg event ${id} is already linked to ${other}. Unlink it there first.`);
    }
    const { error } = await supabase!.from('roster_sync').upsert({ event_id: eventId, clubreg_event_id: id });
    if (error) return setProblem(`Not saved: ${error.message}`);
    setProblem(null);
    setLinked(id);
  };

  const unlink = async () => {
    await supabase?.from('roster_sync').delete().eq('event_id', eventId);
    setUnlinking(false);
    setLinked(null);
  };

  return (
    <View style={styles.sync}>
      <Text style={styles.syncTitle}>Pull from ClubReg automatically</Text>
      {linked ? (
        <>
          <Text style={styles.detail}>
            Linked to ClubReg event {linked}. Pulled at 5:30 AM two days before, the day before and each event morning.
          </Text>
          {unlinking ? (
            <Pressable onPress={unlink}>
              <Text style={styles.danger}>Stop pulling from ClubReg?</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => setUnlinking(true)}>
              <Text style={styles.detail}>Unlink</Text>
            </Pressable>
          )}
        </>
      ) : (
        <>
          <Text style={styles.detail}>
            Type the event's number from its ClubReg link (signUp.cfm/event/16477 → 16477). The list then updates itself
            at 5:30 AM two days before, the day before and each event morning: new sign-ups added, cancellations removed.
          </Text>
          <View style={[styles.buttons, styles.linkRow]}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="ClubReg event number"
              placeholderTextColor={colors.muted}
              inputMode="numeric"
            />
            <Pressable onPress={link} style={[styles.small, styles.primary]}>
              <Text style={styles.btnText}>Link</Text>
            </Pressable>
          </View>
        </>
      )}
      {problem ? <Text style={styles.danger}>{problem}</Text> : null}
      {shownPulls(pulls).map((p) => (
        <Text key={p.at} style={[styles.detail, p.problem ? styles.pullProblem : null]}>
          {new Date(p.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} ·{' '}
          {p.problem ?? [`${p.total} drivers`, changes('new', p.added), changes('cancelled', p.removed)].filter(Boolean).join(' · ')}
        </Text>
      ))}
    </View>
  );
}

/** Up to 8 names, otherwise just how many (the first pull "adds" everyone). */
const changes = (what: string, names: string[]) =>
  !names.length ? '' : names.length > 8 ? `${names.length} ${what}` : `${names.length} ${what}: ${names.join(', ')}`;

/** The last three pulls; a failure only shows while no later pull has worked. */
function shownPulls(pulls: Pull[]): Pull[] {
  const worked = pulls.findIndex((p) => !p.problem);
  return pulls.filter((p, i) => !p.problem || worked < 0 || i < worked).slice(0, 3);
}

const paidFor = (rows: RosterRow[]) => rows.filter((r) => r.coaching).length;

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
  sync: { backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 10, gap: 6 },
  syncTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  linkRow: { alignItems: 'center', marginTop: 4 },
  input: { flex: 1, backgroundColor: colors.cardRaised, color: colors.text, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 10, fontSize: 16 },
  pullProblem: { color: '#FF6961' },
});
