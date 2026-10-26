# Map Changelog

Versioning follows `xx.yy.zz` (see [documentation/CLAUDECODE/CLAUDE.md](../CLAUDECODE/CLAUDE.md)):
`xx` = major feature, `yy` = steps/commits toward a major feature, `zz` = small updates and revisions.

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
