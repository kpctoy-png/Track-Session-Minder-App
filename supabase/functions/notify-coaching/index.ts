// Emails the student (and the coach, if given) when a coaching session is
// booked, changed or removed. A trigger on coaching_sessions (supabase/schema.sql)
// calls this function; see README "Coaching emails" for the setup.
//
// Secrets (Edge Functions -> Secrets): SMTP_USER (the Google address) and
// SMTP_PASS (its app password). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// provided by Supabase automatically.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@6.9.15';

const APP_URL = 'https://kpctoy-png.github.io/Track-Session-Minder-App/';

interface Coaching {
  id: string;
  day_id: string;
  item_id: string | null;
  student_email: string;
  coach: string;
  coach_email: string | null;
  start_time: string;
  end_time: string;
  notes: string | null;
}

interface Payload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  record: Coaching | null;
  old_record: Coaching | null;
}

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const mailer = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: Deno.env.get('SMTP_USER'), pass: Deno.env.get('SMTP_PASS') },
});

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "13:05" -> "1:05 PM" */
function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The event, day and current times of a session (times follow running-late bumps through its schedule item). */
async function describe(c: Coaching) {
  const { data: day } = await db.from('event_days').select('label, date, items, events (name, track)').eq('id', c.day_id).single();
  const item = (day?.items as { id: string; start: string; end: string }[] | undefined)?.find((i) => i.id === c.item_id);
  if (!day) return null;
  const event = day.events as unknown as { name: string; track: string };
  return {
    event: event.name,
    track: event.track,
    date: `${day.label}, ${MONTHS[Number(day.date.slice(5, 7)) - 1]} ${Number(day.date.slice(8, 10))}`,
    time: `${formatTime(item?.start ?? c.start_time)} – ${formatTime(item?.end ?? c.end_time)}`,
  };
}

async function send(to: string[], subject: string, lines: string[]) {
  const html = lines.map((l) => `<p>${l}</p>`).join('') + `<p><a href="${APP_URL}">Open Track Session Minder</a></p>`;
  await mailer.sendMail({ from: `Track Session Minder <${Deno.env.get('SMTP_USER')}>`, to, subject, html });
}

async function fromDatabase(req: Request): Promise<boolean> {
  if (req.headers.get('Authorization') === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) return true;
  const given = req.headers.get('x-webhook-secret');
  if (!given) return false;
  const { data } = await db.from('webhook_secrets').select('secret').eq('name', 'notify-coaching').single();
  return !!data && data.secret === given;
}

Deno.serve(async (req) => {
  // Only the database may call this: its trigger sends a secret from the webhook_secrets table (or, from a
  // dashboard webhook, the service role key). Without this check, anyone could make the function email any address.
  if (!(await fromDatabase(req))) return new Response('forbidden', { status: 403 });
  const { type, record, old_record } = (await req.json()) as Payload;
  const c = record ?? old_record;
  if (!c) return new Response('nothing to do');

  const recipients = [c.student_email, c.coach_email].filter((e): e is string => !!e);
  const d = await describe(c);
  // The whole event was deleted (its days and bookings go with it), so there's nothing meaningful to say.
  if (!d) return new Response('event gone');
  const coach = c.coach ? escape(c.coach) : 'your coach';
  const where = `<b>${escape(d.event)}</b>${d.track ? ` at ${escape(d.track)}` : ''}`;

  if (type === 'DELETE') {
    await send(recipients, `Coaching cancelled: ${d.event}, ${d.date}`, [
      `The coaching session with ${coach} on ${escape(d.date)}, ${d.time}, at ${where} has been cancelled.`,
      'Questions? Reply to this email.',
    ]);
  } else {
    const changed = type === 'UPDATE';
    await send(recipients, `${changed ? 'Coaching updated' : 'Coaching booked'}: ${d.event}, ${d.date} at ${d.time.split(' – ')[0]}`, [
      `${changed ? 'Your coaching session has changed.' : 'You have a coaching session booked.'}`,
      `<b>${escape(d.date)}, ${d.time}</b> with ${coach}<br>${where}`,
      ...(c.notes ? [`Note: ${escape(c.notes)}`] : []),
      `Sign in on the app's <b>Me</b> tab with ${escape(c.student_email)} to see it on your schedule, with a countdown. If the day runs late, the app shows the new time.`,
    ]);
  }
  return new Response('sent');
});
