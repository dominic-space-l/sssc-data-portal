-- pgTAP tests for S2: foreign keys, identity fix, foreign-key indexes, station coordinates.
--
-- Role: checks the guarantees from S2 of documentation/map/supabase_plan.md. The
-- foreign-key and identity checks compare against the full expected set, so a key or
-- identity column added later without updating this file fails the test.
--
-- Usage: npm run db:test   (or: npx supabase test db). It runs in a transaction and
-- rolls back, so it leaves no changes behind. Relies on supabase/seed.sql.

begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- ---------------------------------------------------------------------------------------
-- Foreign keys: every key in public, with its target and delete rule.
-- confdeltype: a = no action, r = restrict, c = cascade, n = set null.
-- ---------------------------------------------------------------------------------------

select set_eq(
  $$select c.conrelid::regclass::text, a.attname::text, c.confrelid::regclass::text,
           c.confdeltype::text, c.confupdtype::text
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace$$,
  $$values
    ('"Contacts"',                'OrganizationID',        '"Organizations"',        'a', 'c'),
    ('"DeviceSpecifications"',    'ManufacturerID',        '"DeviceManufacturers"',  'a', 'c'),
    ('"OrganizationProjects"',    'OrganizationID',        '"Organizations"',        'a', 'c'),
    ('"Sensors"',                 'ObservationTypeID',     '"ObservationTypes"',     'n', 'c'),
    ('"SensorsToSpecs"',          'SensorID',              '"Sensors"',              'c', 'c'),
    ('"SensorsToSpecs"',          'DeviceSpecificationID', '"DeviceSpecifications"', 'r', 'c'),
    ('"StationContact"',          'StationID',             '"Stations"',             'c', 'c'),
    ('"StationContact"',          'ContactID',             '"Contacts"',             'c', 'c'),
    ('"StationContact"',          'RoleID',                '"StationRoles"',         'n', 'c'),
    ('"StationObservations"',     'StationID',             '"Stations"',             'c', 'c'),
    ('"StationObservations"',     'ObservationTypeID',     '"ObservationTypes"',     'r', 'c'),
    ('"StationOrganizationRole"', 'StationID',             '"Stations"',             'c', 'c'),
    ('"StationOrganizationRole"', 'OrganizationID',        '"Organizations"',        'c', 'c'),
    ('"StationOrganizationRole"', 'RoleID',                '"StationRoles"',         'r', 'c'),
    ('"Stations"',                'ProjectID',             '"OrganizationProjects"', 'n', 'c'),
    ('"Stations"',                'SiteID',                '"StationSites"',         'n', 'c'),
    ('"Stations"',                'StationTypeID',         '"StationTypes"',         'n', 'c'),
    ('"StationsToSensors"',       'StationID',             '"Stations"',             'c', 'c'),
    ('"StationsToSensors"',       'SensorID',              '"Sensors"',              'c', 'c'),
    ('"StationsToSensors"',       'MeasurementUnitsID',    '"MeasurementUnits"',     'n', 'c'),
    ('"StationsToSpecs"',         'StationID',             '"Stations"',             'c', 'c'),
    ('"StationsToSpecs"',         'DeviceSpecificationID', '"DeviceSpecifications"', 'r', 'c')$$,
  'every foreign key in public has the expected target and delete rule'
);

select throws_ok(
  $$insert into public."StationOrganizationRole" ("OrganizationID", "StationID", "RoleID")
    values (1, 999, 1)$$,
  '23503', null,
  'a role for a nonexistent station is rejected'
);

select throws_ok(
  $$delete from public."StationRoles" where "RoleID" = 1$$,
  '23503', null,
  'a role that is in use cannot be deleted (restrict)'
);

select throws_ok(
  $$delete from public."ObservationTypes" where "ObservationTypeID" = 1$$,
  '23503', null,
  'an observation type that stations use cannot be deleted (restrict)'
);

select lives_ok(
  $$delete from public."Stations" where "StationID" = 4$$,
  'a station can be deleted'
);

select results_eq(
  $$select count(*)::int from public."StationObservations" where "StationID" = 4$$,
  array[0],
  'deleting a station deletes its observation links (cascade)'
);

-- ---------------------------------------------------------------------------------------
-- Identity: only the tables' own primary keys generate IDs.
-- ---------------------------------------------------------------------------------------

select set_eq(
  $$select table_name::text, column_name::text
    from information_schema.columns
    where table_schema = 'public' and is_identity = 'YES'$$,
  $$values
    ('Contacts', 'ContactID'),
    ('DeviceManufacturers', 'ManufacturerID'),
    ('DeviceSpecifications', 'DeviceSpecificationID'),
    ('MeasurementUnits', 'MeasurementUnitsID'),
    ('ObservationTypes', 'ObservationTypeID'),
    ('OrganizationProjects', 'ProjectID'),
    ('Organizations', 'OrganizationID'),
    ('Sensors', 'SensorID'),
    ('StationRoles', 'RoleID'),
    ('StationSites', 'SiteID'),
    ('StationTypes', 'TypeID'),
    ('Stations', 'StationID')$$,
  'identity columns are exactly the parent tables'' primary keys'
);

-- ---------------------------------------------------------------------------------------
-- Indexes: every foreign key's column leads some index.
-- ---------------------------------------------------------------------------------------

select is_empty(
  $$select c.conrelid::regclass::text || '.' || a.attname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
      )$$,
  'every foreign key is covered by an index'
);

-- ---------------------------------------------------------------------------------------
-- Station coordinates
-- ---------------------------------------------------------------------------------------

select is(
  (select format('%s(%s,%s) generated=%s',
                 t.typname,
                 extensions.postgis_typmod_type(a.atttypmod),
                 extensions.postgis_typmod_srid(a.atttypmod),
                 a.attgenerated)
   from pg_attribute a
   join pg_type t on t.oid = a.atttypid
   where a.attrelid = 'public."Stations"'::regclass and a.attname = 'CoordinateLocation'),
  'geography(Point,4326) generated=s',
  'Stations.CoordinateLocation is a stored generated geography(Point, 4326)'
);

select is_empty(
  $$select "StationID" from public."Stations"
    where "CoordinateLocation" is null
       or extensions.st_x("CoordinateLocation"::extensions.geometry) <> "Longitude"::float8
       or extensions.st_y("CoordinateLocation"::extensions.geometry) <> "Latitude"::float8$$,
  'every station''s point matches its Longitude/Latitude'
);

update public."Stations" set "Longitude" = -135.3000 where "StationID" = 1;

select results_eq(
  $$select extensions.st_x("CoordinateLocation"::extensions.geometry)
    from public."Stations" where "StationID" = 1$$,
  $$values (-135.3::float8)$$,
  'updating Longitude moves the point'
);

select throws_ok(
  $$insert into public."Stations" ("StationName", "Longitude", "Latitude", "CoordinateLocation")
    values ('Direct point', -135.3, 57.05,
            extensions.st_setsrid(extensions.st_makepoint(-135.3, 57.05), 4326)::extensions.geography)$$,
  '428C9', null,
  'inserting CoordinateLocation directly is rejected'
);

select throws_ok(
  $$update public."Stations"
    set "CoordinateLocation" =
      extensions.st_setsrid(extensions.st_makepoint(0, 0), 4326)::extensions.geography
    where "StationID" = 2$$,
  '428C9', null,
  'updating CoordinateLocation directly is rejected'
);

select throws_ok(
  $$update public."Stations" set "Latitude" = 95 where "StationID" = 2$$,
  '23514', null,
  'a Latitude outside -90..90 is rejected'
);

select throws_ok(
  $$update public."Stations" set "Longitude" = 200 where "StationID" = 2$$,
  '23514', null,
  'a Longitude outside -180..180 is rejected'
);

select lives_ok(
  $$insert into public."Stations" ("StationName", "Longitude", "Latitude")
    values ('Portal-style insert', -135.31, 57.06)$$,
  'a station can be inserted with only Longitude and Latitude'
);

select * from finish();
rollback;
