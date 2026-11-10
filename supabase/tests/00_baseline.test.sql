-- Baseline pgTAP test: the pulled schema and the seed data are in place.
--
-- Role: a smoke test for S1 of documentation/map/supabase_plan.md. It confirms that
-- every table in documentation/schema.md exists, that PostGIS is installed, and that
-- supabase/seed.sql loaded the rows later tests depend on.
--
-- Usage: npm run db:test   (or: npx supabase test db). It runs in a transaction and
-- rolls back, so it leaves no changes behind.

begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

-- Tables
select has_table('public', 'StationRoles', 'StationRoles exists');
select has_table('public', 'Organizations', 'Organizations exists');
select has_table('public', 'DeviceManufacturers', 'DeviceManufacturers exists');
select has_table('public', 'MeasurementUnits', 'MeasurementUnits exists');
select has_table('public', 'StationTypes', 'StationTypes exists');
select has_table('public', 'StationSites', 'StationSites exists');
select has_table('public', 'OrganizationProjects', 'OrganizationProjects exists');
select has_table('public', 'Contacts', 'Contacts exists');
select has_table('public', 'DeviceSpecifications', 'DeviceSpecifications exists');
select has_table('public', 'Stations', 'Stations exists');
select has_table('public', 'Sensors', 'Sensors exists');
select has_table('public', 'StationContact', 'StationContact exists');
select has_table('public', 'StationOrganizationRole', 'StationOrganizationRole exists');
select has_table('public', 'StationsToSpecs', 'StationsToSpecs exists');
select has_table('public', 'SensorsToSpecs', 'SensorsToSpecs exists');
select has_table('public', 'StationsToSensors', 'StationsToSensors exists');
select has_table('public', 'ObservationTypes', 'ObservationTypes exists');
select has_table('public', 'StationObservations', 'StationObservations exists');

-- Extensions
select has_extension('postgis', 'PostGIS is installed');

-- Seed data
select results_eq(
  'select count(*)::int from public."Stations"',
  array[4],
  'seed: four stations'
);
select results_eq(
  $$select count(*)::int from public."OrganizationProjects" p
    where not exists (select 1 from public."Stations" s where s."ProjectID" = p."ProjectID")$$,
  array[1],
  'seed: exactly one project has no stations'
);
select results_eq(
  $$select count(*)::int from public."Organizations" o
    where not exists (select 1 from public."StationOrganizationRole" r
                      where r."OrganizationID" = o."OrganizationID")$$,
  array[1],
  'seed: exactly one organization has no station roles'
);
select results_eq(
  $$select count(*)::int from public."StationOrganizationRole"
    where "OrganizationID" = 1 and "StationID" = 1$$,
  array[2],
  'seed: Test Org A holds two roles at station 1'
);
select results_eq(
  $$select "Longitude", "Latitude" from public."Stations" where "StationID" = 1$$,
  $$values (-135.3300::numeric, 57.0500::numeric)$$,
  'seed: station 1 has its known true coordinates'
);

select * from finish();
rollback;
