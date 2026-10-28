// Spelling and grammar suggestions from LanguageTool's free public service (about 20 checks a minute).
// Only the text being checked is sent: an announcement or a note, never names or emails from the app.

export interface Suggestion {
  offset: number;
  length: number;
  message: string;
  replacements: string[];
}

export async function checkGrammar(text: string): Promise<Suggestion[]> {
  const response = await fetch('https://api.languagetool.org/v2/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ text, language: 'en-US', level: 'picky' }).toString(),
  });
  if (!response.ok) throw new Error(`The checker answered ${response.status}`);
  const data = (await response.json()) as {
    matches: { offset: number; length: number; message: string; replacements: { value: string }[] }[];
  };
  const found = data.matches.map((m) => ({
    offset: m.offset,
    length: m.length,
    message: m.message,
    replacements: m.replacements.slice(0, 3).map((r) => r.value),
  }));
  // Add the basics the service can miss, unless it already flagged the same spot.
  const extra = basicChecks(text).filter((b) => !found.some((f) => b.offset < f.offset + f.length && f.offset < b.offset + b.length));
  return [...found, ...extra].sort((a, b) => a.offset - b.offset);
}

/** Sentences that start in lower case, a lone lower-case "i", and a message with no full stop at the end. */
export function basicChecks(text: string): Suggestion[] {
  const out: Suggestion[] = [];
  // The first letter of the message (after any emoji) and of each sentence after . ! or ?
  const starts = /(^[^A-Za-z0-9]*|[.!?]\s+)([a-z][\w']*)/g;
  for (let m = starts.exec(text); m; m = starts.exec(text)) {
    const word = m[2];
    out.push({
      offset: m.index + m[1].length,
      length: word.length,
      message: 'Start the sentence with a capital letter.',
      replacements: [word[0].toUpperCase() + word.slice(1)],
    });
  }
  for (const m of text.matchAll(/\bi\b(?!\.)/g)) {
    const at = m.index ?? 0;
    if (!out.some((o) => o.offset === at)) out.push({ offset: at, length: 1, message: 'Use a capital "I".', replacements: ['I'] });
  }
  const trimmed = text.trimEnd();
  const last = /(\S+)$/.exec(trimmed);
  if (last && /[A-Za-z0-9)"']$/.test(trimmed)) {
    out.push({ offset: last.index, length: last[1].length, message: 'End the message with a full stop.', replacements: [`${last[1]}.`] });
  }
  return out;
}

/** The text with one suggestion applied, and the remaining suggestions moved to match. */
export function applySuggestion(text: string, all: Suggestion[], picked: Suggestion, replacement: string): { text: string; rest: Suggestion[] } {
  const shift = replacement.length - picked.length;
  return {
    text: text.slice(0, picked.offset) + replacement + text.slice(picked.offset + picked.length),
    rest: all.filter((s) => s !== picked).map((s) => (s.offset > picked.offset ? { ...s, offset: s.offset + shift } : s)),
  };
}
