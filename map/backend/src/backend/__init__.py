"""Flask API that serves environmental monitoring data to the map frontend.

Role: defines the app factory and the dev-server entry point for the map
backend. The Angular dev server proxies ``/api/*`` here (see
``map/frontend/proxy.conf.json``). Settings come from ``backend.config.Config``.

Usage:
    uv run backend            # from map/backend/, or `npm run backend:map` from the repo root
"""

from flask import Flask, current_app

from backend.config import Config

# 5001 rather than Flask's default 5000, which macOS AirPlay Receiver occupies.
# Must match the proxy target in map/frontend/proxy.conf.json.
PORT = 5001

# Key under which create_app stores the Config in ``app.config``.
CONFIG_KEY = "MAP_CONFIG"


def create_app(config: Config | None = None) -> Flask:
    """Builds and configures the Flask application.

    Args:
        config: Settings to use. If None, they're read with ``Config.from_env()``,
            which also loads ``map/backend/.env``. Tests should always pass one.

    Returns:
        A configured Flask app with all routes registered. The Config is in
        ``app.config[CONFIG_KEY]`` (see ``get_config``).

    Raises:
        ConfigError: If an environment value is present but malformed.

    Usage:
        app = create_app()                      # dev server, WSGI servers
        app = create_app(Config())              # tests: no database configured
    """
    app = Flask(__name__)
    app.config[CONFIG_KEY] = config if config is not None else Config.from_env()

    @app.get("/api/health")
    def health():
        """Reports that the API is up.

        Args:
            None.

        Returns:
            JSON ``{"status": "ok"}`` with HTTP 200. It doesn't need Supabase.

        Usage:
            curl http://localhost:5001/api/health
        """
        return {"status": "ok"}

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
    create_app().run(host="127.0.0.1", port=PORT, debug=True)
