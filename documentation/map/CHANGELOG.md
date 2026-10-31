# Map Changelog

Versioning follows `xx.yy.zz` (see [documentation/CLAUDECODE/CLAUDE.md](../CLAUDECODE/CLAUDE.md)):
`xx` = major feature, `yy` = steps/commits toward a major feature, `zz` = small updates and revisions.

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
