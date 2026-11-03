# Plan: Supabase Setup for the Map

## Context

The map backend ([map_app_plan.md](map_app_plan.md)) reads station data from Supabase with the **anon key**. The Supabase anon key is designed to be treated as public, so anything the anon role can read should be treated as public too. Right now that would include true station coordinates.

This plan moves privacy and query logic into the database. Once it's in place, the anon role can't read any table directly. It can only call two functions, and those functions return masked coordinates and nothing else sensitive. The Flask backend then mostly passes filters through.

**Implementer:** you (Nicholas), working in Supabase. These steps are commits 1–6 of the [map app plan](map_app_plan.md#commits) and are logged in the map [CHANGELOG](CHANGELOG.md).

### Scope

- **In scope:** migrations in the repo, foreign keys and indexes, RLS for the `anon` role, the masking secret in Vault, the two map functions, and pgTAP tests for each.
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

Each step is one commit, with one migration (or a small group of them) and its pgTAP tests. Before pushing each one to the hosted project with `supabase db push`, run `supabase db reset` and `supabase test db` locally.

### S1. Supabase CLI and baseline — map `0.4.0`

- `supabase init` at the repo root, which creates `supabase/config.toml`.
- `supabase link --project-ref <ref>`, then `supabase db pull` to capture the current schema as the first migration. Commit it unchanged, so every later migration is a reviewable diff.
- Create `supabase/tests/` with a seed helper (`supabase/tests/00_seed.sql` or a `seed.sql`) that inserts a few organizations, projects (one with no stations), roles, station types, observation types, and stations with known coordinates. Later steps' tests use it.
- Add `supabase/README.md` (quickstart, setup, directory guide) and the `supabase/` entry to the root README's directory guide.
- Don't commit `.env` files or database passwords. `supabase/.temp/` goes in `.gitignore`.

### S2. Foreign keys, identity fix, and indexes — map `0.5.0`

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

**Tests:** `has_fk` / `fk_ok` for each key above, and an insert into `StationOrganizationRole` with a nonexistent `StationID` fails.

### S3. Row-level security for `anon` — map `0.6.0`

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

**Tests:** as `anon` (`set local role anon`), selecting from every table in `public` raises a permission error. A query on `pg_tables` checks that every table in `public` has `rowsecurity = true`, so a table added later without RLS fails the test.

### S4. Masking secret and `mask_point` — map `0.7.0`

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

**Tests:** with a test secret inserted in the transaction, the same input always returns the same point. For each seeded station, the distance from its true point is between 235 and 515 m, measured with `extensions.st_distance` on `geography`. The output never equals the input. With the secret deleted, the function raises `location masking is not configured`. As `anon`, calling it raises a permission error.

### S5. `map_stations` function — map `0.8.0`

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
  from public, authenticated;
grant execute on function public.map_stations(bigint, bigint, bigint[], bigint[], bigint) to anon;
comment on function public.map_stations(bigint, bigint, bigint[], bigint[], bigint) is
  'Public map stations with masked coordinates. Organization filters only when no project is given.';
```

- **Only allowlisted columns come out.** There's no `StationNotes`, elevation, site, or raw coordinates. Adding a column to the map means changing `returns table`, which is a reviewed migration.
- `null` means "no filter" for the array parameters. An empty array would match nothing, so the backend sends `null` when no options are ticked.
- Functions in `public` are executable by `PUBLIC` by default in Postgres. The `revoke ... from public` line is what limits it to `anon`. Add `authenticated` to the grant if the portal will want the map view too.

**Tests:** as `anon`, the function succeeds and returns only the seven listed columns. No returned `lon`/`lat` equals a seeded station's true value to 4 decimal places. One test per row of the interaction table (neither, organization only, project, project plus a different organization, a project with no stations). The station-type and observation-type arrays filter correctly, and `null` means no filter. `p_station` returns exactly one row. With the secret deleted, the call raises.

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

revoke all on function public.map_filter_options() from public, authenticated;
grant execute on function public.map_filter_options() to anon;
comment on function public.map_filter_options() is
  'Dropdown options for the public map: projects (with station counts), organizations with roles, types, roles.';
```

`OrganizationNotes`, `ProjectNotes`, and `RoleNotes` are left out on purpose. Notes fields tend to collect internal details.

**Tests:** as `anon`, the function succeeds. Every project is listed, including the seeded one with no stations, which has `station_count = 0`. Each project carries its `organization_id`. Only organizations with at least one role are listed. No key contains a notes field.

## Order of work

S1 → S2 → S3 → S4 → S5 → S6. The map backend doesn't call Supabase until map commit 10, so there's no window during these steps where the live map is broken or exposed.

Once the map is live, push any migration that changes access (a revoke, a grant, or a function's columns) in the same `supabase db push` as the function changes that go with it.

The map's backend foundation (map commits 7–9) doesn't depend on any of this and can proceed in parallel.

## Open questions

1. **Which coordinates are the source of truth?** `Stations` stores a location twice: `Longitude`/`Latitude` (`numeric`) and `CoordinateLocation` (`geometry`). `map_stations()` masks `Longitude`/`Latitude`. If the two can drift apart (for example, one is edited in the dashboard and the other isn't), S2 could make `CoordinateLocation` a generated column built from them, or add a trigger that keeps them in sync. Note also that `Stations.CoordinateLocation` is `geometry` while `StationSites.CoordinateLocation` is `geography`. That's harmless for the map, but worth making consistent.
