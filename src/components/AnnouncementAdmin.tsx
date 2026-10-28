import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ScheduleItem } from '@/data/types';
import { ANNOUNCEMENT_ICONS, announcementText, withIcon } from '@/lib/announcement';
import { announceToPhones, emailRoster } from '@/lib/push';
import { activeAnnouncements, useSchedule } from '@/lib/ScheduleStore';
import { supabase } from '@/lib/supabase';
import { formatRange, shiftSchedule, sortItems, spreadCatchUp, trimSchedule } from '@/lib/schedule';
import { colors } from './theme';

const MAX = 200;
const DURATIONS: { label: string; minutes: number | null }[] = [
  { label: 'Until I clear it', minutes: null },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
];

type Recovery = { kind: 'late' | 'catchUp'; minutes: number };

/**
 * Admin: put an urgent message on drivers' screens and phones, and clear it. Clearing one sent for this event
 * on its day offers to make up the time it held the track, which the organizer reviews before anything is sent.
 */
export function AnnouncementAdmin({
  items,
  fromMinute,
  isToday,
  onRecover,
  onSent,
  rosterVersion,
}: {
  items: ScheduleItem[];
  fromMinute: number;
  isToday: boolean;
  onRecover: (r: Recovery) => void;
  onSent: (text: string) => void;
  /** Changes when the registered drivers list is uploaded or deleted, to recount it. */
  rosterVersion: number;
}) {
  const { event, events, day, announcements, isPlatformAdmin, postAnnouncement, clearAnnouncement } = useSchedule();
  const [message, setMessage] = useState('');
  const [minutes, setMinutes] = useState<number | null>(null);
  const [everyone, setEveryone] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [roster, setRoster] = useState<{ group: string; count: number }[]>([]);
  const [emailToo, setEmailToo] = useState(true);
  /** Run groups to email; null emails everyone registered. */
  const [groups, setGroups] = useState<string[] | null>(null);
  const [inApp, setInApp] = useState(true);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  // After an icon is tapped, put the cursor back in the message so the organizer can finish it.
  const focusMessage = () => setTimeout(() => input.current?.focus(), 0);

  useEffect(() => {
    setRoster([]);
    setGroups(null);
    setInApp(true);
    supabase
      ?.from('event_roster')
      .select('run_group')
      .eq('event_id', event.id)
      .not('email', 'is', null)
      .then(({ data }) => {
        const counts = new Map<string, number>();
        for (const r of data ?? []) counts.set(r.run_group ?? '', (counts.get(r.run_group ?? '') ?? 0) + 1);
        setRoster([...counts].map(([group, count]) => ({ group, count })).sort((a, b) => a.group.localeCompare(b.group)));
      });
  }, [event.id, rosterVersion]);

  const live = activeAnnouncements(announcements, event.id);
  const registered = roster.reduce((n, g) => n + g.count, 0);
  const named = roster.filter((g) => g.group);
  const emailCount = groups ? roster.filter((g) => groups.includes(g.group)).reduce((n, g) => n + g.count, 0) : registered;
  const emailing = !everyone && emailToo && emailCount > 0;
  // The app and phone alerts can be skipped only when the message is going out by email instead.
  const showing = inApp || !emailing;
  const audience = everyone ? 'every driver, on every event' : `every driver following ${event.name}`;
  const emailWho = groups ? `${emailCount} registered ${groups.join(' / ')} drivers` : `${registered} registered drivers`;

  const toggleGroup = (group: string) => {
    const next = groups?.includes(group) ? groups.filter((g) => g !== group) : [...(groups ?? []), group];
    setGroups(next.length ? next : null);
    // A message for some run groups usually isn't for every driver's screen.
    setInApp(!next.length);
    setConfirming(false);
  };

  const send = async () => {
    setBusy(true);
    setProblem(null);
    const text = message.trim();
    if (showing) {
      const error = await postAnnouncement(everyone ? null : event.id, text, minutes);
      if (error) {
        setBusy(false);
        setConfirming(false);
        return setProblem(error);
      }
      announceToPhones(everyone ? events.map((e) => e.id) : [event.id], text);
    }
    setBusy(false);
    setConfirming(false);
    setMessage('');
    if (!emailing) return onSent('Announcement sent to drivers');
    const sent = showing ? 'Announcement sent to drivers · ' : '';
    onSent(`${sent}emailing…`);
    const mail = await emailRoster(event.id, announcementText(text), groups ?? undefined);
    if (mail.error) setProblem(`${showing ? 'Shown in the app, but the' : 'The'} email didn't go out: ${mail.error}`);
    else onSent(`${sent}emailed ${mail.emailed}`);
  };

  const clear = async (id: string, eventId: string | null, createdAt: string) => {
    setProblem(null);
    const error = await clearAnnouncement(id);
    if (error) return setProblem(error);
    onSent('Announcement cleared');
    // How long the track was held, to the nearest 5 minutes.
    const held = Math.max(5, Math.round((Date.now() - new Date(createdAt).getTime()) / 300_000) * 5);
    if (eventId === event.id && isToday) setRecovery({ kind: 'late', minutes: held });
  };

  return (
    <View>
      {live.map((a) => (
        <View key={a.id} style={styles.live}>
          <Text style={styles.liveLabel}>
            ON DRIVERS' SCREENS NOW{a.eventId ? '' : ' · EVERY DRIVER'}
            {a.endsAt ? ` · until ${new Date(a.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
          </Text>
          <Text style={styles.liveText}>{announcementText(a.message)}</Text>
          {a.eventId || isPlatformAdmin ? (
            <Btn label="Clear announcement" onPress={() => clear(a.id, a.eventId, a.createdAt)} />
          ) : null}
        </View>
      ))}

      {recovery ? (
        <RecoveryReview
          items={items}
          fromMinute={fromMinute}
          dayLabel={day.label}
          recovery={recovery}
          onChange={setRecovery}
          onApprove={() => {
            onRecover(recovery);
            setRecovery(null);
          }}
          onSkip={() => setRecovery(null)}
        />
      ) : null}

      <Text style={styles.sub}>
        For lightning, a red flag or anything drivers must see now. It shows in red at the top of their app and goes
        to phones with alerts on.
      </Text>
      <View style={[styles.buttons, styles.icons]}>
        {ANNOUNCEMENT_ICONS.map((i) => (
          <Btn
            key={i.label}
            label={`${i.icon} ${i.label}`}
            onPress={() => {
              setMessage((m) => withIcon(m, i.icon, i.starter).slice(0, MAX));
              focusMessage();
              setConfirming(false);
            }}
          />
        ))}
      </View>
      <TextInput
        ref={input}
        id="announcement-message"
        style={[styles.input, styles.multiline]}
        placeholder="e.g. Lightning in the area. Track closed, stay in your cars."
        placeholderTextColor={colors.muted}
        multiline
        spellCheck
        autoCorrect
        autoCapitalize="sentences"
        maxLength={MAX}
        value={message}
        onChangeText={(t) => {
          setMessage(t);
          setConfirming(false);
        }}
      />
      <Text style={styles.count}>
        {message.length}/{MAX}
      </Text>
      <Text style={styles.label}>Show it</Text>
      <View style={styles.buttons}>
        {DURATIONS.map((d) => (
          <Btn key={d.label} label={d.label} selected={minutes === d.minutes} onPress={() => setMinutes(d.minutes)} />
        ))}
      </View>
      {isPlatformAdmin ? (
        <>
          <Text style={styles.label}>Send to</Text>
          <View style={styles.buttons}>
            <Btn label={`${event.name} only`} selected={!everyone} onPress={() => setEveryone(false)} />
            <Btn label="Every driver (Redline)" selected={everyone} onPress={() => setEveryone(true)} />
          </View>
        </>
      ) : null}
      {!everyone && registered > 0 ? (
        <Pressable
          onPress={() => {
            setEmailToo(!emailToo);
            setConfirming(false);
          }}
          style={styles.check}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: emailToo }}
        >
          <Text style={styles.checkBox}>{emailToo ? '☑' : '☐'}</Text>
          <Text style={styles.checkText}>Also email the {registered} registered drivers</Text>
        </Pressable>
      ) : null}
      {emailing ? (
        <>
          {named.length > 0 && roster.length > 1 ? (
            <>
              <Text style={styles.label}>Email which run groups</Text>
              <View style={styles.buttons}>
                <Btn
                  label={`All (${registered})`}
                  selected={!groups}
                  onPress={() => {
                    setGroups(null);
                    setInApp(true);
                    setConfirming(false);
                  }}
                />
                {named.map((g) => (
                  <Btn key={g.group} label={`${g.group} (${g.count})`} selected={!!groups?.includes(g.group)} onPress={() => toggleGroup(g.group)} />
                ))}
              </View>
            </>
          ) : null}
          <Pressable
            onPress={() => {
              setInApp(!inApp);
              setConfirming(false);
            }}
            style={styles.check}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: inApp }}
          >
            <Text style={styles.checkBox}>{inApp ? '☑' : '☐'}</Text>
            <Text style={styles.checkText}>Also show it in the app and alert every driver's phone</Text>
          </Pressable>
        </>
      ) : null}
      {confirming ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>
            {showing
              ? `Show this to ${audience}${emailing ? `, alert their phones, and email the ${emailWho}?` : ', and alert their phones?'}`
              : `Email this only to the ${emailWho}? It won't show in the app.`}
            {'\n\n'}“{announcementText(message.trim())}”
          </Text>
          <View style={styles.buttons}>
            <Btn label={busy ? 'Sending…' : showing ? 'Send to drivers' : 'Send email'} onPress={() => !busy && send()} primary />
            <Btn label="Cancel" onPress={() => setConfirming(false)} />
          </View>
        </View>
      ) : (
        <View style={[styles.buttons, styles.sendRow]}>
          <Btn
            label="Send announcement"
            primary
            onPress={() => (message.trim() ? setConfirming(true) : setProblem('Type a message first.'))}
          />
        </View>
      )}
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
    </View>
  );
}

/** Shows what making up the lost time would do to the rest of the day. Nothing changes until it's approved. */
function RecoveryReview({
  items,
  fromMinute,
  dayLabel,
  recovery,
  onChange,
  onApprove,
  onSkip,
}: {
  items: ScheduleItem[];
  fromMinute: number;
  dayLabel: string;
  recovery: Recovery;
  onChange: (r: Recovery) => void;
  onApprove: () => void;
  onSkip: () => void;
}) {
  const { kind, minutes } = recovery;
  const next =
    kind === 'late'
      ? shiftSchedule(items, fromMinute, minutes)
      : trimSchedule(items, fromMinute, spreadCatchUp(items, fromMinute, minutes));
  const before = Object.fromEntries(items.map((i) => [i.id, formatRange(i)]));
  const changed = sortItems(next).filter((i) => before[i.id] !== formatRange(i));

  return (
    <View style={styles.confirm}>
      <Text style={styles.confirmText}>The track was held about {minutes} min. Make up the time on {dayLabel}?</Text>
      <View style={styles.buttons}>
        <Btn label="−5 min" onPress={() => onChange({ kind, minutes: Math.max(5, minutes - 5) })} />
        <Text style={styles.minutes}>{minutes} min</Text>
        <Btn label="+5 min" onPress={() => onChange({ kind, minutes: minutes + 5 })} />
      </View>
      <View style={styles.buttons}>
        <Btn label="Push the rest later" selected={kind === 'late'} onPress={() => onChange({ kind: 'late', minutes })} />
        <Btn
          label="Shorten sessions to catch up"
          selected={kind === 'catchUp'}
          onPress={() => onChange({ kind: 'catchUp', minutes })}
        />
      </View>
      <Text style={styles.label}>{changed.length ? 'New times' : 'Nothing left today to change.'}</Text>
      {changed.map((i) => (
        <Text key={i.id} style={styles.change}>
          {i.title}: {before[i.id]} → {formatRange(i)}
        </Text>
      ))}
      <View style={styles.buttons}>
        {changed.length ? <Btn label="Send to drivers" onPress={onApprove} primary /> : null}
        <Btn label="Don't change the schedule" onPress={onSkip} />
      </View>
    </View>
  );
}

function Btn({ label, onPress, primary, selected }: { label: string; onPress: () => void; primary?: boolean; selected?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.btn, (primary || selected) && styles.btnPrimary]}>
      <Text style={[styles.btnText, (primary || selected) && styles.btnTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  live: { backgroundColor: '#C62828', borderRadius: 12, padding: 12, marginBottom: 12, gap: 8 },
  liveLabel: { color: '#FFE0DE', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  liveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2, marginBottom: 10 },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 16 },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  count: { color: colors.muted, fontSize: 12, textAlign: 'right', marginTop: 4 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  sendRow: { marginTop: 12 },
  icons: { marginBottom: 8 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  checkBox: { color: colors.accent, fontSize: 22 },
  checkText: { color: colors.text, fontSize: 15 },
  minutes: { color: colors.text, fontSize: 16, fontWeight: '700', minWidth: 60, textAlign: 'center' },
  change: { color: colors.text, fontSize: 14, lineHeight: 20 },
  confirm: { borderWidth: 2, borderColor: colors.accent, borderRadius: 12, padding: 12, marginTop: 10, marginBottom: 10, gap: 10 },
  confirmText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  problem: { color: '#FF6961', fontSize: 13, marginTop: 8 },
  btn: { backgroundColor: colors.cardRaised, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnText: { color: colors.text, fontWeight: '600' },
  btnTextPrimary: { color: '#000' },
});
