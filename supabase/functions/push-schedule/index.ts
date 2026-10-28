// Phone alerts (web push) for schedule changes. See README "Phone alerts" for the setup.
//
// The app calls it with { action: 'setup' } when an organizer opens Admin (this makes the
// alert keys the first time, so drivers can then turn alerts on), and with
// { action: 'send', eventId, dayId, body } after an organizer's change is saved. Sending checks
// that the signed-in user may manage the event's club, then alerts every phone signed up
// for that event, plus the students and instructors whose bookings that change moved.
//
// The database calls it too, with the secret from its webhook_secrets table:
// { action: 'booking' } from a trigger when a coaching session or check ride is booked,
// changed or removed, and { action: 'reminders' } every minute (pg_cron) to send the
// "starts in 15 minutes" reminders. Booking alerts reach the phones whose driver turned
// alerts on while signed in with the student's or instructor's email.
//
// { action: 'email', eventId, message } emails an announcement to the event's registered
// drivers (the event_roster list its organizers uploaded), after the same organizer check.
//
// The "ClubReg sync" GitHub Action calls it with the ROSTER_SYNC_TOKEN secret (set in both places):
// { action: 'roster-due' } lists the events linked to ClubReg that are due a pull (from two days
// before through the last day; with all: true, every linked event that hasn't ended), and
// { action: 'roster-pull', eventId, rows } replaces that event's roster and logs who was added
// and who cancelled. { action: 'roster-pull', eventId, problem } logs a failed pull and keeps the list.
//
// The alert keys are made here and kept in the push_config table, which only the service
// role can read. Emails use the SMTP_USER and SMTP_PASS secrets already set for
// notify-coaching. SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
// provided by Supabase automatically.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@6.9.15';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

const APP_URL = 'https://kpctoy-png.github.io/Track-Session-Minder-App/';

const url = Deno.env.get('SUPABASE_URL')!;
const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** The alert keys, made and stored the first time they're needed. */
async function vapidKeys(): Promise<CryptoKeyPair> {
  const load = () => db.from('push_config').select('public_jwk, private_jwk').eq('id', 1).maybeSingle();
  const { data } = await load();
  if (data) return webpush.importVapidKeys({ publicKey: data.public_jwk, privateKey: data.private_jwk });

  const keys = await webpush.generateVapidKeys({ extractable: true });
  const exported = await webpush.exportVapidKeys(keys);
  const { error } = await db.from('push_config').insert({
    id: 1,
    public_key: await webpush.exportApplicationServerKey(keys),
    public_jwk: exported.publicKey,
    private_jwk: exported.privateKey,
  });
  if (!error) return keys;
  // Another call made them at the same moment: use those.
  const { data: theirs } = await load();
  if (!theirs) throw error;
  return webpush.importVapidKeys({ publicKey: theirs.public_jwk, privateKey: theirs.private_jwk });
}

/** True if the caller is signed in and may change this club's events. */
async function canManage(req: Request, clubId: string): Promise<boolean> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token) return false;
  const { data } = await db.auth.getUser(token);
  if (!data.user) return false;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: allowed } = await asUser.rpc('can_manage_club', { club: clubId });
  return allowed === true;
}

interface Sub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface Item {
  id: string;
  start: string;
  end: string;
}

interface Booking {
  id: string;
  day_id: string;
  item_id: string | null;
  kind: string;
  student_email: string;
  coach: string;
  coach_email: string | null;
  start_time: string;
  end_time: string;
}

/** Sends one alert to each phone, and forgets phones whose alerts were turned off. */
async function pushTo(subs: Sub[], alert: { title: string; body: string; tag: string }) {
  if (!subs.length) return { sent: 0, removed: 0 };
  const server = await webpush.ApplicationServer.new({ contactInformation: APP_URL, vapidKeys: await vapidKeys() });
  const message = JSON.stringify({ ...alert, url: APP_URL });
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await server
          .subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
          .pushTextMessage(message, { urgency: webpush.Urgency.High, ttl: 3600, topic: alert.tag.slice(0, 32) });
        sent++;
      } catch (err) {
        // 404/410: the phone turned alerts off or the browser dropped the subscription.
        const status = err instanceof webpush.PushMessageError ? err.response.status : 0;
        if (status === 404 || status === 410) gone.push(s.endpoint);
        else console.error('push failed', status, String(err));
      }
    }),
  );
  if (gone.length) await db.from('push_subscriptions').delete().in('endpoint', gone);
  return { sent, removed: gone.length };
}

/** Phones signed in with this email (lowercase) when alerts were turned on. */
async function phonesOf(email: string | null | undefined): Promise<Sub[]> {
  if (!email) return [];
  const { data } = await db.from('push_subscriptions').select('endpoint, p256dh, auth').eq('email', email.toLowerCase());
  return data ?? [];
}

/** True when the request comes from the database (trigger or timer). */
async function fromDatabase(req: Request): Promise<boolean> {
  const given = req.headers.get('x-webhook-secret');
  if (!given) return false;
  const { data } = await db.from('webhook_secrets').select('secret').eq('name', 'push-schedule').maybeSingle();
  return !!data && data.secret === given;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** "1:05 PM", as the app shows times. */
function formatTime(hhmm: string): string {
  const total = toMinutes(hhmm);
  const h = Math.floor(total / 60);
  return `${((h + 11) % 12) + 1}:${String(total % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** The booking's start, taken from its schedule item when that still exists, as the app does. */
function startOf(b: Booking, items: Item[] | null | undefined): string {
  return (b.item_id && items?.find((i) => i.id === b.item_id)?.start) || b.start_time;
}

const kindName = (b: Booking) => (b.kind === 'checkride' ? 'check ride' : 'coaching session');
const capital = (text: string) => text[0].toUpperCase() + text.slice(1);
const withCoach = (b: Booking) => (b.coach ? `, with ${b.coach}` : '');
/** What the instructor's alerts call the booking: "Check ride for sam@example.com". */
const forStudent = (b: Booking) => `${b.kind === 'checkride' ? 'Check ride' : 'Coaching'} for ${b.student_email}`;

/** Alerts the student, and the instructor when they have a different email. */
async function alertBooking(b: Booking, title: string, student: string, coach: string) {
  const tag = `booking-${b.id}`;
  await pushTo(await phonesOf(b.student_email), { title, body: student, tag });
  if (b.coach_email && b.coach_email.toLowerCase() !== b.student_email)
    await pushTo(await phonesOf(b.coach_email), { title, body: coach, tag });
}

/** A booking was made, changed or removed. */
async function bookingChanged(input: { type: string; record: Booking | null; old_record: (Booking & { event_name?: string; day_label?: string; day_items?: Item[] }) | null }) {
  const b = input.record ?? input.old_record;
  if (!b) return;
  if (input.type === 'DELETE') {
    const old = input.old_record!;
    const when = `${old.day_label ? `on ${old.day_label} ` : ''}at ${formatTime(startOf(old, old.day_items))}`;
    await alertBooking(old, old.event_name ?? 'Track Session Minder',
      `Your ${kindName(old)} ${when} was cancelled.`, `${forStudent(old)} ${when} was cancelled.`);
    return;
  }
  const { data: day } = await db.from('event_days').select('label, items, events(name)').eq('id', b.day_id).maybeSingle();
  const start = startOf(b, day?.items);
  const old = input.old_record;
  if (input.type === 'UPDATE' && old) {
    const same = (['day_id', 'item_id', 'kind', 'student_email', 'coach', 'coach_email', 'start_time'] as const).every((k) => old[k] === b[k]);
    if (same) return; // Only the notes changed.
  }
  const when = `${day?.label ? `${day.label} ` : ''}at ${formatTime(start)}`;
  const title = (day?.events as { name?: string } | null)?.name ?? 'Track Session Minder';
  if (input.type === 'INSERT')
    await alertBooking(b, title, `Your ${kindName(b)} is booked: ${when}${withCoach(b)}.`, `${forStudent(b)} is booked: ${when}.`);
  else
    await alertBooking(b, title, `Your ${kindName(b)} changed: now ${when}${withCoach(b)}.`, `${forStudent(b)} changed: now ${when}.`);
  await db.from('booking_push_state').upsert({ session_id: b.id, notified_start: start });
}

/** After a schedule change: alerts the bookings on that day whose start time it moved. */
async function bookingsMoved(dayId: string, eventName: string) {
  const { data: day } = await db.from('event_days').select('label, items').eq('id', dayId).maybeSingle();
  const { data: bookings } = await db.from('coaching_sessions').select('*').eq('day_id', dayId).not('item_id', 'is', null);
  if (!day || !bookings?.length) return;
  const { data: states } = await db.from('booking_push_state').select('session_id, notified_start').in('session_id', bookings.map((b) => b.id));
  for (const b of bookings as Booking[]) {
    const start = startOf(b, day.items);
    const before = states?.find((s) => s.session_id === b.id)?.notified_start ?? b.start_time;
    if (start === before) continue;
    const when = `${formatTime(start)} (${day.label})`;
    await alertBooking(b, eventName, `Your ${kindName(b)} moved to ${when}${withCoach(b)}.`, `${forStudent(b)} moved to ${when}.`);
    await db.from('booking_push_state').upsert({ session_id: b.id, notified_start: start });
  }
}

/** The date ("2026-10-31") and minute of the day (with seconds as a fraction) at the track right now. */
function localNow(timeZone: string): { date: string; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) + Number(parts.second) / 60 };
}

const REMIND_BEFORE = 15;

/** Runs every minute: "starts in 15 minutes" for bookings about to start. */
async function sendReminders() {
  const today = new Date();
  const dates = [-1, 0, 1].map((d) => new Date(today.getTime() + d * 86400000).toISOString().slice(0, 10));
  const { data: days } = await db.from('event_days').select('id, date, items, events(name, time_zone)').in('date', dates);
  let reminded = 0;
  for (const day of days ?? []) {
    const event = day.events as { name: string; time_zone: string | null } | null;
    const now = localNow(event?.time_zone || 'America/New_York');
    if (now.date !== day.date) continue;
    const { data: bookings } = await db.from('coaching_sessions').select('*').eq('day_id', day.id);
    if (!bookings?.length) continue;
    const { data: states } = await db.from('booking_push_state').select('session_id, reminded_start').in('session_id', bookings.map((b) => b.id));
    for (const b of bookings as Booking[]) {
      const start = startOf(b, day.items);
      const until = toMinutes(start) - now.minute;
      // A two-minute window, so a late timer run still catches it; reminded_start stops repeats.
      if (until <= REMIND_BEFORE - 2 || until > REMIND_BEFORE) continue;
      if (states?.find((s) => s.session_id === b.id)?.reminded_start === start) continue;
      const mins = `${Math.ceil(until)} minutes (${formatTime(start)})`;
      const instructor = b.coach ? `your instructor, ${b.coach}` : 'your instructor';
      await alertBooking(b, event?.name ?? 'Track Session Minder',
        `Your ${kindName(b)} starts in ${mins}, please pair with ${instructor}.`,
        `${forStudent(b)} starts in ${mins}, please pair with your student.`);
      await db.from('booking_push_state').upsert({ session_id: b.id, reminded_start: start });
      reminded++;
    }
  }
  return reminded;
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Emails an announcement to everyone on the event's roster (or only the given run groups), 50 at a time in
 * Bcc so nobody sees the others' addresses. Returns how many addresses it went to.
 */
async function emailRoster(eventId: string, eventName: string, message: string, groups?: string[]): Promise<number> {
  let query = db.from('event_roster').select('email').eq('event_id', eventId).not('email', 'is', null);
  if (groups) query = query.in('run_group', groups);
  const { data } = await query;
  const emails = [...new Set((data ?? []).map((r) => r.email as string))];
  if (!emails.length) return 0;
  const from = Deno.env.get('SMTP_USER');
  const mailer = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: from, pass: Deno.env.get('SMTP_PASS') },
  });
  const html =
    `<p style="font-size:20px;font-weight:bold">${escape(message)}</p>` +
    `<p>From the organizers of ${escape(eventName)}. See the latest schedule in ` +
    `<a href="${APP_URL}">Track Session Minder</a>.</p>`;
  for (let i = 0; i < emails.length; i += 50)
    await mailer.sendMail({
      from: `"${eventName.replace(/["<>]/g, '')} via Track Session Minder" <${from}>`,
      to: from,
      bcc: emails.slice(i, i + 50),
      subject: `${eventName}: ${message.length > 70 ? message.slice(0, 67) + '…' : message}`,
      html,
    });
  return emails.length;
}

/** Whether the call carries the ROSTER_SYNC_TOKEN secret. */
function fromSyncRobot(input: { token?: unknown }): boolean {
  const secret = Deno.env.get('ROSTER_SYNC_TOKEN') ?? '';
  const given = String(input.token ?? '');
  if (secret.length < 20 || given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

const addDays = (date: string, days: number) => new Date(Date.parse(date + 'T12:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);

/** Linked events due a ClubReg pull today, in each track's time zone. */
async function rosterDue(all: boolean) {
  const { data: links } = await db.from('roster_sync').select('event_id, clubreg_event_id, events (name, time_zone, event_days (date))');
  const due = [];
  for (const l of (links ?? []) as unknown as { event_id: string; clubreg_event_id: string; events: { name: string; time_zone: string | null; event_days: { date: string }[] } | null }[]) {
    const dates = (l.events?.event_days ?? []).map((d) => d.date).sort();
    if (!dates.length) continue;
    const today = localNow(l.events?.time_zone ?? 'America/New_York').date;
    const last = dates[dates.length - 1];
    if (today > last || (!all && today < addDays(dates[0], -2))) continue;
    due.push({ eventId: l.event_id, clubregEventId: l.clubreg_event_id, name: l.events?.name ?? l.event_id });
  }
  return due;
}

type PulledRow = { name?: unknown; email?: unknown; runGroup?: unknown; coaching?: unknown };

/** Replaces an event's roster with a fresh pull and logs the difference from the last list. */
async function rosterPull(eventId: string, pulled: PulledRow[]) {
  const rows = new Map<string, { event_id: string; name: string; email: string; run_group: string | null; coaching: number }>();
  for (const r of pulled.slice(0, 2000)) {
    const email = String(r.email ?? '').trim().toLowerCase().slice(0, 254);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    const coaching = Math.min(20, Math.max(0, Math.floor(Number(r.coaching) || 0)));
    rows.set(email, { event_id: eventId, name: String(r.name ?? '').slice(0, 200), email, run_group: String(r.runGroup ?? '').slice(0, 60) || null, coaching });
  }
  if (!rows.size) {
    await db.from('roster_pulls').insert({ event_id: eventId, problem: 'ClubReg returned no drivers, so the list was kept.' });
    return { kept: true };
  }
  const { data: before } = await db.from('event_roster').select('name, email').eq('event_id', eventId);
  const old = new Map((before ?? []).map((r) => [r.email as string, r.name as string]));
  const label = (name: string, email: string) => name || email;
  const added = [...rows.values()].filter((r) => !old.has(r.email)).map((r) => label(r.name, r.email));
  const removed = [...old].filter(([email]) => !rows.has(email)).map(([email, name]) => label(name, email));
  const del = await db.from('event_roster').delete().eq('event_id', eventId);
  if (del.error) throw del.error;
  const ins = await db.from('event_roster').insert([...rows.values()]);
  if (ins.error) throw ins.error;
  await db.from('roster_pulls').insert({ event_id: eventId, total: rows.size, added: added.slice(0, 100), removed: removed.slice(0, 100) });
  return { total: rows.size, added: added.length, removed: removed.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });

  try {
    const input = await req.json();

    if (input.action === 'setup') {
      await vapidKeys();
      return reply(200, { ok: true });
    }

    if (input.action === 'send') {
      const eventId = String(input.eventId ?? '');
      const body = String(input.body ?? '').slice(0, 200);
      const { data: event } = await db.from('events').select('name, club_id').eq('id', eventId).maybeSingle();
      if (!event || !body) return reply(400, { error: 'Unknown event or empty message' });
      if (!(await canManage(req, event.club_id))) return reply(403, { error: 'Not an organizer for this event' });

      const { data: subs } = await db.from('push_subscriptions').select('endpoint, p256dh, auth').eq('event_id', eventId);
      const result = await pushTo(subs ?? [], { title: event.name, body, tag: eventId });
      if (input.dayId) await bookingsMoved(String(input.dayId), event.name);
      return reply(200, result);
    }

    if (input.action === 'email') {
      const eventId = String(input.eventId ?? '');
      const message = String(input.message ?? '').slice(0, 200);
      const { data: event } = await db.from('events').select('name, club_id').eq('id', eventId).maybeSingle();
      if (!event || !message.trim()) return reply(400, { error: 'Unknown event or empty message' });
      if (!(await canManage(req, event.club_id))) return reply(403, { error: 'Not an organizer for this event' });
      const groups = Array.isArray(input.groups) ? input.groups.map(String).slice(0, 20) : undefined;
      return reply(200, { emailed: await emailRoster(eventId, event.name, message, groups?.length ? groups : undefined) });
    }

    if (input.action === 'roster-due' || input.action === 'roster-pull') {
      if (!fromSyncRobot(input)) return reply(403, { error: 'Wrong or missing sync token' });
      if (input.action === 'roster-due') return reply(200, { due: await rosterDue(!!input.all) });
      const eventId = String(input.eventId ?? '');
      const { data: link } = await db.from('roster_sync').select('event_id').eq('event_id', eventId).maybeSingle();
      if (!link) return reply(400, { error: 'That event is not linked to ClubReg' });
      if (input.problem) {
        await db.from('roster_pulls').insert({ event_id: eventId, problem: String(input.problem).slice(0, 300) });
        return reply(200, { logged: true });
      }
      return reply(200, await rosterPull(eventId, Array.isArray(input.rows) ? input.rows : []));
    }

    if (input.action === 'booking' || input.action === 'reminders') {
      if (!(await fromDatabase(req))) return reply(403, { error: 'Only the database may call this' });
      if (input.action === 'booking') {
        await bookingChanged(input);
        return reply(200, { ok: true });
      }
      return reply(200, { reminded: await sendReminders() });
    }

    return reply(400, { error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return reply(500, { error: String(err) });
  }
});
