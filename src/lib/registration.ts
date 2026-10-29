import { useEffect, useState } from 'react';

import { supabase } from './supabase';

/**
 * Whether the signed-in driver is on the event's registered drivers list (from ClubReg). Track staff and guests
 * aren't, so the app is view only for them. Counts as registered until the database says otherwise.
 */
export function useOnRoster(eventId: string, email: string | null | undefined): boolean {
  const [onRoster, setOnRoster] = useState(true);
  useEffect(() => {
    setOnRoster(true);
    if (!email || !eventId) return;
    supabase?.rpc('on_event_roster', { for_event: eventId }).then(({ data, error }) => setOnRoster(error ? true : data !== false));
  }, [eventId, email]);
  return onRoster;
}
