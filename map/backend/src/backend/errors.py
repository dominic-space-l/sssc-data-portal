"""JSON error responses for the map API.

Role: every error leaves the API as ``{"error": {"code": "...", "message": "..."}}``
with the right status. Database failures map to fixed, generic messages. The cause
is logged on the server and never sent to the client, so no internal detail (SQL,
hostnames, stack traces) reaches a browser:

    HTTP errors (400, 404, 405, ...)   their status, code from the name ("not_found")
    UpstreamError                      502 upstream_error
    MaskingUnavailableError                 503 masking_unavailable
    DatabaseNotConfiguredError              503 database_not_configured
    anything else                      500 internal_error

Usage:
    register_error_handlers(app)   # create_app does this
    abort(400, description="station_type must be a list of ids")  # message is shown
"""

from __future__ import annotations

import logging

from flask import Flask
from werkzeug.exceptions import HTTPException

from backend.db import DatabaseNotConfiguredError, MaskingUnavailableError, UpstreamError

logger = logging.getLogger(__name__)

# Status, code, and message for each database failure. The messages are the only text
# a client ever sees for these.
_DATABASE_ERRORS = {
    UpstreamError: (
        502,
        "upstream_error",
        "The station database could not be reached. Try again later.",
    ),
    MaskingUnavailableError: (
        503,
        "masking_unavailable",
        "Station locations are temporarily unavailable.",
    ),
    DatabaseNotConfiguredError: (
        503,
        "database_not_configured",
        "The station database is not configured on this server.",
    ),
}


def error_body(code: str, message: str) -> dict:
    """Builds the API's error JSON.

    Args:
        code: A short machine-readable code, e.g. ``"not_found"``.
        message: A sentence safe to show a user.

    Returns:
        ``{"error": {"code": code, "message": message}}``.

    Usage:
        return error_body("not_found", "No such layer."), 404
    """
    return {"error": {"code": code, "message": message}}


def register_error_handlers(app: Flask) -> None:
    """Registers JSON handlers for HTTP errors, database errors, and anything else.

    Args:
        app: The Flask app.

    Usage:
        register_error_handlers(app)
    """

    @app.errorhandler(HTTPException)
    def handle_http_error(err: HTTPException):
        """Turns a werkzeug HTTP error (404, 405, abort(400, ...)) into JSON.

        Args:
            err: The HTTP error. Its ``description`` is shown, so code that calls
                ``abort`` must pass a message that is safe for users.

        Returns:
            The error JSON and the error's status.

        Usage:
            Called by Flask.
        """
        code = (err.name or "error").lower().replace(" ", "_").replace("'", "")
        return error_body(code, err.description or err.name), err.code

    def handle_database_error(err: Exception):
        """Turns a database failure into its fixed status and message.

        Args:
            err: An UpstreamError, MaskingUnavailableError, or DatabaseNotConfiguredError.
                ``db.py`` has already logged its cause.

        Returns:
            The error JSON and status from ``_DATABASE_ERRORS``.

        Usage:
            Called by Flask.
        """
        status, code, message = _DATABASE_ERRORS[type(err)]
        logger.warning("%s -> %d %s", type(err).__name__, status, code)
        return error_body(code, message), status

    for error_class in _DATABASE_ERRORS:
        app.register_error_handler(error_class, handle_database_error)

    @app.errorhandler(Exception)
    def handle_unexpected_error(err: Exception):
        """Logs an unexpected exception with its traceback and returns a bare 500.

        Args:
            err: The exception. Its text is logged, never returned.

        Returns:
            A generic 500 error JSON.

        Usage:
            Called by Flask.
        """
        logger.exception("Unhandled error: %s", err)
        return error_body("internal_error", "An unexpected error occurred."), 500
