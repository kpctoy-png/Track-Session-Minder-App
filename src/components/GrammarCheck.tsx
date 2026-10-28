import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { applySuggestion, basicChecks, checkGrammar, type Suggestion } from '@/lib/grammar';
import { colors } from './theme';

/** A "Check spelling and grammar" link under a text box, listing each suggestion with tap-to-fix buttons. */
export function GrammarCheck({ text, onChange }: { text: string; onChange: (text: string) => void }) {
  const [found, setFound] = useState<Suggestion[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState('');

  // Typing after a check makes its suggestions stale.
  useEffect(() => {
    if (found && text !== checked) setFound(null);
  }, [text, checked, found]);

  const check = async () => {
    if (!text.trim() || checking) return;
    setChecking(true);
    setError(null);
    try {
      setFound(await checkGrammar(text));
      setChecked(text);
    } catch {
      // Offline or the service is busy: still offer the capital letter and full stop checks.
      setFound(basicChecks(text));
      setChecked(text);
      setError("Couldn't reach the full checker, so only capitals and the full stop were checked. Try again in a minute.");
    }
    setChecking(false);
  };

  const fix = (s: Suggestion, replacement: string) => {
    const next = applySuggestion(text, found ?? [], s, replacement);
    setChecked(next.text);
    setFound(next.rest);
    onChange(next.text);
  };

  if (!text.trim()) return null;
  return (
    <View style={styles.wrap}>
      <Pressable onPress={check}>
        <Text style={styles.link}>{checking ? 'Checking…' : '✓ Check spelling and grammar'}</Text>
      </Pressable>
      {error ? <Text style={styles.muted}>{error}</Text> : null}
      {found && !found.length ? <Text style={styles.ok}>No problems found.</Text> : null}
      {found?.map((s) => (
        <View key={`${s.offset}-${s.message}`} style={styles.item}>
          <Text style={styles.message}>
            <Text style={styles.word}>“{text.slice(s.offset, s.offset + s.length)}”</Text> {s.message}
          </Text>
          {s.replacements.length ? (
            <View style={styles.fixes}>
              {s.replacements.map((r) => (
                <Pressable key={r} onPress={() => fix(s, r)} style={styles.fix}>
                  <Text style={styles.fixText}>{r || '(remove)'}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6, gap: 6 },
  link: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  muted: { color: colors.muted, fontSize: 13 },
  ok: { color: '#7CD992', fontSize: 13 },
  item: { backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 8, gap: 6 },
  message: { color: colors.text, fontSize: 13 },
  word: { fontWeight: '700' },
  fixes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fix: { borderRadius: 999, borderWidth: 1, borderColor: colors.accent, paddingHorizontal: 10, paddingVertical: 4 },
  fixText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
});
