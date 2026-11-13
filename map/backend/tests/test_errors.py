"""Tests for backend.errors: every failure becomes the API's JSON error shape.

Role: checks the status, code, and message for HTTP errors, each database error, and
unexpected exceptions, and that internal details are logged but never returned. Routes
that raise on purpose are added to a test-only blueprint.

Usage:
    uv run pytest tests/test_errors.py      # from map/backend/
"""

import logging

import pytest
from flask import Blueprint, abort

from backend import create_app
from backend.config import Config
from backend.db import (
    MaskingUnavailableError,
    UpstreamError,
    get_database,
)

SECRET_DETAIL = "permission denied for table Contacts at db.internal:5432"


@pytest.fixture
def client():
    """A client for an app with extra routes that fail in known ways.

    Returns:
        A Flask test client.

    Usage:
        def test_x(client): client.get("/boom/upstream")
    """
    boom = Blueprint("boom", __name__, url_prefix="/boom")

    @boom.get("/upstream")
    def upstream():
        """Raises UpstreamError with a detail that must not leak.

        Raises:
            UpstreamError: Always.

        Usage:
            GET /boom/upstream
        """
        raise UpstreamError(SECRET_DETAIL)

    @boom.get("/masking")
    def masking():
        """Raises MaskingUnavailableError.

        Raises:
            MaskingUnavailableError: Always.

        Usage:
            GET /boom/masking
        """
        raise MaskingUnavailableError(SECRET_DETAIL)

    @boom.get("/database")
    def database():
        """Asks for the database on an app with no Supabase settings.

        Returns:
            Never returns: ``get_database()`` raises DatabaseNotConfiguredError.

        Usage:
            GET /boom/database
        """
        return {"database": repr(get_database())}

    @boom.get("/bad-request")
    def bad_request():
        """Aborts with a 400 and a user-facing message.

        Usage:
            GET /boom/bad-request
        """
        abort(400, description="station_type must be a list of ids")

    @boom.get("/crash")
    def crash():
        """Raises an unexpected exception.

        Raises:
            RuntimeError: Always.

        Usage:
            GET /boom/crash
        """
        raise RuntimeError(SECRET_DETAIL)

    app = create_app(Config())
    app.register_blueprint(boom)
    return app.test_client()


@pytest.mark.parametrize(
    ("path", "status", "code"),
    [
        ("/boom/upstream", 502, "upstream_error"),
        ("/boom/masking", 503, "masking_unavailable"),
        ("/boom/database", 503, "database_not_configured"),
        ("/boom/crash", 500, "internal_error"),
    ],
)
def test_failures_map_to_status_and_code_without_details(client, path, status, code):
    """Each failure gets its status and code, and the internal detail stays out.

    Args:
        client: The test client with failing routes.
        path: The failing route.
        status: Expected HTTP status.
        code: Expected error code.

    Usage:
        uv run pytest -k without_details
    """
    response = client.get(path)
    assert response.status_code == status
    body = response.get_json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message"}
    assert body["error"]["code"] == code
    assert body["error"]["message"]
    assert SECRET_DETAIL not in response.get_data(as_text=True)


def test_database_not_configured_comes_from_get_database(client):
    """An app with no Supabase settings answers data routes with 503, not a crash.

    Args:
        client: The test client, whose app has ``Config()``.

    Usage:
        uv run pytest -k comes_from
    """
    response = client.get("/boom/database")
    assert response.status_code == 503
    assert response.get_json()["error"]["code"] == "database_not_configured"


def test_masking_message_is_user_facing(client):
    """A 503 from masking says locations are unavailable, nothing about Vault.

    Args:
        client: The test client.

    Usage:
        uv run pytest -k user_facing
    """
    message = client.get("/boom/masking").get_json()["error"]["message"]
    assert message == "Station locations are temporarily unavailable."


def test_bad_request_keeps_its_message(client):
    """abort(400, description=...) passes its message through for the user.

    Args:
        client: The test client.

    Usage:
        uv run pytest -k bad_request
    """
    response = client.get("/boom/bad-request")
    assert response.status_code == 400
    assert response.get_json() == {
        "error": {"code": "bad_request", "message": "station_type must be a list of ids"}
    }


def test_unknown_route_is_a_json_404(client):
    """A missing route answers with the JSON shape, not Flask's HTML page.

    Args:
        client: The test client.

    Usage:
        uv run pytest -k json_404
    """
    response = client.get("/api/nope")
    assert response.status_code == 404
    assert response.is_json
    assert response.get_json()["error"]["code"] == "not_found"


def test_wrong_method_is_a_json_405(client):
    """The API is GET-only. Other methods get a JSON 405.

    Args:
        client: The test client.

    Usage:
        uv run pytest -k json_405
    """
    response = client.post("/api/health")
    assert response.status_code == 405
    assert response.get_json()["error"]["code"] == "method_not_allowed"


def test_unexpected_errors_are_logged_with_traceback(client, caplog):
    """A crash is logged in full on the server, while the client gets a bare 500.

    Args:
        client: The test client.
        caplog: pytest's log capture.

    Usage:
        uv run pytest -k traceback
    """
    with caplog.at_level(logging.ERROR, logger="backend.errors"):
        client.get("/boom/crash")
    assert SECRET_DETAIL in caplog.text
    assert "Traceback" in caplog.text
