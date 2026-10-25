import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text } from 'react-native';

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
          source={require('../../assets/brand/redline-techniques.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Redline Techniques logo"
        />
        <Text style={styles.name}>Track Session Minder</Text>
        <Text style={styles.tagline}>Live track day schedules</Text>
        <Text style={styles.footer}>by Redline Techniques LLC</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#FFFFFF', zIndex: 100 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  logo: { width: '90%', maxWidth: 420, aspectRatio: 763 / 246, marginBottom: 28 },
  name: { color: '#111114', fontSize: 30, fontWeight: '800', textAlign: 'center', letterSpacing: 0.5 },
  tagline: { color: '#5C5C66', fontSize: 16, marginTop: 6, textAlign: 'center' },
  footer: { position: 'absolute', bottom: 48, color: '#8A8A94', fontSize: 13 },
});
