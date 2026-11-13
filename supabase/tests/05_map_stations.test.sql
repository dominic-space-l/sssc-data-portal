-- pgTAP tests for S5: public.map_stations.
--
-- Role: checks the guarantees from S5 of documentation/map/supabase_plan.md. anon can
-- call the function, and it returns only the seven allowlisted columns, with every point
-- masked by map_private.mask_point. It follows each row of the org/project interaction
-- table in documentation/map/map_app_plan.md, the type filters (null means no filter),
-- and p_station. A missing Vault secret makes it raise, and authenticated can't call it.
--
-- Usage: npm run db:test   (or: npx supabase test db). It runs in a transaction and
-- rolls back, so it leaves no changes behind. Relies on supabase/seed.sql, including its
-- local-only map_location_mask_secret. Seed facts used below:
--   station  project  type  observations  roles (org: roles)
--   1        1        1     1, 3          org 1: 1, 3   org 2: 2
--   2        1        2     2             org 1: 2
--   3        2        1     1             org 2: 1      (inactive)
--   4        -        2     2             -             (no code)
--   Project 3 has no stations. Org 3 holds no roles.

begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

-- True and expected masked points for each seeded station, read as postgres. anon can't
-- read Stations, so it gets select on this temp table to compare against.
create temp table truth on commit drop as
select s."StationID" as id, s."Longitude" as true_lon, s."Latitude" as true_lat,
       m.lon as masked_lon, m.lat as masked_lat
from public."Stations" s
cross join lateral map_private.mask_point(s."StationID", s."Longitude", s."Latitude") m;
grant select on truth to anon;

-- ---------------------------------------------------------------------------------------
-- Definition and privileges
-- ---------------------------------------------------------------------------------------

select is(
  (select format('secdef=%s config=%s volatility=%s', p.prosecdef, p.proconfig, p.provolatile)
   from pg_proc p
   where p.oid = 'public.map_stations(bigint, bigint, bigint[], bigint[], bigint)'::regprocedure),
  'secdef=t config={"search_path=\"\""} volatility=s',
  'map_stations is stable, security definer, with an empty search_path'
);

select is(
  pg_get_function_result(
    'public.map_stations(bigint, bigint, bigint[], bigint[], bigint)'::regprocedure),
  'TABLE(station_id bigint, name text, code text, is_active boolean, lon numeric, lat numeric, roles bigint[])',
  'map_stations returns only the seven allowlisted columns'
);

select ok(
  has_function_privilege('anon',
    'public.map_stations(bigint, bigint, bigint[], bigint[], bigint)', 'EXECUTE'),
  'anon can execute map_stations'
);

select is_empty(
  $$select r.rolname
    from (values ('public'), ('authenticated')) as r(rolname)
    where has_function_privilege(r.rolname,
            'public.map_stations(bigint, bigint, bigint[], bigint[], bigint)', 'EXECUTE')$$,
  'PUBLIC and authenticated cannot execute map_stations'
);

-- ---------------------------------------------------------------------------------------
-- As anon: output columns and masking
-- ---------------------------------------------------------------------------------------

set local role anon;

select lives_ok(
  $$select * from public.map_stations()$$,
  'anon can call map_stations'
);

select results_eq(
  $$select station_id, name, code, is_active from public.map_stations()$$,
  $$values (1::bigint, 'Test Station 1'::text, 'TS1'::text, true),
           (2, 'Test Station 2', 'TS2', true),
           (3, 'Test Station 3', 'TS3', false),
           (4, 'Test Station 4', null, true)$$,
  'returns each station''s id, name, code, and active flag, inactive stations included'
);

select is_empty(
  $$select ms.station_id
    from public.map_stations() ms
    join truth t on t.id = ms.station_id
    where ms.lon = round(t.true_lon, 4) or ms.lat = round(t.true_lat, 4)$$,
  'no returned longitude or latitude equals the station''s true value to 4 decimal places'
);

select is_empty(
  $$select ms.station_id
    from public.map_stations() ms
    join truth t on t.id = ms.station_id
    where extensions.st_distance(
            extensions.st_setsrid(extensions.st_makepoint(t.true_lon, t.true_lat), 4326)
              ::extensions.geography,
            extensions.st_setsrid(extensions.st_makepoint(ms.lon, ms.lat), 4326)
              ::extensions.geography) not between 235 and 515$$,
  'every returned point is 235-515 m from the true point'
);

select results_eq(
  $$select station_id, lon, lat from public.map_stations()$$,
  $$select id, masked_lon, masked_lat from truth order by id$$,
  'every returned point is exactly mask_point''s output for that station'
);

select results_eq(
  $$select station_id, lon, lat
    from public.map_stations(p_organization => 2, p_station_types => '{1}')$$,
  $$select id, masked_lon, masked_lat from truth where id in (1, 3) order by id$$,
  'filters don''t change a station''s masked point'
);

-- ---------------------------------------------------------------------------------------
-- As anon: the org/project interaction table
-- ---------------------------------------------------------------------------------------

select results_eq(
  $$select station_id, roles from public.map_stations()$$,
  $$values (1::bigint, null::bigint[]), (2, null), (3, null), (4, null)$$,
  'neither: every station, with roles null'
);

select results_eq(
  $$select station_id, roles from public.map_stations(p_organization => 1)$$,
  $$values (1::bigint, '{1,3}'::bigint[]), (2, '{2}')$$,
  'organization only: its stations, with its sorted roles at each (org 1, two roles at station 1)'
);

select results_eq(
  $$select station_id, roles from public.map_stations(p_organization => 2)$$,
  $$values (1::bigint, '{2}'::bigint[]), (3, '{1}')$$,
  'organization only: its stations, with its roles at each (org 2)'
);

select is_empty(
  $$select * from public.map_stations(p_organization => 3)$$,
  'organization only: an organization with no roles shows no stations'
);

select results_eq(
  $$select station_id, roles from public.map_stations(p_project => 1)$$,
  $$values (1::bigint, null::bigint[]), (2, null)$$,
  'project only: the project''s stations, with roles null'
);

select results_eq(
  $$select station_id, roles from public.map_stations(p_project => 1, p_organization => 1)$$,
  $$values (1::bigint, '{1,3}'::bigint[]), (2, '{2}')$$,
  'project with its managing organization: the project''s stations, colored by that organization'
);

select results_eq(
  $$select station_id, roles from public.map_stations(p_project => 1, p_organization => 2)$$,
  $$values (1::bigint, '{2}'::bigint[]), (2, '{}')$$,
  'project with a different organization: still every project station; no role gives ''{}'''
);

select results_eq(
  $$select station_id, roles from public.map_stations(p_project => 2, p_organization => 3)$$,
  $$values (3::bigint, '{}'::bigint[])$$,
  'project with an organization that holds no roles: the project''s stations, all ''{}'''
);

select is_empty(
  $$select * from public.map_stations(p_project => 3, p_organization => 3)$$,
  'a project with no stations shows none'
);

-- ---------------------------------------------------------------------------------------
-- As anon: type filters and p_station
-- ---------------------------------------------------------------------------------------

select results_eq(
  $$select station_id from public.map_stations(p_station_types => null, p_observation_types => null)$$,
  $$values (1::bigint), (2), (3), (4)$$,
  'null type arrays mean no filter'
);

select results_eq(
  $$select station_id from public.map_stations(p_station_types => '{1}')$$,
  $$values (1::bigint), (3)$$,
  'station types: one type'
);

select results_eq(
  $$select station_id from public.map_stations(p_station_types => '{1,2}')$$,
  $$values (1::bigint), (2), (3), (4)$$,
  'station types: any of several types'
);

select is_empty(
  $$select * from public.map_stations(p_station_types => '{}')$$,
  'station types: an empty array matches nothing'
);

select results_eq(
  $$select station_id from public.map_stations(p_observation_types => '{2}')$$,
  $$values (2::bigint), (4)$$,
  'observation types: one type'
);

select results_eq(
  $$select station_id from public.map_stations(p_observation_types => '{1,3}')$$,
  $$values (1::bigint), (3)$$,
  'observation types: any of several, each station once even when it matches several'
);

select is_empty(
  $$select * from public.map_stations(p_observation_types => '{}')$$,
  'observation types: an empty array matches nothing'
);

select results_eq(
  $$select station_id, roles
    from public.map_stations(p_organization => 1, p_station_types => '{1}',
                             p_observation_types => '{3}')$$,
  $$values (1::bigint, '{1,3}'::bigint[])$$,
  'organization, station type, and observation type filters combine'
);

select results_eq(
  $$select station_id from public.map_stations(p_station => 3)$$,
  $$values (3::bigint)$$,
  'p_station returns exactly that station'
);

select is_empty(
  $$select * from public.map_stations(p_station => 4, p_project => 1)$$,
  'p_station still applies the other filters'
);

select is_empty(
  $$select * from public.map_stations(p_station => 999)$$,
  'p_station with an unknown id returns nothing'
);

reset role;

-- ---------------------------------------------------------------------------------------
-- authenticated can't call it; a missing secret makes it raise
-- ---------------------------------------------------------------------------------------

set local role authenticated;
select throws_ok(
  $$select * from public.map_stations()$$,
  '42501', null,
  'authenticated cannot call map_stations'
);
reset role;

delete from vault.secrets where name = 'map_location_mask_secret';

set local role anon;
select throws_ok(
  $$select * from public.map_stations()$$,
  'P0001', 'location masking is not configured',
  'with no secret, map_stations raises instead of returning any point'
);
reset role;

select * from finish();
rollback;
