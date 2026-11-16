-- Authentication A1: the auth_private schema, the admins list, and auth_private.is_admin().
--
-- Role: steps 0 and 1 of documentation/authentication/supabase_assessment.md
-- (authentication 0.3.0). It holds everything the portal's Edge Functions need that
-- nobody should reach through the API:
--   admins               which signed-in users are admins (managed by hand in the dashboard)
--   access_requests      outside organizations asking for a link
--   access_links         links handed out by an admin: "new" works once, "edit" works for
--                        one organization until it expires
--   pending_submissions  outside submissions and edits waiting for an admin to approve
--
-- Usage: applied by `npm run db:reset` locally and `npx supabase db push` for the hosted
-- project. Tests: supabase/tests/07_auth_private.test.sql.
--
-- Signed in is not the same as admin: a user counts as an admin only while their id is in
-- auth_private.admins. To add one (dashboard SQL editor, after creating the user under
-- Authentication -> Users):
--   insert into auth_private.admins (user_id, note)
--   select id, 'why they are an admin' from auth.users where email = '<their email>';
--
-- The schema must NOT be added to Settings -> API -> Exposed schemas. RLS is on and every
-- privilege is revoked, so even if it were exposed, anon and authenticated could read
-- nothing. The Edge Functions reach these tables through their direct database connection.

create schema if not exists auth_private;
revoke all on schema auth_private from public, anon, authenticated;
-- authenticated needs USAGE only to call auth_private.is_admin() from RLS policies.
-- It gets no privilege on any table here.
grant usage on schema auth_private to authenticated;

create table auth_private.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text not null default '',
  created_at timestamptz not null default now()
);

create table auth_private.access_requests (
  id           uuid primary key default gen_random_uuid(),
  org_name     text not null check (char_length(org_name) between 1 and 200),
  contact_name text check (char_length(contact_name) <= 200),
  email        text not null check (char_length(email) between 3 and 320),
  reason       text check (char_length(reason) <= 2000),
  kind         text not null default 'new' check (kind in ('new', 'edit')),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);

create table auth_private.access_links (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  request_id      uuid references auth_private.access_requests (id) on delete set null,
  kind            text not null default 'new' check (kind in ('new', 'edit')),
  organization_id bigint references public."Organizations" ("OrganizationID")
                    on update cascade on delete cascade,
  expires_at      timestamptz not null,
  used_at         timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint access_links_edit_needs_org check (kind = 'new' or organization_id is not null)
);

create table auth_private.pending_submissions (
  id           uuid primary key default gen_random_uuid(),
  link_id      uuid references auth_private.access_links (id) on delete set null,
  kind         text not null default 'new' check (kind in ('new', 'edit')),
  form         text not null,
  -- kind = 'new': rows to insert, as [{ "table": ..., "rows": [...] }]
  parts        jsonb not null default '[]' check (jsonb_typeof(parts) = 'array'),
  -- kind = 'edit': changes with their before/after values
  changes      jsonb check (changes is null or jsonb_typeof(changes) = 'array'),
  row_count    integer not null default 0 check (row_count >= 0),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at  timestamptz,
  constraint pending_submissions_edit_has_changes check (kind = 'new' or changes is not null)
);

create index access_requests_email_idx on auth_private.access_requests (lower(email), created_at);
create index access_requests_status_idx on auth_private.access_requests (status);
create index access_links_request_idx on auth_private.access_links (request_id);
create index access_links_organization_idx on auth_private.access_links (organization_id);
create index pending_submissions_link_idx on auth_private.pending_submissions (link_id);
create index pending_submissions_status_idx on auth_private.pending_submissions (status);

alter table auth_private.admins              enable row level security;
alter table auth_private.access_requests     enable row level security;
alter table auth_private.access_links        enable row level security;
alter table auth_private.pending_submissions enable row level security;
revoke all on all tables in schema auth_private from public, anon, authenticated;
revoke all on all sequences in schema auth_private from public, anon, authenticated;
alter default privileges in schema auth_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema auth_private revoke all on sequences from public, anon, authenticated;
alter default privileges in schema auth_private revoke all on functions from public, anon, authenticated;

-- True while the caller is signed in and listed in auth_private.admins. Runs as its owner
-- so policies can check the list without anyone being able to read it.
create or replace function auth_private.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth_private.admins a where a.user_id = (select auth.uid())
  );
$$;

comment on function auth_private.is_admin() is
  'True when the signed-in user is listed in auth_private.admins. Used by admin RLS policies.';

revoke all on function auth_private.is_admin() from public, anon, authenticated;
grant execute on function auth_private.is_admin() to authenticated;
