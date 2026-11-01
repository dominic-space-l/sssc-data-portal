# Map Changelog

Versioning follows `xx.yy.zz` (see [documentation/CLAUDECODE/CLAUDE.md](../CLAUDECODE/CLAUDE.md)):
`xx` = major feature, `yy` = steps/commits toward a major feature, `zz` = small updates and revisions.

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
