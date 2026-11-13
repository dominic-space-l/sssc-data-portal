-- pgTAP tests for S6: public.map_filter_options.
--
-- Role: checks the guarantees from S6 of documentation/map/supabase_plan.md. anon can
-- call the function, and it returns exactly the five lists, each with only ids, names,
-- and (for projects) organization_id and station_count. Every project is listed, the
-- empty one with station_count 0. Organizations are listed when they hold a role or
-- manage a project. No notes field or notes text comes out, and authenticated can't
-- call it.
--
-- Usage: npm run db:test   (or: npx supabase test db). It runs in a transaction and
-- rolls back, so it leaves no changes behind. Relies on supabase/seed.sql:
--   Projects   1 Project Alpha (org 1, 2 stations), 2 Project Beta (org 2, 1 station),
--              3 Project Empty (org 3, no stations)
--   Orgs       1 and 2 hold roles; 3 holds none but manages Project Empty
--   Types      station types 1 Weather station, 2 Tide gauge; observation types
--              1 Air temperature, 2 Water level, 3 Precipitation
--   Roles      1 Owner, 2 Operator, 3 Maintainer (3 has a seed note)

begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

-- ---------------------------------------------------------------------------------------
-- Definition and privileges
-- ---------------------------------------------------------------------------------------

select is(
  (select format('secdef=%s config=%s volatility=%s result=%s', p.prosecdef, p.proconfig,
                 p.provolatile, pg_get_function_result(p.oid))
   from pg_proc p
   where p.oid = 'public.map_filter_options()'::regprocedure),
  'secdef=t config={"search_path=\"\""} volatility=s result=jsonb',
  'map_filter_options is stable, security definer, with an empty search_path, and returns jsonb'
);

select ok(
  has_function_privilege('anon', 'public.map_filter_options()', 'EXECUTE'),
  'anon can execute map_filter_options'
);

select is_empty(
  $$select r.rolname
    from (values ('public'), ('authenticated')) as r(rolname)
    where has_function_privilege(r.rolname, 'public.map_filter_options()', 'EXECUTE')$$,
  'PUBLIC and authenticated cannot execute map_filter_options'
);

-- ---------------------------------------------------------------------------------------
-- As anon: the seeded options
-- ---------------------------------------------------------------------------------------

set local role anon;

select lives_ok(
  $$select public.map_filter_options()$$,
  'anon can call map_filter_options'
);

select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.map_filter_options()) k),
  array['observation_types', 'organizations', 'projects', 'roles', 'station_types'],
  'returns exactly the five lists'
);

select is(
  public.map_filter_options() -> 'projects',
  '[{"id": 1, "name": "Project Alpha", "organization_id": 1, "station_count": 2},
    {"id": 2, "name": "Project Beta",  "organization_id": 2, "station_count": 1},
    {"id": 3, "name": "Project Empty", "organization_id": 3, "station_count": 0}]'::jsonb,
  'projects: every project by name, with its organization_id and station_count (0 for the empty one)'
);

select is(
  public.map_filter_options() -> 'organizations',
  '[{"id": 1, "name": "Test Org A"},
    {"id": 2, "name": "Test Org B"},
    {"id": 3, "name": "Test Org C"}]'::jsonb,
  'organizations: by name, including one that holds no role but manages a project'
);

select is(
  public.map_filter_options() -> 'station_types',
  '[{"id": 2, "name": "Tide gauge"}, {"id": 1, "name": "Weather station"}]'::jsonb,
  'station_types: by name'
);

select is(
  public.map_filter_options() -> 'observation_types',
  '[{"id": 1, "name": "Air temperature"},
    {"id": 3, "name": "Precipitation"},
    {"id": 2, "name": "Water level"}]'::jsonb,
  'observation_types: by name'
);

select is(
  public.map_filter_options() -> 'roles',
  '[{"id": 1, "name": "Owner"}, {"id": 2, "name": "Operator"}, {"id": 3, "name": "Maintainer"}]'::jsonb,
  'roles: by RoleID, the order the map assigns colors in'
);

-- Every object at any depth, then its keys. The CASE keeps jsonb_object_keys off arrays
-- and scalars, which it would reject.
select is_empty(
  $$select k
    from jsonb_path_query(public.map_filter_options(), '$.**') v
    cross join lateral jsonb_object_keys(
      case when jsonb_typeof(v) = 'object' then v else '{}' end) k
    where k ilike '%note%'$$,
  'no key at any depth is a notes field'
);

select ok(
  public.map_filter_options()::text not ilike '%seed note%',
  'no seeded notes text appears anywhere in the output'
);

reset role;

-- ---------------------------------------------------------------------------------------
-- Changes to the data show up (as postgres, then read as anon)
-- ---------------------------------------------------------------------------------------

-- An organization with no role and no project.
insert into public."Organizations" ("OrganizationName") values ('Test Org D');
-- A station in the empty project.
insert into public."Stations" ("ProjectID", "StationName", "Longitude", "Latitude")
values (3, 'Test Station 5', -135.30, 57.06);

set local role anon;

select ok(
  not (public.map_filter_options() -> 'organizations') @> '[{"name": "Test Org D"}]',
  'an organization with no role and no project is not listed'
);

select is(
  (select (e ->> 'station_count')::int
   from jsonb_array_elements(public.map_filter_options() -> 'projects') e
   where e ->> 'name' = 'Project Empty'),
  1,
  'a project''s station_count follows its stations'
);

reset role;

delete from public."StationTypes";

set local role anon;
select is(
  public.map_filter_options() -> 'station_types',
  '[]'::jsonb,
  'an empty table gives [], not null'
);
reset role;

-- The dropdowns don't need masking, so they still work without the Vault secret.
delete from vault.secrets where name = 'map_location_mask_secret';

set local role anon;
select is(
  jsonb_array_length(public.map_filter_options() -> 'projects'),
  3,
  'works without the Vault secret'
);
reset role;

select ok(
  not exists (select 1 from jsonb_path_query(public.map_filter_options(), '$.**') v
              cross join lateral jsonb_object_keys(
                case when jsonb_typeof(v) = 'object' then v else '{}' end) k
              where k in ('lon', 'lat', 'Longitude', 'Latitude', 'CoordinateLocation')),
  'no coordinate field appears anywhere in the output'
);

-- ---------------------------------------------------------------------------------------
-- authenticated can't call it
-- ---------------------------------------------------------------------------------------

set local role authenticated;
select throws_ok(
  $$select public.map_filter_options()$$,
  '42501', null,
  'authenticated cannot call map_filter_options'
);
reset role;

select * from finish();
rollback;
