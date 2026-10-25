import { KIND_COLORS, RUN_GROUPS } from '@/data/runGroups';
import type { ScheduleItem } from '@/data/types';

export const colors = {
  background: '#0B0B0F',
  card: '#17171D',
  cardRaised: '#22222B',
  border: '#2C2C36',
  text: '#F5F5F7',
  muted: '#9A9AA5',
  accent: '#FF9F0A',
};

export function itemColors(item: ScheduleItem): string[] {
  if (item.kind === 'track' && item.groups?.length) return item.groups.map((g) => RUN_GROUPS[g].color);
  if (item.kind === 'track') return [colors.muted];
  return [KIND_COLORS[item.kind]];
}
