# Context for `map/` for AI coding agents

Read this before changing anything under `map/`, or the Supabase functions the map calls. The general rules (versioning, code style, READMEs) are in [CLAUDE.md](CLAUDE.md).

## What the map is

A public web map of monitoring stations. A Flask backend (`map/backend`) serves a generic layer API. An Angular 22 + Leaflet frontend (`map/frontend`) draws whatever the API's manifest describes. It reached `1.0.0` with one layer, `stations`, which has four filters and role colors.

- **The plan and design decisions:** [documentation/map/map_app_plan.md](../map/map_app_plan.md). Each step has a "Done" note saying what the implementation actually decided.
- **The API contract:** [documentation/map/api.md](../map/api.md)
- **How to add or change a layer:** [documentation/map/adding_a_layer.md](../map/adding_a_layer.md)
- **The database side:** [documentation/map/supabase_plan.md](../map/supabase_plan.md) and [supabase/README.md](../../supabase/README.md)
- **History:** [documentation/map/CHANGELOG.md](../map/CHANGELOG.md)

## Rules that must not be broken

1. **True coordinates never leave Postgres for the map.**
   - The backend reads data only through `db.rpc()` calls to `map_stations` and `map_filter_options`. Never query a table, and never return `Longitude`, `Latitude`, or `CoordinateLocation` from any route.
   - Every point the API serves comes from a database function that runs it through `map_private.mask_point`: 250–500 m off, stable per id, rounded to 4 decimals.
2. **Anon key only.** `Config` refuses a service-role or secret key at startup. Don't weaken that check. The one place a service-role key is used is `scripts/smoke_supabase.py --check-coordinates`, which prompts for it and never stores it. Never take it as an argument, or put it in `.env`, a test, or a log.
3. **No contact data, ever.** No names, emails, or notes from `Contacts`, `StationContact`, or any `*Notes` column, in any layer, property, detail, or log.
4. **Fail closed.** If masking isn't configured, `map_stations` raises, the API returns `503 masking_unavailable`, and the frontend shows an error. Never fall back to unmasked or approximate-in-Python points.
5. **Allowlisted columns.** A new public field means a reviewed migration changing the function's `returns table`. Its pgTAP tests check the exact column list, and the S3 test checks the anon allowlist (`supabase/tests/03_anon_rls.test.sql`).
6. **Don't imply precision.** Keep zoom capped at 14 (`MAX_ZOOM` in `map/map.ts`), and keep "Approximate location" in the popup.

## Layout

```
map/backend/src/backend/
  __init__.py      create_app(config, database, layers), get_config, main
  config.py        Config from env / map/backend/.env; refuses service-role keys
  db.py            Database protocol, SupabaseDatabase (10 s timeout), error translation
  errors.py        {"error": {code, message}}; 502 / 503 / 500 never leak causes
  http_hooks.py    Cache-Control (public on 200 layer responses, no-store otherwise), request log
  api.py           /api/health, /api/layers, /features, /features/<int:id>
  layers/base.py   Layer protocol, FilterDef/FilterOption/StyleBy/Detail, parse_filters
  layers/stations.py   the stations layer: _RPC_PARAMS and _OPTION_BUILDERS per filter
  layers/__init__.py   REGISTRY (manifest order), get_layer(s)
map/backend/tests/  fakes.py (FakeDatabase, FakeLayer), test_*.py, test_integration.py (-m integration)
map/frontend/src/app/
  core/models.ts       types mirroring api.md exactly (snake_case, readonly)
  core/map-api.ts      MapApi, filterParams, describeApiError
  core/map-state.ts    signals: manifest, filters (setFilter applies implies), layerLoads, reload
  map/                 MapView: draws visible layers via an effect; empty and error states
  layers/              registry.ts (styles, Okabe–Ito palette), style-by.ts, markers.ts, popup.ts
  filter-panel/, legend/, status-badge/
```

## Conventions

- **Layers own the content.** Wording, fields, filters, and display formatting live in the backend layer module. The frontend must not know layer or filter names. The only exception is optional styles in `layers/registry.ts`.
- **Properties are display-ready** (`"Yes"`/`"No"`/`"Unknown"`, `"—"` for a missing code), plus `muted`, plus the `style_by` property only when it applies.
- **Filters:**
  - A filter is a `FilterDef` mapped to a function parameter in `_RPC_PARAMS`, with options from `map_filter_options` built in `_OPTION_BUILDERS`.
  - Unset filters aren't sent to the RPC.
  - Query parsing (`base.py`) refuses unknown or invalid parameters with a 400 that names them.
- **Frontend safety and accessibility:**
  - Popups are built with `textContent`, and marker SVG takes only palette constants, so database values never become markup.
  - Markers are keyboard-focusable, and their titles name the roles while coloring is active.
- **Tests:**
  - Backend tests always build the app with an explicit `Config` and fakes. Fixture rows mirror real function output.
  - Frontend tests use a fake `MapApi` and real Leaflet in jsdom.
  - Integration tests and the smoke script need real credentials, and run by hand.
- **Commits:** one per plan step, with a changelog entry and `map/backend/pyproject.toml` bumped to match. PRs are per chunk of the plan. Record in the plan's "Done" notes anything the implementation decided that the plan didn't say.

## Gotchas

- **CLI 3 targets the local database by default.** Supabase CLI 3 commands target the *local* database unless given `--remote`. Hosted schema changes go only through the deploy workflow (see `supabase/README.md`).
- **Empty results without the secret.** `map_stations` with filters that match nothing can return `[]` without raising even when the masking secret is missing. Don't treat an empty result as proof that masking is configured.
- **Upstream deprecation warnings.** supabase-py 2.33 triggers `timeout`/`verify` deprecation warnings in postgrest-py, which pytest ignores on purpose (see `pyproject.toml`).
- **Locally, `vault.secrets` belongs to `supabase_admin`.** To test a missing masking secret by hand, rename it as `supabase_admin` and rename it back afterwards. `npm run db:reset` also restores it.
