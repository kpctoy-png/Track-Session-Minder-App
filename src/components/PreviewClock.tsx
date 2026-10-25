import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSchedule } from '@/lib/ScheduleStore';
import { formatTime, fromMinutes } from '@/lib/schedule';
import { colors } from './theme';

// Shown when the selected day isn't today. The time keeps ticking like a real
// clock, and the buttons move it so you can see any point of the day.
export function PreviewClock() {
  const { day, clock } = useSchedule();
  if (!clock.isPreview) return null;
  const step = (delta: number) => clock.setPreviewMinute(clock.minuteOfDay + delta);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        Preview of {day.label}, running at this time of day.{' '}
        <Text style={styles.link} onPress={clock.resetPreview}>
          Back to now
        </Text>
      </Text>
      <View style={styles.controls}>
        <Btn label="−15" onPress={() => step(-15)} />
        <Btn label="−5" onPress={() => step(-5)} />
        <Text style={styles.time}>{formatTime(fromMinutes(clock.minuteOfDay))}</Text>
        <Btn label="+5" onPress={() => step(5)} />
        <Btn label="+15" onPress={() => step(15)} />
      </View>
    </View>
  );
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.btn}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  label: { color: colors.muted, fontSize: 12, textAlign: 'center', marginBottom: 6 },
  link: { color: colors.accent, fontWeight: '600' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { color: colors.text, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  btn: { backgroundColor: colors.cardRaised, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  btnText: { color: colors.text, fontWeight: '600' },
});
