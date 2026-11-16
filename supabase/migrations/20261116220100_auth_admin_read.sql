-- Authentication A2: admins can read every public table. Nobody else gains anything.
--
-- Role: step 2 of documentation/authentication/supabase_assessment.md (authentication
-- 0.3.0). The portal's admin pages and its read-only MCP server read as the signed-in
-- admin, so these policies decide what they can see. One SELECT policy per table, listed
-- by name (no loop), each tied to auth_private.is_admin().
--
-- Usage: applied by `npm run db:reset` locally and `npx supabase db push` for the hosted
-- project. Tests: supabase/tests/08_auth_admin_read.test.sql.
--
-- What this does NOT allow:
--   - anon: still nothing (S3).
--   - a signed-in user who isn't in auth_private.admins: still nothing.
--   - writes through the API by anyone, admins included. There are no INSERT, UPDATE or
--     DELETE policies. Admin and outside-organization writes go through the Edge
--     Functions, which check the admin list and the data before saving.
-- Stations and StationSites hold true coordinates and Contacts holds personal data; only
-- admins read them here, which is what the client asked for ("only the admin reads").

create policy "Admins can read Contacts"
  on public."Contacts" for select to authenticated using ((select auth_private.is_admin()));
create policy "Admins can read DeviceManufacturers"
  on public."DeviceManufacturers" for select to authenticated using ((select auth_private.is_admin()));
create policy "Admins can read DeviceSpecifications"
  on public."DeviceSpecifications" for select to authenticated using ((select auth_private.is_admin()));
create policy "Admins can read MeasurementUnits"
  on public."MeasurementUnits" for select to authenticated using ((select auth_private.is_admin()));
create policy "Admins can read ObservationTypes"
  on public."ObservationTypes" for select to authenticated using ((select auth_private.is_admin()));
create policy "Admins can read OrganizationProjects"
  on public."OrganizationProjects" for select to authenticated using ((select auth_private.is_admin()));
create policy "Admins can read Organizations"
  on public."Organizations" for select to authenticated using ((select auth_private.is_admin()));
create policy "Admins can read Sensors"
  on public."Sensors" for select to authenticated using ((select auth_private.is_admin()));
create policy "Admins can read SensorsToSpecs"
  on public."SensorsToSpecs" for select to authenticated using ((select auth_private.is_admin()));
create policy "Admins can read StationContact"
  on public."StationContact" for select to authenticated using ((select auth_private.is_admin()));
create policy "Admins can read StationObservations"
  on public."StationObservations" for select to authenticated using ((select auth_private.is_admin()));
create policy "Admins can read StationOrganizationRole"
  on public."StationOrganizationRole" for select to authenticated using ((select auth_private.is_admin()));
create policy "Admins can read StationRoles"
  on public."StationRoles" for select to authenticated using ((select auth_private.is_admin()));
create policy "Admins can read StationSites"
  on public."StationSites" for select to authenticated using ((select auth_private.is_admin()));
create policy "Admins can read StationTypes"
  on public."StationTypes" for select to authenticated using ((select auth_private.is_admin()));
create policy "Admins can read Stations"
  on public."Stations" for select to authenticated using ((select auth_private.is_admin()));
create policy "Admins can read StationsToSensors"
  on public."StationsToSensors" for select to authenticated using ((select auth_private.is_admin()));
create policy "Admins can read StationsToSpecs"
  on public."StationsToSpecs" for select to authenticated using ((select auth_private.is_admin()));
