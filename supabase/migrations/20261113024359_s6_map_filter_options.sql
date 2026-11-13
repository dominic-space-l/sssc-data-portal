-- S6: public.map_filter_options, the options for the public map's filter dropdowns.
--
-- Role: step S6 of documentation/map/supabase_plan.md (map 0.9.0). One call returns
-- everything the map backend needs to build the manifest's filters, as one jsonb object:
--   projects           every project, by name, with its managing organization_id and a
--                      station_count (0 means the map tags it "No stations")
--   organizations      organizations that hold a role at a station or manage a project,
--                      by name. Managing organizations are included so that choosing a
--                      project can always fill in the organization dropdown.
--   station_types      by name
--   observation_types  by name
--   roles              by RoleID, the order the map assigns role colors in
--
-- Usage: applied by `npm run db:reset` locally and `npx supabase db push --remote` for
-- the hosted project. Called over the API as db.rpc("map_filter_options").
-- Tests: supabase/tests/06_map_filter_options.test.sql.
--
-- Only ids, names, a project's organization_id, and station_count come out. Notes fields
-- (OrganizationNotes, ProjectNotes, RoleNotes, TypeNotes) and every other column are
-- left out on purpose: notes tend to collect internal details. Each list is [] when its
-- table is empty, never null.

create or replace function public.map_filter_options()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'projects', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', p."ProjectID", 'name', p."ProjectName",
               'organization_id', p."OrganizationID",
               'station_count', (select count(*) from public."Stations" s
                                 where s."ProjectID" = p."ProjectID"))
               order by p."ProjectName"), '[]')
      from public."OrganizationProjects" p),
    'organizations', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', o."OrganizationID", 'name', o."OrganizationName")
               order by o."OrganizationName"), '[]')
      from public."Organizations" o
      where exists (select 1 from public."StationOrganizationRole" sor
                    where sor."OrganizationID" = o."OrganizationID")
         or exists (select 1 from public."OrganizationProjects" p
                    where p."OrganizationID" = o."OrganizationID")),
    'station_types', (
      select coalesce(jsonb_agg(jsonb_build_object('id', t."TypeID", 'name', t."TypeName")
               order by t."TypeName"), '[]')
      from public."StationTypes" t),
    'observation_types', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', ot."ObservationTypeID", 'name', ot."ObservationType")
               order by ot."ObservationType"), '[]')
      from public."ObservationTypes" ot),
    'roles', (
      select coalesce(jsonb_agg(jsonb_build_object('id', sr."RoleID", 'name', sr."RoleTitle")
               order by sr."RoleID"), '[]')
      from public."StationRoles" sr));
$$;

-- Functions in public are executable by PUBLIC, and by anon and authenticated through
-- postgres's default privileges. Revoke all of those, then grant anon alone.
revoke all on function public.map_filter_options() from public, anon, authenticated;
grant execute on function public.map_filter_options() to anon;
comment on function public.map_filter_options() is
  'Dropdown options for the public map: projects (with station counts), organizations with a role or a project, types, roles.';
