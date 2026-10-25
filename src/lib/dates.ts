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
