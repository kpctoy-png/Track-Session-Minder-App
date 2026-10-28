import type { ReactNode } from 'react';
import { ScrollView, type ScrollViewProps, StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';
import { announcementText } from '@/lib/announcement';
import { activeAnnouncements, useSchedule } from '@/lib/ScheduleStore';
import { formatTime, fromMinutes } from '@/lib/schedule';

/** Urgent messages from the organizers (a lightning hold, a red flag), pinned above every driver tab while they last. */
export function AnnouncementBanner() {
  const { announcements, event, events } = useSchedule();
  const shown = activeAnnouncements(announcements, event.id);
  if (!shown.length) return null;
  return (
    <ScrollView style={styles.pinned} contentContainerStyle={styles.wrap}>
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
    </ScrollView>
  );
}

/**
 * A driver screen's scroll area with the announcements, and an optional header such as the event and day picker,
 * pinned above it, so scrolling never hides them.
 */
export function DriverScroll({ header, ...props }: ScrollViewProps & { header?: ReactNode }) {
  return (
    <View style={styles.screen}>
      <AnnouncementBanner />
      {header ? <View style={styles.header}>{header}</View> : null}
      <ScrollView {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexShrink: 0, paddingHorizontal: 16, paddingTop: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  pinned: { flexGrow: 0, flexShrink: 0, maxHeight: '45%' },
  wrap: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  banner: { backgroundColor: '#C62828', borderRadius: 12, padding: 14, borderWidth: 2, borderColor: '#FF8A80' },
  message: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', lineHeight: 23 },
  meta: { color: '#FFE0DE', fontSize: 12, marginTop: 6 },
});
