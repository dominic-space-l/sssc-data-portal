"""Tests for backend.db: error translation, the timeout, and lazy creation.

Role: checks that SupabaseDatabase turns every Supabase failure into one of
backend.db's exceptions (with details logged, not leaked), that it sets the request
timeout, and that the app creates its database only when first used. A fake client
stands in for supabase-py, so no network is needed. The error shapes match what
supabase-py 2.33 raised against the local stack.

Usage:
    uv run pytest tests/test_db.py      # from map/backend/
"""

import logging

import httpx
import pytest
from postgrest.exceptions import APIError

from backend import create_app
from backend.config import Config
from backend.db import (
    EXTENSION_KEY,
    DatabaseNotConfiguredError,
    MaskingUnavailableError,
    SupabaseDatabase,
    UpstreamError,
    get_database,
)

LOCAL_URL = "http://127.0.0.1:54321"


class FakeResponse:
    """What ``execute()`` returns: an object with ``data``."""

    def __init__(self, data):
        """Stores the response data.

        Args:
            data: The decoded JSON result.

        Usage:
            FakeResponse([{"station_id": 1}])
        """
        self.data = data


class FakeRequest:
    """What ``client.rpc(...)`` returns: an object whose ``execute()`` runs the call."""

    def __init__(self, outcome):
        """Stores what execute() should do.

        Args:
            outcome: An exception to raise, or data to return.

        Usage:
            FakeRequest(APIError({"code": "42501"}))
        """
        self._outcome = outcome

    def execute(self):
        """Returns the data or raises the exception.

        Returns:
            A FakeResponse.

        Raises:
            Exception: The stored exception, if there is one.

        Usage:
            FakeRequest([]).execute().data
        """
        if isinstance(self._outcome, BaseException):
            raise self._outcome
        return FakeResponse(self._outcome)


class FakeClient:
    """A stand-in for the supabase-py client that records each rpc call."""

    def __init__(self, outcome=None):
        """Sets what every call does.

        Args:
            outcome: An exception to raise, or data to return.

        Usage:
            FakeClient([{"station_id": 1}])
        """
        self.outcome = outcome
        self.calls = []

    def rpc(self, name, params):
        """Records the call and returns a FakeRequest.

        Args:
            name: Function name.
            params: Named arguments.

        Returns:
            A FakeRequest.

        Usage:
            client.rpc("map_stations", {})
        """
        self.calls.append((name, params))
        return FakeRequest(self.outcome)


def _masking_error():
    """The error map_stations raises when the Vault secret is missing.

    Returns:
        An APIError with code P0001 and the masking message.

    Usage:
        FakeClient(_masking_error())
    """
    return APIError(
        {
            "code": "P0001",
            "message": "location masking is not configured",
            "details": None,
            "hint": None,
        }
    )


# ---------------------------------------------------------------------------------------
# SupabaseDatabase.rpc
# ---------------------------------------------------------------------------------------


def test_rpc_returns_data_and_passes_params():
    """A successful call returns the response data and sends the params as given.

    Usage:
        uv run pytest -k returns_data
    """
    rows = [{"station_id": 1, "lon": -135.3341, "lat": 57.0511}]
    client = FakeClient(rows)
    db = SupabaseDatabase(LOCAL_URL, "anon", client=client)

    assert db.rpc("map_stations", {"p_project": 1}) == rows
    assert client.calls == [("map_stations", {"p_project": 1})]


def test_rpc_without_params_sends_an_empty_dict():
    """No params means the function's defaults: an empty dict, never None.

    Usage:
        uv run pytest -k empty_dict
    """
    client = FakeClient({"projects": []})
    SupabaseDatabase(LOCAL_URL, "anon", client=client).rpc("map_filter_options")
    assert client.calls == [("map_filter_options", {})]


def test_masking_error_becomes_masking_unavailable():
    """The P0001 masking error is its own exception, so the API can return 503.

    Usage:
        uv run pytest -k masking_unavailable
    """
    db = SupabaseDatabase(LOCAL_URL, "anon", client=FakeClient(_masking_error()))
    with pytest.raises(MaskingUnavailableError):
        db.rpc("map_stations")


def test_other_p0001_errors_are_upstream_errors():
    """Only the exact masking message counts. Any other raised exception is a 502.

    Usage:
        uv run pytest -k other_p0001
    """
    error = APIError({"code": "P0001", "message": "something else went wrong"})
    db = SupabaseDatabase(LOCAL_URL, "anon", client=FakeClient(error))
    with pytest.raises(UpstreamError):
        db.rpc("map_stations")


@pytest.mark.parametrize(
    "error",
    [
        APIError({"code": "42501", "message": "permission denied for table Stations"}),
        APIError({"code": "PGRST202", "message": "Could not find the function"}),
        APIError({"code": "22P02", "message": 'invalid input syntax for type bigint: "x"'}),
        APIError({"message": "Invalid API key"}),
        httpx.ConnectError("[Errno 111] Connection refused"),
        httpx.ConnectTimeout("timed out"),
        httpx.ReadTimeout("timed out"),
    ],
    ids=[
        "permission",
        "not-found",
        "bad-param",
        "bad-key",
        "unreachable",
        "connect-timeout",
        "read-timeout",
    ],
)
def test_supabase_failures_become_upstream_errors(error):
    """Every other API error and every network failure is an UpstreamError.

    Args:
        error: What the client raises.

    Usage:
        uv run pytest -k upstream_errors
    """
    db = SupabaseDatabase(LOCAL_URL, "anon", client=FakeClient(error))
    with pytest.raises(UpstreamError) as raised:
        db.rpc("map_stations")
    assert raised.value.__cause__ is error


def test_error_details_are_logged_not_put_in_the_exception(caplog):
    """The cause goes to the server log. The exception text stays generic.

    Args:
        caplog: pytest's log capture.

    Usage:
        uv run pytest -k logged
    """
    error = APIError({"code": "42501", "message": "permission denied for table Contacts"})
    db = SupabaseDatabase(LOCAL_URL, "anon", client=FakeClient(error))
    with (
        caplog.at_level(logging.ERROR, logger="backend.db"),
        pytest.raises(UpstreamError) as raised,
    ):
        db.rpc("map_stations")

    assert "permission denied for table Contacts" in caplog.text
    assert "42501" in caplog.text
    assert "Contacts" not in str(raised.value)


def test_timeout_is_set_on_the_client():
    """The request timeout reaches the Supabase client's REST options.

    Usage:
        uv run pytest -k timeout_is_set
    """
    db = SupabaseDatabase(LOCAL_URL, "sb_publishable_test", timeout=2.5)
    assert db._client.options.postgrest_client_timeout == 2.5


# ---------------------------------------------------------------------------------------
# get_database: lazy creation in the app
# ---------------------------------------------------------------------------------------


def test_database_is_created_on_first_use_and_reused():
    """The app starts with no client and creates one SupabaseDatabase when first asked.

    Usage:
        uv run pytest -k first_use
    """
    app = create_app(Config(LOCAL_URL, "sb_publishable_test"))
    assert app.extensions[EXTENSION_KEY] is None

    with app.app_context():
        first = get_database()
        second = get_database()

    assert isinstance(first, SupabaseDatabase)
    assert first is second
    assert app.extensions[EXTENSION_KEY] is first


def test_injected_database_is_used():
    """A Database passed to create_app is returned as-is, and nothing is created.

    Usage:
        uv run pytest -k injected
    """
    fake = object()
    app = create_app(Config(), database=fake)
    with app.app_context():
        assert get_database() is fake


def test_missing_settings_raise_database_not_configured():
    """With no Supabase settings, asking for the database is a clear error.

    Usage:
        uv run pytest -k not_configured
    """
    app = create_app(Config(supabase_url=LOCAL_URL))
    with app.app_context(), pytest.raises(DatabaseNotConfiguredError):
        get_database()
    assert app.extensions[EXTENSION_KEY] is None
