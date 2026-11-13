"""The map API's routes, as a Flask Blueprint mounted at ``/api``.

Role: holds every HTTP route. Routes reach data only through ``backend.db``'s
``Database`` protocol (``get_database()``) and report failures by raising, so
``backend.errors`` can turn them into JSON. Map commit 9 adds the generic layer routes.

Usage:
    app.register_blueprint(api)   # create_app does this
    curl http://localhost:5001/api/health
"""

from flask import Blueprint

api = Blueprint("api", __name__, url_prefix="/api")


@api.get("/health")
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
