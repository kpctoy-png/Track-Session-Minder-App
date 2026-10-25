import type { RunGroupId } from './types';

export const RUN_GROUPS: Record<RunGroupId, { name: string; short: string; color: string }> = {
  novice: { name: 'Novice / Novice Solo', short: 'Novice', color: '#A8E6A3' },
  int1: { name: 'Intermediate 1', short: 'Int 1', color: '#A7C7FA' },
  int2: { name: 'Intermediate 2', short: 'Int 2', color: '#FFF1A0' },
  advanced: { name: 'Advanced', short: 'Adv', color: '#FF9B9B' },
  ladies: { name: 'Ladies Only', short: 'Ladies', color: '#C9A7F5' },
};

export const KIND_COLORS = {
  classroom: '#FFD60A',
  meeting: '#B8B8C0',
  break: '#8E8E93',
  parade: '#64D2FF',
} as const;
