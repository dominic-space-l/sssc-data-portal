-- Day 2: database rules + private tables.
-- Run in the TEST project's SQL Editor. Safe to run more than once.
-- (If the RLS warning pop-up appears, choose to run WITHOUT enabling RLS. This script handles RLS itself.)

---------------------------------------------------------------------------
-- 1. Existing form tables (public schema)
--    Logged-in users (only the admin, since sign-ups are off) can read and add rows.
--    Logged-out visitors get nothing.
---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);

    execute format('drop policy if exists "admin can read" on public.%I', r.tablename);
    execute format('create policy "admin can read" on public.%I for select to authenticated using (true)', r.tablename);

    execute format('drop policy if exists "admin can add" on public.%I', r.tablename);
    execute format('create policy "admin can add" on public.%I for insert to authenticated with check (true)', r.tablename);
  end loop;
end $$;

-- Table permissions the policies rely on (the policies above still decide who gets in).
grant select, insert on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

---------------------------------------------------------------------------
-- 2. Private schema: one-time links and waiting submissions.
--    Not exposed to the website. Only Edge Functions (server side) touch it.
---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Outside organizations asking for access (Day 3)
create table if not exists private.access_requests (
  id           uuid primary key default gen_random_uuid(),
  org_name     text not null,
  contact_name text,
  email        text not null,
  reason       text,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);

-- One-time links (Day 3)
create table if not exists private.access_links (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  request_id  uuid references private.access_requests (id) on delete set null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- Outside submissions waiting for approval (Days 4-5). rows holds one entry or a whole CSV.
create table if not exists private.pending_submissions (
  id            uuid primary key default gen_random_uuid(),
  link_id       uuid references private.access_links (id) on delete set null,
  target_table  text not null,
  rows          jsonb not null check (jsonb_typeof(rows) = 'array'),
  row_count     integer generated always as (jsonb_array_length(rows)) stored,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at  timestamptz not null default now(),
  reviewed_at   timestamptz,
  review_note   text
);

alter table private.access_requests     enable row level security;
alter table private.access_links        enable row level security;
alter table private.pending_submissions enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;

---------------------------------------------------------------------------
-- 3. Quick check: every table should show rls_on = true
---------------------------------------------------------------------------
select schemaname, tablename, rowsecurity as rls_on
from pg_tables
where schemaname in ('public', 'private')
order by schemaname, tablename;
