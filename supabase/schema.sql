-- Creates the tables the app reads. Paste supabase/setup.sql (this plus the
-- sample events) into the Supabase SQL Editor and run it once.

create table if not exists events (
  id text primary key,
  name text not null,
  track text not null,
  location text not null,
  sort int not null default 0
);

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

-- Anyone can read schedules. Only signed-in users can change them; turn off
-- public sign-ups so the only accounts are admins you add yourself.
alter table events enable row level security;
alter table event_days enable row level security;

drop policy if exists "Anyone can read events" on events;
create policy "Anyone can read events" on events for select using (true);
drop policy if exists "Admins manage events" on events;
create policy "Admins manage events" on events for all to authenticated using (true) with check (true);

drop policy if exists "Anyone can read days" on event_days;
create policy "Anyone can read days" on event_days for select using (true);
drop policy if exists "Admins manage days" on event_days;
create policy "Admins manage days" on event_days for all to authenticated using (true) with check (true);

-- Send changes to phones as they happen.
do $$
begin
  alter publication supabase_realtime add table events, event_days;
exception when duplicate_object then null;
end $$;
