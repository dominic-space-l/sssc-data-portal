# Environmental Monitoring Database Webmap

A public web map of the Sitka Sound Science Center's environmental monitoring stations. Stations are drawn at **approximate (masked) locations**, can be filtered by project, organization, station type, and what they observe, and can be colored by an organization's role at each station.

## Overview
- **What it shows:** every monitoring station as a waypoint, about 250–500 m from its true location. Click one for its name, code, and whether it's active. Inactive stations are greyed out.
- **Filters:** project (projects with no stations are tagged "No stations"), organization, station type, and observation type ("Observes").
- **Role colors:** pick an organization to color each station by the role it holds there. One role is a solid marker, several make a pie, and stations without one are gray. Picking a project also selects the organization that runs it. A legend explains the colors.
- **Privacy:** true coordinates never leave the database for the public map. The backend can only call two database functions with the public anon key, and one of them masks every point. Contact details are never served. See [Location masking](../documentation/map/map_app_plan.md#location-masking).

The full contract between the backend and the frontend is in [documentation/map/api.md](../documentation/map/api.md).

## Architecture
```
 Supabase (Postgres)                Flask backend (map/backend)           Angular frontend (map/frontend)
 map_stations()        ◀── anon ──  layers/stations.py  ── /api/... ──▶   MapApi → MapState → MapView
 map_filter_options()     key       generic routes, errors, caching        filter panel, legend, popups
 (masked points, RLS)
```

Everything about *what* is on the map lives in a **layer** on the backend. The frontend draws whatever layers the backend's manifest describes, and knows no layer by name except for optional marker styles.

### Backend
Flask, in `backend/` (a uv project). It reads Supabase only through `rpc()` calls to the two map functions, using the anon key. It refuses a service-role key at startup.
- `layers/stations.py` turns `map_stations` rows into display-ready, masked GeoJSON points. Its filters map query parameters onto the function's parameters. Its options come from `map_filter_options`.
- `api.py` serves the generic routes: the manifest, features, and detail.
- `errors.py` returns JSON errors. A missing masking secret becomes a 503, never coordinates.
- `http_hooks.py` adds caching headers and request logging.

Details: [backend/README.md](backend/README.md).

### Frontend
Angular 22 with Leaflet, in `frontend/`.
- `MapState` holds the manifest, filter values, and load status as signals.
- `MapView` draws each visible layer, and redraws it when its filters change.
- `FilterPanel` builds controls from the manifest's filters.
- `Legend` explains the colors.
- Popups are built from the manifest's popup fields as text.

Zoom is capped at 14, because the points are approximate. Details: [frontend/README.md](frontend/README.md).

To add a layer or change what one shows, see [documentation/map/adding_a_layer.md](../documentation/map/adding_a_layer.md).

## Directory Guide
| Path | Contents |
| --- | --- |
| `backend/` | Flask API (uv project). See [backend/README.md](backend/README.md). |
| `backend/src/backend/` | App source: app factory, settings (`config.py`), routes (`api.py`), database access (`db.py`), JSON errors (`errors.py`), and caching and logging (`http_hooks.py`) |
| `backend/src/backend/layers/` | The layer framework (`base.py`), the stations layer (`stations.py`), and the registry of layers the API serves (`__init__.py`) |
| `backend/scripts/` | `smoke_supabase.py`: checks the anon key's access on a real Supabase project, and, with `--check-coordinates`, the masking |
| `backend/.env.example` | Template for the backend's local settings (`.env`) |
| `backend/tests/` | pytest tests (unit tests, and integration tests run with `-m integration`) |
| `frontend/` | Angular + Leaflet app. See [frontend/README.md](frontend/README.md). |
| `frontend/src/app/map/` | The Leaflet map page: draws every visible layer from the manifest, plus empty and error states |
| `frontend/src/app/core/` | API types (`models.ts`), the HTTP client (`map-api.ts`), and shared state (`map-state.ts`) |
| `frontend/src/app/layers/` | Marker styles per layer, role colors, the marker factory, and popups |
| `frontend/src/app/filter-panel/` | The filter panel, built from the manifest's filters |
| `frontend/src/app/legend/` | The legend: role colors and the "Inactive" entry |
| `frontend/src/app/status-badge/` | The backend health badge |
| `frontend/proxy.conf.json` | Dev proxy: `/api/*` → backend on port 5001 |

Planning docs, the API contract, the layer guide, and the changelog live in [`documentation/map/`](../documentation/map/). The database side (migrations, the map functions, deploys) is in [`supabase/`](../supabase/README.md).

## Usage
### Quickstart
Prerequisites: [Node.js](https://nodejs.org/) 24 (`nvm use` reads the repo's `.nvmrc`), [uv](https://docs.astral.sh/uv/), and Docker (for the local database).

From the **repo root**:

```sh
npm install                          # installs frontend deps for every app (npm workspaces)
npm run db:start                     # local Supabase with fictional seed stations
cp map/backend/.env.example map/backend/.env
#   then set SUPABASE_KEY in map/backend/.env to PUBLISHABLE_KEY from: npx supabase status -o env
npm run dev:map                      # starts the Flask API and the Angular dev server together
```

Open http://localhost:4200. You should see the seed stations near Sitka as waypoints (inactive ones greyed out), and the bottom-right badge should read `backend: ok`. Click a station for its name, code, and status. Try the filters at the top right.

To run each side on its own:

| Part | Command (from repo root) | URL |
| --- | --- | --- |
| Frontend (Angular + Leaflet) | `npm run start:map` | http://localhost:4200 |
| Backend (Flask) | `npm run backend:map` (or `uv run backend` inside `map/backend/`) | http://localhost:5001/api/health |

In dev, the frontend proxies `/api/*` to the backend (`frontend/proxy.conf.json`). The API runs on port 5001 instead of 5000 because macOS AirPlay already uses 5000.

### Setup
One-time setup after cloning:

1. Install [Node.js](https://nodejs.org/) 24 (`nvm install && nvm use` in the repo root reads `.nvmrc`), [uv](https://docs.astral.sh/uv/getting-started/installation/), and Docker.
2. From the **repo root**, run `npm install`. This installs every frontend through npm workspaces. Don't run it inside `map/frontend/`.
3. In `map/backend/`, run `uv sync`. This creates `.venv` with the Python version in `.python-version`. `uv run` also does this automatically on first use.
4. Copy `map/backend/.env.example` to `map/backend/.env` and set `SUPABASE_URL` and `SUPABASE_KEY` (see [Configuration](#configuration)).

### Troubleshooting
| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Badge says `backend: unreachable` | The Flask backend isn't running, or isn't on port 5001 | Start it with `npm run backend:map` (or use `npm run dev:map`). |
| "The map couldn't load its layers. The station database is not configured on this server." | `SUPABASE_URL` or `SUPABASE_KEY` isn't set | Fill in `map/backend/.env` and restart the backend. |
| The backend won't start: `ConfigError: SUPABASE_KEY is a service-role (secret) key` | The secret key was pasted into `.env` | Use the anon (publishable) key. The map must never hold the secret key. |
| "Stations couldn't be loaded. Station locations are temporarily unavailable." (503) | The Vault masking secret is missing, so the database refuses to serve any point | Create it: see "Hosted project: one-time manual steps" in [supabase/README.md](../supabase/README.md). Locally, `npm run db:reset` re-creates the seed secret. |
| "Stations couldn't be loaded. The station database could not be reached." (502) | Supabase is down, or the URL or key is wrong | Check `npx supabase status` locally, or the project's dashboard. The backend log has the cause. |
| "No stations match these filters." | The filters exclude every station | Change them, or use "Clear filters" in the filter panel. |
| Stations don't move when the data changes | Responses are cached for `CACHE_MAX_AGE` seconds (default 300) | Wait, or hard-reload. Set `CACHE_MAX_AGE=0` while developing. |

### Configuration
The backend reads `SUPABASE_URL`, `SUPABASE_KEY` (the anon key only), and `CACHE_MAX_AGE` from the environment or `backend/.env`. It starts without the Supabase settings, so `/api/health` works, but the map then shows an error instead of stations. See [backend/README.md](backend/README.md#configuration). The frontend needs no configuration: in dev it proxies `/api/*` to the backend.

### Testing
From the **repo root**:

```sh
npm run test:backend            # backend unit tests (pytest)
npm run lint:backend            # ruff lint and format check
npm test -w map-frontend        # frontend unit tests (Vitest)
npm run lint && npm run format:check
npm run build -w map-frontend   # production build
```

Against a real Supabase project (the local stack or the hosted one), from `map/backend/`:

```sh
SUPABASE_URL=... SUPABASE_KEY=<anon key> uv run pytest -m integration   # the whole stack
uv run python scripts/smoke_supabase.py                                  # anon key's access
uv run python scripts/smoke_supabase.py --check-coordinates              # masking; prompts for the service-role key
```

CI runs the unit tests, lint, format check, and build on every PR. The integration tests and smoke script need credentials, so run them by hand before a release and after any change to the database's access rules or map functions.

### Development
- **Change what the map shows** (fields, wording, filters, colors, or a new layer): follow [adding_a_layer.md](../documentation/map/adding_a_layer.md). Content changes go in the backend layer module. New columns need a Supabase migration that changes the map function.
- **The API contract** is [api.md](../documentation/map/api.md). Keep `frontend/src/app/core/models.ts` in step with it.
- **Never** read a table directly from the backend, return true coordinates, add a service-role key, or expose contact details. The masking rules are in [the map plan](../documentation/map/map_app_plan.md#location-masking).
- **Versioning:** each change gets a [changelog](../documentation/map/CHANGELOG.md) entry (`xx.yy.zz`). `backend/pyproject.toml` keeps the same version.
- Planned work after 1.0 is listed under ["After 1.0"](../documentation/map/map_app_plan.md#after-10) in the plan.
