# Environmental Monitoring Database Webmap
...
## Overview
...
## Architecture
...
### Backend
...
### Frontend
...
## Directory Guide
| Path | Contents |
| --- | --- |
| `backend/` | Flask API (uv project). See [backend/README.md](backend/README.md). |
| `backend/src/backend/` | App source: app factory, settings (`config.py`), routes (`api.py`), database access (`db.py`), and JSON errors (`errors.py`) |
| `backend/src/backend/layers/` | The layer framework (`base.py`) and the registry of layers the API serves (`__init__.py`) |
| `backend/scripts/` | `smoke_supabase.py`: checks the anon key's access on a real Supabase project |
| `backend/.env.example` | Template for the backend's local settings (`.env`) |
| `backend/tests/` | pytest tests |
| `frontend/` | Angular + Leaflet app. See [frontend/README.md](frontend/README.md). |
| `frontend/src/app/map/` | The Leaflet map page: draws every visible layer from the manifest |
| `frontend/src/app/core/` | API types (`models.ts`), the HTTP client (`map-api.ts`), and shared state (`map-state.ts`) |
| `frontend/src/app/layers/` | Marker styles per layer, the marker factory, and popups |
| `frontend/src/app/filter-panel/` | The filter panel, built from the manifest's filters |
| `frontend/src/app/status-badge/` | The backend health badge |
| `frontend/proxy.conf.json` | Dev proxy: `/api/*` → backend on port 5001 |

Planning docs and the changelog live in [`documentation/map/`](../documentation/map/).

## Usage
### Quickstart
Prerequisites: [Node.js](https://nodejs.org/) 24 (`nvm use` reads the repo's `.nvmrc`) and [uv](https://docs.astral.sh/uv/).

From the **repo root**:

```sh
npm install        # installs frontend deps for every app (npm workspaces)
npm run dev:map    # starts the Flask API and the Angular dev server together
```

Open http://localhost:4200. You should see a Leaflet map with the stations as waypoints (inactive ones greyed out), and the bottom-right badge should read `backend: ok`. Click a station for its name, code, and status.

The stations come from Supabase, so the backend needs `SUPABASE_URL` and `SUPABASE_KEY` (the anon key) in `backend/.env`. See [backend/README.md](backend/README.md#configuration). For local development, start the local database first (`npm run db:start`) and use its URL and key. Without them, the map still loads, but with no stations.

To run each side on its own:

| Part | Command (from repo root) | URL |
| --- | --- | --- |
| Frontend (Angular + Leaflet) | `npm run start:map` | http://localhost:4200 |
| Backend (Flask) | `npm run backend:map` (or `uv run backend` inside `map/backend/`) | http://localhost:5001/api/health |

In dev, the frontend proxies `/api/*` to the backend (`frontend/proxy.conf.json`). The API runs on port 5001 instead of 5000 because macOS AirPlay already uses 5000.
### Setup
One-time setup after cloning:

1. Install [Node.js](https://nodejs.org/) 24 (`nvm install && nvm use` in the repo root reads `.nvmrc`) and [uv](https://docs.astral.sh/uv/getting-started/installation/).
2. From the **repo root**, run `npm install`. This installs every frontend through npm workspaces. Don't run it inside `map/frontend/`.
3. In `map/backend/`, run `uv sync`. This creates `.venv` with the Python version in `.python-version`. `uv run` also does this automatically on first use.

### Troubleshooting
...
### Configuration
The backend reads `SUPABASE_URL`, `SUPABASE_KEY` (the anon key only), and `CACHE_MAX_AGE` from the environment or `backend/.env`. It starts without them. See [backend/README.md](backend/README.md#configuration). The frontend needs no configuration: in dev it proxies `/api/*` to the backend.

### Testing
...
### Development
...