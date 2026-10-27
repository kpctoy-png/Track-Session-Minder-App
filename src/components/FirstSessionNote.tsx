import { StyleSheet, Text, View } from 'react-native';

/** A yellow tag for a run group's first session of the day, e.g. "2 laps, no passing, yellow flag". */
export function FirstSessionNote({ text, big }: { text: string; big?: boolean }) {
  return (
    <View style={styles.tag}>
      <View style={[styles.flag, big && styles.flagBig]} accessibilityLabel="Yellow flag" />
      <Text style={[styles.text, big && styles.textBig]}>First session: {text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: 6 },
  flag: { width: 14, height: 10, backgroundColor: '#FFD60A', borderRadius: 1 },
  flagBig: { width: 20, height: 14 },
  text: { color: '#FFD60A', fontSize: 13, fontWeight: '700' },
  textBig: { fontSize: 16 },
});
