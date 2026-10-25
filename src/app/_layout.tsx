import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, type ColorValue } from 'react-native';

import { OpeningScreen } from '@/components/OpeningScreen';
import { colors } from '@/components/theme';
import { ScheduleProvider } from '@/lib/ScheduleStore';

function icon(glyph: string) {
  return ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
}

export default function RootLayout() {
  return (
    <>
      <ScheduleProvider>
        <StatusBar style="light" />
        <Tabs
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.muted,
            sceneStyle: { backgroundColor: colors.background },
          }}
        >
          <Tabs.Screen name="events" options={{ title: 'Events', tabBarIcon: icon('▦') }} />
          <Tabs.Screen name="index" options={{ title: 'Now', tabBarIcon: icon('◉') }} />
          <Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarIcon: icon('☰') }} />
          <Tabs.Screen name="me" options={{ title: 'My Day', tabBarIcon: icon('👤') }} />
          <Tabs.Screen name="admin" options={{ title: 'Admin', tabBarIcon: icon('✎') }} />
        </Tabs>
      </ScheduleProvider>
      {/* Outside the provider so it also covers the first load from the database. */}
      <OpeningScreen />
    </>
  );
}
