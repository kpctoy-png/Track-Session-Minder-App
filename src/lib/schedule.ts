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

export function formatRange(item: Pick<ScheduleItem, 'start' | 'end'>): string {
  return `${formatTime(item.start)} – ${formatTime(item.end)}`;
}

export function sortItems(items: ScheduleItem[]): ScheduleItem[] {
  return [...items].sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || toMinutes(a.end) - toMinutes(b.end));
}

/** Track sessions, lunch and parade laps use the track; classroom and meetings do not. */
export function usesTrack(item: ScheduleItem): boolean {
  return item.kind === 'track' || item.kind === 'break' || item.kind === 'parade';
}

/** Clubs whose run groups start each day with warm-up laps, and what drivers should know about that session. */
const FIRST_SESSION_RULES: Record<string, string> = {
  'just-track-it': '2 laps, no passing, yellow flag',
};

/** The club's note for a run group's first session of the day, if this is one (and the club has such a rule). */
export function firstSessionNote(clubId: string, items: ScheduleItem[], item: ScheduleItem): string | undefined {
  const rule = FIRST_SESSION_RULES[clubId];
  if (!rule || item.kind !== 'track' || !item.groups?.length) return undefined;
  const earlier = items.filter((i) => i.kind === 'track' && toMinutes(i.start) < toMinutes(item.start));
  const first = item.groups.some((g) => !earlier.some((i) => i.groups?.includes(g)));
  return first ? rule : undefined;
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

/** Track sessions that haven't started by `fromMinute`: the ones a trim may shorten. */
export function trimmableSessions(items: ScheduleItem[], fromMinute: number): ScheduleItem[] {
  return sortItems(items).filter((i) => i.kind === 'track' && toMinutes(i.start) >= fromMinute);
}

/**
 * Shortens upcoming track sessions by `cuts[id]` minutes each and pulls everything after them earlier by the
 * time saved so far, so there are no gaps. Classroom, lunch and meetings keep their length.
 */
export function trimSchedule(items: ScheduleItem[], fromMinute: number, cuts: Record<string, number>): ScheduleItem[] {
  // Each trimmed session saves its cut from its original end onwards.
  const savings = trimmableSessions(items, fromMinute)
    .filter((i) => cuts[i.id] > 0)
    .map((i) => ({ at: toMinutes(i.end), cut: cuts[i.id] }));
  const savedBy = (minute: number) => savings.reduce((sum, s) => (s.at <= minute ? sum + s.cut : sum), 0);
  return items.map((item) => {
    const start = toMinutes(item.start);
    if (start < fromMinute) return item;
    const shift = savedBy(start);
    const cut = item.kind === 'track' ? (cuts[item.id] ?? 0) : 0;
    return { ...item, start: fromMinutes(start - shift), end: fromMinutes(toMinutes(item.end) - shift - cut) };
  });
}

/** Never trim a session below this many minutes. */
export const MIN_SESSION_MINUTES = 10;

/**
 * Spreads `minutes` as evenly as possible over the upcoming track sessions, in whole minutes, without taking any
 * session below MIN_SESSION_MINUTES. Returns the cut per session id; their sum can be less than asked if the
 * sessions are already short.
 */
export function spreadCatchUp(items: ScheduleItem[], fromMinute: number, minutes: number): Record<string, number> {
  const sessions = trimmableSessions(items, fromMinute);
  const room = Object.fromEntries(
    sessions.map((s) => [s.id, Math.max(0, toMinutes(s.end) - toMinutes(s.start) - MIN_SESSION_MINUTES)]),
  );
  const cuts: Record<string, number> = Object.fromEntries(sessions.map((s) => [s.id, 0]));
  let left = minutes;
  // Hand out one minute at a time, earliest sessions first, skipping any that are at their minimum.
  while (left > 0) {
    const open = sessions.filter((s) => cuts[s.id] < room[s.id]);
    if (!open.length) break;
    for (const s of open) {
      if (left === 0) break;
      cuts[s.id]++;
      left--;
    }
  }
  return cuts;
}
