// Holds the events and which one is being viewed. For now the schedules live
// in memory, so admin changes only affect this device; the online database
// will replace SAMPLE_EVENTS and updateDay later.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { SAMPLE_EVENTS } from '@/data/sampleEvents';
import type { EventDay, ScheduleItem, TrackEvent } from '@/data/types';
import { sortItems } from './schedule';

interface Clock {
  minuteOfDay: number;
  seconds: number;
  /** True when no event is running today, so we show a pretend time instead. */
  isPreview: boolean;
  setPreviewMinute: (minute: number) => void;
}

interface ScheduleStore {
  events: TrackEvent[];
  event: TrackEvent;
  day: EventDay;
  selectEvent: (eventId: string) => void;
  selectDay: (dayId: string) => void;
  updateDay: (dayId: string, items: ScheduleItem[]) => void;
  resetDay: (dayId: string) => void;
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

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<TrackEvent[]>(SAMPLE_EVENTS);
  const [now, setNow] = useState(() => new Date());
  const todays = findToday(events, now);
  const [eventId, setEventId] = useState(todays?.event.id ?? events[0].id);
  const [dayId, setDayId] = useState(todays?.day.id ?? events[0].days[0].id);
  const [previewMinute, setPreviewMinute] = useState(9 * 60 + 20);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const event = events.find((e) => e.id === eventId) ?? events[0];
  const day = event.days.find((d) => d.id === dayId) ?? event.days[0];
  const isLive = todays?.day.id === day.id;

  const store = useMemo<ScheduleStore>(
    () => ({
      events,
      event,
      day,
      selectEvent: (id) => {
        const next = events.find((e) => e.id === id);
        if (!next) return;
        setEventId(id);
        setDayId(next.days[0].id);
      },
      selectDay: setDayId,
      updateDay: (id, items) =>
        setEvents((all) =>
          all.map((e) => ({ ...e, days: e.days.map((d) => (d.id === id ? { ...d, items: sortItems(items) } : d)) })),
        ),
      resetDay: (id) => {
        const original = SAMPLE_EVENTS.flatMap((e) => e.days).find((d) => d.id === id);
        if (original) store.updateDay(id, original.items);
      },
      clock: {
        minuteOfDay: isLive ? now.getHours() * 60 + now.getMinutes() : previewMinute,
        seconds: isLive ? now.getSeconds() : 0,
        isPreview: !isLive,
        setPreviewMinute,
      },
    }),
    [events, event, day, isLive, now, previewMinute],
  );

  return <Context.Provider value={store}>{children}</Context.Provider>;
}

export function useSchedule(): ScheduleStore {
  const store = useContext(Context);
  if (!store) throw new Error('useSchedule must be used inside ScheduleProvider');
  return store;
}
