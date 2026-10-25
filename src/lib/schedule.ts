import type { EventDay, ScheduleItem } from '@/data/types';

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, total));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "13:05" -> "1:05 PM" */
export function formatTime(hhmm: string): string {
  const total = toMinutes(hhmm);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatRange(item: ScheduleItem): string {
  return `${formatTime(item.start)} – ${formatTime(item.end)}`;
}

export function sortItems(items: ScheduleItem[]): ScheduleItem[] {
  return [...items].sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || toMinutes(a.end) - toMinutes(b.end));
}

/** Track sessions, lunch and parade laps use the track; classroom and meetings do not. */
export function usesTrack(item: ScheduleItem): boolean {
  return item.kind === 'track' || item.kind === 'break' || item.kind === 'parade';
}

export interface NowState {
  onTrack?: ScheduleItem;
  upNext?: ScheduleItem;
  offTrack: ScheduleItem[]; // classroom or meeting happening right now
  dayOver: boolean;
}

export function getNowState(day: EventDay, minuteOfDay: number): NowState {
  const items = sortItems(day.items);
  const track = items.filter(usesTrack);
  const onTrack = track.find((i) => toMinutes(i.start) <= minuteOfDay && minuteOfDay < toMinutes(i.end));
  const upNext = track.find((i) => toMinutes(i.start) > minuteOfDay);
  const offTrack = items.filter(
    (i) => !usesTrack(i) && toMinutes(i.start) <= minuteOfDay && minuteOfDay < toMinutes(i.end),
  );
  const last = items[items.length - 1];
  return { onTrack, upNext, offTrack, dayOver: !!last && minuteOfDay >= toMinutes(last.end) };
}

/** Pushes every item that hasn't finished by `fromMinute` later by `delay` minutes (negative pulls it earlier). */
export function shiftSchedule(items: ScheduleItem[], fromMinute: number, delay: number): ScheduleItem[] {
  return items.map((item) => {
    const start = toMinutes(item.start);
    const end = toMinutes(item.end);
    if (end <= fromMinute) return item;
    // A session already running keeps its start time and just runs longer.
    const newStart = start < fromMinute ? start : start + delay;
    return { ...item, start: fromMinutes(newStart), end: fromMinutes(Math.max(newStart + 5, end + delay)) };
  });
}

export function countdown(fromMinute: number, toHHMM: string, seconds = 0): string {
  const remaining = (toMinutes(toHHMM) - fromMinute) * 60 - seconds;
  if (remaining <= 0) return 'now';
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
