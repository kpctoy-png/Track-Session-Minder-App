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

/** The same coach, matched by email, or by name when no email was entered. */
function sameCoach(a: Pick<CoachingSession, 'coach' | 'coachEmail'>, b: Pick<CoachingSession, 'coach' | 'coachEmail'>): boolean {
  if (a.coachEmail && b.coachEmail && normalizeEmail(a.coachEmail) === normalizeEmail(b.coachEmail)) return true;
  const name = a.coach.trim().toLowerCase();
  return !!name && name === b.coach.trim().toLowerCase();
}

/** An existing session on the same day that the coach of `draft` is already giving at an overlapping time. */
export function findCoachClash(
  sessions: CoachingSession[],
  draft: Omit<CoachingSession, 'id'>,
  day: EventDay,
): CoachingSession | undefined {
  return sessions.find((c) => {
    if (c.dayId !== draft.dayId || !sameCoach(c, draft)) return false;
    const t = coachingTimes(c, day);
    return t.start < draft.end && draft.start < t.end;
  });
}
