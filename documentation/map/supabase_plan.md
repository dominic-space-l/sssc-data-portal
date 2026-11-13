# Plan: Supabase Setup for the Map

## Context

The map backend ([map_app_plan.md](map_app_plan.md)) reads station data from Supabase with the **anon key**. The Supabase anon key is designed to be treated as public, so anything the anon role can read should be treated as public too. Right now that would include true station coordinates.

This plan moves privacy and query logic into the database. Once it's in place, the anon role can't read any table directly. It can only call two functions, and those functions return masked coordinates and nothing else sensitive. The Flask backend then mostly passes filters through.

**Implementer:** you (Nicholas), working in Supabase. These steps are commits 1–6 of the [map app plan](map_app_plan.md#commits) and are logged in the map [CHANGELOG](CHANGELOG.md).

### Scope

- **In scope:** migrations in the repo, foreign keys and indexes, RLS for the `anon` role, the masking secret in Vault, the two map functions, pgTAP tests for each, and GitHub Actions workflows to test, deploy, and drift-check the database.
- **Out of scope:** policies for the `authenticated` role (the portal and `authentication/` plans own writes and logged-in access) and data cleanup beyond what foreign keys require.

## Target design

```
                         Supabase (Postgres)
┌──────────────────────────────────────────────────────────────────────┐
│ public tables  (RLS on; anon: no grants, no policies → no access)    │
│   Stations, StationSites, Contacts, StationOrganizationRole, ...     │
│                                                                      │
│ map_private schema  (not exposed through the API)                    │
│   mask_point(id, lon, lat) ── reads secret from Vault                │
│                                                                      │
│ public functions  (security definer; EXECUTE granted to anon only)   │
│   map_stations(project, organization, station_types[],               │
│                observation_types[], station)                         │
│   map_filter_options()                                               │
└──────────────────────────────────────────────────────────────────────┘
                 ▲  db.rpc("map_stations", {...})
                 │  db.rpc("map_filter_options")
          Flask backend (anon key)
```

| Decision | Choice | Why |
| --- | --- | --- |
| Anon access | Execute on two functions, nothing else | The smallest surface. A leaked anon key exposes only what the public map already shows. |
| Masking | Salted deterministic offset of 250–500 m in `map_private.mask_point`, called only inside `map_stations`. No exemptions. | True coordinates never leave Postgres for the anon role. The output is stable, so it can't be averaged away. |
| Masking secret | Supabase Vault (`vault.decrypted_secrets`) | Encrypted at rest. It's never in the Flask env, the repo, or a migration. |
| Query shape | Functions with explicit parameters, not views | One round trip per request. The org/project rules live next to the data. A view over `Stations` would need security-definer behavior to bypass RLS, which Supabase's advisor flags. |
| Schema changes | Supabase CLI migrations in `supabase/migrations/` | Versioned, reviewable, reproducible locally with `supabase start`. |
| Tests | pgTAP via `supabase test db`, added with each step | Tests the privacy guarantees where they are enforced. |

## Steps

Each step is one commit, with one migration (or a small group of them) and its pgTAP tests. Before pushing each one to the hosted project with `supabase db push --remote`, run `supabase db reset` and `supabase test db` locally.

### S1. Supabase CLI and baseline — map `0.4.0`

- `supabase init` at the repo root, which creates `supabase/config.toml`.
- `supabase link --project-ref <ref>`, then `supabase db pull` to capture the current schema as the first migration. Commit it unchanged, so every later migration is a reviewable diff.
- Create `supabase/tests/` with a seed helper (`supabase/tests/00_seed.sql` or a `seed.sql`) that inserts a few organizations, projects (one with no stations), roles, station types, observation types, and stations with known coordinates. Later steps' tests use it.
- Add `supabase/README.md` (quickstart, setup, directory guide) and the `supabase/` entry to the root README's directory guide.
- Don't commit `.env` files or database passwords. `supabase/.temp/` goes in `.gitignore`.

### S2. Foreign keys, identity fix, indexes, and station coordinates — map `0.5.0`

> **Done (0.5.0).** Migration `20261110171451_s2_keys_identity_indexes_coordinates.sql`, tests in `supabase/tests/01_keys_identity_coordinates.test.sql`. What the implementation found:
> - Every foreign key below already existed, so there were no orphan rows. But 7 of them used `on delete cascade` from a lookup table, which doesn't match the table below. For example, deleting a measurement unit deleted every sensor placement that used it. Those 7 were re-created with the plan's rule. The three `restrict` keys from the baseline (`Contacts`, `OrganizationProjects`, `DeviceSpecifications`) use Postgres's default `no action`, which blocks the same deletes, so they were left as is.
> - Indexes cover every foreign key that isn't the leading column of a primary key (16 in all), not only the five listed. `sor_organization_idx` was skipped because it duplicates the primary key.
> - On the hosted project, `CoordinateLocation` was NULL for all 5 stations, so the drift check found nothing to keep.

**Check for orphan rows first.** Adding a foreign key fails if any row points at a missing parent. For each pair below, run a query like this and fix the data before migrating:

```sql
select s."StationID", s."ProjectID"
from public."Stations" s
left join public."OrganizationProjects" p on p."ProjectID" = s."ProjectID"
where s."ProjectID" is not null and p."ProjectID" is null;
```

**Foreign keys.** PostgREST needs these for embedded selects (the portal will want them), and they keep the linking tables honest.

| Table.column | References | On delete |
| --- | --- | --- |
| `Stations.ProjectID` | `OrganizationProjects.ProjectID` | set null |
| `Stations.SiteID` | `StationSites.SiteID` | set null |
| `Stations.StationTypeID` | `StationTypes.TypeID` | set null |
| `OrganizationProjects.OrganizationID` | `Organizations.OrganizationID` | restrict |
| `Contacts.OrganizationID` | `Organizations.OrganizationID` | restrict |
| `DeviceSpecifications.ManufacturerID` | `DeviceManufacturers.ManufacturerID` | restrict |
| `Sensors.ObservationTypeID` | `ObservationTypes.ObservationTypeID` | set null |
| `StationOrganizationRole.StationID` / `.OrganizationID` / `.RoleID` | `Stations` / `Organizations` / `StationRoles` | cascade / cascade / restrict |
| `StationContact.StationID` / `.ContactID` / `.RoleID` | `Stations` / `Contacts` / `StationRoles` | cascade / cascade / set null |
| `StationObservations.StationID` / `.ObservationTypeID` | `Stations` / `ObservationTypes` | cascade / restrict |
| `StationsToSensors.StationID` / `.SensorID` / `.MeasurementUnitsID` | `Stations` / `Sensors` / `MeasurementUnits` | cascade / cascade / set null |
| `StationsToSpecs.StationID` / `.DeviceSpecificationID` | `Stations` / `DeviceSpecifications` | cascade / restrict |
| `SensorsToSpecs.SensorID` / `.DeviceSpecificationID` | `Sensors` / `DeviceSpecifications` | cascade / restrict |

Skip any that already exist. `supabase db pull` in S1 shows which do.

**Identity fix.** The schema marks `StationID` (and `SensorID` in `StationsToSensors` and `SensorsToSpecs`) as *Identity* in the linking tables. A linking-table column should hold a copied ID, not generate one:

```sql
alter table public."StationOrganizationRole" alter column "StationID" drop identity if exists;
-- repeat for StationContact, StationsToSpecs, StationsToSensors (StationID and SensorID),
-- SensorsToSpecs (SensorID), StationObservations
```

`StationContact` keeps `StationID` as its sole primary key: each station has one contact by design. Only the identity is dropped.

**Indexes.** Postgres doesn't index foreign-key columns automatically. A composite primary key only covers lookups on its leading column. The tables are small, so this is about avoiding Supabase advisor warnings and future-proofing more than speed:

```sql
create index if not exists stations_project_idx      on public."Stations" ("ProjectID");
create index if not exists stations_type_idx         on public."Stations" ("StationTypeID");
create index if not exists sor_station_idx           on public."StationOrganizationRole" ("StationID");
create index if not exists sor_organization_idx      on public."StationOrganizationRole" ("OrganizationID");
create index if not exists station_obs_type_idx      on public."StationObservations" ("ObservationTypeID");
```

Drop any that duplicate the leading column of an existing primary key.

**Station coordinates.** `Stations` stores a location twice: `Longitude`/`Latitude` (`numeric`, what users type in the data portal) and `CoordinateLocation` (a PostGIS point for spatial queries). The two are kept because the client wanted plain numbers to enter and read, and the developer wanted a spatial type. They must never disagree. `CoordinateLocation` is also `geometry` here but `geography` in `StationSites`.

`Longitude`/`Latitude` are the source of truth. `CoordinateLocation` becomes a **stored generated column** of type `geography(Point, 4326)`, computed from them:

- Postgres recomputes it on every insert and update, so it can't drift. There's no trigger code to maintain.
- Nobody can write it directly. An insert or update that sets it raises an error, which matches the portal, where users only enter longitude and latitude.
- It matches `StationSites.CoordinateLocation`, and `mask_point` (S4) already works on `geography`.

A trigger would only be needed if both sides could be edited, for example a GIS tool writing the point. Nothing does, so the generated column is the simpler choice. `Elevation (FT)` stays a separate column and isn't folded into the point as a Z value. Geography distance and `ST_Project` ignore Z, elevation is optional, and it's stored in feet.

Postgres can't turn an existing column into a generated one, so the migration drops and re-adds it. **Before migrating**, check the hosted data for rows where the stored point disagrees with `Longitude`/`Latitude`, has the wrong SRID, or is missing. Dropping the column discards those values, so decide which side is right for each row and fix `Longitude`/`Latitude` first:

```sql
select "StationID", "Longitude", "Latitude",
       extensions.st_astext("CoordinateLocation") as stored_point,
       extensions.st_srid("CoordinateLocation")   as srid
from public."Stations"
where "CoordinateLocation" is null
   or extensions.st_srid("CoordinateLocation") <> 4326
   or extensions.st_distance(
        "CoordinateLocation"::extensions.geography,
        extensions.st_setsrid(
          extensions.st_makepoint("Longitude", "Latitude"), 4326)::extensions.geography
      ) > 1;  -- metres
```

Then migrate:

```sql
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
```

The range checks catch typos and most swapped values (a Sitka longitude of about −135 fails the latitude check). Without them, PostGIS would quietly wrap an out-of-range point instead of raising an error. If the drift query finds anything out of range, fix it before adding the constraints.

Also in this step:
- Remove `CoordinateLocation` from the `Stations` insert in `supabase/seed.sql`. Inserting into a generated column fails.
- Update the `Stations` row in [schema.md](../schema.md): `CoordinateLocation` becomes `geography`, generated from `Longitude`/`Latitude`.

**Tests:** `has_fk` / `fk_ok` for each key above, and an insert into `StationOrganizationRole` with a nonexistent `StationID` fails. For coordinates: `col_type_is` reports `geography(Point,4326)` for `Stations.CoordinateLocation`, and `col_is_generated` passes for it. For each seeded station, the point's longitude and latitude equal `Longitude`/`Latitude`. After an update to a station's `Longitude`, its point moves to match. An insert or update that sets `CoordinateLocation` directly raises an error, and so does a `Latitude` of 95.

### S2b. `StationSites` coordinates and elevation — map `0.5.1`

> **Done (0.5.1).** Migration `20261110172633_s2b_station_sites_coordinates.sql`, tests in `supabase/tests/02_station_sites_coordinates.test.sql`. The hosted `StationSites` table was still empty when the migration was written.

`StationSites` stores a location twice, just as `Stations` did: `Longitude`/`Latitude` (`numeric`, `NOT NULL`) and `CoordinateLocation` (plain `geography`, `NOT NULL UNIQUE`, written separately). The two tables were never meant to differ. This step makes `StationSites` match `Stations` after S2:
- `Longitude`/`Latitude` are the source of truth, with the same range checks.
- `CoordinateLocation` becomes a stored generated `geography(Point, 4326)` column that can't be written directly.
- `Elevation` is renamed `Elevation (FT)`. It's already stored in feet, and the new name matches `Stations`.

**Uniqueness is dropped.** The baseline makes `CoordinateLocation` unique, so two sites can't share a point. Nothing needs that rule, and `Stations` doesn't have it. Dropping the column drops the constraint (`StationSites_CoordinateLocation_key`), and it isn't re-created.

**Hosted data:** when this step was planned (2026-11-10), `StationSites` had no rows and no station had a `SiteID`, so nothing is lost by dropping the column. Re-run this check before migrating in case sites have been added since. For each row it reports the point type, the SRID, and how far the stored point is from `Longitude`/`Latitude`:

```sql
select "SiteID",
       extensions.st_geometrytype("CoordinateLocation"::extensions.geometry) as point_type,
       extensions.st_srid("CoordinateLocation")                              as srid,
       extensions.st_distance("CoordinateLocation",
         extensions.st_setsrid(
           extensions.st_makepoint("Longitude", "Latitude"), 4326)::extensions.geography) as dist_m
from public."StationSites";
```

If any row has a different point type or SRID, or a distance over 1 m, fix its `Longitude`/`Latitude` first.

```sql
alter table public."StationSites"
  add constraint station_sites_longitude_range check ("Longitude" between -180 and 180),
  add constraint station_sites_latitude_range  check ("Latitude"  between  -90 and  90);

alter table public."StationSites" rename column "Elevation" to "Elevation (FT)";

alter table public."StationSites" drop column "CoordinateLocation";  -- also drops StationSites_CoordinateLocation_key

alter table public."StationSites"
  add column "CoordinateLocation" extensions.geography(Point, 4326)
  generated always as (
    extensions.st_setsrid(
      extensions.st_makepoint("Longitude"::float8, "Latitude"::float8), 4326
    )::extensions.geography
  ) stored;

comment on column public."StationSites"."CoordinateLocation" is
  'Generated from Longitude/Latitude (WGS 84). Read-only: edit Longitude and Latitude instead.';
```

**Also in this step:**
- **Seed:** `supabase/seed.sql` has no sites yet. Add two sites near Sitka, with an `Elevation (FT)` on one. Put stations 1 and 2 at site 1 (a site with more than one station) and leave site 2 empty. Advance the `SiteID` sequence past them.
- **Docs:** update the `StationSites` rows in [schema.md](../schema.md). `CoordinateLocation` becomes `geography(Point, 4326)`, generated and read-only, and is no longer unique. `Elevation` becomes `Elevation (FT)`.

**Tests** (`supabase/tests/02_station_sites_coordinates.test.sql`), mirroring S2's coordinate tests:
- `CoordinateLocation` is a stored generated `geography(Point, 4326)`, and every seeded site's point matches its `Longitude`/`Latitude`.
- Updating `Longitude` moves the point.
- Writing `CoordinateLocation` directly in an insert or update raises `428C9`.
- An out-of-range latitude or longitude raises `23514`.
- A site inserted with only `Longitude`/`Latitude` succeeds.
- `has_column` passes for `Elevation (FT)` and `hasnt_column` passes for `Elevation`.
- **Parity:** the shared columns (`Longitude`, `Latitude`, `CoordinateLocation`, `Elevation (FT)`) have the same type, nullability, and generation expression in both tables, and both tables have the same range checks. A later change to one table that isn't made to the other fails this test.

### S3. Row-level security for `anon` — map `0.6.0`

> **Done (0.6.0).** Migration `20261112061116_s3_anon_rls.sql`, tests in `supabase/tests/03_anon_rls.test.sql`. What the implementation found:
> - The baseline already had RLS on for all 18 tables, with no policies. So anon reads already returned no rows and anon writes already failed, and nothing could have relied on anon access. The `enable row level security` lines are no-ops kept to state the rule in one place. The real change is the revokes: anon had every table privilege and `USAGE`/`SELECT`/`UPDATE` on every sequence. Over the API, an anon request for a table now returns `401` with `permission denied` instead of `[]`.
> - The default-privilege revokes use `for role postgres`, the role migrations and the SQL editor run as. Supabase's `supabase_admin` role has the same anon defaults, and `postgres` can't change them. Nothing of ours is created as `supabase_admin`.
> - Functions aren't covered by default privileges. New functions in `public` are executable by anon both directly and through `PUBLIC`, and a schema-scoped revoke can't remove the `PUBLIC` grant. Instead, the test fails if anon can execute any function in `public` outside an allowlist. The allowlist is empty now. S5 and S6 add their function to it.
> - `authenticated` keeps its grants and is still blocked by RLS, as before.

Turn on RLS for **every** table in `public`, and remove the anon role's table privileges. With RLS on and no anon policies, anon reads return nothing. Revoking the grants as well means anon requests fail loudly rather than silently returning empty results.

```sql
alter table public."Stations" enable row level security;
-- ...repeat for every table in public

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
```

> **Watch out:** enabling RLS also blocks the `authenticated` role until it has policies. Nothing in the repo uses Supabase yet, but check whether anything outside the repo relies on it. The table editor in the dashboard uses the `postgres` role and isn't affected.

**Tests:** as `anon` (`set local role anon`), selecting from every table in `public` raises a permission error. A query on `pg_tables` checks that every table in `public` has `rowsecurity = true`, so a table added later without RLS fails the test. The implementation also checks, from the catalog: anon has no table, column, or sequence privilege in `public`; `postgres`'s default privileges grant anon nothing, and a table created during the test isn't anon-readable; no policy applies to `anon` or `PUBLIC`; anon can execute no function in `public` outside the allowlist; and anon keeps `USAGE` on schema `public`, which RPC calls need.

### S4. Masking secret and `mask_point` — map `0.7.0`

> **Done (0.7.0).** Migration `20261112062156_s4_mask_point.sql`, tests in `supabase/tests/04_mask_point.test.sql`. The function is the one below, unchanged. What the implementation found:
> - **The hosted secret is still a manual step.** Run the `vault.create_secret` call below before S5's `map_stations` is used. Until then, `mask_point` raises instead of returning a point. The step is also listed under "Hosted project: one-time manual steps" in `supabase/README.md`.
> - **Local secret in the seed.** The plan had each test insert a secret inside its transaction. Instead, `supabase/seed.sql` creates a throwaway local `map_location_mask_secret`, so masking works in local development and in S5's tests without extra setup. The tests delete or replace it inside their own transactions when they need to. `supabase db push` never sends the seed.
> - pgcrypto, Vault (0.3.1), and PostGIS are already installed by Supabase in `extensions` and `vault`, so the `extensions.` prefixes work as written.
> - `map_private` is now linted in CI and in `npm run db:lint`.
> - With the local secret, the four seeded stations move 271–349 m, in four different directions. Over the local API, `rpc/mask_point` returns 404 and the `map_private` profile is rejected (406).

Store the secret in Vault once, by hand in the SQL editor, **not in a migration**:

```sql
select vault.create_secret('<long random string>', 'map_location_mask_secret');
```

Generate the value with something like `openssl rand -base64 48`. Changing it later moves every marker on the map, so treat it as long-lived.

Then the migration creates a private schema and the masking function. `HMAC(secret, StationID)` picks an azimuth and a distance between 250 and 500 m. PostGIS `ST_Project` moves the point that far along the ellipsoid, and the result is rounded to 4 decimal places:

```sql
create extension if not exists pgcrypto with schema extensions;

create schema if not exists map_private;
revoke all on schema map_private from public, anon, authenticated;

create or replace function map_private.mask_point(
  p_id bigint, p_lon numeric, p_lat numeric,
  out lon numeric, out lat numeric)
language plpgsql stable security definer set search_path = ''
as $$
declare
  c_min_m constant double precision := 250;
  c_max_m constant double precision := 500;
  v_secret text;
  v_hash bytea;
  v_azimuth double precision;
  v_dist double precision;
  v_point extensions.geometry;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'map_location_mask_secret';
  if v_secret is null then
    raise exception 'location masking is not configured' using errcode = 'P0001';
  end if;

  v_hash := extensions.hmac(p_id::text, v_secret, 'sha256');
  -- Azimuth in radians, clockwise from north, as ST_Project expects.
  v_azimuth := ((get_byte(v_hash, 0) << 8) | get_byte(v_hash, 1)) / 65536.0 * 2 * pi();
  v_dist := c_min_m + ((get_byte(v_hash, 2) << 8) | get_byte(v_hash, 3)) / 65535.0 * (c_max_m - c_min_m);

  v_point := extensions.st_project(
      extensions.st_setsrid(
        extensions.st_makepoint(p_lon::double precision, p_lat::double precision), 4326
      )::extensions.geography,
      v_dist, v_azimuth
    )::extensions.geometry;

  lon := round(extensions.st_x(v_point)::numeric, 4);
  lat := round(extensions.st_y(v_point)::numeric, 4);
end;
$$;

revoke all on function map_private.mask_point(bigint, numeric, numeric) from public, anon, authenticated;
comment on function map_private.mask_point(bigint, numeric, numeric) is
  'Moves a point 250-500 m in a direction derived from HMAC(Vault secret, id). Stable per id.';
```

- The PostGIS functions are qualified with `extensions.` because `search_path` is empty, which is where Supabase installs PostGIS by default. If `select extnamespace::regnamespace from pg_extension where extname = 'postgis'` shows a different schema, such as `public`, use that prefix instead.
- `map_private` is not in the API's exposed schemas (**Settings → API → Exposed schemas** should list only `public`), so it can't be called over HTTP.
- The radius is in the function body, not a parameter, so a caller can't ask for a smaller one. To change it later, edit the two constants in a new migration. Every marker will move.
- Rounding to 4 decimal places (about 11 m) can push a point a few meters outside the 250–500 m band. The tests allow ±15 m for that.

**Tests:** the same input always returns the same point. For each seeded station, the distance from its true point is between 235 and 515 m, measured with `extensions.st_distance` on `geography`. The output never equals the input. With the secret deleted, the function raises `location masking is not configured`. As `anon`, calling it raises a permission error. The implementation also checks that:
- the function is stable and security definer, with an empty `search_path`
- `PUBLIC`, `anon`, and `authenticated` have no usage on `map_private` and no execute on `mask_point`, and `authenticated` can't call it either
- output is rounded to 4 decimal places
- the seeded stations move in different directions, and two ids at the same point get different results
- replacing the secret moves every point, and each point stays 235–515 m from its true location
- a null longitude gives a null point, not an error

### S5. `map_stations` function — map `0.8.0`

> **Done (0.8.0).** Migration `20261113022518_s5_map_stations.sql`, tests in `supabase/tests/05_map_stations.test.sql`. The function is the one below. The only change is that the revoke also names `anon`, so anon's execute comes only from the explicit grant and not from `postgres`'s default privileges. What the implementation found:
> - Lint and the security advisors report nothing for a `security definer` function granted to anon, so CI doesn't flag it.
> - **Fail closed, with one gap:** with the secret missing, any call that would return a station raises `P0001`. A call whose filters match no station may return `[]` instead, depending on the plan Postgres picks. That leaks nothing, but the backend can't assume an empty result means masking is configured.
> - Over the local API, `rpc/map_stations` as anon returns the masked rows and `roles` as a JSON array (`[]` for none, `null` with no organization). A direct request for `Stations` still returns 401.
> - `code` can be `null` (seeded station 4). The backend should treat a missing code as absent, not as the string `"null"`.

One call returns the stations for the map with the filters applied and coordinates masked. It implements the [org/project interaction table](map_app_plan.md#filter-and-color-behavior):

- `roles` is `null` when no organization is given, and otherwise the sorted role ids that organization holds at the station (`{}` for none).
- The organization filters only when no project is given.
- `p_station` limits the result to one station, for the detail route.

```sql
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

revoke all on function public.map_stations(bigint, bigint, bigint[], bigint[], bigint)
  from public, anon, authenticated;
grant execute on function public.map_stations(bigint, bigint, bigint[], bigint[], bigint) to anon;
comment on function public.map_stations(bigint, bigint, bigint[], bigint[], bigint) is
  'Public map stations with masked coordinates. Organization filters only when no project is given.';
```

- **Only allowlisted columns come out.** There's no `StationNotes`, elevation, site, or raw coordinates. Adding a column to the map means changing `returns table`, which is a reviewed migration.
- `null` means "no filter" for the array parameters. An empty array would match nothing, so the backend sends `null` when no options are ticked.
- Functions in `public` are executable by `PUBLIC` by default in Postgres. The `revoke ... from public` line is what limits it to `anon`. Add `authenticated` to the grant if the portal will want the map view too.

**Tests:** add `map_stations` to the `anon_functions` allowlist in `supabase/tests/03_anon_rls.test.sql`. As `anon`, the function succeeds and returns only the seven listed columns. No returned `lon`/`lat` equals a seeded station's true value to 4 decimal places. One test per row of the interaction table (neither, organization only, project, project plus a different organization, a project with no stations). The station-type and observation-type arrays filter correctly, and `null` means no filter. `p_station` returns exactly one row. With the secret deleted, the call raises.

### S6. `map_filter_options` function — map `0.9.0`

One call returns everything the backend needs to build the manifest's dropdowns. Each project carries a `station_count`, so the map can tag projects that have none with "No stations":

```sql
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
                    where sor."OrganizationID" = o."OrganizationID")),
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

revoke all on function public.map_filter_options() from public, anon, authenticated;
grant execute on function public.map_filter_options() to anon;
comment on function public.map_filter_options() is
  'Dropdown options for the public map: projects (with station counts), organizations with roles, types, roles.';
```

`OrganizationNotes`, `ProjectNotes`, and `RoleNotes` are left out on purpose. Notes fields tend to collect internal details.

**Tests:** add `map_filter_options` to the `anon_functions` allowlist in `supabase/tests/03_anon_rls.test.sql`. As `anon`, the function succeeds. Every project is listed, including the seeded one with no stations, which has `station_count = 0`. Each project carries its `organization_id`. Only organizations with at least one role are listed. No key contains a notes field.

### S7. Deploy and drift-check workflows — map: next free `yy` when it lands

S1 added `.github/workflows/database.yml`, which tests migrations against a throwaway local database and never touches the hosted project. This step adds two workflows that do connect to it. Both use the same setup:

- **Secrets live in GitHub environments, not repository secrets.** An environment's secrets reach only jobs that name that environment, and an environment can require approval before a job starts.
  - `supabase-production`, with **Required reviewers** set to Nicholas and deployments limited to the `main` branch. Secrets: `SUPABASE_ACCESS_TOKEN` (a personal access token from **Account → Access Tokens**) and `SUPABASE_DB_PASSWORD`. Variable: `SUPABASE_PROJECT_ID` (`cmxvpikgbetmesmpiubt`).
  - `supabase-readonly`, with no reviewers, for the nightly check. It holds the same `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_ID`, and a database URL for a read-only role (below) instead of the owner password.
- **Read-only role for the drift check.** Create it by hand in the SQL editor, like the Vault secret in S4, so the password never lands in a migration:
  ```sql
  create role ci_readonly login password '<generated>' in role pg_read_all_data;
  ```
  Store `postgresql://ci_readonly.<project-ref>:<password>@<pooler-host>:5432/postgres` as `SUPABASE_READONLY_DB_URL` in `supabase-readonly`. If `supabase db diff` can't dump the schema as this role, fall back to the owner password in that environment and note it here.
- **Every command that should reach the hosted project passes `--remote`.** Since CLI 3, `db push`, `migration list`, and `db advisors` target the local database by default, so without the flag a command points at a database on the runner instead of the hosted project. Each job should also fail unless the CLI's JSON output reports `"target": {"kind": "linked", ...}`.
- **The CLI version comes from `package-lock.json`** (`npm ci`, then `npx supabase`), the same as in `database.yml`, so all three workflows run the same CLI.

#### Deploy: `.github/workflows/database-deploy.yml`

```
push to main ──▶ Database (CI) ──success──▶ plan: link + db push --remote --dry-run
                                                 │  (log shows pending migrations)
                                                 ▼
                                   deploy: waits for approval in supabase-production
                                                 │
                                                 ▼
                                   db push --remote ──▶ migration list --remote ──▶ db advisors --remote
```

- **Trigger:** `workflow_run` on the `Database` workflow, `types: [completed]`, `branches: [main]`, with `if: github.event.workflow_run.conclusion == 'success'`. Deploys therefore happen only after the migrations, tests, lint, and advisors pass on `main`. Check out `github.event.workflow_run.head_sha`, so it deploys the commit that was tested. Also allow `workflow_dispatch` for a manual re-run.
- **`plan` job** (environment `supabase-readonly`, no approval needed): `npx supabase link --project-ref "$SUPABASE_PROJECT_ID"`, then `npx supabase db push --remote --dry-run`. It writes the list of pending migrations to the job summary (`$GITHUB_STEP_SUMMARY`), so the reviewer sees exactly what will run before approving. If nothing is pending, it says so and `deploy` is skipped.
- **`deploy` job** (`needs: plan`, environment `supabase-production`, which pauses for approval): `link`, then `npx supabase db push --remote --yes`. Hosted changes accept only `--yes` or `SUPABASE_YES` for confirmation. Then `npx supabase migration list --remote` confirms local and remote match, and `npx supabase db advisors --remote --type security --fail-on error` confirms nothing regressed.
- **`concurrency: { group: database-deploy, cancel-in-progress: false }`**, so two deploys never overlap and a queued one isn't cancelled halfway.
- **Never** pass `--include-seed` (the seed is fictional test data) or `--include-all` (it applies migrations older than the remote's latest, which the `migrations-immutable` check exists to prevent).
- **Out of the deploy's reach:** the Vault secret (S4) and the read-only role stay manual one-time steps, and data changes aren't migrations.
- **Rollback is forward-only.** Fix a bad migration with a new migration through the same path. For data loss, use the hosted project's backups (**Database → Backups**). Write the restore steps into `supabase/README.md` when this step lands.

Once this workflow exists, stop running `supabase db push` from a laptop. Update the "Workflow for a schema change" section in `supabase/README.md` to say that merging to `main` and approving the deploy is the only path to the hosted database.

#### Drift check: `.github/workflows/database-drift.yml`

Catches the hosted database drifting from the repo: a table or policy edited in the dashboard, a migration pushed but never merged, or one merged but never deployed. That matters most after S3. A dashboard edit that loosens a grant or a policy would otherwise go unnoticed.

- **Trigger:** `schedule` nightly (for example `cron: "17 10 * * *"`, around 2–3 a.m. Alaska time) and `workflow_dispatch`. It runs in environment `supabase-readonly`.
- **Checks, each failing the job:**
  1. **Migration history:** `npx supabase migration list --remote`. Fail if any migration is only local (merged but not deployed) or only remote (pushed but not in the repo).
  2. **Schema:** `npx supabase db diff --from migrations --to "$SUPABASE_READONLY_DB_URL" --schema public,map_private` (drop `map_private` if S4 hasn't landed). It builds the migrations in a shadow database on the runner and compares it with the hosted schema. Fail if the output contains any SQL. Check the CLI's exit code and output format when implementing, and fail on non-empty output rather than relying on the exit code.
  3. **Security advisors:** `npx supabase db advisors --remote --type security --fail-on error`. This catches, for example, a table created in the dashboard without RLS.
- **Output:** write the diff and the advisor findings to the job summary. GitHub emails the person who last changed the workflow's schedule when a scheduled run fails, so nobody has to watch it.
- **Fixing drift:** if the dashboard change was intended, capture it with `npx supabase db pull` as a new migration in a PR. If not, write a migration that reverts it. Either way, the repo stays the source of truth.

**Tests / verification** (workflows can't be pgTAP-tested, so verify by hand when the step lands):
- Run `database-drift.yml` with `workflow_dispatch` on a clean state. All three checks pass.
- Merge a no-op migration (for example a `comment on table`). `plan` lists it, `deploy` waits for approval, and after approval `migration list` shows it on both sides.
- Run `plan` with nothing pending. It reports that and skips `deploy`.

## Order of work

S1 → S2 → S2b → S3 → S4 → S5 → S6, with S7 anywhere after S3 and before map commit 10. The map backend doesn't call Supabase until map commit 10, so there's no window during these steps where the live map is broken or exposed. S7 should land before the live map relies on the access rules, so the drift check is guarding them from day one. Until S7 lands, push by hand with `supabase db push --remote` as described in each step and in the "Workflow for a schema change" section of `supabase/README.md`.

Once the map is live, push any migration that changes access (a revoke, a grant, or a function's columns) in the same `supabase db push --remote` as the function changes that go with it.

The map's backend foundation (map commits 7–9) doesn't depend on any of this and can proceed in parallel.

## Open questions

None. The question about which coordinate column is the source of truth is settled in [S2](#s2-foreign-keys-identity-fix-indexes-and-station-coordinates--map-050): `Longitude`/`Latitude` are, and `CoordinateLocation` becomes a `geography` column generated from them.
