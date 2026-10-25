import type { CoachingSession, EventDay } from '@/data/types';

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const isEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

/** The session's times, taken from its schedule item when that still exists so bumps carry over. */
export function coachingTimes(session: CoachingSession, day: EventDay | undefined): { start: string; end: string } {
  const item = session.itemId ? day?.items.find((i) => i.id === session.itemId) : undefined;
  return item ? { start: item.start, end: item.end } : { start: session.start, end: session.end };
}

/** Sessions the signed-in person takes part in, as the student or as the coach. */
export function sessionsFor(coaching: CoachingSession[], email: string | null): CoachingSession[] {
  return email ? coaching.filter((c) => c.studentEmail === email || isCoachOf(c, email)) : [];
}

/** True when this person gives the session rather than takes it. */
export const isCoachOf = (session: CoachingSession, email: string | null) =>
  !!email && session.studentEmail !== email && session.coachEmail?.toLowerCase() === email;

/** "With Dave" for the student, "Coaching sam@example.com" for the coach. */
export function coachingTitle(session: CoachingSession, email: string | null): string {
  if (isCoachOf(session, email)) return `Coaching ${session.studentEmail}`;
  return session.coach ? `With ${session.coach}` : 'Coaching session';
}
