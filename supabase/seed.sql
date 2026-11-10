-- Local seed data for the Supabase database.
--
-- Role: a small, known dataset that `supabase db reset` loads after the migrations
-- (see [db.seed] in config.toml). The pgTAP tests in supabase/tests/ rely on these
-- exact IDs, names, and coordinates, so update the tests if you change this file.
-- It is never pushed to the hosted project. Don't run `supabase db push --include-seed`.
--
-- Usage: npm run db:reset   (or: npx supabase db reset)
--
-- All names are fictional. The coordinates are made-up points near Sitka, AK, and are
-- not real station locations.
--
-- What's covered:
--   Organizations  1 Test Org A (roles at stations 1, 2)
--                  2 Test Org B (role at stations 1, 3)
--                  3 Test Org C (no station roles, owns the empty project)
--   Projects       1 Project Alpha (org 1): stations 1, 2
--                  2 Project Beta  (org 2): station 3
--                  3 Project Empty (org 3): no stations
--   Stations       1-3 in projects; 4 has no project; 3 is inactive
--   Roles          org 1 holds two roles at station 1 (multi-role / pie marker case)

-- Explicit IDs keep the tests deterministic. `overriding system value` is needed for
-- the identity primary keys. Linking tables have no identity columns, so their inserts
-- don't use it.

insert into public."StationRoles" ("RoleID", "RoleTitle", "RoleNotes")
overriding system value values
  (1, 'Owner', null),
  (2, 'Operator', null),
  (3, 'Maintainer', 'Seed note: should never appear on the public map');

insert into public."Organizations"
  ("OrganizationID", "OrganizationName", "OrganizationType", "OrganizationNotes")
overriding system value values
  (1, 'Test Org A', 'non-profit', 'Seed note: internal'),
  (2, 'Test Org B', 'educational-institution', null),
  (3, 'Test Org C', 'state-government', null);

insert into public."OrganizationProjects"
  ("ProjectID", "OrganizationID", "ProjectName", "StartDate", "IsOngoing", "ProjectNotes")
overriding system value values
  (1, 1, 'Project Alpha', '2024-01-01', true, 'Seed note: internal'),
  (2, 2, 'Project Beta', '2025-06-01', true, null),
  (3, 3, 'Project Empty', null, false, null);

insert into public."StationTypes" ("TypeID", "TypeName", "TypeNotes")
overriding system value values
  (1, 'Weather station', null),
  (2, 'Tide gauge', null);

insert into public."ObservationTypes" ("ObservationTypeID", "ObservationType")
overriding system value values
  (1, 'Air temperature'),
  (2, 'Water level'),
  (3, 'Precipitation');

-- CoordinateLocation is generated from Longitude/Latitude, so it isn't inserted.
insert into public."Stations"
  ("StationID", "ProjectID", "StationTypeID", "StationName", "StationCode",
   "IsActive", "Longitude", "Latitude", "StationNotes")
overriding system value
select id, project, station_type, name, code, active, lon, lat, notes
from (values
  (1::bigint, 1::bigint, 1::bigint, 'Test Station 1', 'TS1', true,  -135.3300::numeric, 57.0500::numeric, 'Seed note: gate code 1234'),
  (2,         1,         2,         'Test Station 2', 'TS2', true,  -135.3400,          57.0400,          null),
  (3,         2,         1,         'Test Station 3', 'TS3', false, -135.2900,          57.0700,          null),
  (4,         null,      2,         'Test Station 4', null,  true,  -135.4000,          57.0200,          null)
) as v(id, project, station_type, name, code, active, lon, lat, notes);

insert into public."StationOrganizationRole" ("OrganizationID", "StationID", "RoleID") values
  (1, 1, 1),
  (1, 1, 3),
  (1, 2, 2),
  (2, 1, 2),
  (2, 3, 1);

insert into public."StationObservations" ("StationID", "ObservationTypeID") values
  (1, 1),
  (1, 3),
  (2, 2),
  (3, 1),
  (4, 2);

-- Move each identity sequence past the explicit IDs, so later inserts in tests or
-- local Studio don't collide with the seed rows.
select setval(pg_get_serial_sequence('public."StationRoles"', 'RoleID'), 3);
select setval(pg_get_serial_sequence('public."Organizations"', 'OrganizationID'), 3);
select setval(pg_get_serial_sequence('public."OrganizationProjects"', 'ProjectID'), 3);
select setval(pg_get_serial_sequence('public."StationTypes"', 'TypeID'), 2);
select setval(pg_get_serial_sequence('public."ObservationTypes"', 'ObservationTypeID'), 3);
select setval(pg_get_serial_sequence('public."Stations"', 'StationID'), 4);
