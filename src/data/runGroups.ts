import type { RunGroupId } from './types';

export const RUN_GROUPS: Record<RunGroupId, { name: string; short: string; color: string }> = {
  novice: { name: 'Novice / Novice Solo', short: 'Novice', color: '#A8E6A3' },
  int1: { name: 'Intermediate 1', short: 'Int 1', color: '#A7C7FA' },
  int2: { name: 'Intermediate 2', short: 'Int 2', color: '#FFF1A0' },
  advanced: { name: 'Advanced', short: 'Adv', color: '#FF9B9B' },
  ladies: { name: 'Ladies Only', short: 'Ladies', color: '#C9A7F5' },
};

// Meetings, breaks and parade laps get no color; the transparent bar keeps titles lined up.
export const KIND_COLORS = {
  classroom: '#FFD60A',
  meeting: 'transparent',
  break: 'transparent',
  parade: 'transparent',
} as const;
