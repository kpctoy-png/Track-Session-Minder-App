// Reading the first sheet of an Excel (.xlsx) file, such as a Google Sheet downloaded as Excel, as rows of
// plain-text cells. An .xlsx file is a zip of XML files; the browser's DecompressionStream unzips it.

/** Whether `bytes` start like a zip file (and so may be an .xlsx). */
export function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** The files in a zip, by name, as text. Only stored and deflated entries are read. */
async function unzip(bytes: Uint8Array, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a zip file');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (!wanted(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.slice(start, start + size);
    if (method === 0) files.set(name, new TextDecoder().decode(data));
    else if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      files.set(name, await new Response(stream).text());
    }
  }
  return files;
}

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** The text of every <t> inside `xml`, joined (a shared string can be split into formatted runs). */
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');

/** Column index for a cell reference such as "C7" (A is 0). */
function column(ref: string): number {
  let n = 0;
  for (const c of ref.replace(/\d+$/, '')) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** The rows of the first sheet in an .xlsx file. */
export async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  const files = await unzip(bytes, (name) => name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  const sheet = [...files.keys()].filter((n) => n.startsWith('xl/worksheets/')).sort((a, b) => parseInt(a.slice(19), 10) - parseInt(b.slice(19), 10))[0];
  if (!sheet) throw new Error('no sheet in the file');
  const shared = [...(files.get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const rows: string[][] = [];
  for (const row of files.get(sheet)!.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells: string[] = [];
    for (const cell of (row[1] ?? '').matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(cell[1])?.[1];
      const type = /\bt="(\w+)"/.exec(cell[1])?.[1];
      const body = cell[2] ?? '';
      const value = decode(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '');
      const text = type === 's' ? (shared[Number(value)] ?? '') : type === 'inlineStr' ? texts(body) : value;
      cells[ref ? column(ref) : cells.length] = text;
    }
    rows.push(Array.from(cells, (c) => c ?? ''));
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}
