import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';

const OPEN_KEY = 'tsm-admin-open';
let remembered: Record<string, boolean> | null = null;

async function loadRemembered(): Promise<Record<string, boolean>> {
  if (remembered) return remembered;
  try {
    remembered = JSON.parse((await AsyncStorage.getItem(OPEN_KEY)) ?? '{}');
  } catch {
    remembered = {};
  }
  return remembered!;
}

/** A titled Admin section that opens and closes with a tap. Each device remembers which ones were left open. */
export function Collapsible({
  id,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  /** A short line shown under the title, such as "3 booked". */
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    loadRemembered().then((r) => {
      if (id in r) setOpen(r[id]);
    });
  }, [id]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    loadRemembered().then((r) => {
      r[id] = next;
      AsyncStorage.setItem(OPEN_KEY, JSON.stringify(r)).catch(() => {});
    });
  };

  return (
    <View style={styles.section}>
      <Pressable onPress={toggle} style={styles.header} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {summary ? <Text style={styles.summary}>{summary}</Text> : null}
        </View>
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  headerText: { flex: 1 },
  title: { color: colors.text, fontSize: 19, fontWeight: '700' },
  summary: { color: colors.muted, fontSize: 13, marginTop: 2 },
  chevron: { color: colors.accent, fontSize: 22, fontWeight: '700', width: 24, textAlign: 'center' },
  body: { paddingBottom: 12 },
});
