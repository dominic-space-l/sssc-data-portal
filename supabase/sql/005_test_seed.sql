-- TEST PROJECT ONLY. Do NOT run on the real database.
-- Adds a few sample rows so the form dropdowns have something in them.
-- Safe to run more than once (skips rows that already exist).
-- (If the RLS warning pop-up appears, choose to run WITHOUT enabling RLS.)

-- Station roles: the forms expect these exact IDs.
insert into public."StationRoles" ("RoleID", "RoleTitle")
values (1, 'Primary owner'), (2, 'Secondary owner'), (3, 'Maintainer'), (4, 'Data provider')
on conflict ("RoleID") do nothing;

insert into public."Organizations" ("OrganizationName")
select 'Sitka Sound Science Center'
where not exists (select 1 from public."Organizations" where "OrganizationName" = 'Sitka Sound Science Center');

insert into public."Organizations" ("OrganizationName")
select 'Test Partner Org'
where not exists (select 1 from public."Organizations" where "OrganizationName" = 'Test Partner Org');

insert into public."OrganizationProjects" ("OrganizationID", "ProjectName", "IsOngoing")
select o."OrganizationID", 'Landslide monitoring', true
from public."Organizations" o
where o."OrganizationName" = 'Sitka Sound Science Center'
  and not exists (select 1 from public."OrganizationProjects" where "ProjectName" = 'Landslide monitoring');

insert into public."StationTypes" ("TypeName")
select t from (values ('Weather'), ('Soil moisture')) v(t)
where not exists (select 1 from public."StationTypes" where "TypeName" = v.t);

insert into public."ObservationTypes" ("ObservationType")
select t from (values ('Rain'), ('Tilt')) v(t)
where not exists (select 1 from public."ObservationTypes" where "ObservationType" = v.t);

insert into public."StationSites" ("SiteName", "CoordinateLocation", "Longitude", "Latitude")
select 'Harbor Mountain', 'SRID=4326;POINT(-135.33 57.05)', -135.33, 57.05
where not exists (select 1 from public."StationSites" where "SiteName" = 'Harbor Mountain');

-- Check: each count should be at least 1 (station roles = 4).
select 'StationRoles' as table_name, count(*) from public."StationRoles"
union all select 'Organizations', count(*) from public."Organizations"
union all select 'OrganizationProjects', count(*) from public."OrganizationProjects"
union all select 'StationTypes', count(*) from public."StationTypes"
union all select 'ObservationTypes', count(*) from public."ObservationTypes"
union all select 'StationSites', count(*) from public."StationSites";
