"""Tests for the /api/health endpoint.

Role: confirms the app factory builds and the health route responds.

Usage:
    uv run pytest             # from map/backend/
"""

from backend import create_app


def test_health():
    """Checks that GET /api/health returns 200 and ``{"status": "ok"}``.

    Args:
        None.

    Usage:
        uv run pytest tests/test_health.py
    """
    client = create_app().test_client()
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}
