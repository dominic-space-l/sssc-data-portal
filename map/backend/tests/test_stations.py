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


def test_stations_take_no_filters_yet():
    """Until steps 13-16 add filters, any query parameter is a 400.

    Usage:
        uv run pytest -k no_filters_yet
    """
    db = FakeDatabase({"map_stations": ROWS})
    response = _client(db).get("/api/layers/stations/features?project=1")
    assert response.status_code == 400
    assert db.calls == []


# ---------------------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------------------


def test_manifest_entry():
    """The manifest entry matches the API contract, and needs no database call yet.

    Usage:
        uv run pytest -k manifest_entry
    """
    db = FakeDatabase()
    response = _client(db).get("/api/layers")
    assert response.status_code == 200
    assert response.get_json() == {
        "layers": [
            {
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
                "filters": [],
            }
        ]
    }
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
