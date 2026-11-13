"""Tests for the stations layer, against map_stations-shaped rows.

Role: checks that map_stations rows become the GeoJSON features, manifest entry, and
detail the API contract describes: display-ready name, code, and active status, muted
inactive stations, and the masked point passed through untouched. The fixture rows have
the exact shape map_stations returned from the local Supabase stack (seed data),
plus one station with an unknown status.

Usage:
    uv run pytest tests/test_stations.py      # from map/backend/
"""

import pytest
from fakes import FakeDatabase

from backend import create_app
from backend.config import Config
from backend.db import MaskingUnavailableError, UpstreamError
from backend.layers.stations import STATIONS

ROWS = [
    {"station_id": 1, "name": "Test Station 1", "code": "TS1", "is_active": True,
     "lon": -135.3341, "lat": 57.0511, "roles": None},
    {"station_id": 3, "name": "Test Station 3", "code": "TS3", "is_active": False,
     "lon": -135.2871, "lat": 57.0677, "roles": None},
    {"station_id": 4, "name": "Test Station 4", "code": None, "is_active": True,
     "lon": -135.4008, "lat": 57.0231, "roles": None},
    {"station_id": 5, "name": "Test Station 5", "code": "", "is_active": None,
     "lon": -135.3, "lat": 57.06, "roles": None},
]  # fmt: skip

# What map_filter_options returned from the local Supabase stack (seed data).
OPTIONS = {
    "projects": [
        {"id": 1, "name": "Project Alpha", "organization_id": 1, "station_count": 2},
        {"id": 2, "name": "Project Beta", "organization_id": 2, "station_count": 1},
        {"id": 3, "name": "Project Empty", "organization_id": 3, "station_count": 0},
    ],
    "organizations": [
        {"id": 1, "name": "Test Org A"},
        {"id": 2, "name": "Test Org B"},
        {"id": 3, "name": "Test Org C"},
    ],
    "station_types": [{"id": 2, "name": "Tide gauge"}, {"id": 1, "name": "Weather station"}],
    "observation_types": [
        {"id": 1, "name": "Air temperature"},
        {"id": 3, "name": "Precipitation"},
        {"id": 2, "name": "Water level"},
    ],
    "roles": [
        {"id": 1, "name": "Owner"},
        {"id": 2, "name": "Operator"},
        {"id": 3, "name": "Maintainer"},
    ],
}


def _client(db):
    """A test client serving the real layer registry against a fake database.

    Args:
        db: The FakeDatabase.

    Returns:
        A Flask test client.

    Usage:
        _client(FakeDatabase({"map_stations": ROWS}))
    """
    return create_app(Config(), db).test_client()


# ---------------------------------------------------------------------------------------
# Features
# ---------------------------------------------------------------------------------------


def test_features_are_display_ready_points_at_the_masked_location():
    """Each row becomes a Point feature with display-ready properties.

    Usage:
        uv run pytest -k display_ready
    """
    db = FakeDatabase({"map_stations": ROWS})
    features = STATIONS.features(db, {})

    assert db.calls == [("map_stations", {})]
    assert features[0] == {
        "type": "Feature",
        "id": 1,
        "geometry": {"type": "Point", "coordinates": [-135.3341, 57.0511]},
        "properties": {"name": "Test Station 1", "code": "TS1", "active": "Yes", "muted": False},
    }
    assert [f["id"] for f in features] == [1, 3, 4, 5]


@pytest.mark.parametrize(
    ("index", "active", "muted"),
    [(0, "Yes", False), (1, "No", True), (3, "Unknown", False)],
    ids=["active", "inactive", "unknown"],
)
def test_active_status_and_muting(index, active, muted):
    """Inactive stations are "No" and muted. Unknown status is drawn normally.

    Args:
        index: Which fixture row.
        active: The expected display value.
        muted: Whether the marker is greyed out.

    Usage:
        uv run pytest -k muting
    """
    properties = STATIONS.features(FakeDatabase({"map_stations": ROWS}), {})[index]["properties"]
    assert properties["active"] == active
    assert properties["muted"] is muted


@pytest.mark.parametrize("index", [2, 3], ids=["null-code", "empty-code"])
def test_missing_code_is_a_dash(index):
    """A null or empty StationCode shows as an em dash, never "None" or blank.

    Args:
        index: A fixture row with no code.

    Usage:
        uv run pytest -k missing_code
    """
    properties = STATIONS.features(FakeDatabase({"map_stations": ROWS}), {})[index]["properties"]
    assert properties["code"] == "—"


def test_only_popup_properties_and_muted_are_sent():
    """No raw column (roles, is_active, lon/lat) leaks into properties.

    Usage:
        uv run pytest -k only_popup
    """
    for feature in STATIONS.features(FakeDatabase({"map_stations": ROWS}), {}):
        assert set(feature["properties"]) == {"name", "code", "active", "muted"}


def test_features_route_returns_the_collection():
    """GET /api/layers/stations/features returns every station as a FeatureCollection.

    Usage:
        uv run pytest -k features_route
    """
    response = _client(FakeDatabase({"map_stations": ROWS})).get("/api/layers/stations/features")
    assert response.status_code == 200
    body = response.get_json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 4


def test_no_stations_is_an_empty_collection():
    """An empty result is an empty FeatureCollection, not an error.

    Usage:
        uv run pytest -k no_stations
    """
    response = _client(FakeDatabase({"map_stations": []})).get("/api/layers/stations/features")
    assert response.get_json() == {"type": "FeatureCollection", "features": []}


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (MaskingUnavailableError("location masking is not configured"), 503, "masking_unavailable"),
        (UpstreamError("database call map_stations failed"), 502, "upstream_error"),
    ],
)
def test_database_failures_are_not_coordinates(error, status, code):
    """With masking unconfigured the API fails closed with a 503, and Supabase errors are 502.

    Args:
        error: What map_stations raises.
        status: Expected status.
        code: Expected error code.

    Usage:
        uv run pytest -k not_coordinates
    """
    response = _client(FakeDatabase({"map_stations": error})).get("/api/layers/stations/features")
    assert response.status_code == status
    assert response.get_json()["error"]["code"] == code
    assert "features" not in response.get_json()


# ---------------------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("query", "params"),
    [
        ("", {}),
        ("?station_type=1", {"p_station_types": [1]}),
        ("?station_type=2,1", {"p_station_types": [2, 1]}),
        ("?observation_type=3&observation_type=1", {"p_observation_types": [3, 1]}),
        (
            "?station_type=1&observation_type=2",
            {"p_station_types": [1], "p_observation_types": [2]},
        ),
        ("?station_type=&observation_type=", {}),
        ("?project=3", {"p_project": 3}),
        ("?project=1&station_type=2", {"p_project": 1, "p_station_types": [2]}),
        ("?organization=2", {"p_organization": 2}),
    ],
    ids=[
        "none",
        "one-type",
        "two-types",
        "observations",
        "both",
        "blank",
        "project",
        "project+type",
        "organization",
    ],
)
def test_filters_become_map_stations_params(query, params):
    """Each set filter is passed as its map_stations parameter. Unset ones aren't sent.

    Args:
        query: The features query string.
        params: The expected map_stations params.

    Usage:
        uv run pytest -k map_stations_params
    """
    db = FakeDatabase({"map_stations": ROWS})
    response = _client(db).get(f"/api/layers/stations/features{query}")
    assert response.status_code == 200
    assert db.calls == [("map_stations", params)]


@pytest.mark.parametrize("query", ["?station_type=abc", "?colour=1"], ids=["bad-id", "unknown"])
def test_invalid_filters_are_a_400_before_any_database_call(query):
    """A malformed or unknown filter is refused without calling map_stations.

    Args:
        query: An invalid query string.

    Usage:
        uv run pytest -k before_any_database_call
    """
    db = FakeDatabase({"map_stations": ROWS})
    response = _client(db).get(f"/api/layers/stations/features{query}")
    assert response.status_code == 400
    assert db.calls == []


# ---------------------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------------------


def _manifest_entry():
    """Fetches the stations manifest entry from the API with canned options.

    Returns:
        The entry, and the FakeDatabase's calls.

    Usage:
        entry, calls = _manifest_entry()
    """
    db = FakeDatabase({"map_filter_options": OPTIONS})
    response = _client(db).get("/api/layers")
    assert response.status_code == 200
    (entry,) = response.get_json()["layers"]
    return entry, db.calls


def test_manifest_entry_describes_the_layer():
    """The static parts of the manifest entry match the API contract.

    Usage:
        uv run pytest -k describes_the_layer
    """
    entry, _ = _manifest_entry()
    assert {key: value for key, value in entry.items() if key not in ("filters", "style_by")} == {
        "id": "stations",
        "title": "Stations",
        "default_visible": True,
        "location_note": "Approximate location",
        "muted_label": "Inactive",
        "popup_fields": [
            {"key": "name", "label": "Station"},
            {"key": "code", "label": "Code"},
            {"key": "active", "label": "Active"},
        ],
    }


def test_manifest_filters_come_from_map_filter_options():
    """Every filter's options come from one map_filter_options call, in its order.

    Usage:
        uv run pytest -k come_from_map_filter_options
    """
    entry, calls = _manifest_entry()
    assert calls == [("map_filter_options", {})]
    assert entry["filters"] == [
        {
            "key": "project",
            "label": "Project",
            "type": "select",
            "options": [
                {"value": 1, "label": "Project Alpha"},
                {"value": 2, "label": "Project Beta"},
                {"value": 3, "label": "Project Empty", "hint": "No stations"},
            ],
        },
        {
            "key": "organization",
            "label": "Organization",
            "type": "select",
            "options": [
                {"value": 1, "label": "Test Org A"},
                {"value": 2, "label": "Test Org B"},
                {"value": 3, "label": "Test Org C"},
            ],
        },
        {
            "key": "station_type",
            "label": "Station type",
            "type": "multiselect",
            "options": [
                {"value": 2, "label": "Tide gauge"},
                {"value": 1, "label": "Weather station"},
            ],
        },
        {
            "key": "observation_type",
            "label": "Observes",
            "type": "multiselect",
            "options": [
                {"value": 1, "label": "Air temperature"},
                {"value": 3, "label": "Precipitation"},
                {"value": 2, "label": "Water level"},
            ],
        },
    ]


def test_manifest_style_by_colors_by_role_while_an_organization_is_chosen():
    """style_by colors markers by roles, with every role in RoleID order.

    Usage:
        uv run pytest -k colors_by_role
    """
    entry, _ = _manifest_entry()
    assert entry["style_by"] == {
        "property": "roles",
        "label": "Role",
        "active_when": "organization",
        "values": [
            {"value": 1, "label": "Owner"},
            {"value": 2, "label": "Operator"},
            {"value": 3, "label": "Maintainer"},
        ],
        "fallback_label": "No role with this organization",
    }


ORG_ROWS = [
    {**ROWS[0], "roles": [1, 3]},
    {**ROWS[1], "roles": [2]},
    {**ROWS[2], "roles": []},
]


def test_roles_are_a_property_only_when_an_organization_is_chosen():
    """With an organization, each feature carries its role ids ([] for none).

    Usage:
        uv run pytest -k only_when_an_organization
    """
    db = FakeDatabase({"map_stations": ORG_ROWS})
    response = _client(db).get("/api/layers/stations/features?organization=1")
    assert db.calls == [("map_stations", {"p_organization": 1})]
    assert [f["properties"]["roles"] for f in response.get_json()["features"]] == [
        [1, 3],
        [2],
        [],
    ]

    plain = STATIONS.features(FakeDatabase({"map_stations": ROWS}), {})
    assert all("roles" not in f["properties"] for f in plain)


def test_project_select_takes_one_project():
    """Project is a single-value filter: two projects is a 400.

    Usage:
        uv run pytest -k takes_one_project
    """
    db = FakeDatabase({"map_stations": ROWS})
    response = _client(db).get("/api/layers/stations/features?project=1&project=2")
    assert response.status_code == 400
    assert db.calls == []


# ---------------------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------------------


def test_detail_shows_the_popup_fields_for_one_station():
    """The detail calls map_stations for one id and shows the same three fields.

    Usage:
        uv run pytest -k detail_shows
    """
    db = FakeDatabase({"map_stations": [ROWS[1]]})
    response = _client(db).get("/api/layers/stations/features/3")
    assert response.status_code == 200
    assert db.calls == [("map_stations", {"p_station": 3})]
    assert response.get_json() == {
        "id": 3,
        "title": "Test Station 3",
        "sections": [
            {
                "title": "Overview",
                "fields": [
                    {"label": "Station", "value": "Test Station 3"},
                    {"label": "Code", "value": "TS3"},
                    {"label": "Active", "value": "No"},
                ],
            }
        ],
        "links": [],
        "data": {"code": "TS3", "is_active": False},
    }


def test_detail_has_no_coordinates():
    """The detail's raw data carries no location, masked or not.

    Usage:
        uv run pytest -k no_coordinates
    """
    detail = STATIONS.detail(FakeDatabase({"map_stations": [ROWS[0]]}), 1)
    assert not {"lon", "lat", "roles"} & set(detail.to_json()["data"])


def test_unknown_station_detail_is_a_404():
    """An id map_stations doesn't return is a JSON 404.

    Usage:
        uv run pytest -k unknown_station
    """
    response = _client(FakeDatabase({"map_stations": []})).get("/api/layers/stations/features/99")
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "not_found"
