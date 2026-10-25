// Holds the events and which one is being viewed. When the online database is
// configured, schedules load from it and every change made there shows up
// here within seconds. Otherwise the built-in sample events are used and
// admin changes only affect this device.

import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { LoadingOrError } from '@/components/LoadingOrError';
import { SAMPLE_EVENTS } from '@/data/sampleEvents';
import type { EventDay, ScheduleItem, TrackEvent } from '@/data/types';
import { sortItems } from './schedule';
import { supabase } from './supabase';

interface Clock {
  minuteOfDay: number;
  seconds: number;
  /** True when no event is running today, so we show a pretend time instead. */
  isPreview: boolean;
  setPreviewMinute: (minute: number) => void;
}

export type SyncStatus = 'offline' | 'loading' | 'live' | 'error';

interface ScheduleStore {
  events: TrackEvent[];
  event: TrackEvent;
  day: EventDay;
  selectEvent: (eventId: string) => void;
  selectDay: (dayId: string) => void;
  updateDay: (dayId: string, items: ScheduleItem[]) => void;
  sync: { status: SyncStatus; message?: string };
  /** Signed-in admin; always null when there is no database. */
  session: Session | null;
  clock: Clock;
}

const Context = createContext<ScheduleStore | null>(null);

function todayISO(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function findToday(events: TrackEvent[], now: Date) {
  const today = todayISO(now);
  for (const event of events) {
    const day = event.days.find((d) => d.date === today);
    if (day) return { event, day };
  }
  return null;
}

interface DayRow {
  id: string;
  event_id: string;
  label: string;
  date: string;
  items: ScheduleItem[];
}

function toDay(row: DayRow): EventDay {
  return { id: row.id, label: row.label, date: row.date, items: sortItems(row.items ?? []) };
}

async function fetchEvents(): Promise<TrackEvent[]> {
  if (!supabase) return SAMPLE_EVENTS;
  const { data, error } = await supabase
    .from('events')
    .select('id, name, track, location, sort, event_days (id, event_id, label, date, items)')
    .order('sort');
  if (error) throw error;
  return (data ?? [])
    .map((e) => ({
      id: e.id,
      name: e.name,
      track: e.track,
      location: e.location,
      days: (e.event_days as DayRow[]).map(toDay).sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .filter((e) => e.days.length > 0);
}

function replaceDay(events: TrackEvent[], day: EventDay): TrackEvent[] {
  return events.map((e) => ({ ...e, days: e.days.map((d) => (d.id === day.id ? day : d)) }));
}

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<TrackEvent[]>(supabase ? [] : SAMPLE_EVENTS);
  const [sync, setSync] = useState<ScheduleStore['sync']>({ status: supabase ? 'loading' : 'offline' });
  const [session, setSession] = useState<Session | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [eventId, setEventId] = useState<string | null>(null);
  const [dayId, setDayId] = useState<string | null>(null);
  const [previewMinute, setPreviewMinute] = useState(9 * 60 + 20);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load from the database, then keep listening for changes.
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let cancelled = false;
    const reload = () =>
      fetchEvents()
        .then((loaded) => {
          if (cancelled) return;
          setEvents(loaded);
          setSync({ status: 'live' });
        })
        .catch((err: Error) => !cancelled && setSync({ status: 'error', message: err.message }));

    reload();
    const channel = client
      .channel('schedule')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'event_days' }, (payload) =>
        setEvents((all) => replaceDay(all, toDay(payload.new as DayRow))),
      )
      // New or removed events and days are rarer; just reload everything.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'event_days' }, reload)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'event_days' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, reload)
      .subscribe();

    client.auth.getSession().then(({ data }) => !cancelled && setSession(data.session));
    const { data: auth } = client.auth.onAuthStateChange((_event, next) => setSession(next));

    return () => {
      cancelled = true;
      client.removeChannel(channel);
      auth.subscription.unsubscribe();
    };
  }, []);

  const todays = events.length ? findToday(events, now) : null;
  const event = events.find((e) => e.id === eventId) ?? todays?.event ?? events[0];
  const day = event?.days.find((d) => d.id === dayId) ?? (todays?.event.id === event?.id ? todays?.day : undefined) ?? event?.days[0];
  const isLive = !!day && todays?.day.id === day.id;

  const store = useMemo<ScheduleStore | null>(() => {
    if (!event || !day) return null;
    return {
      events,
      event,
      day,
      selectEvent: (id) => {
        setEventId(id);
        setDayId(null);
      },
      selectDay: setDayId,
      updateDay: (id, items) => {
        const sorted = sortItems(items);
        const previous = events;
        setEvents((all) => all.map((e) => ({ ...e, days: e.days.map((d) => (d.id === id ? { ...d, items: sorted } : d)) })));
        if (!supabase) return;
        supabase
          .from('event_days')
          .update({ items: sorted })
          .eq('id', id)
          .select('id')
          .then(({ data, error }) => {
            if (!error && data?.length) return;
            // Put the old schedule back so the screen matches what drivers see.
            setEvents(previous);
            setSync({
              status: 'error',
              message: error?.message ?? 'The change was not saved. Try signing in again.',
            });
          });
      },
      sync,
      session,
      clock: {
        minuteOfDay: isLive ? now.getHours() * 60 + now.getMinutes() : previewMinute,
        seconds: isLive ? now.getSeconds() : 0,
        isPreview: !isLive,
        setPreviewMinute,
      },
    };
  }, [events, event, day, isLive, now, previewMinute, sync, session]);

  if (!store) return <LoadingOrError status={sync.status} message={sync.message} />;
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

export function useSchedule(): ScheduleStore {
  const store = useContext(Context);
  if (!store) throw new Error('useSchedule must be used inside ScheduleProvider');
  return store;
}
