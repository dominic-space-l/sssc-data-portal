# Map Backend

Flask API that serves data to the map frontend. It has settings from the environment, a Supabase database wrapper, JSON error responses, and a generic layer framework with its routes. No layers are registered yet: map commit 10 adds the stations layer. See [the map plan](../../documentation/map/map_app_plan.md) for what comes next.

## Quickstart
From the repo root:

```sh
npm run backend:map   # or, from this folder: uv run backend
curl http://localhost:5001/api/health   # → {"status": "ok"}
```

The server runs on port 5001 because macOS AirPlay uses 5000. The port is set by `PORT` in `src/backend/__init__.py` and must match `../frontend/proxy.conf.json`.

The app starts and `/api/health` works with no configuration at all. The map's data routes (from map commit 8 on) need the Supabase settings below.

## Setup
1. Install [uv](https://docs.astral.sh/uv/getting-started/installation/).
2. From this folder, run `uv sync`. This installs Python (version from `.python-version`), the dependencies, and the `dev` group (pytest, ruff) from `uv.lock` into `.venv`.
3. Optional until map commit 8: `cp .env.example .env` and fill in `SUPABASE_KEY` (see [Configuration](#configuration)).

To add a dependency, run `uv add <package>`, or `uv add --dev <package>` for test-only tools. Commit `pyproject.toml` and `uv.lock` with the change.

## Configuration
Settings come from environment variables. In development, the backend also loads `map/backend/.env` at startup (copy it from [`.env.example`](.env.example)). A variable set in the real environment wins over the file. `.env` is git-ignored: never commit it.

| Variable | Default | Meaning |
| --- | --- | --- |
| `SUPABASE_URL` | none | Supabase API URL. For the local stack (`npm run db:start` from the repo root), `http://127.0.0.1:54321`. |
| `SUPABASE_KEY` | none | The **anon (publishable)** key. For the local stack, `PUBLISHABLE_KEY` or `ANON_KEY` from `npx supabase status -o env`. |
| `CACHE_MAX_AGE` | `300` | Seconds browsers and proxies may cache layer responses. `0` disables caching. |

The backend refuses to start, with an error naming the variable, if:
- `SUPABASE_URL` doesn't start with `http://` or `https://`
- `SUPABASE_KEY` is a **service-role or secret key** (`sb_secret_…`, or a JWT whose role is `service_role`). Those keys bypass row-level security, and the map must only ever see what the anon role can: masked station locations through `map_stations` and `map_filter_options`.
- `CACHE_MAX_AGE` isn't a whole number of seconds, or is negative

Missing or blank Supabase settings are not an error, so a fresh checkout boots. In code, read settings with `backend.get_config()` inside a request, or pass a `Config` to `create_app(config)`, which tests always do.

## Database access and errors
Routes and layers call `get_database().rpc(name, params)` from `backend.db`, and never import `supabase`. The first call creates a `SupabaseDatabase` from the settings, with a 10-second timeout, and stores it in `app.extensions`. Tests pass a fake instead: `create_app(config, database=fake)`. With the anon key, the only functions that answer are `map_stations` and `map_filter_options`.

Every error response has the shape `{"error": {"code": "...", "message": "..."}}`:

| Cause | Status | `code` |
| --- | --- | --- |
| Bad request, unknown route, wrong method (`abort(400, description=...)` shows its message) | 400, 404, 405, ... | `bad_request`, `not_found`, `method_not_allowed`, ... |
| Supabase error, timeout, or unreachable (`UpstreamError`) | 502 | `upstream_error` |
| Masking secret missing in Vault (`MaskingUnavailableError`) | 503 | `masking_unavailable` |
| `SUPABASE_URL` or `SUPABASE_KEY` not set (`DatabaseNotConfiguredError`) | 503 | `database_not_configured` |
| Anything else | 500 | `internal_error` |

The messages for 5xx errors are fixed and generic. The cause (SQL error, hostname, traceback) is logged on the server and never sent to the browser.

## Layers and routes
Everything the map draws is a **layer**: a class in `src/backend/layers/<name>.py` that implements the `Layer` protocol in `layers/base.py`, with its instance listed in `REGISTRY` in `layers/__init__.py`. The routes are generic and work with whatever is registered:

| Route (GET) | Returns |
| --- | --- |
| `/api/health` | `{"status": "ok"}` |
| `/api/layers` | `{"layers": [...]}`, one manifest entry per layer, with filters (and their options), popup fields, and `style_by` |
| `/api/layers/<layer>/features?<filters>` | GeoJSON `FeatureCollection` |
| `/api/layers/<layer>/features/<id>` | The feature's detail, or 404 |

A layer has a static part: `id`, `title`, `popup_fields`, `filters` (`FilterDef`: key, label, type), and `style_by`. The features route parses query parameters with these alone. A layer also has three methods that take the database:
- `options(db)` returns filter options and `style_by` values, read only when the manifest is built
- `features(db, filters)` returns GeoJSON features with **masked** coordinates
- `detail(db, id)` returns a `Detail`, or `None` for a 404

**Filter query parameters** are whole-number ids:
- `select`: one value, e.g. `?project=4`
- `multiselect`: repeated or comma-separated values, e.g. `?station_type=1&station_type=2` or `?station_type=1,2`
- `boolean`: `true`/`false` or `1`/`0`

A blank value means "no filter", and the layer receives `None` for it. Each of these returns a 400 with a message naming the parameter: an unknown parameter, a non-numeric or oversized id, a single-value filter given twice, or more than 100 values in a multiselect. `/api/layers` doesn't touch the database when no layers are registered.

## Smoke test against a real project
`scripts/smoke_supabase.py` checks the access rules the map relies on, using the key the backend is configured with. The `Stations` and `Contacts` tables must refuse with *permission denied* (an empty result fails too). `mask_point` must be unreachable. `map_stations` must return only its seven public columns, and `map_filter_options` its five lists.

```sh
uv run python scripts/smoke_supabase.py                     # uses .env / the environment
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_KEY=<anon key> uv run python scripts/smoke_supabase.py
```

It prints only pass/fail lines and counts. It exits 0 if all checks pass, 1 if any fail, and 2 if Supabase isn't configured or the key is a service-role key. Run it against the hosted project after any change to grants, policies, or the map functions.

## Testing
```sh
uv run pytest
uv run ruff check && uv run ruff format --check   # lint and format, as CI runs them
```

Tests never read your `.env` or environment: fixtures in `tests/conftest.py` build the app with an explicit `Config`, and the tests of environment loading use a temporary `.env` and restore the environment afterwards.

## Directory Guide
| Path | Contents |
| --- | --- |
| `pyproject.toml` | Project metadata, version (kept in step with the map changelog), dependencies, the `dev` group, and the `backend` run script |
| `uv.lock` | Locked dependency versions (commit this) |
| `.python-version` | Python version uv uses |
| `.env.example` | Template for `.env`, the git-ignored local settings file |
| `src/backend/__init__.py` | App factory (`create_app`), `get_config`, and dev-server entry point (`main`) |
| `src/backend/config.py` | `Config`: loads and validates settings from the environment and `.env` |
| `src/backend/api.py` | The `/api` Blueprint: every route |
| `src/backend/db.py` | `Database` protocol, `SupabaseDatabase` (timeout, error translation), `get_database` |
| `src/backend/errors.py` | JSON error handlers |
| `src/backend/layers/__init__.py` | `REGISTRY` of layers, plus `get_layer` and `get_layers` |
| `src/backend/layers/base.py` | The `Layer` protocol, manifest and detail types, filter parsing, GeoJSON helpers |
| `scripts/smoke_supabase.py` | Checks the anon key's access on a real Supabase project |
| `tests/conftest.py` | Shared fixtures: `app` and `client` with no Supabase configured, and `clean_env` |
| `tests/fakes.py` | `FakeDatabase` (canned rpc results) and `FakeLayer` (one filter of each type) |
| `tests/` | pytest tests |
