"""Flask API that serves environmental monitoring data to the map frontend.

Role: defines the app factory and the dev-server entry point for the map
backend. The Angular dev server proxies ``/api/*`` here (see
``map/frontend/proxy.conf.json``).

Usage:
    uv run backend            # from map/backend/, or `npm run backend:map` from the repo root
"""

from flask import Flask

# 5001 rather than Flask's default 5000, which macOS AirPlay Receiver occupies.
# Must match the proxy target in map/frontend/proxy.conf.json.
PORT = 5001


def create_app() -> Flask:
    """Builds and configures the Flask application.

    Args:
        None.

    Returns:
        A configured Flask app with all routes registered.

    Usage:
        app = create_app()
        client = app.test_client()  # in tests
    """
    app = Flask(__name__)

    @app.get("/api/health")
    def health():
        """Reports that the API is up.

        Args:
            None.

        Returns:
            JSON ``{"status": "ok"}`` with HTTP 200.

        Usage:
            curl http://localhost:5001/api/health
        """
        return {"status": "ok"}

    return app


def main() -> None:
    """Runs the Flask dev server on 127.0.0.1:PORT with debug enabled.

    Args:
        None.

    Usage:
        Invoked by the ``backend`` script in pyproject.toml: ``uv run backend``.
    """
    create_app().run(host="127.0.0.1", port=PORT, debug=True)
