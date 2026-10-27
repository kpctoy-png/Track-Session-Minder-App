import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { isEmail } from '@/lib/coaching';
import { supabase } from '@/lib/supabase';
import { colors } from './theme';

const SLOW_MS = 6000;

type Props = {
  heading: string;
  intro: string;
  /** Shown when what was typed isn't an email address. */
  emailHint: string;
  /** Prefix for the inputs' ids, so each screen's fields stay distinct. */
  idPrefix: string;
  children?: ReactNode;
};

/** Sign in with a one-time code sent to an email, so there are no passwords. Used by drivers and organizers. */
export function EmailCodeSignIn({ heading, intro, emailHint, idPrefix, children }: Props) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);

  const sendCode = async () => {
    // A second tap while sending would send another code and cancel the first.
    if (!supabase || busy) return;
    if (!isEmail(email)) return setError(emailHint);
    setBusy(true);
    setError(null);
    // The email server can take a while; after a few seconds, say so instead of looking stuck.
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    clearTimeout(timer);
    setSlow(false);
    setBusy(false);
    if (error) setError(`Couldn't send the code: ${error.message}`);
    else setSentTo(email.trim());
  };

  const verify = async () => {
    if (!supabase || !sentTo || busy) return;
    setBusy(true);
    setError(null);
    // Pasted codes can carry stray dots or spaces from the email; only the digits count.
    const { error } = await supabase.auth.verifyOtp({ email: sentTo, token: code.replace(/\D/g, ''), type: 'email' });
    setBusy(false);
    if (error) setError('That code did not work. Check the newest email, or send a new code.');
  };

  return (
    <View>
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.sub}>{intro}</Text>
      {sentTo ? (
        <>
          <Text style={styles.sub}>We sent a code to {sentTo}.</Text>
          <TextInput
            id={`${idPrefix}-code`}
            style={styles.input}
            placeholder="Code from the email"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            value={code}
            onChangeText={setCode}
            onSubmitEditing={verify}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Btn label={busy ? 'Checking…' : 'Sign in'} onPress={verify} primary />
          <Pressable onPress={() => setSentTo(null)}>
            <Text style={styles.link}>Use a different email or send a new code</Text>
          </Pressable>
        </>
      ) : (
        <>
          <TextInput
            id={`${idPrefix}-email`}
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={sendCode}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Btn label={busy ? 'Sending…' : 'Email me a code'} onPress={sendCode} primary />
          {slow ? <Text style={styles.sub}>Still sending. The email can take up to a minute, so please keep this screen open.</Text> : null}
        </>
      )}
      {children}
    </View>
  );
}

function Btn({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.btn, primary && styles.btnPrimary]}>
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 8 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2, marginBottom: 10 },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 16, marginBottom: 10 },
  error: { color: '#FF6961', fontSize: 13, marginBottom: 8 },
  link: { color: colors.accent, fontWeight: '600', marginTop: 14 },
  btn: { backgroundColor: colors.cardRaised, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnText: { color: colors.text, fontWeight: '600' },
  btnTextPrimary: { color: '#000' },
});
