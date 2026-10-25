// Reads a schedule laid out the way the Just Track It sheets are: a header row
// of day names (SATURDAY, SUNDAY), and under each day a time column
// ("8:00 - 8:25") next to a title column ("Intermediate 2").

import type { ItemKind, RunGroupId, ScheduleItem } from '@/data/types';
import { fromMinutes } from './schedule';

const DAY_NAMES = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export interface ImportedDay {
  label: string; // "Saturday"
  items: Omit<ScheduleItem, 'id'>[];
}

/** Track days run roughly 7am to 6pm, so "1:05" means 1:05 PM and "7:20" means 7:20 AM. */
function clockToMinutes(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(text.trim());
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (hour < 7) hour += 12;
  return hour * 60 + minute;
}

function parseTimes(cell: string): { start: number; end: number } | null {
  const [from, to] = cell.split(/\s*[-–]\s*/);
  const start = clockToMinutes(from ?? '');
  if (start === null) return null;
  const end = to ? clockToMinutes(to) : null;
  return { start, end: end !== null && end > start ? end : start + 30 };
}

function classify(title: string): { kind: ItemKind; groups?: RunGroupId[] } {
  const t = title.toLowerCase();
  const groups: RunGroupId[] = [];
  if (/ladies/.test(t)) groups.push('ladies');
  if (/novice/.test(t)) groups.push('novice');
  if (/\bint(ermediate)?\.?\s*1\b/.test(t)) groups.push('int1');
  if (/\bint(ermediate)?\.?\s*2\b/.test(t)) groups.push('int2');
  if (/advanced/.test(t)) groups.push('advanced');
  const withGroups = (kind: ItemKind) => (groups.length ? { kind, groups } : { kind });

  if (/classroom/.test(t)) return withGroups('classroom');
  if (/meeting/.test(t)) return { kind: 'meeting' };
  if (/lunch|break|track cold|cold track/.test(t)) return { kind: 'break' };
  if (/parade/.test(t)) return { kind: 'parade' };
  return withGroups('track');
}

function cleanTitle(title: string): string {
  return title.replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
}

const isBlank = (row: string[] | undefined) => !row || row.every((c) => !c?.trim());

/** Parses the first schedule block in the grid. Later copies of the block (some tabs repeat it) are ignored. */
export function parseScheduleGrid(rows: string[][]): ImportedDay[] {
  const headerIndex = rows.findIndex((row) => row.some((c) => DAY_NAMES.includes(c?.trim().toUpperCase())));
  if (headerIndex < 0) return [];
  const header = rows[headerIndex];
  const columns = header
    .map((c, i) => ({ name: c?.trim().toUpperCase(), col: i }))
    .filter((c) => DAY_NAMES.includes(c.name));

  const days: ImportedDay[] = columns.map((c) => ({ label: c.name[0] + c.name.slice(1).toLowerCase(), items: [] }));
  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (isBlank(row)) break;
    if (row.some((c) => DAY_NAMES.includes(c?.trim().toUpperCase()))) break;
    columns.forEach(({ col }, d) => {
      const times = parseTimes(row[col] ?? '');
      const title = cleanTitle(row[col + 1] ?? '');
      if (!times || !title) return;
      days[d].items.push({ start: fromMinutes(times.start), end: fromMinutes(times.end), title, ...classify(title) });
    });
  }
  return days.filter((d) => d.items.length > 0);
}

/** Minimal CSV parser (quotes, commas and newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** "https://docs.google.com/spreadsheets/d/<id>/edit..." -> "<id>" */
export function sheetIdFromLink(link: string): string | null {
  return /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(link)?.[1] ?? null;
}

/** Downloads one tab of a sheet shared as "Anyone with the link can view". */
export async function fetchSheetTab(sheetId: string, tab: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(tab)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google Sheets answered ${response.status}`);
  const text = await response.text();
  if (text.trimStart().startsWith('<')) throw new Error('The sheet is not shared publicly.');
  return parseCsv(text);
}
