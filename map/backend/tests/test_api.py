"""Tests for the generic layer routes in backend.api, against FakeLayer and FakeDatabase.

Role: checks the manifest, features, and detail routes without Supabase or a real
layer: parsed filters reach the layer, invalid filters are a 400, unknown layers and
features are a 404, database failures keep their status, and the layer registry
refuses bad ids.

Usage:
    uv run pytest tests/test_api.py      # from map/backend/
"""

import pytest
from fakes import FakeDatabase, FakeLayer

from backend import create_app
from backend.config import Config
from backend.db import MaskingUnavailableError, UpstreamError
from backend.layers import REGISTRY, get_layers

ROWS = [
    {"id": 1, "lon": -135.3341, "lat": 57.0511, "name": "First"},
    {"id": 2, "lon": -135.3368, "lat": 57.0417, "name": "Second"},
]
OPTIONS = {"groups": [[4, "Group A", None, None]], "tags": [[1, "Red"]]}


def _client(db=None, layers=None, config=None):
    """A test client for an app serving fake layers.

    Args:
        db: The FakeDatabase, or a new one with ROWS and OPTIONS.
        layers: The layers, or a single FakeLayer.
        config: The Config, or ``Config()``.

    Returns:
        A Flask test client.

    Usage:
        _client(FakeDatabase({"fake_features": []}))
    """
    db = db if db is not None else FakeDatabase({"fake_features": ROWS, "fake_options": OPTIONS})
    layers = layers if layers is not None else [FakeLayer()]
    return create_app(config or Config(), db, layers).test_client()


# ---------------------------------------------------------------------------------------
# /api/layers
# ---------------------------------------------------------------------------------------


def test_registry_serves_the_stations_layer():
    """REGISTRY lists the stations layer, which create_app serves by default.

    Usage:
        uv run pytest -k registry_serves
    """
    assert [layer.id for layer in REGISTRY] == ["stations"]
    app = create_app(Config(), FakeDatabase())
    with app.app_context():
        assert [layer.id for layer in get_layers()] == ["stations"]


def test_manifest_with_no_layers_needs_no_database(client):
    """With no layers, the manifest is empty and Supabase isn't needed.

    Args:
        client: Client for an app with no Supabase settings and no layers.

    Usage:
        uv run pytest -k needs_no_database
    """
    response = client.get("/api/layers")
    assert response.status_code == 200
    assert response.get_json() == {"layers": []}


def test_manifest_lists_layers_in_order_with_options():
    """Each layer's entry is built with its options, in registry order.

    Usage:
        uv run pytest -k lists_layers
    """
    db = FakeDatabase({"fake_options": OPTIONS})
    response = _client(db, [FakeLayer("first"), FakeLayer("second")]).get("/api/layers")
    assert response.status_code == 200
    layers = response.get_json()["layers"]
    assert [layer["id"] for layer in layers] == ["first", "second"]
    assert layers[0]["filters"][0]["options"] == [{"value": 4, "label": "Group A"}]
    assert layers[0]["style_by"]["values"] == [{"value": 1, "label": "Red"}]
    assert db.calls == [("fake_options", {}), ("fake_options", {})]


def test_manifest_without_database_settings_is_a_503():
    """Layers need the database for options. Without settings, that's a clean 503.

    Usage:
        uv run pytest -k without_database_settings
    """
    client = create_app(Config(), layers=[FakeLayer()]).test_client()
    response = client.get("/api/layers")
    assert response.status_code == 503
    assert response.get_json()["error"]["code"] == "database_not_configured"


# ---------------------------------------------------------------------------------------
# /api/layers/<layer>/features
# ---------------------------------------------------------------------------------------


def test_features_returns_a_feature_collection():
    """The layer's features come back as a GeoJSON FeatureCollection.

    Usage:
        uv run pytest -k feature_collection
    """
    response = _client().get("/api/layers/fake/features")
    assert response.status_code == 200
    body = response.get_json()
    assert body["type"] == "FeatureCollection"
    assert [f["id"] for f in body["features"]] == [1, 2]
    assert body["features"][0] == {
        "type": "Feature",
        "id": 1,
        "geometry": {"type": "Point", "coordinates": [-135.3341, 57.0511]},
        "properties": {"name": "First"},
    }


def test_features_passes_every_filter_parsed():
    """The layer receives every filter key, parsed, with None for absent ones.

    Usage:
        uv run pytest -k every_filter_parsed
    """
    db = FakeDatabase({"fake_features": []})
    response = _client(db).get("/api/layers/fake/features?kind=2,1&kind=3&group=4")
    assert response.status_code == 200
    assert response.get_json() == {"type": "FeatureCollection", "features": []}
    assert db.calls == [("fake_features", {"group": 4, "kind": [2, 1, 3], "live": None})]


@pytest.mark.parametrize(
    ("query", "message"),
    [
        ("group=abc", "group must be a whole-number id."),
        ("group=1&group=2", "group takes a single value."),
        ("kind=1,x", "kind must be a whole-number id."),
        ("live=maybe", "live must be true or false."),
        ("colour=red", "Unknown filter: colour."),
    ],
)
def test_invalid_filters_are_a_400_with_a_message(query, message):
    """Invalid query parameters return 400 bad_request, and the layer isn't called.

    Args:
        query: The query string.
        message: The expected error message.

    Usage:
        uv run pytest -k invalid_filters
    """
    db = FakeDatabase()
    response = _client(db).get(f"/api/layers/fake/features?{query}")
    assert response.status_code == 400
    assert response.get_json() == {"error": {"code": "bad_request", "message": message}}
    assert db.calls == []


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (MaskingUnavailableError("not configured"), 503, "masking_unavailable"),
        (UpstreamError("down"), 502, "upstream_error"),
    ],
)
def test_database_failures_keep_their_status(error, status, code):
    """A database failure inside a layer reaches the client with its own status.

    Args:
        error: What the fake database raises.
        status: The expected HTTP status.
        code: The expected error code.

    Usage:
        uv run pytest -k keep_their_status
    """
    response = _client(FakeDatabase({"fake_features": error})).get("/api/layers/fake/features")
    assert response.status_code == status
    assert response.get_json()["error"]["code"] == code


def test_unknown_layer_is_a_404():
    """A layer id that isn't registered is a JSON 404.

    Usage:
        uv run pytest -k unknown_layer
    """
    response = _client().get("/api/layers/nope/features")
    assert response.status_code == 404
    assert response.get_json() == {
        "error": {"code": "not_found", "message": "No layer with that id."}
    }


# ---------------------------------------------------------------------------------------
# /api/layers/<layer>/features/<id>
# ---------------------------------------------------------------------------------------


def test_detail_returns_the_feature():
    """A known id returns its Detail.

    Usage:
        uv run pytest -k detail_returns
    """
    response = _client().get("/api/layers/fake/features/2")
    assert response.status_code == 200
    assert response.get_json() == {
        "id": 2,
        "title": "Second",
        "sections": [{"title": "Overview", "fields": [{"label": "Name", "value": "Second"}]}],
        "links": [],
        "data": {},
    }


@pytest.mark.parametrize(
    "path",
    ["/api/layers/fake/features/99", "/api/layers/nope/features/1", "/api/layers/fake/features/x"],
    ids=["unknown-feature", "unknown-layer", "non-integer-id"],
)
def test_missing_detail_is_a_404(path):
    """An unknown feature, an unknown layer, or a non-integer id is a JSON 404.

    Args:
        path: The detail URL.

    Usage:
        uv run pytest -k missing_detail
    """
    response = _client().get(path)
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "not_found"


# ---------------------------------------------------------------------------------------
# Registry validation
# ---------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("ids", "message"),
    [
        (["fake", "fake"], "Two layers"),
        (["Stations"], "URL-safe"),
        (["two words"], "URL-safe"),
        (["1st"], "URL-safe"),
    ],
)
def test_registry_refuses_bad_layer_ids(ids, message):
    """Duplicate ids and ids that aren't lowercase and URL-safe stop the app starting.

    Args:
        ids: The layer ids to register.
        message: Part of the expected error.

    Usage:
        uv run pytest -k bad_layer_ids
    """
    with pytest.raises(ValueError, match=message):
        create_app(Config(), FakeDatabase(), [FakeLayer(layer_id) for layer_id in ids])
