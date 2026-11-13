"""Tests for the /api/health endpoint.

Role: confirms the app factory builds and the health route responds, including when
no Supabase settings are configured.

Usage:
    uv run pytest             # from map/backend/
"""


def test_health(client):
    """Checks that GET /api/health returns 200 and ``{"status": "ok"}``.

    The ``client`` fixture's app has no Supabase settings, so this also checks that
    health doesn't depend on them.

    Args:
        client: Test client for an app built with ``Config()``.

    Usage:
        uv run pytest tests/test_health.py
    """
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}
