"""Tests for backend.http_hooks: Cache-Control headers and request logging.

Role: checks that only successful layer responses are cacheable (for CACHE_MAX_AGE
seconds), that health and every error are ``no-store`` (so a temporary 503 can't be
cached), and that each request is logged with its method, path, and status.

Usage:
    uv run pytest tests/test_http_hooks.py      # from map/backend/
"""

import logging

import pytest
from fakes import FakeDatabase, FakeLayer

from backend import create_app
from backend.config import Config
from backend.db import MaskingUnavailableError

ROWS = [{"id": 1, "lon": -135.3341, "lat": 57.0511, "name": "First"}]
OPTIONS = {"groups": [], "tags": []}


def _client(results=None, cache_max_age=120):
    """A test client for an app serving FakeLayer.

    Args:
        results: FakeDatabase results, or the default rows and options.
        cache_max_age: The CACHE_MAX_AGE setting.

    Returns:
        A Flask test client.

    Usage:
        _client(cache_max_age=0)
    """
    db = FakeDatabase(results or {"fake_features": ROWS, "fake_options": OPTIONS})
    return create_app(Config(cache_max_age=cache_max_age), db, [FakeLayer()]).test_client()


@pytest.mark.parametrize(
    "path", ["/api/layers", "/api/layers/fake/features?kind=1", "/api/layers/fake/features/1"]
)
def test_successful_layer_responses_are_cacheable(path):
    """The manifest, features, and detail may be cached publicly for CACHE_MAX_AGE.

    Args:
        path: A layer route.

    Usage:
        uv run pytest -k cacheable
    """
    response = _client().get(path)
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "public, max-age=120"


def test_cache_max_age_zero_means_revalidate():
    """CACHE_MAX_AGE=0 still sends a header, with max-age=0.

    Usage:
        uv run pytest -k max_age_zero
    """
    response = _client(cache_max_age=0).get("/api/layers/fake/features")
    assert response.headers["Cache-Control"] == "public, max-age=0"


@pytest.mark.parametrize(
    ("path", "results", "status"),
    [
        ("/api/health", None, 200),
        ("/api/layers/fake/features?kind=x", None, 400),
        ("/api/layers/nope/features", None, 404),
        ("/api/layers/fake/features/99", None, 404),
        ("/api/nope", None, 404),
        (
            "/api/layers/fake/features",
            {"fake_features": MaskingUnavailableError("not configured")},
            503,
        ),
    ],
    ids=["health", "bad-filter", "unknown-layer", "unknown-feature", "unknown-route", "masking"],
)
def test_everything_else_is_no_store(path, results, status):
    """Health and every error are never cached, so a temporary 503 can't outlive its fix.

    Args:
        path: The request path.
        results: FakeDatabase results, or None for the defaults.
        status: The expected status.

    Usage:
        uv run pytest -k no_store
    """
    response = _client(results).get(path)
    assert response.status_code == status
    assert response.headers["Cache-Control"] == "no-store"


def test_each_request_is_logged(caplog):
    """One INFO line per request: method, path with query, status, duration.

    Args:
        caplog: pytest's log capture.

    Usage:
        uv run pytest -k logged
    """
    client = _client()
    with caplog.at_level(logging.INFO, logger="backend.requests"):
        client.get("/api/layers/fake/features?kind=1")
        client.get("/api/layers/nope/features")

    lines = [r.getMessage() for r in caplog.records if r.name == "backend.requests"]
    assert len(lines) == 2
    assert lines[0].startswith("GET /api/layers/fake/features?kind=1 200 ")
    assert lines[0].endswith("ms")
    assert lines[1].startswith("GET /api/layers/nope/features 404 ")
