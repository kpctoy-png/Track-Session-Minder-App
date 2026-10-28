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
    body: new URLSearchParams({ text, language: 'en-US' }).toString(),
  });
  if (!response.ok) throw new Error(`The checker answered ${response.status}`);
  const data = (await response.json()) as {
    matches: { offset: number; length: number; message: string; replacements: { value: string }[] }[];
  };
  return data.matches.map((m) => ({
    offset: m.offset,
    length: m.length,
    message: m.message,
    replacements: m.replacements.slice(0, 3).map((r) => r.value),
  }));
}

/** The text with one suggestion applied, and the remaining suggestions moved to match. */
export function applySuggestion(text: string, all: Suggestion[], picked: Suggestion, replacement: string): { text: string; rest: Suggestion[] } {
  const shift = replacement.length - picked.length;
  return {
    text: text.slice(0, picked.offset) + replacement + text.slice(picked.offset + picked.length),
    rest: all.filter((s) => s !== picked).map((s) => (s.offset > picked.offset ? { ...s, offset: s.offset + shift } : s)),
  };
}
