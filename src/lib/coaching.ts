import type { BookingKind, CoachingSession, EventDay } from '@/data/types';

/** "Coaching session" or "Check ride". */
export const bookingName = (kind: BookingKind | undefined) => (kind === 'checkride' ? 'Check ride' : 'Coaching session');

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

/** "With Dave" for the student, "Coaching sam@example.com" or "Check ride for sam@example.com" for the coach. */
export function coachingTitle(session: CoachingSession, email: string | null): string {
  if (isCoachOf(session, email))
    return session.kind === 'checkride' ? `Check ride for ${session.studentEmail}` : `Coaching ${session.studentEmail}`;
  return session.coach ? `With ${session.coach}` : bookingName(session.kind);
}

/** The same coach, matched by email, or by name when no email was entered. */
function sameCoach(a: Pick<CoachingSession, 'coach' | 'coachEmail'>, b: Pick<CoachingSession, 'coach' | 'coachEmail'>): boolean {
  if (a.coachEmail && b.coachEmail && normalizeEmail(a.coachEmail) === normalizeEmail(b.coachEmail)) return true;
  const name = a.coach.trim().toLowerCase();
  return !!name && name === b.coach.trim().toLowerCase();
}

/**
 * An existing coaching session or check ride on the same day, at an overlapping time, that the student or the
 * coach of `draft` is already booked for. Nobody can be in two places at once, whichever kind each booking is.
 */
export function findClash(
  sessions: CoachingSession[],
  draft: Omit<CoachingSession, 'id'>,
  day: EventDay,
): { session: CoachingSession; who: 'student' | 'coach' } | undefined {
  for (const c of sessions) {
    if (c.dayId !== draft.dayId) continue;
    const t = coachingTimes(c, day);
    if (!(t.start < draft.end && draft.start < t.end)) continue;
    if (c.studentEmail === normalizeEmail(draft.studentEmail)) return { session: c, who: 'student' };
    if (sameCoach(c, draft)) return { session: c, who: 'coach' };
  }
  return undefined;
}
