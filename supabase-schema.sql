-- Run this once in Supabase: SQL Editor → New query.
create table if not exists public.tracker_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.tracker_data enable row level security;

create policy "Users manage only their tracker" on public.tracker_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
