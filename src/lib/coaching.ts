import type { BookingKind, CoachingSession, EventDay } from '@/data/types';
import { toMinutes } from '@/lib/schedule';

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

type Coach = Pick<CoachingSession, 'coach' | 'coachEmail'>;

/** "Mike  O'Neil." and "mike oneil" read the same. */
const coachName = (name: string) => name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Every name and email an instructor is known by. A booking entered with only a name still matches one entered with
 * only an email when another booking links the two.
 */
function coachKeys(coach: Coach, sessions: Coach[]): Set<string> {
  const keys = new Set<string>();
  const add = (c: Coach) => {
    if (c.coachEmail?.trim()) keys.add(`@${normalizeEmail(c.coachEmail)}`);
    if (coachName(c.coach)) keys.add(coachName(c.coach));
  };
  add(coach);
  for (let grew = true; grew; ) {
    grew = false;
    for (const s of sessions) {
      const before = keys.size;
      const mine = (s.coachEmail?.trim() && keys.has(`@${normalizeEmail(s.coachEmail)}`)) || (coachName(s.coach) && keys.has(coachName(s.coach)));
      if (mine) add(s);
      if (keys.size > before) grew = true;
    }
  }
  return keys;
}

/** "mike" against "mike smith": probably the same instructor, entered once by first name only. */
function sameFirstName(a: string, b: string): boolean {
  const [x, y] = [coachName(a), coachName(b)];
  if (!x || !y || x === y) return false;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  return !short.includes(' ') && long.split(' ')[0] === short;
}

/**
 * An existing coaching session or check ride on the same day, at an overlapping time, that the student or the
 * coach of `draft` is already booked for. Nobody can be in two places at once, whichever kind each booking is.
 * `maybe-coach` means the instructor names only share a first name ("Mike" and "Mike Smith"), so it may be someone else.
 */
export function findClash(
  sessions: CoachingSession[],
  draft: Omit<CoachingSession, 'id'>,
  day: EventDay,
): { session: CoachingSession; who: 'student' | 'coach' | 'maybe-coach' } | undefined {
  const keys = coachKeys(draft, sessions);
  const [start, end] = [toMinutes(draft.start), toMinutes(draft.end)];
  let maybe: CoachingSession | undefined;
  for (const c of sessions) {
    if (c.dayId !== draft.dayId) continue;
    const t = coachingTimes(c, day);
    if (!(toMinutes(t.start) < end && start < toMinutes(t.end))) continue;
    if (normalizeEmail(c.studentEmail) === normalizeEmail(draft.studentEmail)) return { session: c, who: 'student' };
    if ([...coachKeys(c, sessions)].some((k) => keys.has(k))) return { session: c, who: 'coach' };
    if (!maybe && sameFirstName(c.coach, draft.coach)) maybe = c;
  }
  return maybe ? { session: maybe, who: 'maybe-coach' } : undefined;
}

/**
 * What a club tells drivers who ask for coaching in the app: the price and how to pay. Requests made in the app are
 * paid at the event's registration (ClubReg takes no payments once the event starts), once an organizer has
 * checked there's room and taken payment. Keep the amounts in step with COACHING_PRICE in supabase/functions/push-schedule.
 */
export const COACHING_OFFER: Record<string, { amount: string; price: string; pay: string }> = {
  'just-track-it': { amount: '$100', price: '$100 per session', pay: "Send a request, then see us at registration. We'll check for an open spot before you pay." },
};
