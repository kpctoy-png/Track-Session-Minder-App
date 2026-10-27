import { StyleSheet, Text, View } from 'react-native';

import { announcementText } from '@/lib/announcement';
import { activeAnnouncements, useSchedule } from '@/lib/ScheduleStore';
import { formatTime, fromMinutes } from '@/lib/schedule';

/** Urgent messages from the organizers (a lightning hold, a red flag), on top of every driver tab while they last. */
export function AnnouncementBanner() {
  const { announcements, event, events } = useSchedule();
  const shown = activeAnnouncements(announcements, event.id);
  if (!shown.length) return null;
  return (
    <View style={styles.wrap}>
      {shown.map((a) => {
        const sent = new Date(a.createdAt);
        const from = a.eventId ? (events.find((e) => e.id === a.eventId)?.name ?? event.name) : 'Track Session Minder';
        return (
          <View key={a.id} style={styles.banner} accessibilityRole="alert">
            <Text style={styles.message}>{announcementText(a.message)}</Text>
            <Text style={styles.meta}>
              {from} · {formatTime(fromMinutes(sent.getHours() * 60 + sent.getMinutes()))}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 12 },
  banner: { backgroundColor: '#C62828', borderRadius: 12, padding: 14, borderWidth: 2, borderColor: '#FF8A80' },
  message: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', lineHeight: 23 },
  meta: { color: '#FFE0DE', fontSize: 12, marginTop: 6 },
});
