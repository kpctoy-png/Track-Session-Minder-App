import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, type ColorValue } from 'react-native';

import { OpeningScreen } from '@/components/OpeningScreen';
import { colors } from '@/components/theme';
import { ScheduleProvider, useSchedule } from '@/lib/ScheduleStore';

function icon(glyph: string) {
  return ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
}

export default function RootLayout() {
  return (
    <>
      <ScheduleProvider>
        <StatusBar style="light" />
        <AppTabs />
      </ScheduleProvider>
      {/* Outside the provider so it also covers the first load from the database. */}
      <OpeningScreen />
    </>
  );
}

function AppTabs() {
  const { isPlatformAdmin, manageableClubs } = useSchedule();
  const isAdmin = isPlatformAdmin || manageableClubs.length > 0;
  return (
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
      {/* Only admins see the tab; others can still sign in at /admin. Hidden with a style rather than
          href: null, because href: null also stops /admin links from opening. */}
      <Tabs.Screen
        name="admin"
        options={{ title: 'Admin', tabBarIcon: icon('✎'), tabBarItemStyle: isAdmin ? undefined : { display: 'none' } }}
      />
    </Tabs>
  );
}
