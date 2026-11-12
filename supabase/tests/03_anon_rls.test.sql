-- pgTAP tests for S3: row-level security on every public table, and no table access
-- for anon.
--
-- Role: checks the guarantees from S3 of documentation/map/supabase_plan.md. The checks
-- read the catalog rather than a fixed table list, so a table, sequence, policy, or
-- function added later without the same protection fails here.
--
-- Usage: npm run db:test   (or: npx supabase test db). It runs in a transaction and
-- rolls back, so it leaves no changes behind.
--
-- When S5 and S6 add map_stations and map_filter_options, add them to anon_functions
-- below. They are the only functions anon is meant to call.

begin;
create extension if not exists pgtap with schema extensions;

-- 10 catalog/behavior checks, plus one select test per table in public.
select plan(10 + (select count(*)::int from pg_tables where schemaname = 'public'));

create temp table anon_functions (proname name primary key) on commit drop;
grant select on anon_functions to anon;
-- insert into anon_functions values ('map_stations'), ('map_filter_options');  -- S5, S6

-- ---------------------------------------------------------------------------------------
-- Catalog: RLS, grants, default privileges, policies, functions
-- ---------------------------------------------------------------------------------------

select is_empty(
  $$select tablename from pg_tables where schemaname = 'public' and not rowsecurity$$,
  'every table in public has row-level security enabled'
);

select is_empty(
  $$select c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and (has_table_privilege('anon', c.oid,
             'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
           or has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))$$,
  'anon has no table or column privilege on any table or view in public'
);

select is_empty(
  $$select c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'S'
      -- CASE stops the planner from calling this on non-sequences, which raises.
      and case when c.relkind = 'S'
               then has_sequence_privilege('anon', c.oid, 'USAGE, SELECT, UPDATE') end$$,
  'anon has no privilege on any sequence in public'
);

select is_empty(
  $$select d.defaclobjtype, a.privilege_type
    from pg_default_acl d
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and d.defaclnamespace = 'public'::regnamespace
      and d.defaclobjtype in ('r', 'S')
      and a.grantee = 'anon'::regrole$$,
  'postgres''s default privileges in public grant anon nothing on new tables or sequences'
);

-- No policy may apply to anon. A policy with no TO clause applies to PUBLIC, which
-- includes anon, so that counts too.
select is_empty(
  $$select tablename, policyname, roles
    from pg_policies
    where schemaname = 'public'
      and roles && array['anon', 'public']::name[]$$,
  'no policy in public applies to anon (directly or through PUBLIC)'
);

-- Extension members are skipped: if an extension were ever installed into public, its
-- functions aren't ours to lock down.
select is_empty(
  $$select p.oid::regprocedure
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.proname not in (select proname from anon_functions)
      and not exists (select 1 from pg_depend dep
                      where dep.classid = 'pg_proc'::regclass and dep.objid = p.oid
                        and dep.deptype = 'e')$$,
  'anon can execute no function in public outside the allowlist'
);

select ok(
  has_schema_privilege('anon', 'public', 'USAGE'),
  'anon keeps USAGE on schema public (PostgREST needs it to call the map functions)'
);

-- A table created now, as postgres (as a migration or the SQL editor would), gets no
-- anon grant from the default privileges.
create table public.s3_probe (id int);
select ok(
  not has_table_privilege('anon', 'public.s3_probe', 'SELECT'),
  'a new table in public is not readable by anon by default'
);
drop table public.s3_probe;

-- ---------------------------------------------------------------------------------------
-- Behavior: as anon, every table refuses with a permission error, not an empty result
-- ---------------------------------------------------------------------------------------

set local role anon;

select throws_ok(
  format('select 1 from public.%I limit 1', tablename),
  '42501', null,
  format('anon cannot select from %s', tablename)
)
from pg_tables
where schemaname = 'public'
order by tablename;

select throws_ok(
  $$insert into public."Stations" ("StationName", "Longitude", "Latitude")
    values ('anon insert', -135.3, 57.05)$$,
  '42501', null,
  'anon cannot insert into Stations'
);

select throws_ok(
  $$select nextval(pg_get_serial_sequence('public."Stations"', 'StationID'))$$,
  '42501', null,
  'anon cannot use the Stations sequence'
);

reset role;

select * from finish();
rollback;
