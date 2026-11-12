-- S2: foreign-key delete rules, identity fix, foreign-key indexes, and station coordinates.
--
-- Role: step S2 of documentation/map/supabase_plan.md (map 0.5.0). Every foreign key in
-- the plan already existed in the baseline, so this migration only corrects the delete
-- rules that cascaded from lookup tables, drops the identity from linking-table ID
-- columns, indexes every foreign key that no index covered, and makes
-- Stations."CoordinateLocation" a geography column generated from Longitude/Latitude.
--
-- Usage: applied by `npm run db:reset` locally and `npx supabase db push` for the hosted
-- project. Tests: supabase/tests/01_keys_identity_coordinates.test.sql.

-- ---------------------------------------------------------------------------------------
-- 1. Foreign-key delete rules
--
-- These cascaded from lookup tables, so deleting a role, observation type, measurement
-- unit, or device specification silently deleted the rows that used it. Each key is
-- re-created with the same name and ON UPDATE CASCADE, and the delete rule from the
-- plan's table. Keys that already matched the plan are left alone.
-- ---------------------------------------------------------------------------------------

alter table public."Sensors"
  drop constraint "Sensors_ObservationTypeID_fkey",
  add constraint "Sensors_ObservationTypeID_fkey"
    foreign key ("ObservationTypeID") references public."ObservationTypes" ("ObservationTypeID")
    on update cascade on delete set null;

alter table public."StationOrganizationRole"
  drop constraint "StationOrganizationRole_RoleID_fkey",
  add constraint "StationOrganizationRole_RoleID_fkey"
    foreign key ("RoleID") references public."StationRoles" ("RoleID")
    on update cascade on delete restrict;

alter table public."StationContact"
  drop constraint "StationContact_RoleID_fkey",
  add constraint "StationContact_RoleID_fkey"
    foreign key ("RoleID") references public."StationRoles" ("RoleID")
    on update cascade on delete set null;

alter table public."StationObservations"
  drop constraint "StationObservations_ObservationTypeID_fkey",
  add constraint "StationObservations_ObservationTypeID_fkey"
    foreign key ("ObservationTypeID") references public."ObservationTypes" ("ObservationTypeID")
    on update cascade on delete restrict;

alter table public."StationsToSensors"
  drop constraint "StationsToSensors_MeasurementUnitsID_fkey",
  add constraint "StationsToSensors_MeasurementUnitsID_fkey"
    foreign key ("MeasurementUnitsID") references public."MeasurementUnits" ("MeasurementUnitsID")
    on update cascade on delete set null;

alter table public."StationsToSpecs"
  drop constraint "StationsToSpecs_DeviceSpecificationID_fkey",
  add constraint "StationsToSpecs_DeviceSpecificationID_fkey"
    foreign key ("DeviceSpecificationID") references public."DeviceSpecifications" ("DeviceSpecificationID")
    on update cascade on delete restrict;

alter table public."SensorsToSpecs"
  drop constraint "SensorsToSpecs_DeviceSpecificationID_fkey",
  add constraint "SensorsToSpecs_DeviceSpecificationID_fkey"
    foreign key ("DeviceSpecificationID") references public."DeviceSpecifications" ("DeviceSpecificationID")
    on update cascade on delete restrict;

-- ---------------------------------------------------------------------------------------
-- 2. Identity fix
--
-- A linking-table column holds an ID copied from its parent table. It shouldn't generate
-- one. StationContact keeps StationID as its sole primary key (one contact per station).
-- ---------------------------------------------------------------------------------------

alter table public."StationContact"          alter column "StationID" drop identity if exists;
alter table public."StationObservations"     alter column "StationID" drop identity if exists;
alter table public."StationOrganizationRole" alter column "StationID" drop identity if exists;
alter table public."StationsToSensors"       alter column "StationID" drop identity if exists;
alter table public."StationsToSensors"       alter column "SensorID"  drop identity if exists;
alter table public."StationsToSpecs"         alter column "StationID" drop identity if exists;
alter table public."SensorsToSpecs"          alter column "SensorID"  drop identity if exists;

-- ---------------------------------------------------------------------------------------
-- 3. Foreign-key indexes
--
-- Postgres doesn't index foreign-key columns automatically. This covers every foreign
-- key that isn't already the leading column of a primary key, which also clears the
-- Supabase advisor's unindexed-foreign-key warnings.
-- ---------------------------------------------------------------------------------------

create index if not exists contacts_organization_idx          on public."Contacts" ("OrganizationID");
create index if not exists device_specs_manufacturer_idx      on public."DeviceSpecifications" ("ManufacturerID");
create index if not exists projects_organization_idx          on public."OrganizationProjects" ("OrganizationID");
create index if not exists sensors_observation_type_idx       on public."Sensors" ("ObservationTypeID");
create index if not exists sensors_to_specs_spec_idx          on public."SensorsToSpecs" ("DeviceSpecificationID");
create index if not exists station_contact_contact_idx        on public."StationContact" ("ContactID");
create index if not exists station_contact_role_idx           on public."StationContact" ("RoleID");
create index if not exists station_obs_type_idx               on public."StationObservations" ("ObservationTypeID");
create index if not exists sor_station_idx                    on public."StationOrganizationRole" ("StationID");
create index if not exists sor_role_idx                       on public."StationOrganizationRole" ("RoleID");
create index if not exists stations_project_idx               on public."Stations" ("ProjectID");
create index if not exists stations_site_idx                  on public."Stations" ("SiteID");
create index if not exists stations_type_idx                  on public."Stations" ("StationTypeID");
create index if not exists stations_to_sensors_sensor_idx     on public."StationsToSensors" ("SensorID");
create index if not exists stations_to_sensors_units_idx      on public."StationsToSensors" ("MeasurementUnitsID");
create index if not exists stations_to_specs_spec_idx         on public."StationsToSpecs" ("DeviceSpecificationID");

-- ---------------------------------------------------------------------------------------
-- 4. Station coordinates
--
-- Longitude/Latitude are the source of truth (users enter them in the data portal).
-- CoordinateLocation is generated from them, so the two can't drift apart, and it can't
-- be written directly. Postgres can't convert an existing column to a generated one, so
-- the column is dropped and re-added. On the hosted project every stored value was NULL
-- when this was written, so nothing is lost.
--
-- The range checks catch typos and most swapped values. Without them, PostGIS would
-- quietly wrap an out-of-range point instead of raising an error.
-- ---------------------------------------------------------------------------------------

alter table public."Stations"
  add constraint stations_longitude_range check ("Longitude" between -180 and 180),
  add constraint stations_latitude_range  check ("Latitude"  between  -90 and  90);

alter table public."Stations" drop column "CoordinateLocation";

alter table public."Stations"
  add column "CoordinateLocation" extensions.geography(Point, 4326)
  generated always as (
    extensions.st_setsrid(
      extensions.st_makepoint("Longitude"::float8, "Latitude"::float8), 4326
    )::extensions.geography
  ) stored;

comment on column public."Stations"."CoordinateLocation" is
  'Generated from Longitude/Latitude (WGS 84). Read-only: edit Longitude and Latitude instead.';
