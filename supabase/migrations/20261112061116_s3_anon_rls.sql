-- S3: row-level security on every public table, and no table access for anon.
--
-- Role: step S3 of documentation/map/supabase_plan.md (map 0.6.0). The anon key is
-- public, so whatever anon can reach is public too. After this migration anon holds no
-- privilege on any table or sequence in public, and new ones created by postgres (in a
-- migration or the dashboard SQL editor) don't get one by default. The map will reach
-- data only through the functions added in S5 and S6. Requests that touch a table fail
-- with "permission denied" (42501) instead of quietly returning no rows.
--
-- Usage: applied by `npm run db:reset` locally and `npx supabase db push` for the hosted
-- project. Tests: supabase/tests/03_anon_rls.test.sql.
--
-- Already true before this migration: the baseline has RLS on for all 18 tables and no
-- policies, so anon reads already returned nothing and anon writes already failed. The
-- enable statements below are no-ops today; they keep the rule in one place. Tables
-- added later are covered by the test, not by this file.
--
-- Not changed here: the authenticated role keeps its grants and, with no policies, is
-- still blocked by RLS. Its policies belong to the portal and authentication plans.
-- anon keeps USAGE on schema public, which PostgREST needs to call the S5/S6 functions.

alter table public."Contacts"                enable row level security;
alter table public."DeviceManufacturers"     enable row level security;
alter table public."DeviceSpecifications"    enable row level security;
alter table public."MeasurementUnits"        enable row level security;
alter table public."ObservationTypes"        enable row level security;
alter table public."OrganizationProjects"    enable row level security;
alter table public."Organizations"           enable row level security;
alter table public."Sensors"                 enable row level security;
alter table public."SensorsToSpecs"          enable row level security;
alter table public."StationContact"          enable row level security;
alter table public."StationObservations"     enable row level security;
alter table public."StationOrganizationRole" enable row level security;
alter table public."StationRoles"            enable row level security;
alter table public."StationSites"            enable row level security;
alter table public."StationTypes"            enable row level security;
alter table public."Stations"                enable row level security;
alter table public."StationsToSensors"       enable row level security;
alter table public."StationsToSpecs"         enable row level security;

-- Existing objects. Revoking a table privilege also revokes it from every column.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Future objects created by postgres. Supabase's supabase_admin role has its own
-- defaults that postgres can't change, but nothing of ours is created as supabase_admin.
alter default privileges for role postgres in schema public revoke all on tables    from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
