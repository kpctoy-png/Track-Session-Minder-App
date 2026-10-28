// Reads a schedule laid out the way the Just Track It sheets are: a header row
// of day names (SATURDAY, SUNDAY, or one "Friday December 4 2026"), and under
// each day a time column ("8:00 - 8:25") next to a title column ("Intermediate 2").

import type { ItemKind, RunGroupId, ScheduleItem } from '@/data/types';
import { fromMinutes } from './schedule';

const DAY_NAMES = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

/** "SATURDAY" or "Friday December 4 2026" -> the day's name; anything else (like "Friday 6:00 - 7:20") -> null. */
function dayHeader(cell: string | undefined): string | null {
  const m = /^([a-z]+)(,?\s+[a-z]+\.?\s+\d{1,2}(st|nd|rd|th)?(,?\s+\d{4})?)?$/i.exec(cell?.trim() ?? '');
  const name = m?.[1].toUpperCase();
  return name && DAY_NAMES.includes(name) ? name : null;
}

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
  const headerIndex = rows.findIndex((row) => row.some((c) => dayHeader(c)));
  if (headerIndex < 0) return [];
  const header = rows[headerIndex];
  const columns = header
    .map((c, i) => ({ name: dayHeader(c), col: i }))
    .filter((c): c is { name: string; col: number } => !!c.name);

  const days: ImportedDay[] = columns.map((c) => ({ label: c.name[0] + c.name.slice(1).toLowerCase(), items: [] }));
  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (isBlank(row)) break;
    if (row.some((c) => dayHeader(c))) break;
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

/** "...#gid=123" or "...?gid=123" -> "123", the tab the link points at. */
export function sheetGidFromLink(link: string): string | null {
  return /[#?&]gid=(\d+)/.exec(link)?.[1] ?? null;
}

/** Downloads one tab of a sheet shared as "Anyone with the link can view": by name, by gid, or the first tab. */
export async function fetchSheetTab(sheetId: string, tab: string | { gid: string | null }): Promise<string[][]> {
  const which = typeof tab === 'string' ? `&sheet=${encodeURIComponent(tab)}` : tab.gid ? `&gid=${tab.gid}` : '';
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&headers=0${which}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google Sheets answered ${response.status}`);
  const text = await response.text();
  if (text.trimStart().startsWith('<')) throw new Error('The sheet is not shared publicly.');
  return parseCsv(text);
}
