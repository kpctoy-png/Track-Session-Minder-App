/**
 * One-tap icons for announcements: tapping one puts it at the start of the message. An icon with `starter`
 * also fills in the start of an empty message, for the organizer to finish (e.g. which corner).
 */
export const ANNOUNCEMENT_ICONS: { icon: string; label: string; starter?: string }[] = [
  { icon: '⚡', label: 'Lightning' },
  { icon: '🚑', label: 'Medical' },
  { icon: '🚩', label: 'Red flag' },
  { icon: '🌧️', label: 'Weather' },
  { icon: '🛢️', label: 'Speedy Dry', starter: 'Speedy Dry down at Turn ' },
  { icon: '🔥', label: 'Fire' },
  { icon: '⚠️', label: 'Caution' },
  { icon: '🏁', label: 'Track open' },
];

const LEADING_ICON = /^\p{Extended_Pictographic}️?\s*/u;

/** The message with `icon` in front, replacing any icon it already starts with. */
export function withIcon(message: string, icon: string, starter = '') {
  const rest = message.replace(LEADING_ICON, '');
  return `${icon} ${rest.trim() ? rest : starter}`;
}

/** How an announcement reads on screens and phones: 📢 in front unless it already starts with an icon. */
export function announcementText(message: string) {
  return LEADING_ICON.test(message) ? message : `📢 ${message}`;
}
