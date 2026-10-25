import type { TrackEvent } from '@/data/types';
import { addDays, weekday } from './dates';

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

interface NewEventInput {
  name: string;
  track: string;
  location: string;
  startDate: string;
  dayCount: number;
  /** Day 1 copies the template's day 1, and so on; extra days reuse its last day. */
  template?: TrackEvent;
}

export function buildEvent({ name, track, location, startDate, dayCount, template }: NewEventInput): TrackEvent {
  const id = `${slug(track)}-${startDate}`;
  return {
    id,
    name: name.trim(),
    track: track.trim(),
    location: location.trim(),
    days: Array.from({ length: dayCount }, (_, i) => {
      const date = addDays(startDate, i);
      const dayId = `${id}-${i + 1}`;
      const source = template?.days[Math.min(i, template.days.length - 1)];
      return {
        id: dayId,
        label: weekday(date),
        date,
        items: (source?.items ?? []).map((item, n) => ({ ...item, id: `${dayId}-${n}` })),
      };
    }),
  };
}
