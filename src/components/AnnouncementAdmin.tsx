import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ScheduleItem } from '@/data/types';
import { ANNOUNCEMENT_ICONS, announcementText, withIcon } from '@/lib/announcement';
import { announceToPhones, emailRoster } from '@/lib/push';
import { activeAnnouncements, useSchedule } from '@/lib/ScheduleStore';
import { supabase } from '@/lib/supabase';
import { formatRange, shiftSchedule, sortItems, spreadCatchUp, trimSchedule } from '@/lib/schedule';
import { GrammarCheck } from './GrammarCheck';
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
  const { clubs, event, events, day, announcements, isPlatformAdmin, postAnnouncement, clearAnnouncement } = useSchedule();
  const [message, setMessage] = useState('');
  const [minutes, setMinutes] = useState<number | null>(null);
  const [everyone, setEveryone] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  /** Registered drivers by run group: how many have an email, and their cell numbers. */
  const [roster, setRoster] = useState<{ group: string; count: number; noPhone: number; phones: string[] }[]>([]);
  // How it goes out: nothing is ticked until the organizer picks at least one.
  const [emailToo, setEmailToo] = useState(false);
  const [textToo, setTextToo] = useState(false);
  /** Texts waiting for the organizer to send from their iPhone with the Text Drivers shortcut. */
  const [textBatch, setTextBatch] = useState<{ message: string; phones: string[] } | null>(null);
  /** Run groups to email; null emails everyone registered. */
  const [groups, setGroups] = useState<string[] | null>(null);
  const [inApp, setInApp] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  // After an icon is tapped, put the cursor back in the message so the organizer can finish it.
  const focusMessage = () => setTimeout(() => input.current?.focus(), 0);

  useEffect(() => {
    setRoster([]);
    setGroups(null);
    setInApp(false);
    setTextToo(false);
    setEmailToo(false);
    supabase
      ?.from('event_roster')
      .select('run_group, email, phone')
      .eq('event_id', event.id)
      .then(({ data }) => {
        const byGroup = new Map<string, { count: number; noPhone: number; phones: string[] }>();
        for (const r of data ?? []) {
          const g = byGroup.get(r.run_group ?? '') ?? { count: 0, noPhone: 0, phones: [] };
          if (r.email) g.count++;
          if (r.email && !r.phone) g.noPhone++;
          if (r.phone && !g.phones.includes(r.phone)) g.phones.push(r.phone);
          byGroup.set(r.run_group ?? '', g);
        }
        const next = [...byGroup].map(([group, g]) => ({ group, ...g })).sort((a, b) => a.group.localeCompare(b.group));
        setRoster(next);
      });
  }, [event.id, rosterVersion]);

  const live = activeAnnouncements(announcements, event.id);
  const registered = roster.reduce((n, g) => n + g.count, 0);
  const named = roster.filter((g) => g.group);
  const emailCount = groups ? roster.filter((g) => groups.includes(g.group)).reduce((n, g) => n + g.count, 0) : registered;
  const chosen = groups ? roster.filter((g) => groups.includes(g.group)) : roster;
  const phones = [...new Set(chosen.flatMap((g) => g.phones))];
  const allPhones = roster.reduce((n, g) => n + g.phones.length, 0);
  const texting = !everyone && textToo && phones.length > 0;
  // Texts come first; drivers with no cell number get an email instead, unless everyone is being emailed anyway.
  const noPhone = chosen.reduce((n, g) => n + g.noPhone, 0);
  const emailRest = texting && !emailToo && noPhone > 0;
  const emailing = !everyone && ((emailToo && emailCount > 0) || emailRest);
  const reaching = emailing || texting;
  const showing = inApp || everyone;
  const audience = everyone ? 'every driver, on every event' : `every driver following ${event.name}`;
  const emailWho = emailRest
    ? `${noPhone === 1 ? '1 driver' : `${noPhone} drivers`} with no cell number`
    : groups
      ? `${emailCount} registered ${groups.join(' / ')} drivers`
      : `${registered} registered drivers`;

  const toggleGroup = (group: string) => {
    const next = groups?.includes(group) ? groups.filter((g) => g !== group) : [...(groups ?? []), group];
    setGroups(next.length ? next : null);
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
    setInApp(false);
    setTextToo(false);
    setEmailToo(false);
    setGroups(null);
    // Event name on top and the club's name at the bottom, so drivers know who is texting from an unsaved number.
    const club = clubs.find((c) => c.id === event.clubId)?.name;
    if (texting) setTextBatch({ message: [event.name, announcementText(text), club ? `– ${club}` : ''].filter(Boolean).join('\n'), phones });
    const textNext = texting ? `tap Text ${plural(phones.length)} below to send the texts` : '';
    if (!emailing) return onSent([showing ? 'Announcement sent to drivers' : '', textNext].filter(Boolean).join(' · '));
    const sent = showing ? 'Announcement sent to drivers · ' : '';
    onSent(`${sent}emailing…`);
    const mail = await emailRoster(event.id, announcementText(text), groups ?? undefined, emailRest);
    if (mail.error) setProblem(`${showing ? 'Shown in the app, but the' : 'The'} email didn't go out: ${mail.error}`);
    else onSent(`${sent}emailed ${mail.emailed}${textNext ? ` · ${textNext}` : ''}`);
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
      <GrammarCheck
        text={message}
        onChange={(t) => {
          setMessage(t.slice(0, MAX));
          setConfirming(false);
        }}
      />
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
      {everyone ? null : (
        <>
          <Text style={styles.label}>How to send it (pick one or more)</Text>
          <Check
            checked={inApp}
            label="Show it in the app and alert every driver's phone"
            onPress={() => {
              setInApp(!inApp);
              setConfirming(false);
            }}
          />
          {allPhones > 0 ? (
            <Check
              checked={textToo}
              label={`Text the ${plural(allPhones)} with a cell number (from your iPhone)`}
              onPress={() => {
                setTextToo(!textToo);
                setConfirming(false);
              }}
            />
          ) : null}
          {emailRest ? <Text style={styles.checkNote}>{noPhone === 1 ? 'The 1 driver with no cell number gets an email instead.' : `The ${noPhone} drivers with no cell number get an email instead.`}</Text> : null}
          {registered > 0 ? (
            <Check
              checked={emailToo}
              label={`Email ${registered === 1 ? 'the 1 registered driver' : `all ${registered} registered drivers`}${textToo && allPhones > 0 ? ', even those who get a text' : ''}`}
              onPress={() => {
                setEmailToo(!emailToo);
                setConfirming(false);
              }}
            />
          ) : null}
        </>
      )}
      {reaching && named.length > 0 && roster.length > 1 ? (
        <>
          <Text style={styles.label}>{texting && !emailing ? 'Text which run groups' : emailing && !texting ? 'Email which run groups' : 'Which run groups'}</Text>
          <View style={styles.buttons}>
            <Btn
              label={`All (${registered})`}
              selected={!groups}
              onPress={() => {
                setGroups(null);
                setConfirming(false);
              }}
            />
            {named.map((g) => (
              <Btn key={g.group} label={`${g.group} (${g.count})`} selected={!!groups?.includes(g.group)} onPress={() => toggleGroup(g.group)} />
            ))}
          </View>
        </>
      ) : null}
      {confirming ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>
            {confirmText()}
            {'\n\n'}“{announcementText(message.trim())}”
          </Text>
          <View style={styles.buttons}>
            <Btn label={busy ? 'Sending…' : showing ? 'Send to drivers' : emailing ? 'Send email' : 'Get texts ready'} onPress={() => !busy && send()} primary />
            <Btn label="Cancel" onPress={() => setConfirming(false)} />
          </View>
        </View>
      ) : (
        <View style={[styles.buttons, styles.sendRow]}>
          <Btn
            label="Send announcement"
            primary
            onPress={() => {
              if (!message.trim()) return setProblem('Type a message first.');
              if (!showing && !reaching) return setProblem('Pick how to send it: in the app, by text or by email.');
              setProblem(null);
              setConfirming(true);
            }}
          />
        </View>
      )}
      {textBatch ? <TextDrivers batch={textBatch} onDone={() => setTextBatch(null)} /> : null}
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
    </View>
  );

  function confirmText() {
    const extras = [texting ? `text ${plural(phones.length)} from your iPhone` : '', emailing ? `email the ${emailWho}` : ''].filter(Boolean);
    const also = extras.length ? `, and ${extras.join(' and ')}` : '';
    if (showing) return `Show this to ${audience}, alert their phones${also}?`;
    return `${extras.join(' and ').replace(/^./, (c) => c.toUpperCase())}? It won't show in the app.`;
  }
}

function Check({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <Text style={styles.checkBox}>{checked ? '☑' : '☐'}</Text>
      <Text style={styles.checkText}>{label}</Text>
    </Pressable>
  );
}

const plural = (n: number) => `${n} ${n === 1 ? 'driver' : 'drivers'}`;

/** The name the organizer gives the shortcut on their iPhone; the button below runs it by this name. */
export const TEXT_SHORTCUT = 'Text Drivers';

/**
 * Hands the message and numbers to the Text Drivers shortcut on the organizer's iPhone, which sends each driver
 * their own text from the organizer's number. Web pages can't send texts themselves.
 */
function TextDrivers({ batch, onDone }: { batch: { message: string; phones: string[] }; onDone: () => void }) {
  const [opened, setOpened] = useState(false);
  const url = `shortcuts://run-shortcut?name=${encodeURIComponent(TEXT_SHORTCUT)}&input=text&text=${encodeURIComponent(JSON.stringify(batch))}`;
  // The texts aren't sent until this button is tapped, so bring the card into view rather than leave it below the fold.
  useEffect(() => {
    if (typeof document !== 'undefined') document.getElementById('text-drivers')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);
  return (
    <View style={[styles.confirm, styles.textCard]} nativeID="text-drivers">
      <Text style={styles.textCardTitle}>{opened ? '📱 Texting…' : '📱 One more step: the texts are not sent yet'}</Text>
      <Text style={styles.confirmText}>
        {opened
          ? `The ${TEXT_SHORTCUT} shortcut is texting ${plural(batch.phones.length)}. Keep the Shortcuts app open until it finishes.`
          : `Now text ${plural(batch.phones.length)} from your iPhone:`}
        {'\n\n'}“{batch.message}”
      </Text>
      <View style={styles.buttons}>
        <Btn
          label={opened ? 'Send the texts again' : `Text ${plural(batch.phones.length)}`}
          primary={!opened}
          onPress={() => {
            setOpened(true);
            if (typeof window !== 'undefined') window.location.href = url;
          }}
        />
        <Btn label={opened ? 'Done' : 'Skip texts'} onPress={onDone} />
      </View>
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
  checkNote: { color: colors.muted, fontSize: 13, marginLeft: 28, marginTop: -2, marginBottom: 6 },
  minutes: { color: colors.text, fontSize: 16, fontWeight: '700', minWidth: 60, textAlign: 'center' },
  change: { color: colors.text, fontSize: 14, lineHeight: 20 },
  textCard: { backgroundColor: colors.cardRaised },
  textCardTitle: { color: colors.accent, fontSize: 17, fontWeight: '700' },
  confirm: { borderWidth: 2, borderColor: colors.accent, borderRadius: 12, padding: 12, marginTop: 10, marginBottom: 10, gap: 10 },
  confirmText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  problem: { color: '#FF6961', fontSize: 13, marginTop: 8 },
  btn: { backgroundColor: colors.cardRaised, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnText: { color: colors.text, fontWeight: '600' },
  btnTextPrimary: { color: '#000' },
});
