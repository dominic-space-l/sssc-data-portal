-- S2b: StationSites coordinates and elevation, matching Stations after S2.
--
-- Role: step S2b of documentation/map/supabase_plan.md (map 0.5.1). The two tables were
-- never meant to handle location differently. After this migration, StationSites has
-- the same range checks, the same generated geography column, and the same
-- "Elevation (FT)" column name as Stations. The unique rule on the old
-- CoordinateLocation is dropped with the column and not re-created: nothing needs it,
-- and Stations doesn't have one.
--
-- Usage: applied by `npm run db:reset` locally and `npx supabase db push` for the hosted
-- project. Tests: supabase/tests/02_station_sites_coordinates.test.sql.
--
-- The hosted StationSites table had no rows when this was written, so dropping the
-- column loses nothing.

alter table public."StationSites"
  add constraint station_sites_longitude_range check ("Longitude" between -180 and 180),
  add constraint station_sites_latitude_range  check ("Latitude"  between  -90 and  90);

-- Elevation is stored in feet. The new name matches Stations."Elevation (FT)".
alter table public."StationSites" rename column "Elevation" to "Elevation (FT)";

-- Also drops the StationSites_CoordinateLocation_key unique constraint.
alter table public."StationSites" drop column "CoordinateLocation";

alter table public."StationSites"
  add column "CoordinateLocation" extensions.geography(Point, 4326)
  generated always as (
    extensions.st_setsrid(
      extensions.st_makepoint("Longitude"::float8, "Latitude"::float8), 4326
    )::extensions.geography
  ) stored;

comment on column public."StationSites"."CoordinateLocation" is
  'Generated from Longitude/Latitude (WGS 84). Read-only: edit Longitude and Latitude instead.';
