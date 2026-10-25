// Holds the events and which one is being viewed. When the online database is
// configured, schedules load from it and every change made there shows up
// here within seconds. Otherwise the built-in sample events are used and
// admin changes only affect this device.

import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { LoadingOrError } from '@/components/LoadingOrError';
import { SAMPLE_CLUBS, SAMPLE_EVENTS } from '@/data/sampleEvents';
import type { BookingKind, Club, CoachingSession, EventDay, Feedback, ScheduleItem, TrackEvent } from '@/data/types';
import { normalizeEmail } from './coaching';
import { todayISO } from './dates';
import { sortItems } from './schedule';
import { supabase } from './supabase';

interface Clock {
  minuteOfDay: number;
  seconds: number;
  /** True when the selected day isn't today. The preview keeps ticking with the real clock, shifted by the admin's scrubbing. */
  isPreview: boolean;
  setPreviewMinute: (minute: number) => void;
  /** Puts the preview back on the real time of day. */
  resetPreview: () => void;
}

export type SyncStatus = 'offline' | 'loading' | 'live' | 'error';

interface ScheduleStore {
  clubs: Club[];
  events: TrackEvent[];
  event: TrackEvent;
  day: EventDay;
  selectEvent: (eventId: string) => void;
  selectDay: (dayId: string) => void;
  updateDay: (dayId: string, items: ScheduleItem[]) => void;
  /** Resolves to an error message, or null once the event is saved. */
  createEvent: (event: TrackEvent) => Promise<string | null>;
  deleteEvent: (eventId: string) => Promise<string | null>;
  sync: { status: SyncStatus; message?: string };
  /** False when the database has no events yet; event and day are then empty placeholders. */
  hasEvents: boolean;
  /** Coaching sessions this person may see: their own, plus every session of the clubs they manage. */
  coaching: CoachingSession[];
  /** The signed-in person's email (or the practice-mode stand-in), lowercased. */
  myEmail: string | null;
  setPracticeEmail: (email: string | null) => void;
  /** Resolves to an error message, or null once saved. */
  addCoaching: (session: Omit<CoachingSession, 'id'>) => Promise<string | null>;
  removeCoaching: (id: string) => Promise<string | null>;
  /** Resolves to an error message, or null once sent. */
  sendFeedback: (feedback: Pick<Feedback, 'eventId' | 'rating' | 'comment' | 'name'>) => Promise<string | null>;
  /** Feedback about one event, or about the app when eventId is null. Admins only. */
  loadFeedback: (eventId: string | null) => Promise<Feedback[]>;
  isPlatformAdmin: boolean;
  /** Signed-in admin; always null when there is no database. */
  session: Session | null;
  /** Clubs whose events the signed-in admin may change. */
  manageableClubs: Club[];
  canManage: (clubId: string) => boolean;
  clock: Clock;
}

const Context = createContext<ScheduleStore | null>(null);

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

async function fetchClubs(): Promise<Club[]> {
  if (!supabase) return SAMPLE_CLUBS;
  const { data, error } = await supabase.from('clubs').select('id, name, logo_url, website').order('name');
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, logoUrl: c.logo_url ?? undefined, website: c.website ?? undefined }));
}

async function fetchEvents(): Promise<TrackEvent[]> {
  if (!supabase) return SAMPLE_EVENTS;
  const { data, error } = await supabase
    .from('events')
    .select('id, club_id, name, track, location, sort, event_days (id, event_id, label, date, items)')
    .order('sort');
  if (error) throw error;
  return (data ?? [])
    .map((e) => ({
      id: e.id,
      clubId: e.club_id,
      name: e.name,
      track: e.track,
      location: e.location,
      days: (e.event_days as DayRow[]).map(toDay).sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .filter((e) => e.days.length > 0);
}

// Stands in when there are no events, so the tabs (and Admin's New event button) still work.
const NO_EVENT: TrackEvent = { id: '', clubId: '', name: 'No events yet', track: '', location: '', days: [{ id: '', label: '', date: '', items: [] }] };
interface CoachingRow {
  id: string;
  day_id: string;
  item_id: string | null;
  kind?: BookingKind;
  student_email: string;
  coach: string;
  coach_email: string | null;
  start_time: string;
  end_time: string;
  notes: string | null;
}

function toCoaching(row: CoachingRow): CoachingSession {
  return {
    id: row.id,
    dayId: row.day_id,
    kind: row.kind ?? 'coaching',
    itemId: row.item_id ?? undefined,
    studentEmail: row.student_email,
    coach: row.coach,
    coachEmail: row.coach_email ?? undefined,
    start: row.start_time,
    end: row.end_time,
    notes: row.notes ?? undefined,
  };
}

async function fetchCoaching(): Promise<CoachingSession[]> {
  if (!supabase) return [];
  // Row level security returns only the rows this person may see.
  const { data, error } = await supabase.from('coaching_sessions').select('*').order('start_time');
  if (error) throw error;
  return (data as CoachingRow[]).map(toCoaching);
}

function replaceDay(events: TrackEvent[], day: EventDay): TrackEvent[] {
  return events.map((e) => ({ ...e, days: e.days.map((d) => (d.id === day.id ? day : d)) }));
}

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [clubs, setClubs] = useState<Club[]>(supabase ? [] : SAMPLE_CLUBS);
  const [events, setEvents] = useState<TrackEvent[]>(supabase ? [] : SAMPLE_EVENTS);
  // Without a database everything is practice mode, so every club is editable.
  const [rights, setRights] = useState<{ all: boolean; clubIds: string[] }>({ all: !supabase, clubIds: [] });
  const [sync, setSync] = useState<ScheduleStore['sync']>({ status: supabase ? 'loading' : 'offline' });
  const [session, setSession] = useState<Session | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [eventId, setEventId] = useState<string | null>(null);
  const [dayId, setDayId] = useState<string | null>(null);
  // How far the preview clock is moved from the real time of day, in minutes.
  const [previewOffset, setPreviewOffset] = useState(0);
  const [coaching, setCoaching] = useState<CoachingSession[]>([]);
  const [practiceEmail, setPracticeEmail] = useState<string | null>(null);
  // Without a database, feedback stays on this device.
  const [practiceFeedback, setPracticeFeedback] = useState<Feedback[]>([]);

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
      Promise.all([fetchClubs(), fetchEvents()])
        .then(([loadedClubs, loaded]) => {
          if (cancelled) return;
          setClubs(loadedClubs);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clubs' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coaching_sessions' }, () =>
        fetchCoaching().then(setCoaching, () => {}),
      )
      .subscribe();

    client.auth.getSession().then(({ data }) => !cancelled && setSession(data.session));
    const { data: auth } = client.auth.onAuthStateChange((_event, next) => setSession(next));

    return () => {
      cancelled = true;
      client.removeChannel(channel);
      auth.subscription.unsubscribe();
    };
  }, []);

  // Coaching depends on who is signed in, so load it again when that changes.
  useEffect(() => {
    if (!supabase) return;
    if (!session) return setCoaching([]);
    let cancelled = false;
    // A failure here (say, before setup.sql adds the table) only hides coaching, not the schedule.
    fetchCoaching().then(
      (rows) => !cancelled && setCoaching(rows),
      () => !cancelled && setCoaching([]),
    );
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  // Look up which clubs the signed-in admin may edit.
  useEffect(() => {
    const client = supabase;
    const userId = session?.user.id;
    const email = session?.user.email?.toLowerCase() ?? '';
    if (!client) return;
    if (!userId) return setRights({ all: false, clubIds: [] });
    let cancelled = false;
    Promise.all([
      client.from('platform_admins').select('user_id').eq('user_id', userId),
      client.from('club_admins').select('club_id').eq('user_id', userId),
      // Organizers added by email in the app.
      client.from('club_organizers').select('club_id').eq('email', email),
    ]).then(([platform, club, organizer]) => {
      if (cancelled) return;
      const clubIds = [...(club.data ?? []), ...(organizer.data ?? [])].map((r) => r.club_id as string);
      setRights({ all: !!platform.data?.length, clubIds });
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user.id, session?.user.email]);

  const canManage = (clubId: string) => rights.all || rights.clubIds.includes(clubId);

  const todays = events.length ? findToday(events, now) : null;
  const loaded = sync.status === 'live' || sync.status === 'offline';
  const event = events.find((e) => e.id === eventId) ?? todays?.event ?? events[0] ?? (loaded ? NO_EVENT : undefined);
  const day = event?.days.find((d) => d.id === dayId) ?? (todays?.event.id === event?.id ? todays?.day : undefined) ?? event?.days[0];
  const isLive = !!day && todays?.day.id === day.id;

  const store = useMemo<ScheduleStore | null>(() => {
    if (!event || !day) return null;
    const nowMinute = now.getHours() * 60 + now.getMinutes();
    return {
      clubs,
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
      createEvent: async (newEvent) => {
        if (events.some((e) => e.id === newEvent.id)) return 'An event at this track on these dates already exists.';
        if (supabase) {
          const { error } = await supabase.from('events').insert({
            id: newEvent.id,
            club_id: newEvent.clubId,
            name: newEvent.name,
            track: newEvent.track,
            location: newEvent.location,
            sort: events.length,
          });
          if (error) return error.message;
          const { error: daysError } = await supabase
            .from('event_days')
            .insert(newEvent.days.map((d) => ({ id: d.id, event_id: newEvent.id, label: d.label, date: d.date, items: d.items })));
          if (daysError) {
            await supabase.from('events').delete().eq('id', newEvent.id);
            return daysError.message;
          }
        }
        setEvents((all) => [...all.filter((e) => e.id !== newEvent.id), newEvent]);
        setEventId(newEvent.id);
        setDayId(null);
        return null;
      },
      deleteEvent: async (id) => {
        if (supabase) {
          // Days are removed with the event (on delete cascade).
          const { data, error } = await supabase.from('events').delete().eq('id', id).select('id');
          if (error) return error.message;
          if (!data?.length) return 'The event was not deleted. Try signing in again.';
        }
        setEvents((all) => all.filter((e) => e.id !== id));
        setEventId(null);
        setDayId(null);
        return null;
      },
      sync,
      hasEvents: events.length > 0,
      session,
      coaching,
      myEmail: supabase ? (session?.user.email ? normalizeEmail(session.user.email) : null) : practiceEmail,
      setPracticeEmail: (email) => setPracticeEmail(email ? normalizeEmail(email) : null),
      addCoaching: async (draft) => {
        const next = { ...draft, studentEmail: normalizeEmail(draft.studentEmail) };
        if (!supabase) {
          setCoaching((all) => [...all, { ...next, id: `practice-${Date.now()}` }]);
          return null;
        }
        const { data, error } = await supabase
          .from('coaching_sessions')
          .insert({
            day_id: next.dayId,
            item_id: next.itemId ?? null,
            student_email: next.studentEmail,
            coach: next.coach,
            // Sent only when needed, so booking still works on a database that predates these columns.
            ...(next.coachEmail ? { coach_email: normalizeEmail(next.coachEmail) } : {}),
            ...(next.kind === 'checkride' ? { kind: 'checkride' } : {}),
            start_time: next.start,
            end_time: next.end,
            notes: next.notes ?? null,
          })
          .select('*');
        if (error) return error.message;
        if (!data?.length) return 'The coaching session was not saved. Try signing in again.';
        const saved = toCoaching(data[0] as CoachingRow);
        setCoaching((all) => (all.some((c) => c.id === saved.id) ? all : [...all, saved]));
        return null;
      },
      sendFeedback: async ({ eventId, rating, comment, name }) => {
        const email = session?.user.email ? normalizeEmail(session.user.email) : undefined;
        if (!supabase) {
          const entry = { id: `practice-${Date.now()}`, eventId, rating, comment, name, email, createdAt: new Date().toISOString() };
          setPracticeFeedback((all) => [entry, ...all]);
          return null;
        }
        // No .select() here: drivers may write feedback but not read it back.
        const { error } = await supabase.from('feedback').insert({
          event_id: eventId ?? null,
          rating,
          comment: comment || null,
          name: name || null,
          email: email ?? null,
        });
        return error ? error.message : null;
      },
      loadFeedback: async (eventId) => {
        if (!supabase) return practiceFeedback.filter((f) => (f.eventId ?? null) === eventId);
        const query = supabase.from('feedback').select('*').order('created_at', { ascending: false });
        const { data, error } = await (eventId ? query.eq('event_id', eventId) : query.is('event_id', null));
        if (error) throw error;
        return (data ?? []).map((f) => ({
          id: f.id,
          eventId: f.event_id ?? undefined,
          rating: f.rating,
          comment: f.comment ?? undefined,
          name: f.name ?? undefined,
          email: f.email ?? undefined,
          createdAt: f.created_at,
        }));
      },
      isPlatformAdmin: rights.all,
      removeCoaching: async (id) => {
        if (supabase) {
          const { data, error } = await supabase.from('coaching_sessions').delete().eq('id', id).select('id');
          if (error) return error.message;
          if (!data?.length) return 'The coaching session was not removed. Try signing in again.';
        }
        setCoaching((all) => all.filter((c) => c.id !== id));
        return null;
      },
      manageableClubs: clubs.filter((c) => canManage(c.id)),
      canManage,
      clock: {
        minuteOfDay: isLive ? nowMinute : (((nowMinute + previewOffset) % 1440) + 1440) % 1440,
        seconds: now.getSeconds(),
        isPreview: !isLive,
        setPreviewMinute: (minute) => setPreviewOffset(minute - nowMinute),
        resetPreview: () => setPreviewOffset(0),
      },
    };
  }, [clubs, events, event, day, isLive, now, previewOffset, sync, session, rights, coaching, practiceEmail, practiceFeedback]);

  if (!store) return <LoadingOrError status={sync.status} message={sync.message} />;
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

export function useSchedule(): ScheduleStore {
  const store = useContext(Context);
  if (!store) throw new Error('useSchedule must be used inside ScheduleProvider');
  return store;
}
