# Plan: Map App (Flask Backend + Angular Frontend)

## Context

The map app has a frame in place: an Angular + Leaflet frontend (`map/frontend`) that shows a placeholder marker, and a Flask backend (`map/backend`) with a single `/api/health` route. Neither one reads from the Supabase database described in [`schema.md`](../schema.md) yet.

This plan builds the app end to end, up to version `1.0.0`. It has three parts:

- **Database setup** in Supabase (detailed in [supabase_plan.md](supabase_plan.md)): migrations, row-level security, location masking, and two functions the map calls.
- **A generic structure:** config, database access, an API, and a frontend that renders whatever the API describes.
- **The 1.0 features,** each as its own commit:
  - Stations appear as waypoints on the map, at a **masked** location rather than their true coordinates.
  - Clicking a station shows its `StationName`, `StationCode`, and `IsActive`.
  - Stations can be filtered by station type and observation type.
  - A **project** dropdown limits the map to that project's stations. Projects with no stations are still listed, tagged "No stations".
  - An **organization** dropdown shows the stations that organization has a `StationOrganizationRole` with, colored by role.
  - Selecting a project also selects the organization that runs it, so its roles color the markers.

### Scope

- **In scope:** the Supabase migrations and functions, the backend and frontend architecture, the generic layer system, the stations layer and the features above, tests, and docs.
- **After 1.0:** a station detail side panel, a layer on/off control (only useful once there is a second layer), marker clustering, and URL syncing of filters. See [After 1.0](#after-10).
- **Out of scope:** writes of any kind (the portal and `authentication/` own those), `authenticated`-role policies, and deployment.

## Core idea: layers

A **layer** is one set of things drawn on the map (for example stations or sites). Everything about the map's *content* lives in a layer definition. The rest of the app is generic and does not know which layers exist.

```
   Supabase                     Backend                                    Frontend
┌──────────────────┐ ┌──────────────────────────────────────┐     ┌────────────────────────────────────────┐
│ map_stations()   │ │ layers/stations.py   ← CONTENT       │     │ layers/registry.ts  ← STYLE (optional) │
│  filters, roles, │◀│   id, title                          │     │   marker icon/color per layer id;      │
│  masked lon/lat  │ │   rpc call + params                  │     │   palette for style_by values          │
│ map_filter_      │ │   to_feature(row) → GeoJSON          │     ├────────────────────────────────────────┤
│  options()       │ │   popup fields, filters, style_by    │     │ generic components, no layer knowledge:│
│                  │ ├──────────────────────────────────────┤     │   map view, filter panel, legend,      │
│ tables: no anon  │ │ layers/__init__.py  registry         │────▶│   popup                                │
│  access (RLS)    │ │ api.py  generic routes               │ JSON│ MapApi service, MapState service       │
└──────────────────┘ │ db.py, config.py, errors.py          │     └────────────────────────────────────────┘
                     └──────────────────────────────────────┘
```

**To change what's on the map**, you edit one backend file, `layers/<name>.py`, and optionally one style entry in `layers/registry.ts`. If the layer needs new columns, a Supabase migration changes the function it calls. Adding a layer means adding a module to the backend registry. The frontend picks it up from the manifest without code changes.

The layer definition sends display-ready content (labels and formatted values) as well as the raw data. That keeps decisions about wording and field selection on the backend, in one place.

The organization and project dropdowns fit this model as ordinary `select` filters. Four small, generic additions to the API carry the rest:
- An option can **imply** values for other filters (a project implies its organization).
- An option can carry a **hint** (a project with no stations is tagged "No stations").
- A layer can declare **`style_by`** to color markers by the values of one feature property, such as role ids.
- A feature can be **`muted`** (an inactive station is greyed out). The layer's `muted_label` names it in the legend.

The frontend implements all four without knowing about projects, organizations, roles, or station status.

## Location masking

Station coordinates are sensitive: an exact location makes equipment easy to find, tamper with, or steal. The map shows each station near its true position, but never at it.

### Decision

**A salted deterministic offset, applied in the database.** `HMAC(secret, StationID)` picks a bearing and a distance between **250 and 500 m**, and the station's point is moved by that much. No stations are exempt. The secret lives in Supabase Vault. The details are in [supabase_plan.md](supabase_plan.md), steps S3 and S4.

### Rules

1. **True coordinates never leave Postgres for the map.** The anon role can't read any table. It can only call `map_stations()`, which returns masked points. The Flask backend never sees a true coordinate, so it can't leak one.
2. **Allowlisted columns only.** `map_stations()` returns a fixed set of columns. `CoordinateLocation`, `StationSites` coordinates, elevation, and notes are never returned.
3. **Stable output.** A station's masked point is the same on every request. If it changed on each request, an attacker could average many responses back to the true point.
4. **Fail closed.** If the Vault secret is missing, `map_stations()` raises an error, and the backend returns `503` rather than any coordinates.
5. **Don't imply precision.** Coordinates are rounded to 4 decimal places. The map's `maxZoom` is capped at 14, and popups say "Approximate location".
6. **New layers follow the same pattern.** A layer that draws stations or other sensitive points gets them from a database function that masks them. `adding_a_layer.md` documents this.

### Alternatives considered

| Option | Why not |
| --- | --- |
| Snap to a grid | Stations in the same cell stack on one point, and the cell edges bound the true location. |
| Random jitter per request | Averaging repeated requests recovers the true point. |
| Circle instead of a point | Not a waypoint, and overlapping circles get cluttered. Could be added later on top of the offset. |
| Masking in the Flask backend | Anyone holding the anon key could still read true coordinates straight from Supabase. |

## Filter and color behavior

The stations layer has four filters. They combine with AND. Within a multiselect, any selected value matches.

| Filter | Control | Source | Matches a station when |
| --- | --- | --- | --- |
| `project` | dropdown (single) | All `OrganizationProjects`. Those with no stations are tagged "No stations". | `Stations.ProjectID` equals the project |
| `organization` | dropdown (single) | `Organizations` that have at least one `StationOrganizationRole` | the station has a role with the organization *(only when no project is selected; see below)* |
| `station_type` | multiselect | `StationTypes` | `Stations.StationTypeID` is one of the selected types |
| `observation_type` | multiselect | `ObservationTypes` | the station has a `StationObservations` row for one of the selected types |

How the organization and project dropdowns interact:

| Selected | Stations shown | Marker color |
| --- | --- | --- |
| Neither | All (subject to type filters) | Default station style |
| Organization only | Stations with at least one role for that organization | By role (see below) |
| Project | The project's stations. The organization dropdown is set to the project's managing organization (`OrganizationProjects.OrganizationID`). | By role with that organization. Project stations with no role for it are gray, shown in the legend as "No role with this organization". |
| Project, then a different organization picked by hand | The project's stations | By role with the organization picked |
| A project with no stations | None. A message on the map says "No stations are associated with *project name*". | — |

In short, **the organization always sets the colors, and it filters only when no project is selected.** `map_stations()` implements this rule in the database. The frontend only needs to know that the color is driven by the `roles` property whenever `organization` has a value.

Clearing the project also clears an organization that the project set, but keeps one the user picked by hand.

**Role colors:** one color per `StationRoles` row from a colorblind-safe palette (Okabe–Ito), assigned in `RoleID` order, with optional overrides by role title in `registry.ts`. A legend lists the roles whenever an organization is selected.

**Multiple roles:** a station can hold several roles with the same organization (the `StationOrganizationRole` primary key is organization + station + role). Its marker is a **pie**, with one equal slice per role in `RoleID` order. A station with one role is a solid circle in that role's color.

**Inactive stations** (`IsActive = false`) are **greyed out**: drawn at reduced opacity with a gray outline, so any role colors stay readable. They're still shown and clickable, and their popup says "Active: No". Stations with an unknown status (`IsActive` null) are drawn normally. The legend has an "Inactive" entry.

## API contract (generic)

All routes are `GET` and return JSON. Errors use the shape `{"error": {"code": "...", "message": "..."}}`.

| Route | Returns |
| --- | --- |
| `/api/health` | `{"status": "ok"}` (unchanged) |
| `/api/layers` | Manifest: every enabled layer, with its filters, popup fields, and `style_by` |
| `/api/layers/<layer>/features?<filters>` | GeoJSON `FeatureCollection` (masked coordinates) |
| `/api/layers/<layer>/features/<id>` | Detail for one feature, or 404 (no 1.0 UI uses it; kept for the post-1.0 detail panel) |

**Manifest entry** (stations, at 1.0):

```json
{
  "id": "stations",
  "title": "Stations",
  "default_visible": true,
  "location_note": "Approximate location",
  "muted_label": "Inactive",
  "popup_fields": [
    { "key": "name", "label": "Station" },
    { "key": "code", "label": "Code" },
    { "key": "active", "label": "Active" }
  ],
  "filters": [
    { "key": "project", "label": "Project", "type": "select",
      "options": [
        { "value": 4, "label": "Tide Gauges", "implies": { "organization": 2 } },
        { "value": 7, "label": "Snow Survey", "implies": { "organization": 5 },
          "hint": "No stations" }
      ] },
    { "key": "organization", "label": "Organization", "type": "select",
      "options": [{ "value": 2, "label": "Sitka Sound Science Center" }] },
    { "key": "station_type", "label": "Station type", "type": "multiselect",
      "options": [{ "value": 1, "label": "Weather" }] },
    { "key": "observation_type", "label": "Observes", "type": "multiselect",
      "options": [{ "value": 3, "label": "Wind Speed" }] }
  ],
  "style_by": {
    "property": "roles",
    "label": "Role",
    "active_when": "organization",
    "values": [{ "value": 1, "label": "Owner" }, { "value": 2, "label": "Maintainer" }],
    "fallback_label": "No role with this organization"
  }
}
```

- Filter `type` is `boolean`, `select`, or `multiselect`. Options are filled in from `map_filter_options()` when the manifest is built, so the frontend never needs separate lookup endpoints.
- `implies` (optional, per option): choosing this option also sets the named filters to these values.
- `hint` (optional, per option): a short tag the filter panel shows next to the option's label.
- `style_by` (optional): when the filter named in `active_when` has a value, color each marker by the values of `properties[property]`, a list. One value gives a solid marker, and several give a pie with one slice each. An empty list uses the fallback color.
- `muted_label` (optional): the legend label for features with `properties.muted` set to `true`.

**Feature:** a standard GeoJSON `Feature` with `id`, a `Point` geometry (masked), and flat `properties` that include the keys listed in `popup_fields`, plus the `style_by` property when it applies. `muted: true` draws the marker greyed out.

```json
{
  "type": "Feature",
  "id": 12,
  "geometry": { "type": "Point", "coordinates": [-135.3412, 57.0531] },
  "properties": { "name": "Sitka Harbor", "code": "SHB01", "active": "No", "muted": true, "roles": [1, 2] }
}
```

`active` is display-ready: `"Yes"`, `"No"`, or `"Unknown"` (`IsActive` is nullable). `code` is `"—"` when `StationCode` is null.

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

A section has either `fields` (label/value pairs) or `rows` (a table). `data` carries the raw values for any custom frontend component that wants them, and is subject to the same masking rules.

## Target layout

```
supabase/                    # see supabase_plan.md
├── config.toml
├── migrations/
└── tests/                   # pgTAP

map/backend/
├── .env.example
├── scripts/smoke_supabase.py
├── src/backend/
│   ├── __init__.py          # create_app(), main()
│   ├── config.py            # env loading
│   ├── db.py                # Database: Supabase client, rpc(), timeout, UpstreamError, MaskingUnavailable
│   ├── errors.py            # JSON error handlers
│   ├── api.py               # generic Blueprint routes
│   └── layers/
│       ├── __init__.py      # REGISTRY = [stations.LAYER, ...]
│       ├── base.py          # Layer, FilterDef, FilterOption, PopupField, StyleBy, Detail; filter parsing
│       └── stations.py      # stations layer
└── tests/
    ├── conftest.py          # app fixture, FakeDatabase, FakeLayer
    ├── test_health.py
    ├── test_layer_base.py   # filter parsing/validation
    ├── test_api.py          # generic routes against FakeLayer
    ├── test_stations.py     # stations layer against RPC-shaped fixture rows
    └── test_integration.py  # skipped unless SUPABASE_* are set

map/frontend/src/app/
├── core/
│   ├── models.ts            # LayerManifest, FilterDef, StyleBy, Detail, GeoJSON types
│   ├── map-api.ts           # MapApi (replaces services/api.ts)
│   └── map-state.ts         # MapState: manifest, filter values, implied values (signals)
├── layers/
│   ├── registry.ts          # per-layer style + style_by palette
│   └── markers.ts           # marker factory: default and segmented (per-role) markers
├── map/                     # MapView: Leaflet instance, draws visible layers, popups, empty state
├── filter-panel/            # renders controls from manifest FilterDefs
├── legend/                  # shows style_by colors when active
└── status-badge/            # existing backend status, pulled out of MapView
```

Data flow on the frontend: `MapState` holds the manifest and filter values. `MapView` reacts to it, fetches through `MapApi`, and draws with `L.geoJSON`. `FilterPanel` and `Legend` read and write only `MapState`. Components talk to each other only through `MapState`.

## Design decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Content location | Backend layer modules, backed by Supabase functions | One place to change wording and fields. The frontend stays generic. |
| DB access | `supabase-py` `rpc()` calls, wrapped in `Database` | One round trip per request. The wrapper adds a timeout and error translation, and is easy to fake in tests. |
| DB key | Supabase **anon key**, which can only call `map_stations()` and `map_filter_options()` | A leaked key exposes only what the public map already shows. The service-role key is never on this server. |
| Location privacy | Masked in Postgres. Fail closed. | True coordinates never reach the backend or a browser. See [Location masking](#location-masking). |
| Org/project behavior | `map_stations()` decides filtering. Manifest `implies`, `hint`, and `style_by` drive the frontend. | The frontend stays generic, and the rule lives next to the data. |
| Contacts | Never exposed to the public: no names, emails, or contact notes, in any layer | Personal data. `map_stations()` doesn't touch `Contacts` or `StationContact`, and anon can't read either table. |
| Frontend state | One signal-based `MapState` service | Components stay decoupled. URL syncing can be added later in one place. |
| Testing | pgTAP for the database rules. Generic backend code tested against `FakeLayer` and `FakeDatabase`, layers against RPC-shaped rows. | Each rule is tested where it's enforced, and changing content never breaks the framework tests. |

## Conventions (from `documentation/CLAUDECODE/CLAUDE.md`)

Every commit below follows these rules:
- **File headers:** every new `.py` file starts with a module docstring, and every new `.ts` file starts with a `/** @fileoverview ... */` block. Both state the file's role and how to use it. Every new migration starts with a SQL comment saying what it does and why.
- **Docstrings:** every function and class has one, including test functions. In Python they are Google style (`Args:`, `Returns:`, `Raises:`, plus a `Usage:` example). In TypeScript they are JSDoc (`@param`, `@return`, plus usage), with no type annotations in the JSDoc. Classes get at least a one-line summary. SQL functions get a `comment on function`.
- **Style:** Python follows PEP 8 and Google's Python style guide. TypeScript and Angular code follows the Angular v22 style guide and Google's TypeScript style guide; run `npm run format` and `npm run lint` before committing (CI checks both).
- **Design:** object-oriented and SOLID where it fits. Layers implement a shared `Layer` protocol (open/closed). Routes depend on `Layer` and `Database` abstractions, not on Supabase directly (dependency inversion). Each module has one job.
- **READMEs:** any new directory with its own README, and `map/README.md` itself, has at least a quickstart, setup instructions, and a directory guide. Commits that add folders update the directory guides.

## Commits

Each commit updates [`CHANGELOG.md`](CHANGELOG.md), including the Supabase steps. Backend commits keep `version` in `map/backend/pyproject.toml` in sync with it. Each commit is one step toward this major feature (`yy`), and the last commit bumps to `1.0.0`. After every commit, `supabase test db`, `uv run pytest` (in `map/backend`), `npm test`, and `npm run lint` (repo root) all pass, for whichever of them exist by then.

The Supabase steps (1–6) and the backend foundation (7–9) don't depend on each other and can be worked on in parallel. The versions below follow the recommended order. If commits land in a different order, each takes the next free `yy`. Commit 10 needs steps 1–6.

### Supabase (you; details in [supabase_plan.md](supabase_plan.md))

**1. Supabase CLI and baseline — `0.4.0`** (S1): `supabase/` in the repo, the current schema pulled as the first migration, and the pgTAP test folder.

**2. Foreign keys, identity fix, indexes, and station coordinates — `0.5.0`** (S2)

**2b. `StationSites` coordinates and elevation — `0.5.1`** (S2b): the same generated `geography` column and range checks as `Stations`, and `Elevation` renamed `Elevation (FT)`.

**3. Row-level security for `anon` — `0.6.0`** (S3): RLS on every table, and anon's table and sequence privileges revoked, so anon can reach data only through the S5/S6 functions.

**4. Masking secret and `mask_point` — `0.7.0`** (S4): 250–500 m offset with PostGIS `ST_Project`, secret in Vault. The hosted secret was created by hand on 2026-11-12 (see `supabase/README.md`).

**5. `map_stations` function — `0.8.0`** (S5): one call returns the filtered stations with masked points and the organization's roles at each. anon can execute it, and nothing else in `public`.

**6. `map_filter_options` function — `0.9.0`** (S6), including per-project station counts.

Each step adds its own pgTAP tests.

**S7. Deploy and drift-check workflows — next free `yy`:** a gated `supabase db push` on merge to `main`, plus a nightly read-only drift check against the hosted project. It can land any time after S3 and must land before commit 10.

### Backend foundation

**7. Config and dependencies — `0.10.0`**
- Add `python-dotenv`, and move `pytest` into a `dev` dependency group.
- `config.py`: a `Config` dataclass (`SUPABASE_URL`, `SUPABASE_KEY`, `CACHE_MAX_AGE`) loaded from the environment. Missing values do not prevent the app from booting, so `/api/health` still works.
- `create_app(config=None)`; add `.env.example`.

**8. Database access, errors, and blueprint — `0.11.0`**
- `db.py`: a `Database` class wrapping the Supabase client, with `rpc(name, params)` and a request timeout. Supabase failures are raised as `UpstreamError`. The "location masking is not configured" error (`P0001`) is raised as `MaskingUnavailable`. It is created lazily and stored in `app.extensions`.
- `errors.py`: JSON 400, 404, and 500 responses, with `UpstreamError` → 502 and `MaskingUnavailable` → 503. Details are logged on the server only.
- `api.py`: a Blueprint at `/api`, with `/api/health` moved into it unchanged.
- `scripts/smoke_supabase.py`: confirms that, with the anon key, `Stations` and `Contacts` **can't** be read and both functions **can** be called.

**9. Layer framework — `0.12.0`**
- `layers/base.py`: the `Layer` protocol (`id`, `title`, `default_visible`, `location_note`, `popup_fields`, `filters`, `style_by`, `features(db, filters)`, `detail(db, id)`). A `FilterDef` parses and validates query params, so invalid values return 400. `FilterOption` has optional `implies` and `hint`, and `StyleBy` is optional on a layer.
- `layers/__init__.py`: an empty `REGISTRY` plus `get_layer(id)`.
- Generic routes: `/api/layers`, `/api/layers/<layer>/features`, `/api/layers/<layer>/features/<id>`. An unknown layer returns 404.
- Tests run entirely against `FakeLayer` and `FakeDatabase`.

### Stations on the map

**10. Stations layer — `0.13.0`**
- `layers/stations.py`: `features()` calls `db.rpc("map_stations", {})` and turns each row into a feature with `name`, `code`, and `active` (display-ready) properties, `muted` (`true` when `is_active` is `false`), and the masked point. `location_note` is "Approximate location", and `muted_label` is "Inactive".
- Popup fields: Station, Code, Active. Detail: the same three fields, as one section, from the same function filtered to one id.
- Add it to `REGISTRY`. Tests use RPC-shaped fixture rows, plus a check that `MaskingUnavailable` from the fake database becomes a 503.

**11. Frontend models and API client — `0.14.0`**
- `core/models.ts` typed to match the API contract, including `FilterOption.implies`, `FilterOption.hint`, and `StyleBy`. `core/map-api.ts` (`health()`, `layers()`, `features(layer, filters)`, `detail(layer, id)`) replaces `services/api.ts`.
- Tests with `HttpTestingController`.

**12. Station waypoints and popups — `0.15.0`**
- `core/map-state.ts`: signals for the manifest, per-layer filter values, and loading/error state.
- `MapView`: loads the manifest, then draws each `default_visible` layer with `L.geoJSON`, using `layers/registry.ts` styles (or a default) and the marker factory in `layers/markers.ts`. Clicking a marker opens a popup built from `popup_fields`, plus `location_note`. Markers with `muted: true` are drawn greyed out (reduced opacity, gray outline). `maxZoom` is capped at 14.
- Remove the placeholder Sitka marker, and pull the status badge out into `status-badge/`.
- **Feature:** stations show up as waypoints, inactive ones greyed out, and present their name, code, and active status when clicked.

### Filtering and coloring

**13. Station type and observation type filters — `0.16.0`**
- Backend: `station_type` and `observation_type` multiselect filters on the stations layer. Options come from `map_filter_options()`. The selected values are passed as `p_station_types` and `p_observation_types`, or `null` when none are ticked.
- Frontend: `filter-panel/` renders a control for each `FilterDef` by type (`boolean` → checkbox, `select` → dropdown with an "All" entry, `multiselect` → checkbox list) and writes values to `MapState`. `MapView` redraws the layer when its filters change. The panel is generic, with no layer ids in its code.
- `MapView` shows an empty state when the layer returns no features ("No stations match these filters").
- **Feature:** filter stations by type and by what they observe.

**14. Project filter — `0.17.0`**
- Backend: a `project` select filter with every project as an option, sorted by name. Projects whose station count is 0 get `hint: "No stations"`. Passed as `p_project`.
- Frontend: the filter panel shows an option's `hint` as a muted tag after its label. When the selected option has a hint and the layer comes back empty, the empty state names it ("No stations are associated with *Snow Survey*").
- **Feature:** pick a project to see only its stations, and see at a glance which projects have none.

**15. Organization filter with role colors — `0.18.0`**
- Backend: an `organization` select filter, with options from `map_filter_options()` (organizations with at least one role). Passed as `p_organization`, and the rows' `roles` become `properties.roles`. The layer declares `style_by` with the roles from `map_filter_options()` as its values.
- Frontend: `layers/markers.ts` builds an SVG marker from the `style_by` palette in `registry.ts`, using Okabe–Ito colors in `RoleID` order: a solid circle for one role, and a pie with one equal slice per role for several. Markers with no roles use the fallback gray. Muted markers keep their slices but are greyed out. `legend/` shows the role colors while `style_by.active_when` has a value, plus the `muted_label` entry whenever any muted marker is on the map.
- **Feature:** pick an organization to see its stations, colored by its role at each one.

**16. Project selects its managing organization — `0.19.0`**
- Backend: each project option `implies` its `organization_id`. `map_stations()` already applies the rule that a project turns the organization into colors only. A test checks that both parameters are passed together.
- Frontend: `MapState.setFilter` applies `implies` and records which values it set. Clearing the project clears values it implied, unless the user has since changed them. The organization dropdown stays editable.
- **Feature:** picking a project shows its stations, colored by the roles of the organization that runs it.

### Wrap-up

**17. Hardening — `0.20.0`**
- Backend: a `Cache-Control` header on the layer routes (masked output is stable, so it caches well), request logging, and integration tests (`@pytest.mark.integration`).
- `smoke_supabase.py`: run with a service-role key supplied on the command line (never stored in config), it checks that no point from the live features route matches a true station location to 4 decimal places, and that every point is 250–500 m from its station.
- Frontend: a visible error state when the backend is down, a layer fails to load, or masking isn't configured (503).

**18. Documentation — `1.0.0`**
- `documentation/map/api.md`: the API contract, including `implies`, `hint`, `style_by`, and masking guarantees.
- `documentation/map/adding_a_layer.md`: a step-by-step guide to adding a layer or changing its fields, filters, and colors, including how to source points from a masking function.
- Fill in `map/README.md` (configuration, testing, smoke script) and `documentation/CLAUDECODE/map_context.md` (layout, layer conventions, the masking rules, no contact data).

## After 1.0

Each of these becomes its own `1.x` commit, and only touches the files listed.

| Item | Where it lives |
| --- | --- |
| Station detail side panel (install date, sensors, links) | A new Supabase function, `detail()` in `stations.py`, and a new `feature-detail/` component |
| Custom detail view for a layer | A new component plus a `detailComponent` entry in `registry.ts` |
| Layer on/off control (once there's a second layer) | A new `layer-control/` component |
| Marker clustering at low zoom | `map/` and `leaflet.markercluster` |
| Filters in the URL (shareable links) | `map-state.ts` |
| More layers (sites? projects?) | A Supabase function, `backend/layers/*.py`, `layers/__init__.py` |

## Verification

- After every commit: whichever of `supabase test db`, `uv run pytest`, `npm test`, and `npm run lint` exist by then.
- After commit 6: call both functions as anon from the Supabase SQL editor (`set role anon; select * from map_stations();`) and confirm that `select * from "Stations"` fails.
- After commit 8: run `uv run python scripts/smoke_supabase.py` against the real project.
- After commit 10: `curl localhost:5001/api/layers` and `curl localhost:5001/api/layers/stations/features | jq '.features | length'`. Temporarily rename the Vault secret and confirm a 503.
- After commit 12: `npm run dev:map`, open http://localhost:4200, check that the stations appear around Sitka, that inactive ones are greyed out, that clicking one shows its name, code, and active status, and that you can't zoom past 14.
- After commits 13–16: try each row of the [interaction table](#filter-and-color-behavior) in the browser, including a project with no stations. Check that the legend matches the marker colors, and that a station with several roles shows a pie.
- Before `1.0.0`: run `uv run pytest -m integration` with real credentials, and the smoke script's coordinate check.

## Open questions

None.
