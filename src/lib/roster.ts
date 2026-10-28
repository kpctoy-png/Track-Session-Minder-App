// Reading a registration site's participant list: a CSV, an Excel (.xlsx) sheet, or ClubReg's Report Builder
// export (an .xls file that is really an HTML table).

import type { RunGroupId } from '@/data/types';

export interface RosterRow {
  name: string;
  email: string;
  /** The run group as the registration site names it, e.g. "Intermediate 1". */
  runGroup?: string;
  /** Coaching sessions paid for (ClubReg's "Advanced Coaching Quantity"). */
  coaching?: number;
}

/** Splits CSV text into rows of cells, handling quoted cells with commas, quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === '\t') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** The rows of the first HTML table in `text`, as plain-text cells. */
export function parseHtmlTable(text: string): string[][] {
  const decode = (s: string) =>
    s
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
  return [...text.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => decode(cell[1])),
  );
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * The drivers in a participant list: finds the header row with an email column, plus a name column
 * (or first and last name columns). Rows whose Status is Cancelled are left out. Each email appears once.
 */
export function rosterFromCsv(text: string): { rows: RosterRow[]; problem?: string } {
  const clean = text.replace(/^\uFEFF/, '');
  return rosterFromTable(/<table/i.test(clean) ? parseHtmlTable(clean) : parseCsv(clean));
}

/**
 * The participants in a table of cells. The header row is the first with an Email heading. With no header row,
 * the column of email addresses is used and the other cells in each row make the name.
 */
export function rosterFromTable(table: string[][]): { rows: RosterRow[]; problem?: string } {
  const headerAt = table.findIndex((r) => r.some((c) => /e-?mail/i.test(c) && !c.includes('@')));
  if (headerAt < 0) return headerless(table);
  const header = table[headerAt].map((c) => c.trim().toLowerCase());
  const col = (test: RegExp) => header.findIndex((h) => test.test(h));
  const email = col(/e-?mail/);
  const first = col(/^first/);
  const last = col(/^last/);
  const full = col(/^(full )?name$|^driver( name)?$|^participant( name)?$/);
  const status = col(/^status$/);
  const runGroup = col(/^run ?group$/);
  const coaching = col(/coaching.*(quantity|qty)/);
  const waitList = col(/coaching.*wait/);

  const seen = new Set<string>();
  const rows: RosterRow[] = [];
  for (const r of table.slice(headerAt + 1)) {
    if (status >= 0 && /cancel/i.test(r[status] ?? '')) continue;
    const address = (r[email] ?? '').trim().toLowerCase();
    if (!EMAIL.test(address) || seen.has(address)) continue;
    seen.add(address);
    const name = full >= 0 ? r[full] : [first >= 0 ? r[first] : '', last >= 0 ? r[last] : ''].join(' ');
    const paid = coaching >= 0 && !/^y/i.test(waitList >= 0 ? (r[waitList] ?? '').trim() : '') ? parseInt(r[coaching] ?? '', 10) : 0;
    rows.push({
      name: (name ?? '').trim().replace(/\s+/g, ' ').slice(0, 200),
      email: address.slice(0, 254),
      runGroup: runGroup >= 0 ? (r[runGroup] ?? '').trim().slice(0, 60) || undefined : undefined,
      coaching: Math.min(20, Math.max(0, paid || 0)),
    });
  }
  if (!rows.length) return { rows, problem: 'The Email column has no email addresses in it.' };
  return { rows };
}

function headerless(table: string[][]): { rows: RosterRow[]; problem?: string } {
  const email = table.reduce((found, r) => (found >= 0 ? found : r.findIndex((c) => EMAIL.test(c.trim()))), -1);
  if (email < 0) return { rows: [], problem: "Couldn't find any email addresses. Is this the participant list (ClubReg export, CSV or Excel)?" };
  const seen = new Set<string>();
  const rows: RosterRow[] = [];
  for (const r of table) {
    const address = (r[email] ?? '').trim().toLowerCase();
    if (!EMAIL.test(address) || seen.has(address)) continue;
    seen.add(address);
    const name = r.filter((c, i) => i !== email && /[a-z]/i.test(c)).join(' ');
    rows.push({ name: name.trim().replace(/\s+/g, ' ').slice(0, 200), email: address.slice(0, 254), coaching: 0 });
  }
  return { rows };
}

/** The app's run group for a registration site's run group name, if it matches one. */
export function runGroupFor(name: string | undefined): RunGroupId | undefined {
  if (!name) return undefined;
  if (/novice/i.test(name)) return 'novice';
  if (/int(ermediate)?\.? ?1|\bi1\b/i.test(name)) return 'int1';
  if (/int(ermediate)?\.? ?2|\bi2\b/i.test(name)) return 'int2';
  if (/adv/i.test(name)) return 'advanced';
  if (/ladies/i.test(name)) return 'ladies';
  return undefined;
}
