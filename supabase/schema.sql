-- Run this in the Supabase SQL Editor before deploying the app.
create table if not exists public.runners (
  id text primary key,
  name text not null,
  initials text not null,
  color text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.race_events (
  id text primary key,
  title text not null,
  type text not null check (type in ('Løp', 'Fellestrening')),
  date date not null,
  time time not null,
  location text not null default '',
  distance text not null default '',
  note text not null default '',
  statuses jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.runners enable row level security;
alter table public.race_events enable row level security;

-- This calendar is intentionally collaborative and has no sign-in requirement.
create policy "Public runners access" on public.runners for all using (true) with check (true);
create policy "Public events access" on public.race_events for all using (true) with check (true);

alter publication supabase_realtime add table public.runners, public.race_events;
