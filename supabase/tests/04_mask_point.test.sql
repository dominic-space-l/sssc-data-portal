-- pgTAP tests for S4: map_private.mask_point and its lockdown.
--
-- Role: checks the guarantees from S4 of documentation/map/supabase_plan.md. Every
-- masked point is 250-500 m from the true one (with up to 15 m of rounding slack), the
-- same id always gives the same point, the offset depends on both the Vault secret and
-- the id, a missing secret raises, and no API role can reach the function.
--
-- Usage: npm run db:test   (or: npx supabase test db). It runs in a transaction and
-- rolls back, so it leaves no changes behind. Relies on supabase/seed.sql, including
-- its local-only map_location_mask_secret.

begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- Each seeded station with its true and masked points, as geography.
create temp table masked on commit drop as
select s."StationID" as id, s."Longitude" as true_lon, s."Latitude" as true_lat,
       m.lon, m.lat,
       extensions.st_setsrid(extensions.st_makepoint(s."Longitude", s."Latitude"), 4326)
         ::extensions.geography as true_pt,
       extensions.st_setsrid(extensions.st_makepoint(m.lon, m.lat), 4326)
         ::extensions.geography as masked_pt
from public."Stations" s
cross join lateral map_private.mask_point(s."StationID", s."Longitude", s."Latitude") m;

-- ---------------------------------------------------------------------------------------
-- Definition and privileges
-- ---------------------------------------------------------------------------------------

select is(
  (select format('secdef=%s config=%s volatility=%s', p.prosecdef, p.proconfig, p.provolatile)
   from pg_proc p
   where p.oid = 'map_private.mask_point(bigint, numeric, numeric)'::regprocedure),
  'secdef=t config={"search_path=\"\""} volatility=s',
  'mask_point is stable, security definer, with an empty search_path'
);

select is_empty(
  $$select r.rolname, priv
    from (values ('public'), ('anon'), ('authenticated')) as r(rolname)
    cross join (values ('schema usage'), ('function execute')) as k(priv)
    where case priv
            when 'schema usage' then has_schema_privilege(r.rolname, 'map_private', 'USAGE')
            else has_function_privilege(r.rolname,
                   'map_private.mask_point(bigint, numeric, numeric)', 'EXECUTE')
          end$$,
  'PUBLIC, anon, and authenticated have no usage on map_private and no execute on mask_point'
);

-- ---------------------------------------------------------------------------------------
-- Output
-- ---------------------------------------------------------------------------------------

select is((select count(*)::int from masked), 4, 'every seeded station gets a masked point');

select is_empty(
  $$select id, extensions.st_distance(true_pt, masked_pt) as metres
    from masked
    where extensions.st_distance(true_pt, masked_pt) not between 235 and 515$$,
  'every masked point is 235-515 m from the true point (250-500 m plus rounding)'
);

select is_empty(
  $$select id from masked where lon = round(true_lon, 4) and lat = round(true_lat, 4)$$,
  'no masked point equals its true point'
);

select is_empty(
  $$select id from masked where lon <> round(lon, 4) or lat <> round(lat, 4)$$,
  'masked coordinates are rounded to 4 decimal places'
);

select results_eq(
  $$select m.lon, m.lat
    from public."Stations" s
    cross join lateral map_private.mask_point(s."StationID", s."Longitude", s."Latitude") m
    order by s."StationID"$$,
  $$select lon, lat from masked order by id$$,
  'the same id and point always give the same masked point'
);

select is(
  (select count(distinct round(degrees(
            extensions.st_azimuth(true_pt, masked_pt)))) from masked)::int,
  4,
  'the four seeded stations are offset in four different directions'
);

select isnt(
  (select row(lon, lat)::text from map_private.mask_point(1, -135.33, 57.05)),
  (select row(lon, lat)::text from map_private.mask_point(2, -135.33, 57.05)),
  'two ids at the same point get different masked points'
);

select is_empty(
  $$select 1 from map_private.mask_point(1, null, 57.05) where lon is not null or lat is not null$$,
  'a missing longitude gives a null point, not an error'
);

-- ---------------------------------------------------------------------------------------
-- The Vault secret drives the offset
-- ---------------------------------------------------------------------------------------

delete from vault.secrets where name = 'map_location_mask_secret';
select vault.create_secret('a-different-test-secret', 'map_location_mask_secret');

select is_empty(
  $$select m.id
    from masked m
    cross join lateral map_private.mask_point(m.id, m.true_lon, m.true_lat) n
    where n.lon = m.lon and n.lat = m.lat$$,
  'a different secret moves every masked point'
);

select is_empty(
  $$select m.id
    from masked m
    cross join lateral map_private.mask_point(m.id, m.true_lon, m.true_lat) n
    where extensions.st_distance(m.true_pt,
            extensions.st_setsrid(extensions.st_makepoint(n.lon, n.lat), 4326)
              ::extensions.geography) not between 235 and 515$$,
  'with a different secret, every masked point is still 235-515 m away'
);

delete from vault.secrets where name = 'map_location_mask_secret';

select throws_ok(
  $$select * from map_private.mask_point(1, -135.33, 57.05)$$,
  'P0001', 'location masking is not configured',
  'with no secret, mask_point raises instead of returning a point'
);

-- ---------------------------------------------------------------------------------------
-- API roles can't call it
-- ---------------------------------------------------------------------------------------

set local role anon;
select throws_ok(
  $$select * from map_private.mask_point(1, -135.33, 57.05)$$,
  '42501', null,
  'anon cannot call mask_point'
);
reset role;

set local role authenticated;
select throws_ok(
  $$select * from map_private.mask_point(1, -135.33, 57.05)$$,
  '42501', null,
  'authenticated cannot call mask_point'
);
reset role;

select ok(
  not exists (select 1 from pg_namespace n
              where n.nspname = 'map_private'
                and has_schema_privilege('service_role', n.oid, 'USAGE')),
  'service_role has no usage on map_private either'
);

select * from finish();
rollback;
