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
