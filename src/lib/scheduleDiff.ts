import type { ScheduleItem } from '@/data/types';
import { formatRange, sortItems } from './schedule';

export interface DayDiff {
  /** The new items, keeping the current id of each session matched in both, so coaching bookings stay attached. */
  items: ScheduleItem[];
  added: ScheduleItem[];
  removed: ScheduleItem[];
  moved: { from: ScheduleItem; to: ScheduleItem }[];
  /** True when nothing would change. */
  same: boolean;
}

const key = (item: ScheduleItem) => `${item.kind}|${item.title.trim().toLowerCase().replace(/\s+/g, ' ')}`;

const exact = (item: ScheduleItem) => `${key(item)}|${item.start}|${item.end}|${(item.groups ?? []).join(',')}`;

/**
 * Compares a day's current sessions with new ones (from a Google Sheet). Sessions that are exactly the same are
 * matched first. The rest are matched by title and kind, in time order, so the second "Advanced" of the day pairs
 * with the second "Advanced" left over from the sheet.
 */
export function diffDay(current: ScheduleItem[], next: Omit<ScheduleItem, 'id'>[], newId: (n: number) => string): DayDiff {
  const incoming = sortItems(next.map((item, n) => ({ ...item, id: newId(n) })));
  const matched = new Map<string, ScheduleItem>();
  const unmatched = [...sortItems(current)];
  for (const item of incoming) {
    const at = unmatched.findIndex((c) => exact(c) === exact(item));
    if (at >= 0) matched.set(item.id, unmatched.splice(at, 1)[0]);
  }
  const pool = new Map<string, ScheduleItem[]>();
  for (const item of unmatched) pool.set(key(item), [...(pool.get(key(item)) ?? []), item]);

  const items: ScheduleItem[] = [];
  const added: ScheduleItem[] = [];
  const moved: { from: ScheduleItem; to: ScheduleItem }[] = [];
  for (const item of incoming) {
    const same = matched.get(item.id);
    if (same) {
      items.push({ ...item, id: same.id });
      continue;
    }
    const match = pool.get(key(item))?.shift();
    if (!match) {
      added.push(item);
      items.push(item);
      continue;
    }
    const kept = { ...item, id: match.id };
    moved.push({ from: match, to: kept });
    items.push(kept);
  }
  const removed = sortItems([...pool.values()].flat());
  return { items, added, removed, moved, same: !added.length && !removed.length && !moved.length };
}

/** One line per difference, for the preview. */
export function describeDiff(diff: DayDiff): string[] {
  return [
    ...diff.moved.map(({ from, to }) => `Changed: ${to.title} ${formatRange(from)} → ${formatRange(to)}`),
    ...diff.added.map((i) => `Added: ${i.title} ${formatRange(i)}`),
    ...diff.removed.map((i) => `Removed: ${i.title} ${formatRange(i)}`),
  ];
}
