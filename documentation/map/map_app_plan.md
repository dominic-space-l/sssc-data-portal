# Plan: Map App (Flask Backend + Angular Frontend)

## Context

The map app has a frame in place: an Angular + Leaflet frontend (`map/frontend`) that shows a placeholder marker, and a Flask backend (`map/backend`) with a single `/api/health` route. Neither one reads from the Supabase database described in [`assets/schema.md`](../../assets/schema.md) yet.

This plan builds the **structure** for the full app end to end: config, database access, an API, and a frontend that renders data from it. It deliberately **does not decide what goes on the map**. The structure lets you add, remove, or change map content later by editing a small, predictable set of files, and not by reworking routes or components.

### Scope

- **In scope:** the backend and frontend architecture, a generic layer system, one minimal "stations" layer to prove that the system works end to end, tests, and docs.
- **Deferred to you:** which layers exist, which fields appear in popups and detail panels, which filters are offered, and how markers look. See [Content decisions](#content-decisions-deferred).
- **Out of scope:** writes of any kind (the portal and `authentication/` own those) and deployment.

## Core idea: layers

A **layer** is one set of things drawn on the map (for example stations or sites). Everything about the map's *content* lives in a layer definition. The rest of the app is generic and does not know which layers exist.

```
                Backend                                    Frontend
┌──────────────────────────────────────┐     ┌────────────────────────────────────────┐
│ layers/stations.py   ← CONTENT       │     │ layers/registry.ts  ← STYLE (optional) │
│   id, title                          │     │   marker icon/color per layer id;      │
│   query (Supabase select)            │     │   default style if none                │
│   to_feature(row) → GeoJSON          │     ├────────────────────────────────────────┤
│   popup fields, filters, detail      │     │ generic components, no layer knowledge:│
├──────────────────────────────────────┤     │   map view, layer toggle, filter panel,│
│ layers/__init__.py  registry         │────▶│   popup, detail panel                  │
│ api.py  generic routes               │ JSON│ MapApi service, MapState service       │
│ db.py, config.py, errors.py          │     └────────────────────────────────────────┘
└──────────────────────────────────────┘
```

**To change what's on the map**, you edit one backend file, `layers/<name>.py`, and optionally one style entry in `layers/registry.ts`. Adding a layer means adding a module to the backend registry. The frontend picks it up from the manifest without code changes.

The layer definition sends display-ready content (labels and formatted values) as well as the raw data. That keeps decisions about wording and field selection on the backend, in one place. A layer that needs a custom look can still register its own detail component on the frontend (see commit 9).

## API contract (generic)

All routes are `GET` and return JSON. Errors use the shape `{"error": {"code": "...", "message": "..."}}`.

| Route | Returns |
| --- | --- |
| `/api/health` | `{"status": "ok"}` (unchanged) |
| `/api/layers` | Manifest: every enabled layer, with its filters and popup fields |
| `/api/layers/<layer>/features?<filters>` | GeoJSON `FeatureCollection` |
| `/api/layers/<layer>/features/<id>` | Detail for one feature, or 404 |

**Manifest entry:**

```json
{
  "id": "stations",
  "title": "Stations",
  "default_visible": true,
  "popup_fields": [{ "key": "name", "label": "Name" }],
  "filters": [
    { "key": "active", "label": "Active", "type": "boolean" },
    { "key": "observation_type", "label": "Observes", "type": "select",
      "options": [{ "value": 3, "label": "Wind Speed" }] }
  ]
}
```

Filter `type` is `boolean`, `select`, or `multiselect`. Options are filled in from lookup tables when the manifest is built, so the frontend never needs separate lookup endpoints.

**Feature:** a standard GeoJSON `Feature` with `id`, a `Point` geometry, and flat `properties` that include at least the keys listed in `popup_fields`.

**Detail:**

```json
{
  "id": 12,
  "title": "Sitka Harbor",
  "sections": [
    { "title": "Overview", "fields": [{ "label": "Installed", "value": "2019-06-01" }] },
    { "title": "Sensors",  "rows": [{ "Sensor": "Anemometer", "Height (m)": 10 }] }
  ],
  "links": [{ "label": "MesoWest", "url": "https://..." }],
  "data": { }
}
```

A section has either `fields` (label/value pairs) or `rows` (a table). `data` carries the raw values for any custom frontend component that wants them.

## Target layout

```
map/backend/
├── .env.example
├── scripts/smoke_supabase.py
├── src/backend/
│   ├── __init__.py          # create_app(), main()
│   ├── config.py            # env loading
│   ├── db.py                # Database: Supabase client + timeout + UpstreamError
│   ├── errors.py            # JSON error handlers
│   ├── api.py               # generic Blueprint routes
│   └── layers/
│       ├── __init__.py      # REGISTRY = [stations.LAYER, ...]
│       ├── base.py          # Layer, FilterDef, PopupField, Detail dataclasses; filter parsing
│       └── stations.py      # first layer (minimal)
└── tests/
    ├── conftest.py          # app fixture, FakeDatabase, FakeLayer
    ├── test_health.py
    ├── test_layer_base.py   # filter parsing/validation
    ├── test_api.py          # generic routes against FakeLayer
    ├── test_stations.py     # stations layer against fixture rows
    └── test_integration.py  # skipped unless SUPABASE_* are set

map/frontend/src/app/
├── core/
│   ├── models.ts            # LayerManifest, FilterDef, Detail, GeoJSON types
│   ├── map-api.ts           # MapApi (replaces services/api.ts)
│   └── map-state.ts         # MapState: visible layers, filter values, selection (signals)
├── layers/
│   └── registry.ts          # per-layer style + optional custom detail component
├── map/                     # MapView: Leaflet instance, draws visible layers
├── layer-control/           # toggle layers on/off
├── filter-panel/            # renders controls from manifest FilterDefs
├── feature-detail/          # side panel: generic sections/rows/links renderer
└── status-badge/            # existing backend status, pulled out of MapView
```

Data flow on the frontend: `MapState` holds what is visible and filtered. `MapView` reacts to it, fetches through `MapApi`, and draws with `L.geoJSON`. Clicking a feature sets the selection in `MapState`, and `FeatureDetail` reacts by fetching and rendering the detail. Components talk to each other only through `MapState`.

## Design decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Content location | Backend layer modules | One place to change content. The frontend stays generic. |
| DB access | `supabase-py` with embedded selects, wrapped in `Database` | Already a dependency. The wrapper adds a timeout and error translation, and is easy to fake in tests. |
| DB key | Supabase **anon key** + RLS `SELECT` policies | Read-only public map. The service-role key is never on this server. |
| Contacts | Never exposed by any layer | `Contacts.Email` is personal data. |
| Frontend state | One signal-based `MapState` service | Components stay decoupled. URL syncing can be added later in one place. |
| Testing | Generic code tested against `FakeLayer` and `FakeDatabase`; layers tested with fixture rows | Changing content never breaks the framework tests. |

## Commits

Each commit updates [`CHANGELOG.md`](CHANGELOG.md), and backend commits keep `version` in `map/backend/pyproject.toml` in sync with it. Each commit is one step toward this major feature (`yy`). The last commit bumps to `1.0.0`. After every commit, `uv run pytest` (in `map/backend`) and `npm test` (repo root) both pass.

### Backend foundation

**1. Config and dependencies — `0.4.0`**
- Add `python-dotenv`, and move `pytest` into a `dev` dependency group.
- `config.py`: a `Config` dataclass (`SUPABASE_URL`, `SUPABASE_KEY`, `CACHE_MAX_AGE`) loaded from the environment. Missing values do not prevent the app from booting, so `/api/health` still works.
- `create_app(config=None)`; add `.env.example`.

**2. Database access, errors, and blueprint — `0.5.0`**
- `db.py`: a `Database` class wrapping the Supabase client, with a request timeout. Supabase failures are raised as `UpstreamError`. It is created lazily and stored in `app.extensions`.
- `errors.py`: JSON 400, 404, and 500 responses, with `UpstreamError` → 502. Details are logged on the server only.
- `api.py`: a Blueprint at `/api`, with `/api/health` moved into it unchanged.
- `scripts/smoke_supabase.py`: confirms that the tables are readable with the anon key, that foreign-key embedding works, and that `Contacts` is **not** readable.

**3. Layer framework — `0.6.0`**
- `layers/base.py`: the `Layer` protocol (`id`, `title`, `default_visible`, `popup_fields`, `filters`, `features(db, filters)`, `detail(db, id)`) and a `FilterDef` that parses and validates query params, so invalid values return 400.
- `layers/__init__.py`: an empty `REGISTRY` plus `get_layer(id)`.
- Generic routes: `/api/layers`, `/api/layers/<layer>/features`, `/api/layers/<layer>/features/<id>`. An unknown layer returns 404.
- Tests run entirely against `FakeLayer` and `FakeDatabase`.

**4. Minimal stations layer — `0.7.0`**
- `layers/stations.py`: a feature for each station with `name` and a point geometry from `Stations.Longitude`/`Latitude`. One `active` filter and one detail section built from `Stations` columns only.
- Kept deliberately small. This layer is the template you will extend when you make your [content decisions](#content-decisions-deferred).
- Add it to `REGISTRY`, with tests against fixture rows.

### Frontend foundation

**5. Models and API client — `0.8.0`**
- `core/models.ts` typed to match the API contract. `core/map-api.ts` (`health()`, `layers()`, `features(layer, filters)`, `detail(layer, id)`) replaces `services/api.ts`.
- Tests with `HttpTestingController`.

**6. Map state and layer rendering — `0.9.0`**
- `core/map-state.ts`: signals for the manifest, visible layer ids, per-layer filter values, and the selected feature.
- `MapView`: loads the manifest, then draws each visible layer with `L.geoJSON`, using styles from `layers/registry.ts` (or a default style). Shows a generic popup built from `popup_fields`. Redraws a layer when its filters change.
- Remove the placeholder WWU marker, and pull the status badge out into `status-badge/`.

**7. Layer control and filter panel — `0.10.0`**
- `layer-control/`: one checkbox per manifest layer.
- `filter-panel/`: renders a control for each `FilterDef` by type (`boolean` → checkbox, `select` → dropdown, `multiselect` → checkbox list) and writes the values to `MapState`.
- Both are generic, with no layer ids in their code.

**8. Feature detail panel — `0.11.0`**
- `feature-detail/`: a side panel that fetches the detail for the selected feature and renders `sections` (fields or tables) and `links`. Includes loading, error, and close states.

### Wrap-up

**9. Extension points and hardening — `0.12.0`**
- `layers/registry.ts`: an optional `detailComponent` per layer, which `feature-detail` uses in place of the generic renderer when it's set.
- Backend: a `Cache-Control` header on the layer routes, request logging, and integration tests (`@pytest.mark.integration`).
- Frontend: a visible error state when the backend is down or a layer fails to load.

**10. Documentation — `1.0.0`**
- `documentation/map/api.md`: the API contract.
- `documentation/map/adding_a_layer.md`: a step-by-step guide to adding a layer or changing its fields, filters, and style.
- Fill in `map/README.md` (configuration, testing, smoke script) and `documentation/CLAUDECODE/map_context.md` (layout, layer conventions, no contact data).

## Content decisions (deferred)

You decide these. Each one becomes its own small commit after (or between) the commits above, and only touches the files listed.

| Decision | Where it lives |
| --- | --- |
| Which layers exist (stations only? sites? projects?) | `backend/layers/*.py`, `layers/__init__.py` |
| Popup fields per layer | `popup_fields` in the layer module |
| Filters per layer and their option sources | `filters` in the layer module |
| Detail sections, tables, links | `detail()` in the layer module |
| Marker icons and colors | `frontend/src/app/layers/registry.ts` |
| Custom detail view for a layer | A new component plus a `detailComponent` entry in `registry.ts` |
| Initial map view and zoom | `frontend/src/app/map/map.ts` |

## Verification

- `uv run pytest` (backend) and `npm test` (repo root) after every commit.
- After commit 2: run `uv run python scripts/smoke_supabase.py` against the real project.
- After commit 4: `curl localhost:5001/api/layers` and `curl localhost:5001/api/layers/stations/features | jq '.features | length'`.
- After commits 6–8: `npm run dev:map`, open http://localhost:4200, and check that the stations appear around Sitka, that toggling the layer and changing the filter redraw the map, and that clicking a station opens the detail panel.
- Before `1.0.0`: run `uv run pytest -m integration` with real credentials.

## Open questions

1. **Supabase setup:** do foreign keys exist for the schema's relationships, and can you add RLS policies? Commit 2's smoke script checks both.
2. **Database views:** if you can add Postgres views, layers could select from a view (for example `map_stations`) in place of large embedded selects.
3. **Schema quirk:** several linking tables mark `StationID` as an *Identity* column. That is probably an artifact of the schema export, but please confirm.
4. **Contacts:** should any layer ever show maintainer names (without email)? The default is no.
