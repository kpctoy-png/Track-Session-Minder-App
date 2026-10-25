import type { CoachingSession, EventDay } from '@/data/types';

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const isEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

/** The session's times, taken from its schedule item when that still exists so bumps carry over. */
export function coachingTimes(session: CoachingSession, day: EventDay | undefined): { start: string; end: string } {
  const item = session.itemId ? day?.items.find((i) => i.id === session.itemId) : undefined;
  return item ? { start: item.start, end: item.end } : { start: session.start, end: session.end };
}
