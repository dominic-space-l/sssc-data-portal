# Adding or Changing a Map Layer

How to change what the public map shows: a layer's fields and wording, its filters, its colors, or a whole new layer. The design behind it is in [map_app_plan.md](map_app_plan.md#core-idea-layers), and the JSON it produces is in [api.md](api.md).

## The rule that shapes everything

**The public map never sees anything the anon key can't, and the anon key can read no table.** A layer gets its data only from a database function that:
- returns a fixed list of columns
- masks any sensitive point with `map_private.mask_point`
- can be executed by `anon` and by nothing else

The backend calls that function and turns rows into display-ready JSON. The frontend draws whatever the backend describes. So most changes are one backend file, plus a migration when the data itself changes.

| You want to | Change |
| --- | --- |
| Reword a label, popup field, note, or option text | The layer module (`map/backend/src/backend/layers/<name>.py`) |
| Show a column the function already returns | The layer module |
| Show a new column | A migration changing the database function, then the layer module |
| Add a filter on existing data | The layer module (and the function, if it lacks the parameter) |
| Change marker colors or size | `map/frontend/src/app/layers/registry.ts` |
| Add a layer | A migration (new function), a new layer module, `REGISTRY`, and optionally a style entry |

## Changing an existing layer

### Fields, wording, and popups

In `layers/<name>.py`:
- **Popup:** `popup_fields` lists which feature properties appear, in order, with their labels. The keys must be properties that `features()` sets.
- **Notes:** `location_note` and `muted_label` are plain strings.
- **Values:** properties are **display-ready**. Format values in the module (as `stations.py` does with `code` → `"—"` and `active` → `"Yes"`/`"No"`/`"Unknown"`), not in the frontend.

Update the module's tests (`map/backend/tests/test_<name>.py`), which use rows shaped exactly like the function's output, and update [api.md](api.md) if the contract changes.

### Filters

A filter is a `FilterDef(key, label, FilterType.SELECT | MULTISELECT | BOOLEAN)` in the layer's `filters` tuple, in panel order. Then:

1. **Map it to the function's parameter.** In `stations.py`, add the key to `_RPC_PARAMS` (for example `"station_type": "p_station_types"`). Unset filters aren't sent, so the function must treat a missing or `null` parameter as "no filter". If the function lacks the parameter, add it in a migration first (see below).
2. **Give it options** (select and multiselect). Add a builder to `_OPTION_BUILDERS` that reads them from the `map_filter_options()` result. Add `hint=` or `implies=` to a `FilterOption` when it helps: `implies` sets other filters when the option is chosen (a project → its organization), and `hint` tags it ("No stations").
3. **Test it:** that the query parameter reaches the right function parameter, and that the manifest lists the options.

The frontend renders the new control automatically: a dropdown, a checkbox list, or a checkbox.

### Colors

- **Base marker color and size:** `LAYER_STYLES` in `map/frontend/src/app/layers/registry.ts`, by layer id.
- **Colors by value (`style_by`):** the backend layer declares `style_by` (which property, which filter turns it on, the fallback label), and its `options()` returns the values in color order. The frontend assigns the Okabe–Ito palette in that order. To pin one value's color, add it to `STYLE_BY_OVERRIDES` in `registry.ts` by label (for example `stations: { Owner: '#0072B2' }`). Keep it colorblind-safe: the legend and marker titles carry the labels, but color is still the main signal.

## Adding a layer

As an example, a "sites" layer, sketched step by step.

### 1. The database function (migration)

Follow [supabase/README.md](../../supabase/README.md#workflow-for-a-schema-change) and the [deployment guide](../deployment_guide.md). Model the function on `map_stations` (`supabase/migrations/20261113022518_s5_map_stations.sql`):

```sql
create or replace function public.map_sites(p_site bigint default null)
returns table (site_id bigint, name text, lon numeric, lat numeric)   -- only public columns
language sql stable security definer set search_path = ''
as $$
  select s."SiteID", s."SiteName", m.lon, m.lat
  from public."StationSites" s
  cross join lateral map_private.mask_point(s."SiteID", s."Longitude", s."Latitude") m
  where p_site is null or s."SiteID" = p_site
  order by s."SiteID";
$$;

revoke all on function public.map_sites(bigint) from public, anon, authenticated;
grant execute on function public.map_sites(bigint) to anon;
comment on function public.map_sites(bigint) is 'Public map sites with masked coordinates.';
```

- **Mask every sensitive point** through `map_private.mask_point`. Never return raw `Longitude`, `Latitude`, or `CoordinateLocation`. Note that `mask_point` derives the offset from the id it's given. Two kinds of thing whose ids overlap (station 1 and site 1) at the same spot would get the same offset. If that matters, have a migration add a salt per layer to `mask_point`.
- **Return only allowlisted columns.** No notes, contacts, or elevation unless they're meant to be public.
- **Add the function to `anon_functions`** in `supabase/tests/03_anon_rls.test.sql`. Otherwise the S3 test fails, which is the point: making a function public is a decision to review.
- **Write pgTAP tests** like `05_map_stations.test.sql`: anon can call it, the columns are exactly right, no point equals the truth, every point is 235–515 m off, and a missing secret raises.
- If the layer has filters, add its options to `map_filter_options` (a new key), or give the layer its own options function.

### 2. The backend layer module

Create `map/backend/src/backend/layers/sites.py` implementing the `Layer` protocol from `layers/base.py`:

```python
class SitesLayer:
    """Monitoring sites, at masked locations."""

    id = "sites"                      # lowercase, URL-safe, unique
    title = "Sites"
    default_visible = False           # at 1.0 there's no layer toggle, so hidden layers aren't drawn
    location_note = "Approximate location"
    muted_label = None
    popup_fields = (PopupField("name", "Site"),)
    filters = ()
    style_by = None

    def options(self, db):            # filter options and style_by values, for the manifest only
        return LayerOptions()

    def features(self, db, filters):  # parsed filters: every key present, None = unset
        return [
            point_feature(row["site_id"], row["lon"], row["lat"], {"name": row["name"], "muted": False})
            for row in db.rpc("map_sites", {})
        ]

    def detail(self, db, feature_id):  # Detail, or None for a 404
        rows = db.rpc("map_sites", {"p_site": feature_id})
        ...

SITES = SitesLayer()
```

Give every file, class, and function the header and docstrings required by [CLAUDE.md](../CLAUDECODE/CLAUDE.md). Talk to the database only through `db.rpc(...)`, never `supabase` directly. `db.py` translates failures into the API's 502 and 503.

### 3. Register it

Add `SITES` to `REGISTRY` in `layers/__init__.py`. The order there is the manifest order. The routes, the manifest, error handling, and caching all pick it up automatically.

### 4. Tests

Add `map/backend/tests/test_sites.py` using `FakeDatabase` (from `tests/fakes.py`) with rows shaped like the function's real output. See `test_stations.py` for the pattern. It covers the features, display-ready properties, no raw columns leaking, the manifest entry, detail and 404, and `MaskingUnavailableError` → 503. Then run `npm run test:backend`.

### 5. Frontend (usually nothing)

The frontend draws any `default_visible` layer from the manifest. Optionally, give it a marker style in `LAYER_STYLES` in `registry.ts`. Layers without one get the default gray. A layer that isn't `default_visible` needs the post-1.0 layer on/off control (see [After 1.0](map_app_plan.md#after-10)).

### 6. Check it for real

1. `npm run db:reset && npm run db:test` (the pgTAP tests, including the anon allowlist).
2. `npm run dev:map` against the local stack, and look at the layer in a browser.
3. From `map/backend`: `uv run pytest -m integration` with `SUPABASE_URL` and `SUPABASE_KEY` set. Extend `smoke_supabase.py` so it checks the new function, and, for sensitive points, that `--check-coordinates` covers the layer.
4. Add a [changelog](CHANGELOG.md) entry, and bump `map/backend/pyproject.toml` to match.
