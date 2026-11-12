-- pgTAP tests for S2b: StationSites coordinates and elevation, and parity with Stations.
--
-- Role: checks the guarantees from S2b of documentation/map/supabase_plan.md. The parity
-- tests compare StationSites with Stations directly, so a later change to the location
-- columns or range checks of one table that isn't made to the other fails here.
--
-- Usage: npm run db:test   (or: npx supabase test db). It runs in a transaction and
-- rolls back, so it leaves no changes behind. Relies on supabase/seed.sql.

begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

-- ---------------------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------------------

select has_column('public', 'StationSites', 'Elevation (FT)', 'StationSites has Elevation (FT)');
select hasnt_column('public', 'StationSites', 'Elevation', 'StationSites no longer has Elevation');

select is(
  (select format('%s(%s,%s) generated=%s',
                 t.typname,
                 extensions.postgis_typmod_type(a.atttypmod),
                 extensions.postgis_typmod_srid(a.atttypmod),
                 a.attgenerated)
   from pg_attribute a
   join pg_type t on t.oid = a.atttypid
   where a.attrelid = 'public."StationSites"'::regclass and a.attname = 'CoordinateLocation'),
  'geography(Point,4326) generated=s',
  'StationSites.CoordinateLocation is a stored generated geography(Point, 4326)'
);

-- ---------------------------------------------------------------------------------------
-- Parity with Stations. Each side is rendered as one string so the comparison is exact.
-- ---------------------------------------------------------------------------------------

select is(
  (select string_agg(format('%s %s notnull=%s gen=%s', a.attname,
                            format_type(a.atttypid, a.atttypmod), a.attnotnull,
                            coalesce(pg_get_expr(d.adbin, d.adrelid), '-')),
                     '; ' order by a.attname)
   from pg_attribute a
   left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public."StationSites"'::regclass
     and a.attname in ('Longitude', 'Latitude', 'CoordinateLocation', 'Elevation (FT)')),
  (select string_agg(format('%s %s notnull=%s gen=%s', a.attname,
                            format_type(a.atttypid, a.atttypmod), a.attnotnull,
                            coalesce(pg_get_expr(d.adbin, d.adrelid), '-')),
                     '; ' order by a.attname)
   from pg_attribute a
   left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public."Stations"'::regclass
     and a.attname in ('Longitude', 'Latitude', 'CoordinateLocation', 'Elevation (FT)')),
  'StationSites and Stations location columns match (type, nullability, generation)'
);

select is(
  (select string_agg(pg_get_constraintdef(oid), '; ' order by pg_get_constraintdef(oid))
   from pg_constraint
   where conrelid = 'public."StationSites"'::regclass and contype = 'c'),
  (select string_agg(pg_get_constraintdef(oid), '; ' order by pg_get_constraintdef(oid))
   from pg_constraint
   where conrelid = 'public."Stations"'::regclass and contype = 'c'),
  'StationSites and Stations have the same check constraints'
);

-- ---------------------------------------------------------------------------------------
-- Behaviour
-- ---------------------------------------------------------------------------------------

select is_empty(
  $$select "SiteID" from public."StationSites"
    where "CoordinateLocation" is null
       or extensions.st_x("CoordinateLocation"::extensions.geometry) <> "Longitude"::float8
       or extensions.st_y("CoordinateLocation"::extensions.geometry) <> "Latitude"::float8$$,
  'every site''s point matches its Longitude/Latitude'
);

update public."StationSites" set "Longitude" = -135.3000 where "SiteID" = 1;

select results_eq(
  $$select extensions.st_x("CoordinateLocation"::extensions.geometry)
    from public."StationSites" where "SiteID" = 1$$,
  $$values (-135.3::float8)$$,
  'updating Longitude moves the point'
);

select throws_ok(
  $$insert into public."StationSites" ("SiteName", "Longitude", "Latitude", "CoordinateLocation")
    values ('Direct point', -135.3, 57.05,
            extensions.st_setsrid(extensions.st_makepoint(-135.3, 57.05), 4326)::extensions.geography)$$,
  '428C9', null,
  'inserting CoordinateLocation directly is rejected'
);

select throws_ok(
  $$update public."StationSites"
    set "CoordinateLocation" =
      extensions.st_setsrid(extensions.st_makepoint(0, 0), 4326)::extensions.geography
    where "SiteID" = 2$$,
  '428C9', null,
  'updating CoordinateLocation directly is rejected'
);

select throws_ok(
  $$update public."StationSites" set "Latitude" = 95 where "SiteID" = 2$$,
  '23514', null,
  'a Latitude outside -90..90 is rejected'
);

select throws_ok(
  $$update public."StationSites" set "Longitude" = 200 where "SiteID" = 2$$,
  '23514', null,
  'a Longitude outside -180..180 is rejected'
);

select lives_ok(
  $$insert into public."StationSites" ("SiteName", "Longitude", "Latitude")
    values ('Portal-style insert', -135.31, 57.06)$$,
  'a site can be inserted with only Longitude and Latitude'
);

select lives_ok(
  $$insert into public."StationSites" ("SiteName", "Longitude", "Latitude")
    select 'Same point as site 2', "Longitude", "Latitude"
    from public."StationSites" where "SiteID" = 2$$,
  'two sites may share a point (no unique rule)'
);

select * from finish();
rollback;
