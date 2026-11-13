-- S5: public.map_stations, the public map's only way to read stations.
--
-- Role: step S5 of documentation/map/supabase_plan.md (map 0.8.0). One call returns the
-- stations for the map, with the filters applied and every point masked by
-- map_private.mask_point (S4). It implements the org/project interaction table in
-- documentation/map/map_app_plan.md:
--   - roles is null when no organization is given, and otherwise the sorted RoleIDs that
--     organization holds at the station ('{}' for none).
--   - The organization filters only when no project is given. With a project, it only
--     sets the roles (the marker colors).
--   - null means "no filter" for every parameter. An empty array matches nothing.
--   - p_station limits the result to one station, for the detail route.
--
-- Usage: applied by `npm run db:reset` locally and `npx supabase db push --remote` for
-- the hosted project. Called over the API as
--   db.rpc("map_stations", {"p_project": 1, "p_station_types": [1, 2]})
-- Tests: supabase/tests/05_map_stations.test.sql.
--
-- Only the columns in `returns table` ever leave the function: no notes, elevation,
-- site, or true coordinates. Adding a column to the map means changing it here, in a
-- reviewed migration.
--
-- Fail closed: if the Vault secret is missing, mask_point raises, so the call errors
-- instead of returning any point. A call whose filters match no station may return no
-- rows instead of raising, which leaks nothing.

create or replace function public.map_stations(
  p_project bigint default null,
  p_organization bigint default null,
  p_station_types bigint[] default null,
  p_observation_types bigint[] default null,
  p_station bigint default null)
returns table (
  station_id bigint, name text, code text, is_active boolean,
  lon numeric, lat numeric, roles bigint[])
language sql stable security definer set search_path = ''
as $$
  select s."StationID", s."StationName", s."StationCode", s."IsActive",
         m.lon, m.lat,
         case when p_organization is null then null else coalesce(r.roles, '{}') end
  from public."Stations" s
  left join lateral (
    select array_agg(sor."RoleID" order by sor."RoleID") as roles
    from public."StationOrganizationRole" sor
    where sor."StationID" = s."StationID"
      and sor."OrganizationID" = p_organization
  ) r on true
  cross join lateral map_private.mask_point(s."StationID", s."Longitude", s."Latitude") m
  where s."Longitude" is not null and s."Latitude" is not null
    and (p_station is null or s."StationID" = p_station)
    and (p_project is null or s."ProjectID" = p_project)
    and (p_project is not null or p_organization is null or r.roles is not null)
    and (p_station_types is null or s."StationTypeID" = any (p_station_types))
    and (p_observation_types is null or exists (
          select 1 from public."StationObservations" so
          where so."StationID" = s."StationID"
            and so."ObservationTypeID" = any (p_observation_types)))
  order by s."StationID";
$$;

-- Functions in public are executable by PUBLIC, and by anon and authenticated through
-- postgres's default privileges. Revoke all of those, then grant anon alone.
revoke all on function public.map_stations(bigint, bigint, bigint[], bigint[], bigint)
  from public, anon, authenticated;
grant execute on function public.map_stations(bigint, bigint, bigint[], bigint[], bigint) to anon;
comment on function public.map_stations(bigint, bigint, bigint[], bigint[], bigint) is
  'Public map stations with masked coordinates. Organization filters only when no project is given.';
