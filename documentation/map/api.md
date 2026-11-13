# Map API

The contract between the map backend (`map/backend`) and the map frontend (`map/frontend`), as of map `1.0.0`. The backend produces it in `map/backend/src/backend/layers/base.py`, and the frontend types it in `map/frontend/src/app/core/models.ts`. Change all three together.

## Conventions

- Every route is `GET` and returns JSON. In development, the frontend reaches the backend through the dev proxy at `/api`.
- Field names are snake_case. Optional keys are **left out** when unset, not sent as `null`, except where a field is documented as nullable.
- Ids are whole numbers.

## Routes

| Route | Returns | Cached |
| --- | --- | --- |
| `GET /api/health` | `{"status": "ok"}`. Doesn't need the database. | never |
| `GET /api/layers` | The [manifest](#manifest): `{"layers": [<layer>, ...]}` | yes |
| `GET /api/layers/<layer>/features?<filters>` | A GeoJSON [FeatureCollection](#features) | yes |
| `GET /api/layers/<layer>/features/<id>` | One feature's [detail](#detail), or 404 | yes |

"Cached" means a `200` response carries `Cache-Control: public, max-age=CACHE_MAX_AGE` (default 300 seconds). Health and every error carry `Cache-Control: no-store`. Masked points don't change between requests, so caching them is safe, and an error is never cached past its fix.

## Manifest

One entry per layer, in the order the backend registers them. The stations layer at 1.0:

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
        { "value": 1, "label": "Project Alpha", "implies": { "organization": 1 } },
        { "value": 3, "label": "Project Empty", "implies": { "organization": 3 },
          "hint": "No stations" }
      ] },
    { "key": "organization", "label": "Organization", "type": "select",
      "options": [{ "value": 1, "label": "Test Org A" }] },
    { "key": "station_type", "label": "Station type", "type": "multiselect",
      "options": [{ "value": 2, "label": "Tide gauge" }] },
    { "key": "observation_type", "label": "Observes", "type": "multiselect",
      "options": [{ "value": 1, "label": "Air temperature" }] }
  ],
  "style_by": {
    "property": "roles",
    "label": "Role",
    "active_when": "organization",
    "values": [{ "value": 1, "label": "Owner" }, { "value": 2, "label": "Operator" }],
    "fallback_label": "No role with this organization"
  }
}
```

| Field | Meaning |
| --- | --- |
| `id` | URL-safe identifier (lowercase letters, digits, `-`, `_`) |
| `title` | Display name. The frontend also uses it in messages ("No stations match these filters."). |
| `default_visible` | Whether the map draws the layer on load. At 1.0, only these layers are drawn. |
| `location_note` *(optional)* | Shown at the bottom of every popup |
| `muted_label` *(optional)* | Legend label for features with `muted: true` |
| `popup_fields` | The feature properties shown in the popup, in order, with their labels |
| `filters` | The query parameters the features route accepts, in panel order (see [Filters](#filters)) |
| `style_by` *(optional)* | How markers are colored (see [style_by](#style_by)) |

### Filters

| `type` | Control | Query parameter | Value the backend receives |
| --- | --- | --- | --- |
| `select` | Dropdown with "All" | `?project=4` | one id |
| `multiselect` | Checkbox list | `?station_type=1,2` or `?station_type=1&station_type=2` | a list of ids. Duplicates are dropped, in order. At most 100. |
| `boolean` | Checkbox | `?live=true` (also `false`, `1`, `0`) | true or false. The frontend sends only `true`, and unchecked means no filter. |

- A missing or blank parameter means "no filter". The frontend leaves out null values and empty lists.
- Filters combine with AND. Within a multiselect, any selected value matches.
- These are all a `400` with a message naming the parameter: a parameter that isn't one of the layer's filters, an id that isn't an ASCII whole number up to 2⁶³−1, a select given twice, or more than 100 values.

Each option of a `select` or `multiselect` is `{"value", "label"}`, plus optionally:
- **`implies`:** other filters that choosing this option also sets, as `{filter_key: id}`. The frontend applies it only to a select's chosen option. Changing or clearing that select clears the values it set, unless the user has set them by hand since. At 1.0, each project implies its managing organization.
- **`hint`:** a short tag the filter panel shows after the label ("No stations"). If a chosen option has a hint and the layer comes back empty, the empty-state message names that option ("No stations are associated with Project Empty.").

### style_by

While the filter named by `active_when` has a value, each marker is colored by the values in `properties[property]`, a list of ids:
- one value: a solid marker in that value's color
- several: a pie with one equal slice per value, in list order
- an empty list: the fallback gray, labelled `fallback_label` in the legend

`values` lists every possible value in color order. The frontend gives them the Okabe–Ito palette in that order (colorblind-safe), with optional per-label overrides in `layers/registry.ts`. At 1.0, the stations layer colors by `roles` (RoleID order) while an organization is chosen. Marker titles also name the roles, so the coloring isn't carried by color alone.

## Features

A GeoJSON `FeatureCollection` of `Point` features:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": 1,
      "geometry": { "type": "Point", "coordinates": [-135.3341, 57.0511] },
      "properties": { "name": "Test Station 1", "code": "TS1", "active": "Yes", "muted": false,
                      "roles": [1, 3] }
    }
  ]
}
```

- **`geometry.coordinates`:** `[longitude, latitude]`, **masked** (see [Masking guarantees](#masking-guarantees)), rounded to 4 decimal places.
- **`properties`:** flat and display-ready. They include every `popup_fields` key, plus `muted` (the marker is greyed out), plus the `style_by` property when it applies.

Stations at 1.0:

| Property | Value |
| --- | --- |
| `name` | `StationName` |
| `code` | `StationCode`, or `"—"` when it's null or empty |
| `active` | `"Yes"`, `"No"`, or `"Unknown"` (`IsActive` is nullable) |
| `muted` | `true` when `IsActive` is `false`. Unknown status isn't muted. |
| `roles` | Present only when `organization` is set: the sorted role ids that organization holds at the station (`[]` for none) |

The organization filters the stations only when no project is chosen. With a project, it only supplies `roles`. The full behavior is the [interaction table](map_app_plan.md#filter-and-color-behavior).

## Detail

```json
{
  "id": 3,
  "title": "Test Station 3",
  "sections": [
    { "title": "Overview", "fields": [{ "label": "Station", "value": "Test Station 3" },
                                      { "label": "Code", "value": "TS3" },
                                      { "label": "Active", "value": "No" }] }
  ],
  "links": [],
  "data": { "code": "TS3", "is_active": false }
}
```

A section has either `fields` (label/value pairs) or `rows` (a table: a list of `{column label: value}` objects), never both. `links` are `{"label", "url"}`. `data` holds raw values for custom frontend components, under the same masking rules. The stations detail puts no location in it. A non-integer id or an unknown feature is a `404`. No 1.0 screen uses this route. It's kept for the post-1.0 detail panel.

## Errors

Every error has the same shape:

```json
{ "error": { "code": "masking_unavailable", "message": "Station locations are temporarily unavailable." } }
```

| Status | `code` | When |
| --- | --- | --- |
| 400 | `bad_request` | An unknown or invalid filter. The message names the parameter. |
| 404 | `not_found` | An unknown route, layer, or feature |
| 405 | `method_not_allowed` | A method the route doesn't accept, such as `POST` (Flask answers `HEAD` and `OPTIONS` on its own) |
| 500 | `internal_error` | An unexpected error. Details are logged on the server only. |
| 502 | `upstream_error` | Supabase failed, timed out (10 s), or rejected the call |
| 503 | `masking_unavailable` | The Vault masking secret is missing. The backend fails closed: no coordinates. |
| 503 | `database_not_configured` | `SUPABASE_URL` or `SUPABASE_KEY` isn't set on the server |

A 5xx `message` is a fixed sentence. The cause (SQL, hostnames, tracebacks) never reaches the client. The frontend shows the message under "*Stations* couldn't be loaded." with a Retry button.

## Masking guarantees

These hold for every point the API returns. They're enforced in the database, not in the backend:

1. **True coordinates never leave Postgres for the map.** The backend uses the anon key, which can read no table and can call only `map_stations` and `map_filter_options`. `map_stations` returns every point through `map_private.mask_point`. The backend refuses to start with a service-role key.
2. **Every point is 250–500 m from the truth,** in a direction and distance derived from `HMAC(Vault secret, station id)`, then rounded to 4 decimal places (about 11 m).
3. **Points are stable.** The same station always gets the same point, so repeated requests can't be averaged back to the truth.
4. **Fail closed.** Without the secret, `map_stations` raises and the API returns `503 masking_unavailable`, never an unmasked point.
5. **Allowlisted fields only.** No notes, elevation, site, contacts, or raw coordinates are returned. Adding a field means changing the database function in a reviewed migration.
6. **Don't imply precision.** The map caps zoom at 14, and popups say "Approximate location".

How to check them: `uv run python scripts/smoke_supabase.py --check-coordinates` in `map/backend` (see its README), and the pgTAP tests in `supabase/tests/04_mask_point.test.sql` and `05_map_stations.test.sql`.
