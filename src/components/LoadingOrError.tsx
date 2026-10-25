import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';

// Shown before the first schedule arrives from the database.
export function LoadingOrError({ status, message }: { status: string; message?: string }) {
  return (
    <View style={styles.page}>
      {status === 'error' ? (
        <>
          <Text style={styles.title}>Couldn't load the schedule</Text>
          <Text style={styles.body}>Check your internet connection and reopen the app.</Text>
          {message ? <Text style={styles.detail}>{message}</Text> : null}
        </>
      ) : status === 'live' ? (
        <>
          <Text style={styles.title}>No events yet</Text>
          <Text style={styles.body}>Schedules will appear here once they are published.</Text>
        </>
      ) : (
        <ActivityIndicator color={colors.accent} size="large" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  body: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  detail: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 8 },
});
