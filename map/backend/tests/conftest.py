"""Shared pytest fixtures for the map backend.

Role: builds apps with an explicit ``Config`` so tests never read a developer's real
``.env`` or environment, and gives tests that do exercise environment loading a
clean, automatically restored environment.

Usage:
    def test_something(client): ...      # app with no Supabase configured
    def test_env(clean_env): ...          # SUPABASE_* and CACHE_MAX_AGE unset
"""

import pytest

from backend import create_app
from backend.config import Config

ENV_NAMES = ("SUPABASE_URL", "SUPABASE_KEY", "CACHE_MAX_AGE")


@pytest.fixture
def app():
    """An app with no Supabase settings, as on a fresh checkout.

    Returns:
        A Flask app built with ``Config()``.

    Usage:
        def test_x(app): assert app.config["MAP_CONFIG"] == Config()
    """
    return create_app(Config())


@pytest.fixture
def client(app):
    """A test client for the ``app`` fixture.

    Args:
        app: The ``app`` fixture.

    Returns:
        A Flask test client.

    Usage:
        def test_x(client): client.get("/api/health")
    """
    return app.test_client()


@pytest.fixture
def clean_env(monkeypatch):
    """Unsets the backend's variables and restores them after the test.

    Each one is set before it's deleted, so pytest records its original state and
    removes anything the test (or ``load_dotenv``) sets later.

    Args:
        monkeypatch: pytest's monkeypatch fixture.

    Returns:
        The same monkeypatch, for setting variables in the test.

    Usage:
        def test_x(clean_env): clean_env.setenv("SUPABASE_URL", "https://x")
    """
    for name in ENV_NAMES:
        monkeypatch.setenv(name, "placeholder")
        monkeypatch.delenv(name)
    return monkeypatch
