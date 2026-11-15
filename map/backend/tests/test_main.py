"""Tests for the dev-server entry point, backend.main.

Role: checks that ``uv run backend`` starts the app on localhost only, on PORT, and that
PORT matches the Angular dev server's proxy target, which the frontend relies on. The
app factory is replaced, so no server starts and no ``.env`` is read.

Usage:
    uv run pytest tests/test_main.py      # from map/backend/
"""

import json
from pathlib import Path

import backend

PROXY_CONF = Path(__file__).resolve().parents[2] / "frontend" / "proxy.conf.json"


class FakeApp:
    """Records how ``run`` was called instead of starting a server."""

    def __init__(self):
        """Starts with no recorded run.

        Usage:
            FakeApp()
        """
        self.run_kwargs = None

    def run(self, **kwargs):
        """Records the arguments.

        Args:
            **kwargs: What ``main`` passed to ``Flask.run``.

        Usage:
            app.run(host="127.0.0.1", port=5001)
        """
        self.run_kwargs = kwargs


def test_main_runs_the_app_on_localhost_and_port(monkeypatch):
    """Checks that main builds the app from the environment and serves it on 127.0.0.1:PORT.

    Args:
        monkeypatch: pytest's monkeypatch fixture.

    Usage:
        uv run pytest tests/test_main.py -k localhost
    """
    fake = FakeApp()
    calls = []

    def fake_create_app(*args, **kwargs):
        calls.append((args, kwargs))
        return fake

    monkeypatch.setattr(backend, "create_app", fake_create_app)
    monkeypatch.setattr(backend.logging, "basicConfig", lambda **kwargs: None)

    backend.main()

    # No arguments: settings come from the environment and .env, the database and layers
    # from their defaults.
    assert calls == [((), {})]
    assert fake.run_kwargs == {"host": "127.0.0.1", "port": backend.PORT, "debug": True}


def test_port_matches_the_frontend_proxy():
    """Checks that the Angular dev server proxies /api to the backend's PORT.

    Usage:
        uv run pytest tests/test_main.py -k proxy
    """
    target = json.loads(PROXY_CONF.read_text())["/api"]["target"]
    assert target == f"http://127.0.0.1:{backend.PORT}"
