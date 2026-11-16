-- pgTAP tests for authentication A2: admins can read every public table, and nobody
-- else gains anything.
--
-- Role: checks the policies' catalog shape (every authenticated policy is a SELECT tied to
-- auth_private.is_admin()) and their behavior for an admin, a signed-in non-admin, and anon.
-- The catalog checks read pg_policies rather than a fixed list, so a policy added later
-- that opens a table to every signed-in user fails here.
--
-- Usage: npm run db:test   (or: npx supabase test db). It runs in a transaction and
-- rolls back, so it leaves no changes behind.

begin;
create extension if not exists pgtap with schema extensions;

select plan(8 + 2 * (select count(*)::int from pg_tables where schemaname = 'public'));

-- ---------------------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------------------

select is_empty(
  $$select t.tablename
    from pg_tables t
    where t.schemaname = 'public'
      and not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = t.tablename
                        and p.cmd = 'SELECT' and p.roles = array['authenticated']::name[])$$,
  'every public table has an admin SELECT policy'
);

select is_empty(
  $$select tablename, policyname from pg_policies
    where schemaname = 'public' and roles && array['authenticated']::name[]
      and (qual is null or qual not like '%auth_private.is_admin()%')$$,
  'every authenticated policy in public is tied to auth_private.is_admin() (no using (true))'
);

select is_empty(
  $$select tablename, policyname, cmd from pg_policies
    where schemaname = 'public' and roles && array['authenticated']::name[] and cmd <> 'SELECT'$$,
  'no authenticated INSERT, UPDATE or DELETE policies (writes go through the Edge Functions)'
);

-- ---------------------------------------------------------------------------------------
-- Behavior
-- ---------------------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a101', 'admin@a2.test'),
  ('00000000-0000-0000-0000-00000000a102', 'someone@a2.test');
insert into auth_private.admins (user_id) values ('00000000-0000-0000-0000-00000000a101');

insert into public."Organizations" ("OrganizationName") values ('A2 Test Org');
insert into public."Contacts" ("OrganizationID", "Email")
select "OrganizationID", 'private@a2.test' from public."Organizations" where "OrganizationName" = 'A2 Test Org';
insert into public."Stations" ("StationName", "Longitude", "Latitude") values ('A2 Station', -135.33, 57.05);

-- An admin can read every table (one test per table, catalog-driven).
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000a101", "role": "authenticated"}';

select lives_ok(
  format('select 1 from public.%I limit 1', tablename),
  format('an admin can select from %s', tablename)
)
from pg_tables where schemaname = 'public' order by tablename;

select is(
  (select count(*)::int from public."Stations" where "StationName" = 'A2 Station'),
  1,
  'an admin sees Stations rows'
);

select throws_ok(
  $$insert into public."Stations" ("StationName", "Longitude", "Latitude") values ('admin insert', -135.3, 57.05)$$,
  '42501', null,
  'an admin cannot insert through the API'
);

select is_empty(
  $$update public."Stations" set "StationName" = 'changed' where "StationName" = 'A2 Station' returning 1$$,
  'an admin cannot update through the API (no rows changed)'
);

-- A signed-in user who is not an admin sees nothing, in every table.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000a102", "role": "authenticated"}';

select is_empty(
  format('select 1 from public.%I', tablename),
  format('a signed-in non-admin sees no rows in %s', tablename)
)
from pg_tables where schemaname = 'public' order by tablename;

select is_empty(
  $$select "Email" from public."Contacts" where "Email" = 'private@a2.test'$$,
  'a signed-in non-admin cannot read contact details'
);

-- anon is still refused outright (S3 still holds).
reset role;
set local role anon;
select throws_ok(
  $$select 1 from public."Stations" limit 1$$,
  '42501', null,
  'anon still cannot select from Stations'
);

reset role;

select * from finish();
rollback;
