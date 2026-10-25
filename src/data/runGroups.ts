import type { RunGroupId } from './types';

export const RUN_GROUPS: Record<RunGroupId, { name: string; short: string; color: string }> = {
  novice: { name: 'Novice / Novice Solo', short: 'Novice', color: '#34C759' },
  int1: { name: 'Intermediate 1', short: 'Int 1', color: '#0A84FF' },
  int2: { name: 'Intermediate 2', short: 'Int 2', color: '#BF5AF2' },
  advanced: { name: 'Advanced', short: 'Adv', color: '#FF453A' },
  ladies: { name: 'Ladies Only', short: 'Ladies', color: '#FF6FB5' },
};

export const KIND_COLORS = {
  classroom: '#FFD60A',
  meeting: '#FF9F0A',
  break: '#8E8E93',
  parade: '#64D2FF',
} as const;
