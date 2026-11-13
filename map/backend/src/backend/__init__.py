"""Flask API that serves environmental monitoring data to the map frontend.

Role: defines the app factory and the dev-server entry point for the map
backend. The Angular dev server proxies ``/api/*`` here (see
``map/frontend/proxy.conf.json``). Settings come from ``backend.config``, routes
from ``backend.api``, database access from ``backend.db``, and JSON error
responses from ``backend.errors``.

Usage:
    uv run backend            # from map/backend/, or `npm run backend:map` from the repo root
"""

import logging

from flask import Flask, current_app

from backend.api import api
from backend.config import CONFIG_KEY, Config
from backend.db import Database, init_database
from backend.errors import register_error_handlers

__all__ = ["CONFIG_KEY", "PORT", "create_app", "get_config", "main"]

# 5001 rather than Flask's default 5000, which macOS AirPlay Receiver occupies.
# Must match the proxy target in map/frontend/proxy.conf.json.
PORT = 5001


def create_app(config: Config | None = None, database: Database | None = None) -> Flask:
    """Builds and configures the Flask application.

    Args:
        config: Settings to use. If None, they're read with ``Config.from_env()``,
            which also loads ``map/backend/.env``. Tests should always pass one.
        database: A Database for every request (tests pass a fake). If None, a
            Supabase-backed one is created from the settings on first use, so the
            app starts without Supabase.

    Returns:
        A configured Flask app with all routes and error handlers registered. The
        Config is in ``app.config[CONFIG_KEY]`` (see ``get_config``).

    Raises:
        ConfigError: If an environment value is present but malformed.

    Usage:
        app = create_app()                            # dev server, WSGI servers
        app = create_app(Config(), FakeDatabase())    # tests
    """
    app = Flask(__name__)
    app.config[CONFIG_KEY] = config if config is not None else Config.from_env()
    init_database(app, database)
    register_error_handlers(app)
    app.register_blueprint(api)
    return app


def get_config() -> Config:
    """Returns the running app's Config.

    Returns:
        The Config passed to, or loaded by, ``create_app``.

    Usage:
        Inside a request or app context: ``get_config().cache_max_age``.
    """
    return current_app.config[CONFIG_KEY]


def main() -> None:
    """Runs the Flask dev server on 127.0.0.1:PORT with debug enabled.

    Args:
        None.

    Usage:
        Invoked by the ``backend`` script in pyproject.toml: ``uv run backend``.
    """
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    create_app().run(host="127.0.0.1", port=PORT, debug=True)
