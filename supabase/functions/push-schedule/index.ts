// Phone alerts (web push) for schedule changes. See README "Phone alerts" for the setup.
//
// The app calls it with { action: 'setup' } when an organizer opens Admin (this makes the
// alert keys the first time, so drivers can then turn alerts on), and with
// { action: 'send', eventId, body } after an organizer's change is saved. Sending checks
// that the signed-in user may manage the event's club, then alerts every phone signed up
// for that event and forgets phones whose alerts were turned off.
//
// No secrets to set: the keys are made here and kept in the push_config table, which
// only the service role can read. SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
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
      if (!subs?.length) return reply(200, { sent: 0, removed: 0 });

      const server = await webpush.ApplicationServer.new({ contactInformation: APP_URL, vapidKeys: await vapidKeys() });
      const message = JSON.stringify({ title: event.name, body, url: APP_URL, tag: eventId });
      let sent = 0;
      const gone: string[] = [];
      await Promise.all(
        subs.map(async (s) => {
          try {
            await server
              .subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
              .pushTextMessage(message, { urgency: webpush.Urgency.High, ttl: 3600, topic: 'schedule' });
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
      return reply(200, { sent, removed: gone.length });
    }

    return reply(400, { error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return reply(500, { error: String(err) });
  }
});
