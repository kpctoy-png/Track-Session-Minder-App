import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { BookingKind } from '@/data/types';
import { bookingName, COACHING_OFFER, coachingTimes, findClash, isEmail } from '@/lib/coaching';
import { runGroupFor } from '@/lib/roster';
import { todayISO } from '@/lib/dates';
import { formatRange, formatTime, sortItems, toMinutes } from '@/lib/schedule';
import { useSchedule } from '@/lib/ScheduleStore';
import { supabase } from '@/lib/supabase';
import { GrammarCheck } from './GrammarCheck';
import { colors } from './theme';

interface Request {
  id: string;
  email: string;
  note: string | null;
  paid: boolean;
  created_at: string;
}

interface Paid {
  name: string;
  email: string;
  run_group: string | null;
  coaching: number;
}

/**
 * Admin list of the selected day's coaching sessions and check rides, with a form to book one for a student.
 * When the event's registered drivers list says who paid for coaching, it also lists them with how many of their
 * sessions are booked, and booking one fills in the form.
 */
export function CoachingAdmin({ rosterVersion }: { rosterVersion: number }) {
  const { event, day, coaching, addCoaching, removeCoaching } = useSchedule();
  const [paid, setPaid] = useState<Paid[]>([]);
  const [forGroup, setForGroup] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<BookingKind>('coaching');
  const [showFinished, setShowFinished] = useState(false);
  const [email, setEmail] = useState('');
  const [coach, setCoach] = useState('');
  const [coachEmail, setCoachEmail] = useState('');
  const [itemId, setItemId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Removing sends the student and instructor an email and an alert, so it waits for a second tap.
  const [removing, setRemoving] = useState<string | null>(null);
  // Which Book button opened the form ("paid:<email>" or "request:<id>"), so it shows under that row.
  const [bookingFrom, setBookingFrom] = useState<string | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  // The request being booked, marked booked once the booking saves.
  const [forRequest, setForRequest] = useState<string | null>(null);
  // Declining tells the driver it's full, and accepting unlocks booking, so both wait for a second tap.
  const [declining, setDeclining] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  useEffect(() => {
    setRequests([]);
    supabase
      ?.from('coaching_requests')
      .select('id, email, note, paid, created_at')
      .eq('event_id', event.id)
      .eq('status', 'open')
      .order('created_at')
      .then(({ data }) => setRequests(data ?? []));
  }, [event.id, rosterVersion]);

  const answer = async (id: string, status: 'booked' | 'declined') => {
    const { error } = await supabase!.from('coaching_requests').update({ status }).eq('id', id);
    if (error) return setError(error.message);
    setRequests((r) => r.filter((x) => x.id !== id));
  };

  const markPaid = async (id: string) => {
    setMarkingPaid(null);
    const { error } = await supabase!.from('coaching_requests').update({ paid: true }).eq('id', id);
    if (error) return setError(error.message);
    setRequests((r) => r.map((x) => (x.id === id ? { ...x, paid: true } : x)));
  };
  const price = COACHING_OFFER[event.clubId]?.amount;

  useEffect(() => {
    setPaid([]);
    supabase
      ?.from('event_roster')
      .select('name, email, run_group, coaching')
      .eq('event_id', event.id)
      .gt('coaching', 0)
      .order('name')
      .then(({ data }) => setPaid(data ?? []));
  }, [event.id, rosterVersion]);

  // Coaching sessions each student has across the whole event (any day).
  const eventDays = new Set(event.days.map((d) => d.id));
  const bookedFor = (email: string) =>
    coaching.filter((c) => c.kind !== 'checkride' && eventDays.has(c.dayId) && c.studentEmail.toLowerCase() === email).length;
  const needs = paid
    .map((p) => ({ ...p, booked: bookedFor(p.email) }))
    .sort((a, b) => Number(a.booked >= a.coaching) - Number(b.booked >= b.coaching) || a.name.localeCompare(b.name));
  const waiting = needs.filter((p) => p.booked < p.coaching).length;
  const suggested = runGroupFor(forGroup ?? undefined);

  const startBooking = (p: Paid, request?: string) => {
    setBookingFrom(request ? `request:${request}` : `paid:${p.email}`);
    setForRequest(request ?? null);
    setKind('coaching');
    setEmail(p.email);
    setForGroup(p.run_group);
    setItemId(null);
    setError(null);
    setAdding(true);
  };

  const all = coaching
    .filter((c) => c.dayId === day.id)
    .map((c) => ({ session: c, ...coachingTimes(c, day) }))
    .sort((a, b) => a.start.localeCompare(b.start));
  // Sessions that have ended fold away under "Finished", so the list shows what's still to come.
  const now = new Date();
  const today = todayISO(now);
  const isOver = (end: string) => day.date < today || (day.date === today && toMinutes(end) <= now.getHours() * 60 + now.getMinutes());
  const booked = all.filter((b) => !isOver(b.end));
  const finished = all.filter((b) => isOver(b.end));
  const items = sortItems(day.items);

  const save = async () => {
    const item = items.find((i) => i.id === itemId);
    if (!isEmail(email)) return setError("Enter the student's email. They sign in with it to see the session.");
    if (coachEmail.trim() && !isEmail(coachEmail)) return setError("Check the instructor's email, or leave it empty.");
    if (!item) return setError(`Pick the session the ${kind === 'checkride' ? 'check ride' : 'coaching'} happens in.`);
    const draft = {
      dayId: day.id,
      kind,
      itemId: item.id,
      studentEmail: email,
      coach: coach.trim(),
      coachEmail: coachEmail.trim() || undefined,
      start: item.start,
      end: item.end,
      notes: notes.trim() || undefined,
    };
    const clash = findClash(coaching, draft, day);
    if (clash) {
      const what = bookingName(clash.session.kind).toLowerCase();
      const when = formatRange(coachingTimes(clash.session, day));
      return setError(
        clash.who === 'student'
          ? `${clash.session.studentEmail} already has a ${what} at ${when}. Pick another session.`
          : `${draft.coach || draft.coachEmail} already has a ${what} with ${clash.session.studentEmail} at ${when}. Pick another session or instructor.`,
      );
    }
    setBusy(true);
    const problem = await addCoaching(draft);
    setBusy(false);
    if (problem) return setError(problem);
    if (forRequest) await answer(forRequest, 'booked');
    setForRequest(null);
    setEmail('');
    setNotes('');
    setItemId(null);
    setForGroup(null);
    setError(null);
    setAdding(false);
    setBookingFrom(null);
  };

  // Opened from a driver's Book button, the form shows under that driver; otherwise at the bottom.
  const form = (
          <View style={styles.form}>
            <View style={styles.chips}>
              {(['coaching', 'checkride'] as const).map((k) => (
                <Pressable key={k} onPress={() => setKind(k)} style={[styles.chip, kind === k && styles.chipOn]}>
                  <Text style={[styles.chipText, kind === k && styles.chipTextOn]}>{k === 'checkride' ? 'Check ride' : 'Coaching'}</Text>
                </Pressable>
              ))}
            </View>
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
              placeholder="Instructor's name"
              placeholderTextColor={colors.muted}
              spellCheck
              autoCorrect
              autoCapitalize="words"
              value={coach}
              onChangeText={setCoach}
            />
            <TextInput
              id="coach-email"
              style={styles.input}
              placeholder="Instructor's email (optional, they get their own email)"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              value={coachEmail}
              onChangeText={setCoachEmail}
            />
            <Text style={styles.label}>During which session?</Text>
            {suggested ? <Text style={styles.paidSub}>★ marks {forGroup} sessions.</Text> : null}
            <View style={styles.chips}>
              {items.map((item) => (
                <Pressable key={item.id} onPress={() => setItemId(item.id)} style={[styles.chip, itemId === item.id && styles.chipOn]}>
                  <Text style={[styles.chipText, itemId === item.id && styles.chipTextOn]}>
                    {suggested && item.groups?.includes(suggested) ? '★ ' : ''}
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
              spellCheck
              autoCorrect
              autoCapitalize="sentences"
              value={notes}
              onChangeText={setNotes}
            />
            <GrammarCheck text={notes} onChange={setNotes} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <Pressable onPress={save} style={[styles.btn, styles.btnPrimary]} disabled={busy}>
                <Text style={[styles.btnText, styles.btnTextPrimary]}>{busy ? 'Saving…' : kind === 'checkride' ? 'Book check ride' : 'Book coaching'}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setAdding(false);
                  setForGroup(null);
                  setBookingFrom(null);
                  setForRequest(null);
                }}
                style={styles.btn}
              >
                <Text style={styles.btnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
  );

  return (
    <View>
      <Text style={styles.sub}>
        Book a paid coaching session or a check ride for one student. The student and instructor each get an email, and see
        it in the app after signing in on the My Day tab. Nobody can be booked twice at the same time.
      </Text>
      {requests.length ? (
        <View style={styles.paid}>
          <Text style={styles.label}>Coaching requests: {requests.length}</Text>
          <Text style={styles.paidSub}>
            Drivers who asked from the app. At registration, check there's an open spot, take payment and tap Accept; then
            Book fills in their email. Drivers who paid in ClubReg can be booked straight away. Decline
            tells them it's full.
          </Text>
          {requests.map((r) => {
            const reg = paid.find((p) => p.email === r.email);
            const canBook = r.paid || !!reg;
            return (
              <View key={r.id}>
                <View style={styles.paidRow}>
                  <View style={styles.rowBody}>
                    <Text style={styles.paidName}>{reg?.name || r.email}</Text>
                    <Text style={styles.rowSub}>
                      {[reg ? `paid for ${reg.coaching} in ClubReg` : r.paid ? 'accepted and paid' : 'not accepted yet', r.note].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {canBook ? (
                    <Pressable
                      onPress={() => startBooking(reg ?? { name: '', email: r.email, run_group: null, coaching: 0 }, r.id)}
                      style={[styles.btn, styles.btnPrimary]}
                    >
                      <Text style={[styles.btnText, styles.btnTextPrimary]}>Book</Text>
                    </Pressable>
                  ) : (
                    <Pressable onPress={() => setMarkingPaid(markingPaid === r.id ? null : r.id)} style={[styles.btn, styles.btnPrimary]}>
                      <Text style={[styles.btnText, styles.btnTextPrimary]}>Accept</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => setDeclining(declining === r.id ? null : r.id)} style={styles.remove}>
                    <Text style={styles.removeText}>Decline</Text>
                  </Pressable>
                </View>
                {markingPaid === r.id ? (
                  <View style={styles.confirm}>
                    <Text style={styles.confirmText}>
                      Is there an open coaching spot for {reg?.name || r.email}, and did they pay{price ? ` ${price}` : ''}? Only
                      accept if there's room.
                    </Text>
                    <View style={styles.actions}>
                      <Pressable onPress={() => markPaid(r.id)} style={[styles.btn, styles.btnPrimary]}>
                        <Text style={[styles.btnText, styles.btnTextPrimary]}>Yes, accept</Text>
                      </Pressable>
                      <Pressable onPress={() => setMarkingPaid(null)} style={styles.btn}>
                        <Text style={styles.btnText}>Not yet</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
                {declining === r.id ? (
                  <View style={styles.confirm}>
                    <Text style={styles.confirmText}>Decline {r.email}'s request? They get an email and alert saying coaching is full.</Text>
                    <View style={styles.actions}>
                      <Pressable
                        onPress={() => {
                          setDeclining(null);
                          answer(r.id, 'declined');
                        }}
                        style={[styles.btn, styles.btnDanger]}
                      >
                        <Text style={styles.btnText}>Yes, decline</Text>
                      </Pressable>
                      <Pressable onPress={() => setDeclining(null)} style={styles.btn}>
                        <Text style={styles.btnText}>Keep it</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
                {adding && bookingFrom === `request:${r.id}` ? form : null}
              </View>
            );
          })}
        </View>
      ) : null}
      {needs.length ? (
        <View style={styles.paid}>
          <Text style={styles.label}>
            {waiting ? `Needs a coach: ${waiting} ${waiting === 1 ? 'driver' : 'drivers'}` : 'Everyone who paid for coaching is booked'}
          </Text>
          <Text style={styles.paidSub}>From the registered drivers list. Booked counts every day of {event.name}.</Text>
          {needs.map((p) => (
            <View key={p.email}>
            <View style={styles.paidRow}>
              <View style={styles.rowBody}>
                <Text style={styles.paidName}>{p.name || p.email}</Text>
                <Text style={styles.rowSub}>
                  {[p.run_group, `${p.booked} of ${p.coaching} booked`].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {p.booked < p.coaching ? (
                <Pressable onPress={() => startBooking(p)} style={[styles.btn, styles.btnPrimary]}>
                  <Text style={[styles.btnText, styles.btnTextPrimary]}>Book</Text>
                </Pressable>
              ) : (
                <Text style={styles.done}>✓</Text>
              )}
            </View>
            {adding && bookingFrom === `paid:${p.email}` ? form : null}
            </View>
          ))}
        </View>
      ) : null}
      {booked.map(({ session, start, end }) => (
        <View key={session.id}>
        <View style={styles.row}>
          <View style={styles.rowBody}>
            <Text style={styles.rowTime}>{formatRange({ start, end })}</Text>
            <Text style={styles.rowTitle}>{session.studentEmail}</Text>
            <Text style={styles.rowSub}>
              {bookingName(session.kind)} · {session.coach ? `Instructor: ${session.coach}` : 'No instructor named'}
              {session.notes ? ` · ${session.notes}` : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => setRemoving(removing === session.id ? null : session.id)}
            style={styles.remove}
            accessibilityLabel={`Remove ${bookingName(session.kind).toLowerCase()} for ${session.studentEmail}`}
          >
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
        {removing === session.id ? (
          <View style={styles.confirm}>
            <Text style={styles.confirmText}>
              Cancel this {bookingName(session.kind).toLowerCase()} for {session.studentEmail}? They (and the instructor) get a
              cancellation email and alert.
            </Text>
            <View style={styles.actions}>
              <Pressable
                onPress={async () => {
                  setRemoving(null);
                  setError(await removeCoaching(session.id));
                }}
                style={[styles.btn, styles.btnDanger]}
              >
                <Text style={styles.btnText}>Yes, cancel it</Text>
              </Pressable>
              <Pressable onPress={() => setRemoving(null)} style={styles.btn}>
                <Text style={styles.btnText}>Keep it</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        </View>
      ))}

      {finished.length ? (
        <>
          <Pressable onPress={() => setShowFinished(!showFinished)} style={styles.finishedToggle} accessibilityRole="button">
            <Text style={styles.finishedToggleText}>
              {showFinished ? '▾' : '▸'} Finished ({finished.length})
            </Text>
          </Pressable>
          {showFinished
            ? finished.map(({ session, start, end }) => (
                <View key={session.id} style={[styles.row, styles.finishedRow]}>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTime}>{formatRange({ start, end })}</Text>
                    <Text style={styles.rowTitle}>{session.studentEmail}</Text>
                    <Text style={styles.rowSub}>
                      {bookingName(session.kind)} · {session.coach ? `Instructor: ${session.coach}` : 'No instructor named'}
                    </Text>
                  </View>
                </View>
              ))
            : null}
        </>
      ) : null}

      {adding && !bookingFrom ? (
        form
      ) : adding ? null : (
        <>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            onPress={() => {
              setBookingFrom(null);
              setAdding(true);
            }}
            style={[styles.btn, styles.btnPrimary, styles.addBtn]}
          >
            <Text style={[styles.btnText, styles.btnTextPrimary]}>+ Book coaching or check ride</Text>
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
  finishedToggle: { paddingVertical: 8 },
  finishedToggleText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  finishedRow: { opacity: 0.55, borderLeftColor: colors.border },
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
  btnDanger: { borderColor: '#FF453A' },
  confirm: { borderWidth: 2, borderColor: '#FF453A', borderRadius: 12, padding: 12, marginBottom: 8, gap: 10 },
  confirmText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  paid: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 12 },
  paidSub: { color: colors.muted, fontSize: 12, marginTop: -4, marginBottom: 8 },
  paidRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.border },
  paidName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  done: { color: '#34C759', fontSize: 20, fontWeight: '800', paddingHorizontal: 12 },
});
