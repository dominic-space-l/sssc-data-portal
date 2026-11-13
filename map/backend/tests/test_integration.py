"""Integration tests: the real app against a real Supabase project.

Role: runs the whole stack (routes, the stations layer, SupabaseDatabase, and the
database functions) against the project in SUPABASE_URL with the anon key in
SUPABASE_KEY. The tests assume nothing about the data beyond the API contract, so they
work against the local stack and the hosted project alike. They read only the real
environment, never map/backend/.env, and are deselected by default (see
``[tool.pytest.ini_options]`` in pyproject.toml).

Usage (from map/backend/):
    SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_KEY=<anon key> uv run pytest -m integration
"""

import os

import pytest

from backend import create_app
from backend.config import Config

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_KEY")),
        reason="needs SUPABASE_URL and SUPABASE_KEY (the anon key) in the environment",
    ),
]

STATION_PROPERTIES = {"name", "code", "active", "muted"}


@pytest.fixture(scope="module")
def client():
    """A test client for the real app, configured from the environment only.

    Returns:
        A Flask test client.

    Usage:
        def test_x(client): client.get("/api/layers")
    """
    return create_app(Config.from_env(dict(os.environ))).test_client()


@pytest.fixture(scope="module")
def manifest(client):
    """The stations layer's manifest entry.

    Args:
        client: The test client.

    Returns:
        The entry.

    Usage:
        def test_x(manifest): manifest["filters"]
    """
    response = client.get("/api/layers")
    assert response.status_code == 200
    layers = {layer["id"]: layer for layer in response.get_json()["layers"]}
    return layers["stations"]


def _features(client, query=""):
    """Fetches station features and checks the response is a FeatureCollection.

    Args:
        client: The test client.
        query: A query string, with its leading ``?``.

    Returns:
        The features.

    Usage:
        _features(client, "?project=1")
    """
    response = client.get(f"/api/layers/stations/features{query}")
    assert response.status_code == 200, response.get_json()
    body = response.get_json()
    assert body["type"] == "FeatureCollection"
    return body["features"]


def _options(manifest, key):
    """Returns a filter's options from the manifest.

    Args:
        manifest: The stations manifest entry.
        key: The filter key.

    Returns:
        The options.

    Usage:
        _options(manifest, "project")
    """
    return next(f for f in manifest["filters"] if f["key"] == key)["options"]


def test_manifest_lists_the_four_filters_and_roles(manifest):
    """The manifest has the four filters, in order, and style_by values.

    Args:
        manifest: The stations manifest entry.

    Usage:
        uv run pytest -m integration -k four_filters
    """
    assert [f["key"] for f in manifest["filters"]] == [
        "project",
        "organization",
        "station_type",
        "observation_type",
    ]
    assert manifest["style_by"]["active_when"] == "organization"
    assert all(isinstance(v["value"], int) for v in manifest["style_by"]["values"])


def test_features_are_masked_points_with_only_public_properties(client):
    """Every feature is a Point, rounded to 4 decimal places, with only public properties.

    Args:
        client: The test client.

    Usage:
        uv run pytest -m integration -k public_properties
    """
    features = _features(client)
    for feature in features:
        lon, lat = feature["geometry"]["coordinates"]
        assert feature["geometry"]["type"] == "Point"
        assert round(lon, 4) == lon and round(lat, 4) == lat
        assert set(feature["properties"]) == STATION_PROPERTIES
        assert feature["properties"]["active"] in {"Yes", "No", "Unknown"}


def test_a_feature_is_the_same_on_every_request(client):
    """Masked points are stable, so they can't be averaged back to the truth.

    Args:
        client: The test client.

    Usage:
        uv run pytest -m integration -k same_on_every_request
    """
    assert _features(client) == _features(client)


def test_hinted_projects_have_no_stations(client, manifest):
    """A project tagged with a hint returns no stations, and the others do.

    Args:
        client: The test client.
        manifest: The stations manifest entry.

    Usage:
        uv run pytest -m integration -k hinted_projects
    """
    for option in _options(manifest, "project"):
        features = _features(client, f"?project={option['value']}")
        assert (len(features) == 0) == ("hint" in option), option["label"]


def test_project_implies_its_organization_and_colors_by_its_roles(client, manifest):
    """With a project and its implied organization, every station carries a roles list.

    Args:
        client: The test client.
        manifest: The stations manifest entry.

    Usage:
        uv run pytest -m integration -k implies_its_organization
    """
    role_ids = {v["value"] for v in manifest["style_by"]["values"]}
    for option in _options(manifest, "project"):
        organization = option["implies"]["organization"]
        query = f"?project={option['value']}&organization={organization}"
        for feature in _features(client, query):
            roles = feature["properties"]["roles"]
            assert roles == sorted(roles)
            assert set(roles) <= role_ids


def test_detail_matches_the_feature_and_unknown_ids_are_404(client):
    """A station's detail has its name, and an id that can't exist is a 404.

    Args:
        client: The test client.

    Usage:
        uv run pytest -m integration -k detail_matches
    """
    features = _features(client)
    if features:
        first = features[0]
        response = client.get(f"/api/layers/stations/features/{first['id']}")
        assert response.status_code == 200
        assert response.get_json()["title"] == first["properties"]["name"]
    assert client.get(f"/api/layers/stations/features/{2**62}").status_code == 404


def test_invalid_filters_are_400(client):
    """A malformed filter is refused before the database is called.

    Args:
        client: The test client.

    Usage:
        uv run pytest -m integration -k invalid_filters
    """
    response = client.get("/api/layers/stations/features?station_type=abc")
    assert response.status_code == 400
    assert response.headers["Cache-Control"] == "no-store"
