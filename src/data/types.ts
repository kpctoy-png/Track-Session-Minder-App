// The shape of a schedule. Times are 24-hour "HH:MM" strings in the track's
// local time, so a schedule reads the same as the PDF it was copied from.

export type RunGroupId = 'novice' | 'int1' | 'int2' | 'advanced' | 'ladies';

export type ItemKind =
  | 'track' // a run group session on track
  | 'classroom' // happens off track, often at the same time as a session
  | 'meeting'
  | 'break' // lunch, track cold
  | 'parade';

export interface ScheduleItem {
  id: string;
  start: string;
  end: string;
  title: string;
  kind: ItemKind;
  groups?: RunGroupId[];
}

export interface EventDay {
  id: string;
  label: string; // "Saturday"
  date: string; // "2026-10-31"
  items: ScheduleItem[];
}

export interface TrackEvent {
  id: string;
  name: string;
  track: string;
  location: string;
  days: EventDay[];
}
