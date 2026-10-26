const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-31" -> "Oct 31" */
export function shortDate(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
}

/** First and last day as "Oct 31 – Nov 1, 2026" (or "Nov 14 – 15, 2026" within a month). */
export function dateRange(first: string, last: string): string {
  const year = last.slice(0, 4);
  if (first === last) return `${shortDate(first)}, ${year}`;
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  return `${shortDate(first)} – ${sameMonth ? Number(last.slice(8, 10)) : shortDate(last)}, ${year}`;
}

export function todayISO(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Parses "YYYY-MM-DD" as a calendar date, or null if it isn't one. */
function parseISO(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.toISOString().slice(0, 10) === iso.trim() ? date : null;
}

export function isValidDate(iso: string): boolean {
  return parseISO(iso) !== null;
}

export function weekday(iso: string): string {
  const date = parseISO(iso);
  return date ? WEEKDAYS[date.getUTCDay()] : '';
}

export function addDays(iso: string, days: number): string {
  const date = parseISO(iso);
  if (!date) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from one "YYYY-MM-DD" to another (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = parseISO(from);
  const b = parseISO(to);
  return a && b ? Math.round((b.getTime() - a.getTime()) / 86400000) : 0;
}
