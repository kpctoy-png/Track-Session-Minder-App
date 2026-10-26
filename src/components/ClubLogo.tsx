import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import type { Club } from '@/data/types';
import { colors } from './theme';

// Logos shipped with the app. A club's logo_url in the database wins.
const BUNDLED: Record<string, ImageSourcePropType> = {
  'just-track-it': require('../../assets/clubs/just-track-it.png'),
};

/** Whether the club has a picture logo (otherwise ClubLogo shows its name). */
export function hasClubLogo(club?: Club) {
  return !!club && (!!club.logoUrl || club.id in BUNDLED);
}

/** The club's logo on a white badge (most logos are drawn for light backgrounds). */
export function ClubLogo({ club, height = 28 }: { club?: Club; height?: number }) {
  if (!club) return null;
  const source = club.logoUrl ? { uri: club.logoUrl } : BUNDLED[club.id];
  if (!source) {
    return (
      <View style={[styles.badge, styles.textBadge, { height }]}>
        <Text style={styles.text}>{club.name}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, { height, width: height * 1.85 }]}>
      <Image source={source} style={styles.image} resizeMode="contain" accessibilityLabel={`${club.name} logo`} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { backgroundColor: '#FFFFFF', borderRadius: 6, padding: 3, justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  textBadge: { paddingHorizontal: 8, backgroundColor: colors.cardRaised },
  text: { color: colors.text, fontSize: 12, fontWeight: '700' },
});
