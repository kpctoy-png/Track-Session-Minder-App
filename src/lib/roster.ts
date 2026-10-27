// Reading a registration site's participant list (for example a ClubReg export) saved as CSV.

export interface RosterRow {
  name: string;
  email: string;
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

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * The drivers in a participant list: finds the header row with an email column, plus a name column
 * (or first and last name columns). Each email appears once.
 */
export function rosterFromCsv(text: string): { rows: RosterRow[]; problem?: string } {
  const table = parseCsv(text.replace(/^﻿/, ''));
  const headerAt = table.findIndex((r) => r.some((c) => /e-?mail/i.test(c)));
  if (headerAt < 0) return { rows: [], problem: "Couldn't find an Email column. Is this the participant list, saved as CSV?" };
  const header = table[headerAt].map((c) => c.trim().toLowerCase());
  const col = (test: RegExp) => header.findIndex((h) => test.test(h));
  const email = col(/e-?mail/);
  const first = col(/^first/);
  const last = col(/^last/);
  const full = col(/^(full )?name$|^driver( name)?$|^participant( name)?$/);

  const seen = new Set<string>();
  const rows: RosterRow[] = [];
  for (const r of table.slice(headerAt + 1)) {
    const address = (r[email] ?? '').trim().toLowerCase();
    if (!EMAIL.test(address) || seen.has(address)) continue;
    seen.add(address);
    const name = full >= 0 ? r[full] : [first >= 0 ? r[first] : '', last >= 0 ? r[last] : ''].join(' ');
    rows.push({ name: (name ?? '').trim().replace(/\s+/g, ' ').slice(0, 200), email: address.slice(0, 254) });
  }
  if (!rows.length) return { rows, problem: 'The Email column has no email addresses in it.' };
  return { rows };
}
