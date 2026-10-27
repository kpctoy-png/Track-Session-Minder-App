import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';

const SHOW_MS = 1800;
const FADE_MS = 400;

// Shown over the app for a moment each time it opens. Tap to skip.
export function OpeningScreen() {
  const opacity = useRef(new Animated.Value(1)).current;
  const [visible, setVisible] = useState(true);

  const hide = () =>
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => setVisible(false));

  useEffect(() => {
    const timer = setTimeout(hide, SHOW_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;
  return (
    <Animated.View style={[styles.cover, { opacity }]}>
      <Pressable style={styles.inner} onPress={hide} accessibilityLabel="Skip opening screen">
        <Image
          source={require('../../assets/brand/tsm-logo.png')}
          style={styles.appLogo}
          resizeMode="contain"
          accessibilityLabel="Track Session Minder logo"
        />
        <Text style={styles.name}>Track Session Minder</Text>
        <Text style={styles.tagline}>Live track day schedules</Text>
        <View style={styles.footer}>
          <Image
            source={require('../../assets/brand/redline-techniques.png')}
            style={styles.companyLogo}
            resizeMode="contain"
            accessibilityLabel="Redline Techniques logo"
          />
          <Text style={styles.footerText}>by Redline Techniques LLC</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#FFFFFF', zIndex: 100 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  appLogo: { width: 160, height: 160, marginBottom: 24 },
  name: { color: '#111114', fontSize: 30, fontWeight: '800', textAlign: 'center', letterSpacing: 0.5 },
  tagline: { color: '#5C5C66', fontSize: 16, marginTop: 6, textAlign: 'center' },
  footer: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' },
  companyLogo: { width: 160, height: 52, marginBottom: 6 },
  footerText: { color: '#8A8A94', fontSize: 13 },
});
