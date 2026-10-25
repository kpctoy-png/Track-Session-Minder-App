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

create or replace function can_manage_club(club text) returns boolean
  language sql stable security definer set search_path = public as $$
  select is_platform_admin()
    or exists (select 1 from club_admins where user_id = auth.uid() and club_id = club);
$$;

alter table clubs enable row level security;
alter table events enable row level security;
alter table event_days enable row level security;
alter table platform_admins enable row level security;
alter table club_admins enable row level security;

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

-- Optional: the coach gets a copy of the booking email.
alter table coaching_sessions add column if not exists coach_email text;

alter table coaching_sessions enable row level security;

-- Students see only their own sessions; club admins see and manage their club's.
drop policy if exists "Students and club admins read coaching" on coaching_sessions;
create policy "Students and club admins read coaching" on coaching_sessions for select to authenticated
  using (student_email = lower(auth.jwt() ->> 'email') or can_manage_club(club_of_day(day_id)));
drop policy if exists "Club admins manage coaching" on coaching_sessions;
create policy "Club admins manage coaching" on coaching_sessions for all to authenticated
  using (can_manage_club(club_of_day(day_id))) with check (can_manage_club(club_of_day(day_id)));

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
