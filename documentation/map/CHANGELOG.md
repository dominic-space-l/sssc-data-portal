# Map Changelog

Versioning follows `xx.yy.zz` (see [documentation/CLAUDECODE/CLAUDE.md](../CLAUDECODE/CLAUDE.md)):
`xx` = major feature, `yy` = steps/commits toward a major feature, `zz` = small updates and revisions.

## 0.7.0 — 2026-11-11

Supabase step S4: the masking secret and `map_private.mask_point`.
- **Masking:** `mask_point(id, lon, lat)` moves a point 250–500 m in a direction picked by `HMAC(secret, id)`, using PostGIS `ST_Project`, and rounds the result to 4 decimal places. The same id always gives the same point, so the offset can't be averaged away. The radius is fixed in the function, so no caller can ask for a smaller one.
- **Secret:** it's read from Supabase Vault (`map_location_mask_secret`) and never appears in the repo or a migration. On the hosted project it's created once by hand, and that still needs doing. Without it, `mask_point` raises `location masking is not configured`. The local seed creates a throwaway secret.
- **Lockdown:** the function lives in the new `map_private` schema, which isn't exposed through the API. Usage and execute are revoked from `PUBLIC`, `anon`, and `authenticated`. Only S5's `map_stations` will call it.
- **Tests:** new pgTAP tests check the function's definition and privileges. They check that every seeded station moves 235–515 m and never stays put, that output is deterministic, that the secret and the id both change the offset, and that a missing secret raises. They also check that anon and authenticated can't call it.
- **CI:** `map_private` is now linted in the `Database` workflow and `npm run db:lint`.
- **Docs:** marked S4 done in the plan. `supabase/README.md` lists the hosted one-time manual steps (the secret and the exposed-schemas check).

**Files changed**
- `supabase/migrations/20261112062156_s4_mask_point.sql`
- `supabase/tests/04_mask_point.test.sql`
- `supabase/seed.sql`
- `supabase/README.md`
- `.github/workflows/database.yml`
- `package.json`
- `documentation/map/supabase_plan.md`
- `documentation/map/map_app_plan.md`
## 0.6.1 — 2026-11-12

Fixed the hosted push commands in the docs. Since Supabase CLI 3, `db push` and `migration list` target the local Docker database unless given `--remote`. The documented `npx supabase db push` therefore went to the local database, and the push of S3 failed with a misleading `Remote migration versions not found` error. The hosted project wasn't touched.
- `supabase/README.md`: the "Workflow for a schema change" push step now uses `db push --remote --dry-run`, `db push --remote --yes`, and `migration list --remote`. It says how to check the `Target:` line, and what the misleading error means: don't run the `migration repair` the CLI suggests.
- `supabase_plan.md`: every hosted push in the steps and in S7 uses `--remote`, and `migration list --linked` (deprecated) is now `--remote`. S7 notes that each job should fail unless the CLI reports the hosted project as its target.
- Migration header comments still say `npx supabase db push`, because merged migrations aren't edited.

**Files changed**
- `supabase/README.md`
- `documentation/map/supabase_plan.md`
- `documentation/map/CHANGELOG.md`

## 0.6.0 — 2026-11-11

Supabase step S3: row-level security for `anon`. The anon key is public, so the anon role can no longer touch any table.
- **Grants:** anon's privileges on every table and sequence in `public` are revoked, and so are `postgres`'s default privileges that gave anon access to new tables and sequences. An anon request for a table now fails with `permission denied` (HTTP 401) instead of returning `[]`.
- **RLS:** all 18 tables already had RLS on and no policies in the baseline, so anon reads already returned nothing and nothing could have relied on them. The migration still enables RLS on each table, to state the rule in one place.
- **Unchanged:** `authenticated` keeps its grants and is still blocked by RLS until the portal adds policies. anon keeps `USAGE` on schema `public`, which RPC calls need.
- **Tests:** new pgTAP tests read the catalog, so tables and functions added later are covered too. They check that every table has RLS on, anon has no table, column, or sequence privilege, new tables get no anon grant, no policy applies to anon or `PUBLIC`, and anon can execute no function in `public` outside an allowlist (empty until S5 and S6). As anon, selecting from every table, inserting a station, and using a sequence each raise a permission error.
- **Docs:** marked S3 done in the plan, with what the implementation found. S5 and S6 now say to add their function to the allowlist. Added an "Access rules for the anon role" section to `supabase/README.md`.

**Files changed**
- `supabase/migrations/20261112061116_s3_anon_rls.sql`
- `supabase/tests/03_anon_rls.test.sql`
- `supabase/README.md`
- `documentation/map/supabase_plan.md`
- `documentation/map/map_app_plan.md`
- `documentation/map/CHANGELOG.md`

## 0.5.1 — 2026-11-10

Supabase step S2b: `StationSites` now handles location the same way as `Stations`. The difference between them was never intended.
- **Coordinates:** `StationSites.CoordinateLocation` is now a stored generated `geography(Point, 4326)` column built from `Longitude`/`Latitude`, and it can't be written directly. `Longitude` and `Latitude` have the same range checks as in `Stations`.
- **Uniqueness:** the old unique rule on the point was dropped with the column and not re-created, so two sites may now share a point.
- **Elevation:** `Elevation` is renamed `Elevation (FT)` to match `Stations`. It was already stored in feet.
- **Hosted data:** the hosted `StationSites` table was empty, so dropping the column lost nothing.
- **Seed:** added two sites. Stations 1 and 2 share site 1, and site 2 has no stations.
- **Tests:** new pgTAP tests check the new columns and their behavior. They also check that the location columns and range checks of `StationSites` and `Stations` match exactly, so a change to one table that isn't made to the other fails CI.
- **Docs:** updated `schema.md`, and marked S2b done in the plan.

**Files changed**
- `supabase/migrations/20261110172633_s2b_station_sites_coordinates.sql`
- `supabase/tests/02_station_sites_coordinates.test.sql`
- `supabase/seed.sql`
- `documentation/schema.md`
- `documentation/map/supabase_plan.md`
- `documentation/map/CHANGELOG.md`

## 0.5.0 — 2026-11-10

Supabase step S2: foreign keys, identity fix, indexes, and station coordinates.
- **Delete rules:** every planned foreign key already existed. Seven cascaded deletes from lookup tables (roles, observation types, measurement units, device specifications) into the rows that used them. They now `restrict` or `set null`, as in the plan.
- **Identity fix:** the identity was dropped from the copied ID columns in the six linking tables (`StationID`, plus `SensorID` in `StationsToSensors` and `SensorsToSpecs`).
- **Indexes:** every foreign key not already covered by a primary key now has an index (16 in all).
- **Station coordinates:** `Stations.CoordinateLocation` is now a stored generated `geography(Point, 4326)` column built from `Longitude`/`Latitude`, so it can't drift and can't be written directly. `Longitude` and `Latitude` have range checks. On the hosted project, all 5 stations had a NULL `CoordinateLocation`, so dropping and re-adding the column lost nothing.
- **Seed:** no longer inserts `CoordinateLocation`, and linking-table inserts no longer use `overriding system value`.
- **Tests:** new pgTAP tests check the full set of foreign keys and their delete rules, the full set of identity columns, index coverage for every foreign key, and the coordinate column's type, sync, read-only behavior, and range checks.
- **Docs:** `schema.md` reflects the new coordinate column and the linking tables' ID columns. The plan's S2 section notes what the implementation found.
- **Plan:** added step S2b (map `0.5.1`) so `StationSites` handles coordinates the same way as `Stations`: the same generated `geography` column and range checks. It also renames `Elevation` to `Elevation (FT)` and drops the unneeded unique rule on its point. The hosted `StationSites` table was empty when this was written.

**Files changed**
- `supabase/migrations/20261110171451_s2_keys_identity_indexes_coordinates.sql`
- `supabase/tests/01_keys_identity_coordinates.test.sql`
- `supabase/seed.sql`
- `documentation/schema.md`
- `documentation/map/supabase_plan.md`
- `documentation/map/map_app_plan.md`
- `documentation/map/CHANGELOG.md`

## 0.4.1 — 2026-11-10

Settled the Supabase plan's open question about station coordinates and added the fix to S2. `Longitude`/`Latitude` are the source of truth. `Stations.CoordinateLocation` becomes a stored generated `geography(Point, 4326)` column built from them, so the two can't drift apart and it now matches `StationSites`. S2 also adds longitude and latitude range checks, a query to find drifted rows before migrating, a seed update, and tests. `Elevation (FT)` stays a separate column.

**Files changed**
- `documentation/map/supabase_plan.md`
- `documentation/map/map_app_plan.md`
- `documentation/map/CHANGELOG.md`

## 0.4.0 — 2026-11-09

Supabase step S1: CLI and baseline.
- Added the Supabase CLI as a root devDependency (`supabase@^3.1.0`, run with `npx supabase` or the new `db:start`, `db:stop`, `db:reset`, and `db:test` scripts) and ran `supabase init` at the repo root.
- Linked the hosted project and pulled the current schema, unchanged, as the baseline migration.
- Added `supabase/seed.sql`, a small fictional dataset with known IDs and coordinates (including a project with no stations, an organization with no roles, and an organization with two roles at one station), and a baseline pgTAP test that checks the tables, PostGIS, and the seed.
- Added `supabase/README.md` and the `supabase/` entry in the root README. The root README now lists Docker as a prerequisite for the local database and explains how to make Node 24 the nvm default.
- Regenerated `package-lock.json` with Node 24 and npm 11.
- Added a `Database` GitHub Actions workflow (`.github/workflows/database.yml`) that, for changes under `supabase/`, builds the database from the migrations and seed, runs the pgTAP tests, lints SQL functions, and runs the Supabase security advisors. On PRs, it also fails if a merged migration was edited, deleted, or renamed, or if a new migration sorts before the newest merged one. Added the `db:lint` script to match. Lint covers only the `public` schema, because PostGIS's functions in `extensions` report plpgsql_check errors that aren't ours.
- Added step S7 to the Supabase plan for a later commit: a deploy workflow (`supabase db push` after CI passes on `main`, with a dry-run summary and a required approval) and a nightly read-only drift check (migration history, schema diff, and security advisors against the hosted project).

**Files changed**
- `.github/workflows/database.yml`
- `documentation/map/supabase_plan.md`
- `documentation/map/map_app_plan.md`
- `package.json`
- `package-lock.json`
- `README.md`
- `supabase/config.toml`
- `supabase/.gitignore`
- `supabase/migrations/20261110000334_remote_schema.sql`
- `supabase/seed.sql`
- `supabase/tests/00_baseline.test.sql`
- `supabase/README.md`
- `documentation/map/CHANGELOG.md`

## 0.3.10 — 2026-10-31

Recorded the remaining map decisions in the plans:
- A station with several roles for one organization is drawn as a pie marker, with one slice per role.
- Inactive stations are greyed out, using a new generic `muted` feature property and a `muted_label` legend entry.
- The organization dropdown lists only organizations with a station role.
- Contact names are never shown to the public.
- `mask_point` now uses PostGIS `ST_Project` on `geography`, and the masking tests use `ST_Distance`.

Replaced the map plan's open questions with a single Supabase question: which of the two `Stations` coordinate columns is the source of truth.

**Files changed**
- `documentation/map/map_app_plan.md`
- `documentation/map/supabase_plan.md`
- `documentation/map/CHANGELOG.md`

## 0.3.9 — 2026-10-31

Revised both plans after decisions on masking and Supabase:
- Masking uses the salted deterministic offset, at 250–500 m, applied in Supabase, with no stations exempt. The backend `LocationMasker` and its config are removed from the map plan.
- The Supabase steps are now commits 1–6 of the map plan (`0.4.0`–`0.9.0`) and are logged in this changelog. The map commits follow, from `0.10.0`, and `1.0.0` is now commit 18.
- Projects with no stations stay in the project dropdown, tagged "No stations", using a new `hint` on filter options and a per-project `station_count` from `map_filter_options()`. Selecting one shows a message on the map.
- Each Supabase step adds its own pgTAP tests (the separate test step is gone). `map_stations()` gains a `p_station` parameter for the detail route.
- `StationContact` keeps `StationID` as its sole key (one contact per station, by design).
- Resolved the open questions on changelogs, `StationContact`, empty projects, exemptions, Supabase setup, views, and the identity quirk.

**Files changed**
- `documentation/map/map_app_plan.md`
- `documentation/map/supabase_plan.md`
- `documentation/map/CHANGELOG.md`

## 0.3.8 — 2026-10-31

Added a Supabase setup plan for the map, covering CLI migrations in the repo, foreign keys, the linking-table identity fix, indexes, RLS that blocks the anon role from reading any table, the masking secret in Vault, the `map_stations` and `map_filter_options` functions, and pgTAP tests. It lists how each step simplifies the map app plan's commits. The map plan's masking section now points to it.

**Files changed**
- `documentation/map/supabase_plan.md`
- `documentation/map/map_app_plan.md`
- `documentation/map/CHANGELOG.md`

## 0.3.7 — 2026-10-31

Revised the plan with the 1.0 feature set: stations as waypoints at masked locations, popups with name, code, and active status, filters for station type, observation type, and project, and an organization dropdown that colors stations by role, which a project selection also sets. Added a location masking section (options, rules, and a recommendation) and a section on how the filters and colors interact. Split the work into 13 commits, from `0.4.0` to `1.0.0`. Moved the detail panel and layer control to a new "After 1.0" list, and fixed the schema link.

**Files changed**
- `documentation/map/map_app_plan.md`
- `documentation/map/CHANGELOG.md`

## 0.3.6 — 2026-10-30

Added a GitHub Actions CI workflow (`.github/workflows/ci.yml`) that runs on every pull request and on pushes to `main`:
- Frontend: ESLint (angular-eslint, `map` selector prefix), a Prettier format check, Vitest tests, and a production build.
- Backend: Ruff lint (PEP 8 and Google-style docstrings), a Ruff format check, and pytest.

Added the root npm scripts `lint`, `format`, `format:check`, `lint:backend`, and `test:backend`. Prettier reformatted `src/index.html`, with no behavior changes.

**Files changed**
- `.github/workflows/ci.yml`
- `eslint.config.js`
- `package.json`
- `package-lock.json`
- `map/backend/pyproject.toml`
- `map/backend/uv.lock`
- `map/frontend/src/index.html`

## 0.3.5 — 2026-10-26

Fixed the placeholder marker popup. It said "Western Washington University" even though the map has been centered on Sitka since 0.3.1, and now says "Sitka, AK".

**Files changed**
- `map/frontend/src/app/map/map.ts`

## 0.3.4 — 2026-10-26

Brought the existing map files in line with the rules in `documentation/CLAUDECODE/CLAUDE.md`:
- Added file headers and docstrings to all code. There are no behavior changes, and Prettier reformatted one import line.
- Added setup instructions and directory guides to the READMEs.
- Replaced the empty backend README and the Angular CLI boilerplate frontend README.
- Added a Conventions section to the plan.

**Files changed**
- `map/README.md`
- `map/backend/README.md`
- `map/backend/src/backend/__init__.py`
- `map/backend/tests/test_health.py`
- `map/frontend/README.md`
- `map/frontend/src/main.ts`
- `map/frontend/src/assets.d.ts`
- `map/frontend/src/app/app.config.ts`
- `map/frontend/src/app/app.routes.ts`
- `map/frontend/src/app/app.ts`
- `map/frontend/src/app/app.spec.ts`
- `map/frontend/src/app/map/map.ts`
- `map/frontend/src/app/services/api.ts`
- `documentation/map/map_app_plan.md`

## 0.3.3 — 2026-10-26

Revised the plan to cover both the frontend and the backend, and renamed it. The plan now centers on a generic layer system, so decisions about what goes on the map can be made later.

**Files changed**
- `documentation/map/flask_backend_plan.md` → `documentation/map/map_app_plan.md`

## 0.3.2 — 2026-10-26

Added a commit-by-commit plan for the Flask backend, which will serve Supabase station data to the Leaflet map.

**Files changed**
- `documentation/map/flask_backend_plan.md`

## 0.3.1 — 2026-10-21

Moved the map's initial view from WWU in Bellingham to Sitka, AK, and zoomed out from 14 to 10. (`089f45a`)

**Files changed**
- `map/frontend/src/app/map/map.ts`

## 0.3.0 — 2026-10-20

Added the map frontend and backend frame. The frontend is an Angular app with a Leaflet/OpenStreetMap map component and an `Api` service that calls the backend health check. The Flask backend has an `/api/health` endpoint on port 5001, and the dev server proxies `/api` to it. Added a root npm workspace with `dev:map`, `start:map`, and `backend:map` scripts, plus a backend health test. (`04b334f`)

**Files changed**
- `map/README.md`
- `map/backend/src/backend/__init__.py`
- `map/backend/tests/test_health.py`
- `map/frontend/.editorconfig`
- `map/frontend/.gitignore`
- `map/frontend/.prettierrc`
- `map/frontend/.vscode/extensions.json`
- `map/frontend/.vscode/launch.json`
- `map/frontend/.vscode/tasks.json`
- `map/frontend/README.md`
- `map/frontend/angular.json`
- `map/frontend/package.json`
- `map/frontend/proxy.conf.json`
- `map/frontend/public/favicon.ico`
- `map/frontend/src/app/app.config.ts`
- `map/frontend/src/app/app.html`
- `map/frontend/src/app/app.routes.ts`
- `map/frontend/src/app/app.scss`
- `map/frontend/src/app/app.spec.ts`
- `map/frontend/src/app/app.ts`
- `map/frontend/src/app/map/map.html`
- `map/frontend/src/app/map/map.scss`
- `map/frontend/src/app/map/map.ts`
- `map/frontend/src/app/services/api.ts`
- `map/frontend/src/assets.d.ts`
- `map/frontend/src/index.html`
- `map/frontend/src/main.ts`
- `map/frontend/src/styles.scss`
- `map/frontend/tsconfig.app.json`
- `map/frontend/tsconfig.json`
- `map/frontend/tsconfig.spec.json`
- Shared root files: `.gitignore`, `.nvmrc`, `.vscode/extensions.json`, `package.json`, `package-lock.json`

## 0.2.0 — 2026-10-20

Created the map backend as a uv Python project (Python 3.13) with Flask, Supabase, and pytest as dependencies. (`4b15438`)

**Files changed**
- `map/backend/.gitignore`
- `map/backend/.python-version`
- `map/backend/README.md`
- `map/backend/pyproject.toml`
- `map/backend/src/backend/__init__.py`
- `map/backend/uv.lock`

## 0.1.0 — 2026-10-20

Created the `map/` directory with a README outline. (`21f747c`)

**Files changed**
- `map/README.md`
