// Phone alerts (web push) for schedule changes, on the web version of the app.
// A driver turns alerts on for one event; when an organizer saves a change to it,
// the push-schedule Edge Function alerts every phone signed up for that event.
// On iPhone this only works once the app has been added to the home screen.

import { Platform } from 'react-native';

import { supabase } from './supabase';

export type AlertsState =
  | { state: 'unsupported' } // Not a browser that can show alerts, or alerts aren't set up yet.
  | { state: 'add-to-home-screen' } // iPhone or iPad Safari: alerts need the home screen app.
  | { state: 'blocked' } // The driver said no; only their phone's settings can undo that.
  | { state: 'off' }
  | { state: 'on'; eventId: string };

const EVENT_KEY = 'tsm-alerts-event';

function storedEvent(): string | null {
  try {
    return localStorage.getItem(EVENT_KEY);
  } catch {
    return null;
  }
}

function storeEvent(eventId: string | null) {
  try {
    if (eventId) localStorage.setItem(EVENT_KEY, eventId);
    else localStorage.removeItem(EVENT_KEY);
  } catch {
    // Private browsing: alerts still work, the app just won't remember which event.
  }
}

/** The folder the app is served from, e.g. "/Track-Session-Minder-App/" (the manifest sits there). */
function appFolder(): string {
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  return manifest ? new URL('.', manifest.href).pathname : '/';
}

function isAppleMobile(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isHomeScreenApp(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

function canPush(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function publicKey(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.rpc('push_public_key');
  return typeof data === 'string' && data ? data : null;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(appFolder());
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function getAlertsState(): Promise<AlertsState> {
  if (Platform.OS !== 'web' || !supabase) return { state: 'unsupported' };
  if (isAppleMobile() && !isHomeScreenApp()) return { state: 'add-to-home-screen' };
  if (!canPush()) return { state: 'unsupported' };
  if (Notification.permission === 'denied') return { state: 'blocked' };
  if (!(await publicKey())) return { state: 'unsupported' };
  const eventId = storedEvent();
  return (await currentSubscription()) && eventId ? { state: 'on', eventId } : { state: 'off' };
}

/** Must be called straight from a tap: phones only ask for permission in response to one. */
export async function turnOnAlerts(eventId: string): Promise<string | null> {
  if (!supabase) return 'Alerts are not available.';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'Alerts were not allowed. You can allow them later in your phone settings.';
  const key = await publicKey();
  if (!key) return 'Alerts are not set up yet.';
  try {
    const registration = await navigator.serviceWorker.register(`${appFolder()}sw.js`, { scope: appFolder() });
    await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(key) }));
    const { endpoint, keys } = subscription.toJSON();
    const { error } = await supabase.rpc('subscribe_push', {
      sub_endpoint: endpoint,
      sub_p256dh: keys?.p256dh,
      sub_auth: keys?.auth,
      sub_event: eventId,
    });
    if (error) return `Couldn't turn on alerts: ${error.message}`;
    storeEvent(eventId);
    return null;
  } catch (err) {
    return `Couldn't turn on alerts: ${(err as Error).message}`;
  }
}

export async function turnOffAlerts(): Promise<void> {
  const subscription = await currentSubscription();
  if (subscription) {
    await supabase?.rpc('unsubscribe_push', { sub_endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
  storeEvent(null);
}

/** Organizers: makes the alert keys the first time, so drivers can turn alerts on. */
export function setUpAlerts() {
  supabase?.functions.invoke('push-schedule', { body: { action: 'setup' } }).catch(() => {});
}

/** Organizers: alerts the phones signed up for this event. Failing to alert never undoes the change. */
export function alertDrivers(eventId: string, body: string) {
  supabase?.functions
    .invoke('push-schedule', { body: { action: 'send', eventId, body } })
    .then(({ error }) => error && console.warn('Alerts not sent:', error.message))
    .catch(() => {});
}

function fromBase64Url(value: string): ArrayBuffer {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
}
