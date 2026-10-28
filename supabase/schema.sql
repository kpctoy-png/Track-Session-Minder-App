-- Creates the tables the app reads. Paste supabase/setup.sql (this plus the
-- sample events) into the Supabase SQL Editor and run it. It is safe to run
-- again after an update: it only adds what is missing.

-- Clubs organize events. Each club's admins can change only that club's
-- events; platform admins (Redline Techniques) can change everything.
create table if not exists clubs (
  id text primary key,
  name text not null,
  logo_url text,
  website text
);

insert into clubs (id, name, website) values ('just-track-it', 'Just Track It', 'https://justtrackit.net')
  on conflict (id) do nothing;

create table if not exists events (
  id text primary key,
  name text not null,
  track text not null,
  location text not null,
  sort int not null default 0
);

alter table events add column if not exists club_id text references clubs (id);
update events set club_id = 'just-track-it' where club_id is null;
alter table events alter column club_id set not null;

-- The track's time zone, so 15-minute reminders go out at the right local time.
-- Guessed from the state at the end of the location ("Birmingham, AL").
alter table events add column if not exists time_zone text;
create or replace function guess_time_zone(location text) returns text
  language sql immutable as $$
  select case
    when location ~* ',\s*(AL|AR|IA|IL|KS|LA|MN|MO|MS|NE|OK|TX|WI)\s*$' then 'America/Chicago'
    when location ~* ',\s*(CO|MT|NM|UT|WY)\s*$' then 'America/Denver'
    when location ~* ',\s*AZ\s*$' then 'America/Phoenix'
    when location ~* ',\s*(CA|NV|OR|WA)\s*$' then 'America/Los_Angeles'
    else 'America/New_York' end;
$$;
update events set time_zone = guess_time_zone(location) where time_zone is null;
create or replace function set_event_time_zone() returns trigger
  language plpgsql as $$
begin
  if new.time_zone is null or (tg_op = 'UPDATE' and new.location is distinct from old.location) then
    new.time_zone := guess_time_zone(new.location);
  end if;
  return new;
end $$;
drop trigger if exists event_time_zone on events;
create trigger event_time_zone before insert or update on events
  for each row execute function set_event_time_zone();

-- Each day's schedule is stored as one list, so shifting the whole day is a
-- single update that every phone receives at once.
create table if not exists event_days (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  label text not null,
  date date not null,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists event_days_touch on event_days;
create trigger event_days_touch before update on event_days
  for each row execute function touch_updated_at();

-- Who can edit. Add people in Authentication -> Users first, then add a row
-- here with their user id (see README).
create table if not exists platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table if not exists club_admins (
  user_id uuid not null references auth.users (id) on delete cascade,
  club_id text not null references clubs (id) on delete cascade,
  primary key (user_id, club_id)
);

-- The first time this runs, the accounts that already exist (the owner's)
-- become platform admins. Later runs leave the list alone.
insert into platform_admins (user_id)
  select id from auth.users where not exists (select 1 from platform_admins);

create or replace function is_platform_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- Organizers added by email from the app (Admin → Manage organizers). They
-- sign in with an emailed code, so no Supabase account has to be made for them.
create table if not exists club_organizers (
  email text not null check (email = lower(trim(email)) and email like '%_@_%'),
  club_id text not null references clubs (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (email, club_id)
);

create or replace function can_manage_club(club text) returns boolean
  language sql stable security definer set search_path = public as $$
  select is_platform_admin()
    or exists (select 1 from club_admins where user_id = auth.uid() and club_id = club)
    or exists (select 1 from club_organizers where email = lower(auth.jwt() ->> 'email') and club_id = club);
$$;

alter table clubs enable row level security;
alter table events enable row level security;
alter table event_days enable row level security;
alter table platform_admins enable row level security;
alter table club_admins enable row level security;
alter table club_organizers enable row level security;

-- Anyone can read clubs and schedules.
drop policy if exists "Anyone can read clubs" on clubs;
create policy "Anyone can read clubs" on clubs for select using (true);
drop policy if exists "Platform admins manage clubs" on clubs;
create policy "Platform admins manage clubs" on clubs for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists "Anyone can read events" on events;
create policy "Anyone can read events" on events for select using (true);
drop policy if exists "Admins manage events" on events;
drop policy if exists "Club admins manage events" on events;
create policy "Club admins manage events" on events for all to authenticated
  using (can_manage_club(club_id)) with check (can_manage_club(club_id));

drop policy if exists "Anyone can read days" on event_days;
create policy "Anyone can read days" on event_days for select using (true);
drop policy if exists "Admins manage days" on event_days;
drop policy if exists "Club admins manage days" on event_days;
create policy "Club admins manage days" on event_days for all to authenticated
  using (can_manage_club((select club_id from events where events.id = event_id)))
  with check (can_manage_club((select club_id from events where events.id = event_id)));

-- People can see their own admin rights, and platform admins see everyone's.
drop policy if exists "See own platform role" on platform_admins;
create policy "See own platform role" on platform_admins for select to authenticated
  using (user_id = auth.uid() or is_platform_admin());
drop policy if exists "Platform admins manage platform admins" on platform_admins;
create policy "Platform admins manage platform admins" on platform_admins for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists "See own club roles" on club_admins;
create policy "See own club roles" on club_admins for select to authenticated
  using (user_id = auth.uid() or is_platform_admin());
drop policy if exists "Platform admins manage club admins" on club_admins;
create policy "Platform admins manage club admins" on club_admins for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists "See own organizer roles" on club_organizers;
create policy "See own organizer roles" on club_organizers for select to authenticated
  using (email = lower(auth.jwt() ->> 'email') or is_platform_admin());
drop policy if exists "Platform admins manage organizers" on club_organizers;
create policy "Platform admins manage organizers" on club_organizers for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- Paid coaching sessions, each assigned to one student by email. Linking it
-- to a schedule item (item_id) lets it follow "running late" shifts; the
-- times are kept too in case that item is later replaced.
create table if not exists coaching_sessions (
  id uuid primary key default gen_random_uuid(),
  day_id text not null references event_days (id) on delete cascade,
  item_id text,
  student_email text not null check (student_email = lower(student_email)),
  coach text not null default '',
  start_time text not null,
  end_time text not null,
  notes text,
  created_at timestamptz not null default now()
);

create or replace function club_of_day(day text) returns text
  language sql stable security definer set search_path = public as $$
  select events.club_id from event_days join events on events.id = event_days.event_id where event_days.id = day;
$$;

-- Optional: the coach gets their own booking email and sees the session after signing in.
alter table coaching_sessions add column if not exists coach_email text;

-- A booking is a paid coaching session or a check ride; both work the same way.
alter table coaching_sessions add column if not exists kind text not null default 'coaching'
  check (kind in ('coaching', 'checkride'));

alter table coaching_sessions enable row level security;

-- Students and coaches see only their own sessions; club admins see and manage their club's.
drop policy if exists "Students and club admins read coaching" on coaching_sessions;
create policy "Students and club admins read coaching" on coaching_sessions for select to authenticated
  using (
    student_email = lower(auth.jwt() ->> 'email')
    or lower(coach_email) = lower(auth.jwt() ->> 'email')
    or can_manage_club(club_of_day(day_id))
  );
drop policy if exists "Club admins manage coaching" on coaching_sessions;
create policy "Club admins manage coaching" on coaching_sessions for all to authenticated
  using (can_manage_club(club_of_day(day_id))) with check (can_manage_club(club_of_day(day_id)));

-- Neither the student nor the coach can be in two overlapping bookings (coaching
-- or check ride) on the same day. The coach is matched by email, or by name when
-- no email was entered.
create or replace function prevent_coach_double_booking() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  clash coaching_sessions;
begin
  select * into clash from coaching_sessions c
  where c.day_id = new.day_id
    and c.id <> new.id
    and c.start_time < new.end_time and new.start_time < c.end_time
    and (
      c.student_email = new.student_email
      or (new.coach_email is not null and lower(c.coach_email) = lower(new.coach_email))
      or (trim(new.coach) <> '' and lower(trim(c.coach)) = lower(trim(new.coach)))
    )
  limit 1;
  if found and clash.student_email = new.student_email then
    raise exception '% already has a % from % to % that day.',
      new.student_email, case clash.kind when 'checkride' then 'check ride' else 'coaching session' end,
      clash.start_time, clash.end_time
      using errcode = 'P0001';
  elsif found then
    raise exception '% already has a % with % from % to % that day.',
      coalesce(nullif(trim(new.coach), ''), new.coach_email),
      case clash.kind when 'checkride' then 'check ride' else 'coaching session' end,
      clash.student_email, clash.start_time, clash.end_time
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists coach_double_booking on coaching_sessions;
create trigger coach_double_booking before insert or update on coaching_sessions
  for each row execute function prevent_coach_double_booking();

-- Email the student and coach when a booking is added, changed or removed, by
-- calling the notify-coaching Edge Function (supabase/functions). The call
-- carries a random secret that only this database and the function can read.
create extension if not exists pg_net;

create table if not exists webhook_secrets (
  name text primary key,
  secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
-- No policies: the app can't read it; only the database and the service role can.
alter table webhook_secrets enable row level security;
insert into webhook_secrets (name) values ('notify-coaching') on conflict (name) do nothing;

create or replace function notify_coaching() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://trxqycpyhnzfyctajmsb.supabase.co/functions/v1/notify-coaching',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- The public anon key, only to get past the gateway; the secret below is the real check.
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyeHF5Y3B5aG56ZnljdGFqbXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MzU1NTUsImV4cCI6MjEwODUxMTU1NX0.SgVMF1hovWoW1s_t39vxw6Tp22KvZwQdqb6M7OMwfw0',
      'x-webhook-secret', (select secret from webhook_secrets where name = 'notify-coaching')
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'record', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
      'old_record', case when tg_op = 'INSERT' then null else to_jsonb(old) end
    )
  );
  return null;
end $$;

drop trigger if exists coaching_emails on coaching_sessions;
create trigger coaching_emails after insert or update or delete on coaching_sessions
  for each row execute function notify_coaching();

-- Star ratings and comments from drivers. event_id null means feedback about
-- the app itself, which only platform admins read.
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  event_id text references events (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 2000),
  name text check (char_length(name) <= 100),
  email text,
  created_at timestamptz not null default now()
);

alter table feedback enable row level security;

-- Anyone can leave feedback. A signed-in driver's email is attached, and it
-- must be their own, so nobody can post under someone else's address.
drop policy if exists "Anyone can leave feedback" on feedback;
create policy "Anyone can leave feedback" on feedback for insert to anon, authenticated
  with check (email is null or email = lower(auth.jwt() ->> 'email'));
drop policy if exists "Admins read feedback" on feedback;
create policy "Admins read feedback" on feedback for select to authenticated
  using (case when event_id is null then is_platform_admin()
              else can_manage_club((select club_id from events where events.id = event_id)) end);
drop policy if exists "Admins remove feedback" on feedback;
create policy "Admins remove feedback" on feedback for delete to authenticated
  using (case when event_id is null then is_platform_admin()
              else can_manage_club((select club_id from events where events.id = event_id)) end);

-- Phone alerts (web push). Drivers turn alerts on for one event; when an
-- organizer changes that event's schedule, the push-schedule Edge Function
-- alerts every phone signed up for it. The app never reads these tables
-- directly: drivers use the functions below, and only the Edge Function (with
-- the service role) reads the subscriptions and keys.
create table if not exists push_config (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  public_jwk jsonb not null,
  private_jwk jsonb not null
);
alter table push_config enable row level security;

create table if not exists push_subscriptions (
  endpoint text primary key check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  event_id text not null references events (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
-- Set when the driver is signed in (My Day), so their own coaching and check
-- rides can alert them too. Always the signed-in person's own address.
alter table push_subscriptions add column if not exists email text;
create index if not exists push_subscriptions_email on push_subscriptions (email);

-- Null until the Edge Function has made its keys (an organizer opening Admin does that).
create or replace function push_public_key() returns text
  language sql stable security definer set search_path = public as $$
  select public_key from push_config where id = 1;
$$;

-- One event per phone: signing up again moves the phone's alerts to the new event.
-- The app calls it again after signing in or out, to attach or drop the email.
create or replace function subscribe_push(sub_endpoint text, sub_p256dh text, sub_auth text, sub_event text) returns void
  language sql security definer set search_path = public as $$
  insert into push_subscriptions (endpoint, p256dh, auth, event_id, email)
  values (sub_endpoint, sub_p256dh, sub_auth, sub_event, nullif(lower(auth.jwt() ->> 'email'), ''))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth,
    event_id = excluded.event_id, email = excluded.email;
$$;

create or replace function unsubscribe_push(sub_endpoint text) returns void
  language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = sub_endpoint;
$$;

grant execute on function push_public_key(), subscribe_push(text, text, text, text), unsubscribe_push(text) to anon, authenticated;

-- Coaching and check ride alerts. The start time each booking was last alerted
-- for, so a schedule change only alerts the bookings it actually moved, and
-- each 15-minute reminder goes out once.
create table if not exists booking_push_state (
  session_id uuid primary key references coaching_sessions (id) on delete cascade,
  notified_start text,
  reminded_start text
);
alter table booking_push_state enable row level security;

insert into webhook_secrets (name) values ('push-schedule') on conflict (name) do nothing;

-- Tell the alert function when a booking is made, changed or removed.
create or replace function push_booking() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://trxqycpyhnzfyctajmsb.supabase.co/functions/v1/push-schedule',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select secret from webhook_secrets where name = 'push-schedule')
    ),
    body := jsonb_build_object(
      'action', 'booking',
      'type', tg_op,
      'record', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
      'old_record', case when tg_op = 'INSERT' then null else
        to_jsonb(old) || jsonb_build_object('event_name', (select e.name from events e join event_days d on d.event_id = e.id where d.id = old.day_id),
                                             'day_label', (select label from event_days where id = old.day_id),
                                             'day_items', (select items from event_days where id = old.day_id)) end
    )
  );
  return null;
end $$;
drop trigger if exists coaching_push on coaching_sessions;
create trigger coaching_push after insert or update or delete on coaching_sessions
  for each row execute function push_booking();

-- Every minute, ask the alert function to send any 15-minute reminders that are due.
create extension if not exists pg_cron;
select cron.schedule('coaching-reminders', '* * * * *', $cron$
  select net.http_post(
    url := 'https://trxqycpyhnzfyctajmsb.supabase.co/functions/v1/push-schedule',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select secret from public.webhook_secrets where name = 'push-schedule')
    ),
    body := '{"action":"reminders"}'::jsonb
  );
$cron$);

-- Alerts end the day after their event's last day (track time), so drivers
-- aren't alerted about weekends they aren't at. The app then offers to turn
-- them on again for the next event they open.
select cron.schedule('expire-alerts', '7 * * * *', $cron$
  delete from public.push_subscriptions s
  using public.events e
  where e.id = s.event_id
    and (select max(d.date) from public.event_days d where d.event_id = e.id)
        < (now() at time zone coalesce(e.time_zone, 'America/New_York'))::date;
$cron$);

-- Drivers who chose to join a club's list from the Now tab ("Stay in the loop"),
-- agreeing that the club may email or text them. Each club sees only its own list.
-- Drivers add themselves through join_driver_list, which can't read the list back.
create table if not exists driver_signups (
  club_id text not null references clubs (id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  name text not null check (length(trim(name)) between 1 and 100),
  event_id text references events (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (club_id, email)
);
alter table driver_signups enable row level security;

drop policy if exists "Organizers read their sign-ups" on driver_signups;
create policy "Organizers read their sign-ups" on driver_signups for select to authenticated
  using (can_manage_club(club_id));
drop policy if exists "Organizers remove sign-ups" on driver_signups;
create policy "Organizers remove sign-ups" on driver_signups for delete to authenticated
  using (can_manage_club(club_id));

-- Joining again with the same email just updates the name (and the cell number, when given).
alter table driver_signups add column if not exists phone text check (phone is null or phone ~ '^\+[0-9]{8,15}$');
drop function if exists join_driver_list(text, text, text);
create or replace function join_driver_list(signup_name text, signup_email text, signup_event text, signup_phone text default null) returns void
  language sql security definer set search_path = public as $$
  insert into driver_signups (club_id, email, name, event_id, phone)
  select club_id, lower(trim(signup_email)), trim(signup_name), id, nullif(trim(signup_phone), '') from events where id = signup_event
  on conflict (club_id, email) do update set name = excluded.name, event_id = excluded.event_id,
    phone = coalesce(excluded.phone, driver_signups.phone);
$$;

grant execute on function join_driver_list(text, text, text, text) to anon, authenticated;

-- Announcements: urgent messages (a lightning hold, a red flag) shown in red at
-- the top of drivers' screens. An event's organizers post them for that event;
-- platform admins (Redline) can also post one for every driver (event_id null).
-- Anyone can read them, since they're shown to everyone using the app.
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  event_id text references events (id) on delete cascade,
  message text not null check (char_length(trim(message)) between 1 and 200),
  created_at timestamptz not null default now(),
  ends_at timestamptz,
  cleared_at timestamptz,
  created_by uuid default auth.uid()
);
alter table announcements enable row level security;

create or replace function can_announce(event text) returns boolean
  language sql stable security definer set search_path = public as $$
  select case when event is null then is_platform_admin()
              else can_manage_club((select club_id from events where id = event)) end;
$$;

drop policy if exists "Anyone can read announcements" on announcements;
create policy "Anyone can read announcements" on announcements for select using (true);
drop policy if exists "Organizers post announcements" on announcements;
create policy "Organizers post announcements" on announcements for insert to authenticated
  with check (can_announce(event_id));
drop policy if exists "Organizers clear announcements" on announcements;
create policy "Organizers clear announcements" on announcements for update to authenticated
  using (can_announce(event_id)) with check (can_announce(event_id));

do $$
begin
  alter publication supabase_realtime add table announcements;
exception when duplicate_object then null;
end $$;

-- Registered drivers for an event, uploaded by its organizers from their
-- registration site (for example ClubReg), so announcements can be emailed to
-- everyone at the event. Only the event's organizers can see the list. It is
-- deleted a week after the event.
create table if not exists event_roster (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events (id) on delete cascade,
  name text not null default '' check (length(name) <= 200),
  email text check (email = lower(trim(email)) and length(email) <= 254),
  phone text check (length(phone) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists event_roster_event on event_roster (event_id);
-- Run group as the registration site names it, and how many coaching sessions the driver paid for
-- (ClubReg's "Advanced Coaching Quantity"), so organizers can see who still needs one booked.
alter table event_roster add column if not exists run_group text check (length(run_group) <= 60);
alter table event_roster add column if not exists coaching int not null default 0 check (coaching between 0 and 20);
alter table event_roster enable row level security;

drop policy if exists "Organizers read their roster" on event_roster;
create policy "Organizers read their roster" on event_roster for select to authenticated
  using (can_announce(event_id));
drop policy if exists "Organizers add to their roster" on event_roster;
create policy "Organizers add to their roster" on event_roster for insert to authenticated
  with check (can_announce(event_id));
drop policy if exists "Organizers remove from their roster" on event_roster;
create policy "Organizers remove from their roster" on event_roster for delete to authenticated
  using (can_announce(event_id));

select cron.schedule('expire-rosters', '17 4 * * *', $cron$
  delete from public.event_roster r
  where (select max(d.date) from public.event_days d where d.event_id = r.event_id) < current_date - 7;
$cron$);

-- Drivers asking for a coaching session from My Day. The event's organizers get an alert and an email
-- (push-schedule, from the trigger below) and book or decline it in Admin; a declined driver is told.
create table if not exists coaching_requests (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events (id) on delete cascade,
  email text not null check (email = lower(trim(email)) and length(email) <= 254),
  note text check (length(note) <= 200),
  status text not null default 'open' check (status in ('open', 'booked', 'declined')),
  created_at timestamptz not null default now()
);
-- Requests are booked only once accepted: at registration an organizer checks there's room, takes payment and marks it paid.
alter table coaching_requests add column if not exists paid boolean not null default false;
create index if not exists coaching_requests_event on coaching_requests (event_id, created_at);
create unique index if not exists coaching_requests_one_open on coaching_requests (event_id, email) where status = 'open';
alter table coaching_requests enable row level security;
drop policy if exists "Drivers and organizers read requests" on coaching_requests;
create policy "Drivers and organizers read requests" on coaching_requests for select to authenticated
  using (email = lower(auth.jwt() ->> 'email') or can_announce(event_id));
drop policy if exists "Drivers ask for coaching" on coaching_requests;
create policy "Drivers ask for coaching" on coaching_requests for insert to authenticated
  with check (email = lower(auth.jwt() ->> 'email') and status = 'open' and not paid);
drop policy if exists "Organizers answer requests" on coaching_requests;
create policy "Organizers answer requests" on coaching_requests for update to authenticated
  using (can_announce(event_id)) with check (can_announce(event_id));
drop policy if exists "Drivers withdraw their request" on coaching_requests;
create policy "Drivers withdraw their request" on coaching_requests for delete to authenticated
  using ((email = lower(auth.jwt() ->> 'email') and not paid) or can_announce(event_id));

create or replace function push_coaching_request() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  perform net.http_post(
    url := 'https://trxqycpyhnzfyctajmsb.supabase.co/functions/v1/push-schedule',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select secret from webhook_secrets where name = 'push-schedule')
    ),
    body := jsonb_build_object('action', 'coaching-request', 'type', tg_op, 'record', to_jsonb(new))
  );
  return null;
end $$;
drop trigger if exists coaching_request_push on coaching_requests;
create trigger coaching_request_push after insert or update on coaching_requests
  for each row execute function push_coaching_request();

-- Automatic pulls of the roster from ClubReg (the "ClubReg sync" GitHub Action). Organizers link an event
-- to its ClubReg event number; each pull is logged with who was added and who cancelled since the last one.
create table if not exists roster_sync (
  event_id text primary key references events (id) on delete cascade,
  clubreg_event_id text not null check (clubreg_event_id ~ '^[0-9]{1,10}$')
);
alter table roster_sync enable row level security;
drop policy if exists "Organizers manage their ClubReg link" on roster_sync;
create policy "Organizers manage their ClubReg link" on roster_sync for all to authenticated
  using (can_announce(event_id)) with check (can_announce(event_id));

create table if not exists roster_pulls (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events (id) on delete cascade,
  at timestamptz not null default now(),
  total int,
  added text[] not null default '{}',
  removed text[] not null default '{}',
  problem text check (length(problem) <= 300)
);
create index if not exists roster_pulls_event on roster_pulls (event_id, at desc);
alter table roster_pulls enable row level security;
drop policy if exists "Organizers read their pulls" on roster_pulls;
create policy "Organizers read their pulls" on roster_pulls for select to authenticated
  using (can_announce(event_id));

select cron.schedule('expire-roster-pulls', '19 4 * * *', $cron$
  delete from public.roster_pulls p
  where (select max(d.date) from public.event_days d where d.event_id = p.event_id) < current_date - 7;
$cron$);

-- Send changes to phones as they happen.
do $$
begin
  alter publication supabase_realtime add table events, event_days;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table clubs;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table coaching_sessions;
exception when duplicate_object then null;
end $$;

-- Tell the API about new tables and columns right away.
notify pgrst, 'reload schema';
